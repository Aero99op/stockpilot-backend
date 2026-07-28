import { Router } from 'express';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
export const reportsRouter = Router();
reportsRouter.use(authenticate);
reportsRouter.get('/inventory', async (req, res, next) => {
  try {
    const r = await query(
      'SELECT p.id,p.name,p.sku,p.price,p.stock_quantity,p.low_stock_threshold,c.name category_name,(p.price*p.stock_quantity)::numeric stock_value FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.user_id=$1 ORDER BY p.name',
      [req.user!.id],
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    next(e);
  }
});
reportsRouter.get('/movement', async (req, res, next) => {
  try {
    const r = await query(
      "SELECT to_char(created_at,'YYYY-MM-DD') date,type,sum(quantity)::int quantity FROM stock_movements WHERE user_id=$1 AND created_at>=now()-interval '30 days' GROUP BY 1,2 ORDER BY 1",
      [req.user!.id],
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    next(e);
  }
});







/* ===========================================================
   INVENTORY VALUATION REPORT
=========================================================== */

reportsRouter.get(
  "/inventory-valuation",
  async (req, res, next) => {
    try {
      const result = await query(
        `
        SELECT

          COUNT(*)::int AS total_products,

          COALESCE(
            SUM(current_quantity),
            0
          )::int AS total_units,

          COALESCE(
            SUM(current_quantity * purchase_price),
            0
          )::numeric AS purchase_value,

          COALESCE(
            SUM(current_quantity * selling_price),
            0
          )::numeric AS selling_value,

          COALESCE(
            SUM(
              current_quantity *
              (selling_price - purchase_price)
            ),
            0
          )::numeric AS potential_profit

        FROM products

        WHERE user_id = $1
        `,
        [req.user!.id],
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  },
);







/* ===========================================================
   CATEGORY INVENTORY REPORT
=========================================================== */

reportsRouter.get(
  "/category-report",
  async (req, res, next) => {
    try {
      const result = await query(
        `
        SELECT

          c.id AS category_id,

          c.name AS category_name,

          COUNT(p.id)::int AS total_products,

          COALESCE(
            SUM(p.current_quantity),
            0
          )::int AS total_units,

          COALESCE(
            SUM(
              p.current_quantity * p.purchase_price
            ),
            0
          )::numeric AS purchase_value,

          COALESCE(
            SUM(
              p.current_quantity * p.selling_price
            ),
            0
          )::numeric AS selling_value,

          COALESCE(
            SUM(
              p.current_quantity *
              (
                p.selling_price -
                p.purchase_price
              )
            ),
            0
          )::numeric AS potential_profit

        FROM categories c

        LEFT JOIN products p
        ON p.category_id = c.id
        AND p.user_id = $1

        WHERE
          c.user_id = $1

        GROUP BY
          c.id,
          c.name

        ORDER BY
          selling_value DESC,
          c.name ASC
        `,
        [req.user!.id],
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      next(error);
    }
  },
);




/* ===========================================================
   PRODUCT PERFORMANCE REPORT
=========================================================== */

reportsRouter.get(
  "/product-report",
  async (req, res, next) => {
    try {

      const page =
  Math.max(
    1,
    Number(req.query.page) || 1
  );

const limit =
  Math.min(
    100,
    Number(req.query.limit) || 10
  );

const offset =
  (page - 1) * limit;

const search =
  (req.query.search as string)?.trim() || "";
      const result = await query(
        `
        SELECT

          p.id,

          p.name,

          p.sku,

          c.name AS category_name,

          p.current_quantity,

          p.purchase_price,

          p.selling_price,

          (
            p.current_quantity *
            p.purchase_price
          )::numeric AS purchase_value,

          (
            p.current_quantity *
            p.selling_price
          )::numeric AS selling_value,

          (
            p.current_quantity *
            (
              p.selling_price -
              p.purchase_price
            )
          )::numeric AS potential_profit,

          p.status,

COUNT(*) OVER()::INT AS total

        FROM products p

        LEFT JOIN categories c
        ON c.id = p.category_id

        WHERE
  p.user_id = $1

  AND (
    $2 = ''

    OR p.name ILIKE '%' || $2 || '%'

    OR p.sku ILIKE '%' || $2 || '%'
  )

        ORDER BY
  potential_profit DESC,
  p.name ASC

LIMIT $3
OFFSET $4
        `,
        [
  req.user!.id,
  search,
  limit,
  offset,
],
      );

      res.json({
  success: true,

  data: result.rows,

  meta: {
    page,

    limit,

    total:
      result.rows[0]?.total ?? 0,

    hasMore:
      result.rows.length === limit,
  },
});
    } catch (error) {
      next(error);
    }
  },
);