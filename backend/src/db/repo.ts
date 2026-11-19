import type pg from 'pg';
import type { AlertSeverity } from '../heat/heatIndex.js';
import { hashDeviceKey, newDeviceKey, safeEqual, type TokenVault } from '../security.js';
import type { EstimatedSnapshot, OfficialDaily, SourceKind } from '../weather/types.js';

export interface DeviceSettings {
  notificationsEnabled: boolean;
  thresholdC: number;
  notifyHigh: boolean;
  notifyExtreme: boolean;
}

export interface Device extends DeviceSettings {
  id: string;
  platform: string;
  status: 'active' | 'invalid';
}

export interface AlertDevice extends Device {
  /** Decrypted Expo push token. Only used in memory when sending. */
  token: string;
}

export interface AlertState {
  severity: AlertSeverity;
  heatIndexC: number;
  sourceKind: SourceKind;
}

export type AlertStatus = 'sent' | 'delivered' | 'failed';

export interface NewAlert {
  deviceId: string;
  forecastDate: string;
  severity: AlertSeverity;
  heatIndexC: number;
  peakTime: string | null;
  sourceKind: SourceKind;
  reason: string;
  title: string;
  body: string;
  status: AlertStatus;
  ticketId: string | null;
  error: string | null;
}

export interface AlertRecord {
  id: number;
  forecastDate: string;
  severity: AlertSeverity;
  heatIndexC: number;
  peakTime: string | null;
  sourceKind: SourceKind;
  reason: string;
  title: string;
  body: string;
  status: AlertStatus;
  error: string | null;
  createdAt: string;
}

export interface PendingReceipt {
  alertId: number;
  deviceId: string;
  ticketId: string;
}

const DEVICE_COLS = `id, platform, status, notifications_enabled, threshold_c, notify_high, notify_extreme`;

function mapDevice(r: Record<string, unknown>): Device {
  return {
    id: r.id as string,
    platform: r.platform as string,
    status: r.status as 'active' | 'invalid',
    notificationsEnabled: r.notifications_enabled as boolean,
    thresholdC: r.threshold_c as number,
    notifyHigh: r.notify_high as boolean,
    notifyExtreme: r.notify_extreme as boolean,
  };
}

export class Repo {
  constructor(
    readonly pool: pg.Pool,
    private readonly vault: TokenVault,
  ) {}

  // ---------------------------------------------------------------- devices

  /** Create or re-activate a device for a push token. Returns a fresh API key (shown once). */
  async registerDevice(token: string, platform: string): Promise<{ device: Device; deviceKey: string }> {
    const deviceKey = newDeviceKey();
    const { rows } = await this.pool.query(
      `INSERT INTO devices (token_hash, token_enc, key_hash, platform)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO UPDATE SET
         key_hash = EXCLUDED.key_hash,
         token_enc = EXCLUDED.token_enc,
         platform = EXCLUDED.platform,
         status = 'active', invalid_reason = NULL, invalidated_at = NULL,
         updated_at = now(), last_seen_at = now()
       RETURNING ${DEVICE_COLS}`,
      [this.vault.lookupHash(token), this.vault.encrypt(token), hashDeviceKey(deviceKey), platform],
    );
    return { device: mapDevice(rows[0]), deviceKey };
  }

  async authenticateDevice(deviceId: string, deviceKey: string): Promise<Device | null> {
    if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return null;
    const { rows } = await this.pool.query(`SELECT ${DEVICE_COLS}, key_hash FROM devices WHERE id = $1`, [deviceId]);
    const row = rows[0];
    if (!row || !safeEqual(row.key_hash as string, hashDeviceKey(deviceKey))) return null;
    this.pool.query(`UPDATE devices SET last_seen_at = now() WHERE id = $1`, [deviceId]).catch(() => undefined);
    return mapDevice(row);
  }

