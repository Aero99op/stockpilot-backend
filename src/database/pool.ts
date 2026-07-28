import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env.js';
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
});
export const query = <T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) => pool.query<T>(text, values);
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
