import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates shifted to the server timezone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
// Return NUMERIC (used for budgets) as JS numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected idle Postgres client error', err);
});

/** Run a parameterised query. Always pass user input through `params`, never string concatenation. */
export function query(text, params = []) {
  return pool.query(text, params);
}

/** Run `work(client)` inside a transaction, rolling back on any error. */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
