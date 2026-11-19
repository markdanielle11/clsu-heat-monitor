import cron from 'node-cron';
import type { Config } from './config.js';
import { runForecastCheck, runReceiptCheck, type CheckDeps } from './jobs/checkRunner.js';
import { errMsg } from './log.js';

/**
 * In-process scheduler. The backend, not the phone, watches the forecast, so alerts are
 * delivered even when the app is closed. Multiple instances are safe: each run takes a
 * Postgres advisory lock, so only one instance does the work.
 */
export function startScheduler(deps: CheckDeps, config: Pick<Config, 'FORECAST_CRON' | 'RECEIPT_CRON'>): { stop(): void } {
  const guard = (name: string, job: () => Promise<unknown>) => async () => {
    try {
      await job();
    } catch (e) {
      deps.log.error(`${name} job crashed`, { error: errMsg(e) });
    }
  };

  const forecast = cron.schedule(config.FORECAST_CRON, guard('forecast', () => runForecastCheck(deps)), { timezone: 'Asia/Manila' });
  const receipts = cron.schedule(config.RECEIPT_CRON, guard('receipts', () => runReceiptCheck(deps)), { timezone: 'Asia/Manila' });

  // Run once at startup so a fresh deployment has data immediately.
  void guard('forecast', () => runForecastCheck(deps))();

  return {
    stop() {
      void forecast.stop();
      void receipts.stop();
    },
  };
}
