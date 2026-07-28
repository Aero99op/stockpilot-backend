import { Router } from 'express';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/', async (req, res, next) => {
  try {
    const id = req.user!.id;

    const [summary, low, recent, trend, categoryDistribution] = await Promise.all([
      query(
        `
        SELECT
          COUNT(*)::int AS total_products,

          (
            SELECT COUNT(*)::int
            FROM categories
            WHERE user_id = $1
          ) AS total_categories,

          COALESCE(
            SUM(current_quantity * purchase_price),
            0
          )::numeric AS inventory_value,

          COUNT(*) FILTER (
            WHERE current_quantity = 0
          )::int AS out_of_stock,

          COUNT(*) FILTER (
            WHERE current_quantity > 0
            AND current_quantity <= minimum_quantity
          )::int AS low_stock

        FROM products
        WHERE user_id = $1
        `,
        [id],
      ),

      query(
  `
  SELECT
    id,
    name,
    sku,
    current_quantity,
    minimum_quantity

  FROM products

  WHERE user_id = $1
    AND current_quantity <= minimum_quantity

  ORDER BY current_quantity ASC

  LIMIT 5
  `,
  [id],
),

query(
  `
  SELECT
      it.id,
      p.name AS product_name,
      it.type,
      it.quantity,
      it.quantity_before,
      it.quantity_after,
      it.created_at

  FROM inventory_transactions it

  JOIN products p
  ON p.id = it.product_id

  WHERE p.user_id = $1

  ORDER BY it.created_at DESC

  LIMIT 5
  `,
  [id],
),

query(
  `
  SELECT
    TO_CHAR(it.created_at, 'Dy') AS day,

    SUM(
      CASE
        WHEN it.type = 'STOCK_IN'
        THEN it.quantity
        ELSE 0
      END
    )::int AS stock_in,

    SUM(
      CASE
        WHEN it.type = 'STOCK_OUT'
        THEN it.quantity
        ELSE 0
      END
    )::int AS stock_out

  FROM inventory_transactions it

  JOIN products p
  ON p.id = it.product_id

  WHERE
    p.user_id = $1
    AND it.created_at >= NOW() - INTERVAL '7 days'

  GROUP BY day

  ORDER BY MIN(it.created_at)
  `,
  [id],
),

query(
  `
  SELECT
    c.name AS category,
    COUNT(*)::int AS total_products

  FROM products p

  JOIN categories c
  ON c.id = p.category_id

  WHERE p.user_id = $1

  GROUP BY c.name

  ORDER BY total_products DESC
  `,
  [id],
),
    ]);

    res.json({
      success: true,
      data: {
        summary: summary.rows[0],
        lowStock: low.rows,
        recentTransactions: recent.rows,
        trend: trend.rows,
categoryDistribution: categoryDistribution.rows,
      },
    });
  } catch (e) {
    next(e);
  }
});