  async updateSettings(deviceId: string, patch: Partial<DeviceSettings>): Promise<Device | null> {
    const { rows } = await this.pool.query(
      `UPDATE devices SET
         notifications_enabled = COALESCE($2, notifications_enabled),
         threshold_c           = COALESCE($3, threshold_c),
         notify_high           = COALESCE($4, notify_high),
         notify_extreme        = COALESCE($5, notify_extreme),
         updated_at = now()
       WHERE id = $1
       RETURNING ${DEVICE_COLS}`,
      [deviceId, patch.notificationsEnabled ?? null, patch.thresholdC ?? null, patch.notifyHigh ?? null, patch.notifyExtreme ?? null],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.pool.query(`DELETE FROM devices WHERE id = $1`, [deviceId]);
  }

  async markDeviceInvalid(deviceId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE devices SET status = 'invalid', invalid_reason = $2, invalidated_at = now(), updated_at = now() WHERE id = $1`,
      [deviceId, reason.slice(0, 200)],
    );
  }

  /** Active devices that want notifications, with their decrypted push tokens. */
  async listAlertableDevices(): Promise<AlertDevice[]> {
    const { rows } = await this.pool.query(
      `SELECT ${DEVICE_COLS}, token_enc FROM devices WHERE status = 'active' AND notifications_enabled = true`,
    );
    const out: AlertDevice[] = [];
    for (const r of rows) {
      try {
        out.push({ ...mapDevice(r), token: this.vault.decrypt(r.token_enc as string) });
      } catch {
        await this.markDeviceInvalid(r.id as string, 'token could not be decrypted');
      }
    }
    return out;
  }

  /** Test-notification target for one authenticated device. */
  async getDeviceToken(deviceId: string): Promise<string | null> {
    const { rows } = await this.pool.query(`SELECT token_enc FROM devices WHERE id = $1 AND status = 'active'`, [deviceId]);
    return rows[0] ? this.vault.decrypt(rows[0].token_enc as string) : null;
  }

  // ----------------------------------------------------------------- alerts

  async getAlertStates(deviceIds: string[], dates: string[]): Promise<Map<string, AlertState>> {
    const map = new Map<string, AlertState>();
    if (deviceIds.length === 0) return map;
    const { rows } = await this.pool.query(
      `SELECT device_id, forecast_date, severity, heat_index_c, source_kind
       FROM alert_state WHERE device_id = ANY($1::uuid[]) AND forecast_date = ANY($2::date[])`,
      [deviceIds, dates],
    );
    for (const r of rows) {
      map.set(`${r.device_id}|${r.forecast_date}`, {
        severity: r.severity as AlertSeverity,
        heatIndexC: r.heat_index_c as number,
        sourceKind: r.source_kind as SourceKind,
      });
    }
    return map;
  }

  /** Persist an alert. When it was accepted by the push service, also advance the de-dup state. */
  async recordAlert(a: NewAlert, advanceState: boolean): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO alerts (device_id, forecast_date, severity, heat_index_c, peak_time, source_kind, reason, title, body, status, ticket_id, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [a.deviceId, a.forecastDate, a.severity, a.heatIndexC, a.peakTime, a.sourceKind, a.reason, a.title, a.body, a.status, a.ticketId, a.error],
      );
      if (advanceState) {
        await client.query(
          `INSERT INTO alert_state (device_id, forecast_date, severity, heat_index_c, source_kind, notified_at)
           VALUES ($1,$2,$3,$4,$5, now())
           ON CONFLICT (device_id, forecast_date) DO UPDATE SET
             severity = EXCLUDED.severity, heat_index_c = EXCLUDED.heat_index_c,
             source_kind = EXCLUDED.source_kind, notified_at = now()`,
          [a.deviceId, a.forecastDate, a.severity, a.heatIndexC, a.sourceKind],
        );
      }
      await client.query('COMMIT');
      return rows[0].id as number;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async listAlerts(deviceId: string, limit: number): Promise<AlertRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, forecast_date, severity, heat_index_c, peak_time, source_kind, reason, title, body, status, error, created_at
       FROM alerts WHERE device_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [deviceId, limit],
    );
    return rows.map((r) => ({
      id: r.id as number,
      forecastDate: r.forecast_date as string,
      severity: r.severity as AlertSeverity,
      heatIndexC: r.heat_index_c as number,
      peakTime: r.peak_time ? (r.peak_time as Date).toISOString() : null,
      sourceKind: r.source_kind as SourceKind,
      reason: r.reason as string,
      title: r.title as string,
      body: r.body as string,
      status: r.status as AlertStatus,
      error: (r.error as string | null) ?? null,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  /** Alerts that were accepted by Expo 15+ minutes ago and have no receipt checked yet. */
  async listPendingReceipts(limit = 1000): Promise<PendingReceipt[]> {
    const { rows } = await this.pool.query(
      `SELECT id, device_id, ticket_id FROM alerts
       WHERE status = 'sent' AND receipt_checked_at IS NULL AND ticket_id IS NOT NULL
         AND created_at < now() - interval '15 minutes' AND created_at > now() - interval '24 hours'
       ORDER BY created_at LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ alertId: r.id as number, deviceId: r.device_id as string, ticketId: r.ticket_id as string }));
  }

  async finishReceipt(alertId: number, status: AlertStatus, error: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE alerts SET status = $2, error = $3, receipt_checked_at = now() WHERE id = $1`,
      [alertId, status, error?.slice(0, 500) ?? null],
    );
  }

  // -------------------------------------------------------------- forecasts

  async saveSnapshot(snapshot: EstimatedSnapshot): Promise<void> {
    await this.pool.query(`INSERT INTO forecast_snapshots (fetched_at, source, payload) VALUES ($1, $2, $3)`, [
      snapshot.fetchedAt,
      snapshot.provider,
      JSON.stringify(snapshot),
    ]);
    await this.pool.query(`DELETE FROM forecast_snapshots WHERE fetched_at < now() - interval '7 days'`);
  }

  async latestSnapshot(): Promise<EstimatedSnapshot | null> {
    const { rows } = await this.pool.query(`SELECT payload FROM forecast_snapshots ORDER BY fetched_at DESC, id DESC LIMIT 1`);
    return rows[0] ? (rows[0].payload as EstimatedSnapshot) : null;
  }

  async upsertOfficial(o: OfficialDaily): Promise<void> {
    await this.pool.query(
      `INSERT INTO official_daily (forecast_date, heat_index_c, issued_at, station, source_url)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (forecast_date) DO UPDATE SET
         heat_index_c = EXCLUDED.heat_index_c, issued_at = EXCLUDED.issued_at,
         station = EXCLUDED.station, source_url = EXCLUDED.source_url`,
      [o.date, o.heatIndexC, o.issuedAt, o.station, o.sourceUrl],
    );
  }

  async listOfficialFrom(date: string): Promise<OfficialDaily[]> {
    const { rows } = await this.pool.query(
      `SELECT forecast_date, heat_index_c, issued_at, station, source_url
       FROM official_daily WHERE forecast_date >= $1 ORDER BY forecast_date`,
      [date],
    );
    return rows.map((r) => ({
      date: r.forecast_date as string,
      heatIndexC: r.heat_index_c as number,
      issuedAt: (r.issued_at as Date).toISOString(),
      station: r.station as string,
      sourceUrl: (r.source_url as string | null) ?? null,
    }));
  }

  // ------------------------------------------------------------------ locks

  /** Run fn only if no other instance holds the advisory lock. Prevents duplicate pushes when scaled out. */
  async withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<{ ran: true; result: T } | { ran: false }> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [key]);
      if (!rows[0].ok) return { ran: false };
      try {
        return { ran: true, result: await fn() };
      } finally {
        await client.query(`SELECT pg_advisory_unlock($1)`, [key]);
      }
    } finally {
      client.release();
    }
  }
}
