import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';
await pool.query(
  await readFile(
    join(dirname(fileURLToPath(import.meta.url)), 'seeds', '001_demo.sql'),
    'utf8',
  ),
);
await pool.end();
