import { createApp } from './api/app.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db/pool.js';
import { Repo } from './db/repo.js';
import { logger } from './log.js';
import { ExpoPushSender } from './push/sender.js';
import { startScheduler } from './scheduler.js';
import { TokenVault } from './security.js';
import { OpenMeteoProvider } from './weather/openMeteo.js';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
await migrate(pool);

const repo = new Repo(pool, new TokenVault(config.TOKEN_SECRET));
const weather = new OpenMeteoProvider({ baseUrl: config.OPEN_METEO_BASE_URL, apiKey: config.OPEN_METEO_API_KEY });
const sender = new ExpoPushSender(process.env.EXPO_ACCESS_TOKEN);

const app = createApp({ repo, weather, sender, config, log: logger });
const server = app.listen(config.PORT, () => logger.info('CLSU heat monitor API listening', { port: config.PORT }));

const scheduler = config.ENABLE_SCHEDULER === 'true' ? startScheduler({ repo, weather, sender, config, log: logger }, config) : null;

const shutdown = (signal: string) => {
  logger.info('shutting down', { signal });
  scheduler?.stop();
  server.close(() => void pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
