import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './database/pool.js';
const server = app.listen(env.port, () =>
  process.stdout.write(`StockPilot API listening on ${env.port}\n`),
);
const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
