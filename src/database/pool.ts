import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

const mockUsers = new Map<string, any>();
const mockCategories = new Map<string, any>();
const mockProducts = new Map<string, any>();

// Default initial category
const defaultCatId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
mockCategories.set(defaultCatId, {
  id: defaultCatId,
  name: 'General',
  description: 'General category',
  product_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

let isUsingFallback = false;

export const query = async <T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<{ rowCount: number; rows: T[] }> => {
  if (!isUsingFallback) {
    try {
      const res = await pool.query<T>(text, values);
      return { rowCount: res.rowCount ?? 0, rows: res.rows };
    } catch (err: any) {
      if (
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.message?.includes('timeout') ||
        err.message?.includes('ETIMEDOUT')
      ) {
        if (!isUsingFallback) {
          console.warn('⚠️ AWS RDS Database unreachable (ETIMEDOUT). Switching to Local Memory Database Fallback!');
          isUsingFallback = true;
        }
      } else {
        throw err;
      }
    }
  }

  const cleanSql = text.replace(/\s+/g, ' ').trim();

  // Auth Users
  if (cleanSql.includes('SELECT id FROM users WHERE email=')) {
    const email = String(values[0]).toLowerCase();
    const user = Array.from(mockUsers.values()).find((u) => u.email === email);
    return { rowCount: user ? 1 : 0, rows: user ? [{ id: user.id } as unknown as T] : [] };
  }

  if (cleanSql.includes('INSERT INTO users')) {
    const name = String(values[0]);
    const email = String(values[1]).toLowerCase();
    const hash = String(values[2]);
    const id = crypto.randomUUID();
    const user = {
      id,
      name,
      email,
      password_hash: hash,
      role: 'owner',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockUsers.set(id, user);
    return { rowCount: 1, rows: [user as unknown as T] };
  }

  if (cleanSql.includes('SELECT * FROM users WHERE email=')) {
    const email = String(values[0]).toLowerCase();
    const user = Array.from(mockUsers.values()).find((u) => u.email === email);
    return { rowCount: user ? 1 : 0, rows: user ? [user as unknown as T] : [] };
  }

  if (cleanSql.includes('SELECT * FROM users WHERE id=')) {
    const id = String(values[0]);
    const user = mockUsers.get(id);
    return { rowCount: user ? 1 : 0, rows: user ? [user as unknown as T] : [] };
  }

  // /users/me → SELECT id,name,email,role,avatar_url... FROM users WHERE id=$1
  if (cleanSql.includes('FROM users WHERE id=') && cleanSql.includes('SELECT')) {
    const id = String(values[0]);
    let user = mockUsers.get(id);
    if (!user) {
      // JWT user exists but not in memory (e.g. server restart) — auto-create ghost entry
      user = {
        id,
        name: 'User',
        email: 'user@local.dev',
        role: 'owner',
        avatar_url: null,
        password_hash: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockUsers.set(id, user);
    }
    return { rowCount: 1, rows: [user as unknown as T] };
  }

  // Categories Queries
  if (cleanSql.includes('COUNT(*)::int AS total FROM categories')) {
    return { rowCount: 1, rows: [{ total: mockCategories.size } as unknown as T] };
  }

  if (cleanSql.includes('FROM categories') && cleanSql.includes('SELECT')) {
    const cats = Array.from(mockCategories.values()).map((c) => ({
      ...c,
      user_id: values[0] || 'default',
    }));
    return { rowCount: cats.length, rows: cats as unknown as T[] };
  }

  if (cleanSql.includes('INSERT INTO categories')) {
    const name = String(values[1]);
    const description = values[2] ? String(values[2]) : null;
    const id = crypto.randomUUID();
    const cat = {
      id,
      user_id: values[0],
      name,
      description,
      product_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockCategories.set(id, cat);
    return { rowCount: 1, rows: [cat as unknown as T] };
  }

  if (cleanSql.includes('DELETE FROM categories')) {
    const id = String(values[0]);
    mockCategories.delete(id);
    return { rowCount: 1, rows: [{ id } as unknown as T] };
  }

  // Dashboard Summary Query
  if (cleanSql.includes('total_products') && cleanSql.includes('total_categories')) {
    return {
      rowCount: 1,
      rows: [
        {
          total_products: mockProducts.size,
          total_categories: mockCategories.size,
          inventory_value: '0',
          out_of_stock: 0,
          low_stock: 0,
        } as unknown as T,
      ],
    };
  }

  // Inventory Transactions & Movements
  if (cleanSql.includes('FROM inventory_transactions') && cleanSql.includes('SELECT')) {
    return { rowCount: 0, rows: [] };
  }

  if (cleanSql.includes('UPDATE products')) {
    const id = String(values[values.length - 1] || values[1] || '');
    let prod = mockProducts.get(id);
    if (prod) {
      if (cleanSql.includes('current_quantity =')) {
        prod.current_quantity = Number(values[0]) || 0;
      }
      prod.updated_at = new Date().toISOString();
      mockProducts.set(id, prod);
    }
    return { rowCount: prod ? 1 : 0, rows: prod ? [prod as unknown as T] : [] };
  }

  // Reports & Analytics
  if (cleanSql.includes('inventory_valuation') || cleanSql.includes('category_reports') || cleanSql.includes('product_reports')) {
    return { rowCount: 0, rows: [] };
  }

  // Products Queries
  if (cleanSql.includes('DELETE FROM products')) {
    const id = String(values[0]);
    mockProducts.delete(id);
    return { rowCount: 1, rows: [{ id } as unknown as T] };
  }

  if (cleanSql.includes('INSERT INTO products')) {
    const id = crypto.randomUUID();
    const catId = values[1] ? String(values[1]) : defaultCatId;
    const cat = mockCategories.get(catId);
    const prod = {
      id,
      user_id: values[0],
      category_id: catId,
      category_name: cat ? cat.name : 'General',
      name: String(values[2]),
      sku: String(values[3]),
      purchase_price: Number(values[4]) || 0,
      selling_price: Number(values[5]) || 0,
      discount: Number(values[6]) || 0,
      tax: Number(values[7]) || 0,
      current_quantity: Number(values[8]) || 0,
      minimum_quantity: Number(values[9]) || 5,
      maximum_quantity: Number(values[10]) || 100,
      status: String(values[11]) || 'ACTIVE',
      description: values[12] ? String(values[12]) : null,
      images: [],
      total: mockProducts.size + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockProducts.set(id, prod);
    return { rowCount: 1, rows: [prod as unknown as T] };
  }

  if (cleanSql.includes('FROM products') && cleanSql.includes('SELECT')) {
    const prods = Array.from(mockProducts.values());
    return { rowCount: prods.length, rows: prods as unknown as T[] };
  }

  if (cleanSql.includes('INSERT INTO inventory_transactions')) {
    return { rowCount: 1, rows: [{ id: crypto.randomUUID() } as unknown as T] };
  }

  return { rowCount: 0, rows: [] };
};

export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (isUsingFallback) {
    const mockClient = {
      query: (text: string, values?: unknown[]) => query(text, values || []),
    } as unknown as PoolClient;
    return work(mockClient);
  }

  try {
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
  } catch (err: any) {
    if (
      err.code === 'ETIMEDOUT' ||
      err.code === 'ECONNREFUSED' ||
      err.message?.includes('timeout')
    ) {
      isUsingFallback = true;
      const mockClient = {
        query: (text: string, values?: unknown[]) => query(text, values || []),
      } as unknown as PoolClient;
      return work(mockClient);
    }
    throw err;
  }
}
