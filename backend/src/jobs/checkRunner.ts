import { buildAlertMessage } from '../alerts/messages.js';
import { buildCandidates, decide, type DayCandidate } from '../alerts/engine.js';
import type { Config } from '../config.js';
import type { Repo } from '../db/repo.js';
import { errMsg, type Logger } from '../log.js';
import type { PushMessage, PushSender } from '../push/sender.js';
import { manilaDate } from '../time.js';
import type { EstimatedSnapshot, WeatherProvider } from '../weather/types.js';

const FORECAST_LOCK = 41_001;
const RECEIPT_LOCK = 41_002;

export interface CheckDeps {
  repo: Repo;
  weather: WeatherProvider;
  sender: PushSender;
  config: Pick<Config, 'MAX_ALERT_DATA_AGE_MINUTES' | 'SIGNIFICANT_CHANGE_C'>;
  log: Logger;
  now?: () => Date;
}

export interface CheckSummary {
  ran: boolean;
  refreshed: boolean;
  refreshError?: string;
  skippedStaleData?: boolean;
  devices: number;
  sent: number;
  failed: number;
  invalidatedTokens: number;
}

const emptySummary = (): CheckSummary => ({ ran: true, refreshed: false, devices: 0, sent: 0, failed: 0, invalidatedTokens: 0 });

/** Refresh the forecast, then notify every device whose threshold is newly reached. */
export async function runForecastCheck(deps: CheckDeps): Promise<CheckSummary> {
  const locked = await deps.repo.withAdvisoryLock(FORECAST_LOCK, () => forecastCheck(deps));
  return locked.ran ? locked.result : { ...emptySummary(), ran: false };
}

async function forecastCheck(deps: CheckDeps): Promise<CheckSummary> {
  const { repo, weather, sender, config, log } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const summary = emptySummary();

  // 1. Refresh the estimated forecast. A failure is not fatal: keep using the last good snapshot.
  let snapshot: EstimatedSnapshot | null = null;
  try {
    snapshot = await weather.fetchEstimated();
    await repo.saveSnapshot(snapshot);
    summary.refreshed = true;
  } catch (e) {
    summary.refreshError = errMsg(e);
    log.error('forecast refresh failed', { error: summary.refreshError });
    snapshot = await repo.latestSnapshot();
  }

  // 2. Never alert from estimates that are too old. Official values are always eligible.
  const official = await repo.listOfficialFrom(manilaDate(now));
  let hours = snapshot?.hours ?? [];
  if (snapshot) {
    const ageMin = (now.getTime() - new Date(snapshot.fetchedAt).getTime()) / 60_000;
    if (ageMin > config.MAX_ALERT_DATA_AGE_MINUTES) {
      summary.skippedStaleData = true;
      hours = [];
      log.warn('estimated forecast too old for alerting', { ageMin: Math.round(ageMin) });
    }
  }

  const candidates = buildCandidates({ hours, official, now });
  if (candidates.length === 0) return summary;

  // 3. Work out who needs which message.
  const devices = await repo.listAlertableDevices();
  summary.devices = devices.length;
  if (devices.length === 0) return summary;

  const states = await repo.getAlertStates(
    devices.map((d) => d.id),
    candidates.map((c) => c.date),
  );

  interface Planned {
    deviceId: string;
    candidate: DayCandidate;
    severity: 'high' | 'extreme';
    reason: string;
    title: string;
    body: string;
    message: PushMessage;
  }
  const planned: Planned[] = [];

  for (const device of devices) {
    for (const candidate of candidates) {
      const last = states.get(`${device.id}|${candidate.date}`);
      const d = decide(candidate, device, last, config.SIGNIFICANT_CHANGE_C);
      if (!d.send) continue;
      const msg = buildAlertMessage(candidate, d.severity, d.reason);
      planned.push({
        deviceId: device.id,
        candidate,
        severity: d.severity,
        reason: d.reason,
        ...msg,
        message: {
          to: device.token,
          title: msg.title,
          body: msg.body,
          data: {
            type: 'heat_alert',
            severity: d.severity,
            forecastDate: candidate.date,
            heatIndexC: candidate.heatIndexC,
            sourceKind: candidate.sourceKind,
          },
        },
      });
    }
  }
  if (planned.length === 0) return summary;

  // 4. Send, then record. State only advances for pushes the service accepted, so a failed
  //    send is retried on the next run instead of being silently lost.
  const results = await sender.send(planned.map((p) => p.message));
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i]!;
    const r = results[i] ?? { ok: false as const, error: 'NoResult', tokenInvalid: false };
    try {
      await repo.recordAlert(
        {
          deviceId: p.deviceId,
          forecastDate: p.candidate.date,
          severity: p.severity,
          heatIndexC: p.candidate.heatIndexC,
          peakTime: p.candidate.peakTime,
          sourceKind: p.candidate.sourceKind,
          reason: p.reason,
          title: p.title,
          body: p.body,
          status: r.ok ? 'sent' : 'failed',
          ticketId: r.ok ? r.ticketId : null,
          error: r.ok ? null : r.error,
        },
        r.ok || r.tokenInvalid, // a dead token must not be retried every run
      );
    } catch (e) {
      log.error('could not record alert', { error: errMsg(e) });
    }
    if (r.ok) summary.sent++;
    else {
      summary.failed++;
      if (r.tokenInvalid) {
        summary.invalidatedTokens++;
        await repo.markDeviceInvalid(p.deviceId, r.error);
      }
    }
  }
  log.info('forecast check finished', { ...summary });
  return summary;
}

/** Resolve Expo push receipts: confirm APNs accepted the push, and retire dead device tokens. */
export async function runReceiptCheck(deps: Pick<CheckDeps, 'repo' | 'sender' | 'log'>): Promise<{ checked: number; failed: number }> {
  const locked = await deps.repo.withAdvisoryLock(RECEIPT_LOCK, async () => {
    const pending = await deps.repo.listPendingReceipts();
    if (pending.length === 0) return { checked: 0, failed: 0 };
    const receipts = await deps.sender.getReceipts(pending.map((p) => p.ticketId));
    let checked = 0;
    let failed = 0;
    for (const p of pending) {
      const r = receipts.get(p.ticketId);
      if (!r) continue; // not ready yet; checked again next run (up to 24 h)
      checked++;
      if (r.ok) await deps.repo.finishReceipt(p.alertId, 'delivered', null);
      else {
        failed++;
        await deps.repo.finishReceipt(p.alertId, 'failed', r.error);
        if (r.tokenInvalid) await deps.repo.markDeviceInvalid(p.deviceId, r.error);
      }
    }
    deps.log.info('receipt check finished', { checked, failed });
    return { checked, failed };
  });
  return locked.ran ? locked.result : { checked: 0, failed: 0 };
}
