import { createPool, migrate } from './pool.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const pool = createPool(url);
try {
  await migrate(pool);
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
