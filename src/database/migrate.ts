import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';
const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
await pool.query(
  'CREATE TABLE IF NOT EXISTS schema_migrations(name text primary key, applied_at timestamptz default now())',
);
for (const name of (await readdir(dir))
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  if (
    (await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]))
      .rowCount
  )
    continue;
  await pool.query('BEGIN');
  try {
    await pool.query(await readFile(join(dir, name), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}
await pool.end();
