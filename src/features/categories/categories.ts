import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/errors.js';
export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);

    const limit = Math.min(
      100,
      Number(req.query.limit) || 20
    );

    const search = String(req.query.search || "");

    // Get total count
    const totalResult = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM categories
      WHERE user_id = $1
      AND name ILIKE $2
      `,
      [req.user!.id, `%${search}%`]
    );

    const total = totalResult.rows[0].total;

    // Get paginated categories
    const result = await query(
      `
      SELECT
        c.*,
        COUNT(p.id)::int AS product_count
      FROM categories c
      LEFT JOIN products p
        ON p.category_id = c.id
      WHERE
        c.user_id = $1
        AND c.name ILIKE $2
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $3
      OFFSET $4
      `,
      [
        req.user!.id,
        `%${search}%`,
        limit,
        (page - 1) * limit,
      ]
    );

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,

      data: result.rows,

      meta: {
        page,
        limit,
        total,
        totalPages,

        hasMore: page < totalPages,
      },
    });
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
    } catch (e: any) {

  if (
  e.code === "23001" ||
  e.code === "23503"
) {
  return next(
    new AppError(
      409,
      "Cannot delete category because it contains products. Delete or move the products first."
    )
  );
}

  next(e);
}
  },
);
