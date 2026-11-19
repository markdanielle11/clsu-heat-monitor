import pg from 'pg';
import { SCHEMA_SQL } from './schema.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting) and bigint as number.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(20, (v: string) => Number(v));

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
}

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
