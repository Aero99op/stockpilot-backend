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
      productId = String(req.query.productId || '');
    const r = await query(
      "SELECT m.*,p.name product_name,p.sku FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE p.user_id=$1 AND ($2='' OR m.product_id::text=$2) ORDER BY m.created_at DESC LIMIT $3 OFFSET $4",
      [req.user!.id, productId, limit, (page - 1) * limit],
    );
    res.json({
      success: true,
      data: r.rows,
      meta: { page, limit, hasMore: r.rows.length === limit },
    });
  } catch (e) {
    next(e);
  }
});
inventoryRouter.post(
  '/movements',
  [
    body('productId').isUUID(),
    body('type').isIn(['in', 'out', 'adjustment']),
    body('quantity').isInt({ min: 1 }),
    body('note').optional().trim().isLength({ max: 500 }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const item = await transaction(async (client) => {
        const product = (
          await client.query<{ stock_quantity: number }>(
            'SELECT stock_quantity FROM products WHERE id=$1 AND user_id=$2 FOR UPDATE',
            [req.body.productId, req.user!.id],
          )
        ).rows[0];
        if (!product) throw new AppError(404, 'Product not found');
        const delta =
          req.body.type === 'out' ? -req.body.quantity : req.body.quantity;
        if (product.stock_quantity + delta < 0)
          throw new AppError(422, 'Insufficient stock');
        const movement = (
          await client.query(
            'INSERT INTO stock_movements(product_id,user_id,type,quantity,note) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [
              req.body.productId,
              req.user!.id,
              req.body.type,
              delta,
              req.body.note ?? null,
            ],
          )
        ).rows[0];
        await client.query(
          'UPDATE products SET stock_quantity=stock_quantity+$1,updated_at=now() WHERE id=$2',
          [delta, req.body.productId],
        );
        return movement;
      });
      res.status(201).json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  },
);
