import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/errors.js';
export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = Math.min(100, Number(req.query.limit) || 20),
      search = String(req.query.search || '');
    const r = await query(
      'SELECT c.*, count(p.id)::int AS product_count FROM categories c LEFT JOIN products p ON p.category_id=c.id WHERE c.user_id=$1 AND c.name ILIKE $2 GROUP BY c.id ORDER BY c.name LIMIT $3 OFFSET $4',
      [req.user!.id, `%${search}%`, limit, (page - 1) * limit],
    );
    res.json({ success: true, data: r.rows, meta: { page, limit } });
  } catch (e) {
    next(e);
  }
});
categoriesRouter.post(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const r = await query(
        'INSERT INTO categories(user_id,name,description) VALUES($1,$2,$3) RETURNING *',
        [req.user!.id, req.body.name, req.body.description ?? null],
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
categoriesRouter.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const r = await query(
        'UPDATE categories SET name=COALESCE($1,name),description=COALESCE($2,description),updated_at=now() WHERE id=$3 AND user_id=$4 RETURNING *',
        [
          req.body.name ?? null,
          req.body.description ?? null,
          req.params.id,
          req.user!.id,
        ],
      );
      if (!r.rows[0]) throw new AppError(404, 'Category not found');
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
categoriesRouter.delete(
  '/:id',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const r = await query(
        'DELETE FROM categories WHERE id=$1 AND user_id=$2 RETURNING id',
        [req.params.id, req.user!.id],
      );
      if (!r.rows[0]) throw new AppError(404, 'Category not found');
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);
