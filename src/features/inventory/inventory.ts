import { Router } from 'express';
import { body, param } from 'express-validator';
import { query, transaction } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/errors.js';
export const inventoryRouter = Router();
inventoryRouter.use(authenticate);
inventoryRouter.get('/history', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = Math.min(100, Number(req.query.limit) || 30),
      productId = String(req.query.productId || ""),
      search = String(req.query.search || "").trim(),
      type = String(req.query.type || "");
    const r = await query(
  `
  SELECT
    it.id,
    p.name AS product_name,
    p.sku,
    it.type,
    it.quantity,
    it.quantity_before,
    it.quantity_after,
    it.unit_cost,
    it.notes,
    it.reference_no,
    it.created_at

FROM inventory_transactions it

JOIN products p
ON p.id = it.product_id

WHERE
    p.user_id = $1

    AND ($2 = '' OR it.product_id::text = $2)

    AND (
        $3 = ''
        OR LOWER(p.name) LIKE LOWER('%' || $3 || '%')
        OR LOWER(p.sku) LIKE LOWER('%' || $3 || '%')
    )

    AND (
        $4 = ''
        OR it.type = $4
    )

ORDER BY
    it.created_at DESC,
    it.id DESC

LIMIT ($5+1)
OFFSET $6
  `,
  [
  req.user!.id,
  productId,
  search,
  type,
  limit,
  (page - 1) * limit,
],


);


const hasMore =
  r.rows.length > limit;

const data =
  hasMore
    ? r.rows.slice(0, limit)
    : r.rows;
    res.json({
  success: true,
  data,
  meta: {
    page,
    limit,
    hasMore,
  },
});
  } catch (e) {
    next(e);
  }
});
inventoryRouter.post(
  "/movements",
  [
    body("productId").isUUID(),

    body("type").isIn([
      "STOCK_IN",
      "STOCK_OUT",
    ]),

    body("quantity").isInt({
      min: 1,
    }),

    body("notes")
      .optional()
      .trim()
      .isLength({
        max: 500,
      }),

    validate,
  ],

  async (req, res, next) => {
    try {
      const result = await transaction(
        async (client) => {
          const productResult =
            await client.query<{
              id: string;
              current_quantity: number;
            }>(
              `
              SELECT
                id,
                current_quantity
              FROM products
              WHERE
                id = $1
                AND user_id = $2
              FOR UPDATE
              `,
              [
                req.body.productId,
                req.user!.id,
              ],
            );

          const product =
            productResult.rows[0];

          if (!product) {
            throw new AppError(
              404,
              "Product not found",
            );
          }

          const before =
            product.current_quantity;

          let after = before;

          if (
            req.body.type ===
            "STOCK_IN"
          ) {
            after =
              before + req.body.quantity;
          } else {
            after =
              before - req.body.quantity;

            if (after < 0) {
              throw new AppError(
                422,
                "Insufficient stock",
              );
            }
          }

          await client.query(
            `
            UPDATE products
            SET
              current_quantity = $1,
              updated_at = NOW()
            WHERE id = $2
            `,
            [
              after,
              product.id,
            ],
          );

          const referenceNo = `TRX-${Date.now()}`;

          const transactionResult =
            await client.query(
              `
              INSERT INTO inventory_transactions
              (
                product_id,
                type,
                quantity,
                quantity_before,
                quantity_after,
                notes,
                reference_no
              )
              VALUES
              (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7
              )
              RETURNING *
              `,
              [
                product.id,
                req.body.type,
                req.body.quantity,
                before,
                after,
                req.body.notes ??
                  null,
                referenceNo,
              ],
            );

          return transactionResult.rows[0];
        },
      );

      res.status(201).json({
        success: true,
        message:
          "Stock updated successfully.",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  },
);
