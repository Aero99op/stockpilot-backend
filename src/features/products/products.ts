import { Router } from 'express';
import { body, param } from 'express-validator';
import multer from 'multer';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/errors.js';
import { storeImage } from '../../utils/storage.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, f, cb) =>
    cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
});
export const productsRouter = Router();
productsRouter.use(authenticate);
productsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, +req.query.page! || 1),
      limit = Math.min(100, +req.query.limit! || 30),
      search = String(req.query.search || ''),
      category = String(req.query.categoryId || ''),
      status = String(req.query.status || ''),
      sort = String(req.query.sort || 'created_at');
    const order = ['created_at', 'name', 'price', 'stock_quantity'].includes(
      sort,
    )
      ? sort
      : 'created_at';
    const r = await query(
      `SELECT p.*,c.name category_name, count(*) over()::int total FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.user_id=$1 AND (p.name ILIKE $2 OR p.sku ILIKE $2) AND ($3='' OR p.category_id::text=$3) AND ($4='' OR ($4='low' AND p.stock_quantity>0 AND p.stock_quantity<=p.low_stock_threshold) OR ($4='out' AND p.stock_quantity=0)) ORDER BY ${order} DESC LIMIT $5 OFFSET $6`,
      [
        req.user!.id,
        `%${search}%`,
        category,
        status,
        limit,
        (page - 1) * limit,
      ],
    );
    res.json({
      success: true,
      data: r.rows,
      meta: {
        page,
        limit,
        total: r.rows[0]?.total ?? 0,
        hasMore: r.rows.length === limit,
      },
    });
  } catch (e) {
    next(e);
  }
});
productsRouter.get(
  '/:id',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const r = await query(
        'SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=$1 AND p.user_id=$2',
        [req.params.id, req.user!.id],
      );
      if (!r.rows[0]) throw new AppError(404, 'Product not found');
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
const fields = [
  body('name').trim().isLength({ min: 2, max: 150 }),
  body('sku').trim().isLength({ min: 1, max: 80 }),
  body('price').isFloat({ min: 0 }),
  body('stockQuantity').optional().isInt({ min: 0 }),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
  validate,
];
productsRouter.post('/', fields, async (req, res, next) => {
  try {
    const r = await query(
      'INSERT INTO products(user_id,category_id,name,sku,price,stock_quantity,low_stock_threshold,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        req.user!.id,
        req.body.categoryId ?? null,
        req.body.name,
        req.body.sku,
        req.body.price,
        req.body.stockQuantity ?? 0,
        req.body.lowStockThreshold ?? 5,
        req.body.description ?? null,
      ],
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) {
    next(e);
  }
});
productsRouter.patch(
  '/:id',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const r = await query(
        'UPDATE products SET name=COALESCE($1,name),sku=COALESCE($2,sku),price=COALESCE($3,price),category_id=COALESCE($4,category_id),description=COALESCE($5,description),low_stock_threshold=COALESCE($6,low_stock_threshold),updated_at=now() WHERE id=$7 AND user_id=$8 RETURNING *',
        [
          req.body.name ?? null,
          req.body.sku ?? null,
          req.body.price ?? null,
          req.body.categoryId ?? null,
          req.body.description ?? null,
          req.body.lowStockThreshold ?? null,
          req.params.id,
          req.user!.id,
        ],
      );
      if (!r.rows[0]) throw new AppError(404, 'Product not found');
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
productsRouter.post(
  '/:id/image',
  [param('id').isUUID(), validate, upload.single('image')],
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError(422, 'Image is required');
      const imageUrl = await storeImage(req.file);
      const r = await query(
        'UPDATE products SET image_url=$1,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING *',
        [imageUrl, req.params.id, req.user!.id],
      );
      if (!r.rows[0]) throw new AppError(404, 'Product not found');
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
