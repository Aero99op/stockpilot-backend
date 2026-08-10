import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { body } from 'express-validator';

import {
  LambdaClient,
  InvokeCommand,
} from '@aws-sdk/client-lambda';

import {
  query,
  transaction,
} from '../../database/pool.js';

import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/errors.js';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

/* ===========================================================
   AWS LAMBDAaa meow
=========================================================== */

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'ap-south-1',
});

const NOTIFICATION_LAMBDA_NAME =
  'stockpilot-low-stock-alert';

/* ===========================================================
   INVENTORY HISTORY
=========================================================== */

inventoryRouter.get(
  '/history',
  async (req, res, next) => {
    try {
      const page = Math.max(
        1,
        Number(req.query.page) || 1,
      );

      const limit = Math.min(
        100,
        Number(req.query.limit) || 30,
      );

      const productId = String(
        req.query.productId || '',
      );

      const search = String(
        req.query.search || '',
      ).trim();

      const type = String(
        req.query.type || '',
      );

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

          AND (
            $2 = ''
            OR it.product_id::text = $2
          )

          AND (
            $3 = ''
            OR LOWER(p.name)
              LIKE LOWER('%' || $3 || '%')
            OR LOWER(p.sku)
              LIKE LOWER('%' || $3 || '%')
          )

          AND (
            $4 = ''
            OR it.type = $4
          )

        ORDER BY
          it.created_at DESC,
          it.id DESC

        LIMIT ($5 + 1)
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

      const data = hasMore
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
  },
);

/* ===========================================================
   STOCK MOVEMENTS
=========================================================== */

inventoryRouter.post(
  '/movements',
  [
    body('productId').isUUID(),

    body('type').isIn([
      'STOCK_IN',
      'STOCK_OUT',
    ]),

    body('quantity').isInt({
      min: 1,
    }),

    body('notes')
      .optional()
      .trim()
      .isLength({
        max: 500,
      }),

    validate,
  ],

  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await transaction(
        async (client) => {
          /* -------------------------------------------------
             GET PRODUCT
          ------------------------------------------------- */

          const productResult =
            await client.query<{
              id: string;
              current_quantity: number;
              minimum_quantity: number;
            }>(
              `
              SELECT
                id,
                current_quantity,
                minimum_quantity

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
              'Product not found',
            );
          }

          /* -------------------------------------------------
             CALCULATE NEW STOCK
          ------------------------------------------------- */

          const before =
            product.current_quantity;

          let after = before;

          if (
            req.body.type ===
            'STOCK_IN'
          ) {
            after =
              before +
              req.body.quantity;
          } else {
            after =
              before -
              req.body.quantity;

            if (after < 0) {
              throw new AppError(
                422,
                'Insufficient stock',
              );
            }
          }

          /* -------------------------------------------------
             UPDATE PRODUCT STOCK
          ------------------------------------------------- */

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

          /* -------------------------------------------------
             INVENTORY TRANSACTION
          ------------------------------------------------- */

          const referenceNo =
            `TRX-${Date.now()}`;

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
                req.body.notes ?? null,
                referenceNo,
              ],
            );

          /* -------------------------------------------------
             RETURN STOCK + LOW STOCK INFORMATION
          ------------------------------------------------- */

          return {
            transaction:
              transactionResult.rows[0],

            currentQuantity:
              after,

            minimumQuantity:
              product.minimum_quantity,
          };
        },
      );

      /* =====================================================
         LOW STOCK → ASYNC LAMBDA
      ===================================================== */

      if (
        result.currentQuantity <=
        result.minimumQuantity
      ) {
        try {
          await lambdaClient.send(
            new InvokeCommand({
              FunctionName:
                NOTIFICATION_LAMBDA_NAME,

              // Async invocation
              InvocationType: 'Event',

              Payload: Buffer.from(
                JSON.stringify({
                  userId:
                    req.user!.id,

                  productId:
                    req.body.productId,
                }),
              ),
            }),
          );

          console.log(
            'Low-stock notification Lambda invoked:',
            {
              userId:
                req.user!.id,

              productId:
                req.body.productId,

              currentQuantity:
                result.currentQuantity,

              minimumQuantity:
                result.minimumQuantity,
            },
          );
        } catch (lambdaError) {
          /*
           * Lambda notification failure must not
           * undo the already-successful stock update.
           */
          console.error(
            'Failed to invoke low-stock notification Lambda:',
            lambdaError,
          );
        }
      }

      /* =====================================================
         RESPONSE
      ===================================================== */

      res.status(201).json({
        success: true,

        message:
          'Stock updated successfully.',

        data:
          result.transaction,
      });
    } catch (e) {
      next(e);
    }
  },
);