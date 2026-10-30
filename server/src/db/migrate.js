import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';

const schemaUrl = new URL('./schema.sql', import.meta.url);

try {
  const sql = await readFile(schemaUrl, 'utf8');
  await pool.query(sql);
  console.info('Database schema is up to date.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
