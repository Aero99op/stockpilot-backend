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
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
  },
});

export const productsRouter = Router();

productsRouter.use(authenticate);

/* ===========================================================
   GET ALL PRODUCTS
=========================================================== */

productsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);

    const limit = Math.min(100, Number(req.query.limit) || 20);

    const offset = (page - 1) * limit;

    const search = String(req.query.search || '');

    const categoryId = String(req.query.categoryId || '');

    const status = String(req.query.status || '');

    const minPrice = Number(req.query.minPrice) || 0;

    const maxPrice = Number(req.query.maxPrice) || 0;

    const priceType = String(req.query.priceType || "selling_price");

    const sort = String(req.query.sort || "created_at");

const allowedSortFields = [
  "created_at",
  "updated_at",
  "name",
  "purchase_price",
  "selling_price",
  "current_quantity",
  "status",
];

const sortField = allowedSortFields.includes(sort)
  ? sort
  : "created_at";

const direction = String(req.query.order || "desc").toUpperCase();

const allowedDirections = ["ASC", "DESC"];

const sortDirection = allowedDirections.includes(direction)
  ? direction
  : "DESC";

  const allowedPriceFields = [
  "selling_price",
  "purchase_price",
];

const priceField = allowedPriceFields.includes(priceType)
  ? priceType
  : "selling_price";

    const result = await query(
      `
      SELECT
          p.*,
          c.name AS category_name,
          COUNT(*) OVER()::INT AS total

      FROM products p

      LEFT JOIN categories c
      ON c.id = p.category_id

      WHERE
          p.user_id = $1

          AND
          (
            p.name ILIKE $2
            OR
            p.sku ILIKE $2
          )

          AND
          (
            $3 = ''
            OR
            p.category_id::text = $3
          )

          AND
(
  $4 = ''

  OR

  (
    $4='LOW_STOCK'
    AND
    p.current_quantity <= p.minimum_quantity
  )

  OR

  (
    $4='OUT_OF_STOCK'
    AND
    p.current_quantity = 0
  )

  OR

  (
    p.status = $4
  )
)

AND
(
  $5 = 0
  OR
  p.${priceField} >= $5
)

AND
(
  $6 = 0
  OR
  p.${priceField} <= $6
)

ORDER BY ${sortField} ${sortDirection}

LIMIT $7
OFFSET $8
      `,
      [
  req.user!.id,
  `%${search}%`,
  categoryId,
  status,
  minPrice,
  maxPrice,
  limit,
  offset,
]
    );

    res.json({
      success: true,
      data: result.rows,
      meta: {
        page,
        limit,
        total: result.rows[0]?.total ?? 0,
        hasMore: result.rows.length === limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ===========================================================
   GET PRODUCT BY ID
=========================================================== */

productsRouter.get(
  '/:id',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const result = await query(
        `
        SELECT
            p.*,
            c.name AS category_name

        FROM products p

        LEFT JOIN categories c
        ON c.id = p.category_id

        WHERE
            p.id = $1
        AND
            p.user_id = $2
        `,
        [req.params.id, req.user!.id],
      );

      if (!result.rows.length) {
        throw new AppError(404, 'Product not found');
      }

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
   VALIDATION
=========================================================== */

const productValidation = [
  body('name').trim().isLength({ min: 2, max: 180 }),

  body('sku').trim().isLength({ min: 1, max: 80 }),

  body('categoryId').isUUID(),

  body('purchasePrice').isFloat({ min: 0 }),

  body('sellingPrice').isFloat({ min: 0 }),

  body('discount').optional().isFloat({ min: 0 }),

  body('tax').optional().isFloat({ min: 0 }),

  body('currentQuantity').optional().isInt({ min: 0 }),

  body('minimumQuantity').optional().isInt({ min: 0 }),

  body('maximumQuantity').optional().isInt({ min: 0 }),

  body('description').optional().trim().isLength({ max: 1000 }),

  validate,
];

/* ===========================================================
   CREATE PRODUCT
=========================================================== */

productsRouter.post('/', productValidation, async (req, res, next) => {
  try {
    const currentQuantity =
  req.body.currentQuantity ?? 0;

const minimumQuantity =
  req.body.minimumQuantity ?? 5;

const maximumQuantity =
  req.body.maximumQuantity ?? 100;

let status = "ACTIVE";

if (currentQuantity === 0) {
  status = "OUT_OF_STOCK";
} else if (currentQuantity <= minimumQuantity) {
  status = "LOW_STOCK";
} else if (currentQuantity > maximumQuantity) {
  status = "OVERSTOCKED";
}

    const result = await query(
      `
        INSERT INTO products
        (
            user_id,
            category_id,
            name,
            sku,
            purchase_price,
            selling_price,
            discount,
            tax,
            current_quantity,
            minimum_quantity,
            maximum_quantity,
            status,
            description
        )

        VALUES
        (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        )

        RETURNING *
        `,
      [
        req.user!.id,
        req.body.categoryId,

        req.body.name,

        req.body.sku,

        req.body.purchasePrice,

        req.body.sellingPrice,

        req.body.discount ?? 0,

        req.body.tax ?? 0,

        currentQuantity,

        minimumQuantity,

        maximumQuantity,

        status,

        req.body.description ?? null,
      ],
    );

    await query(
  `
  INSERT INTO inventory_transactions
  (
      product_id,
      type,
      quantity,
      quantity_before,
      quantity_after,
      unit_cost
  )
  VALUES
  ($1,$2,$3,$4,$5,$6)
  `,
  [
    result.rows[0].id,
    "STOCK_IN",
    currentQuantity,
    0,
    currentQuantity,
    req.body.purchasePrice,
  ]
);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/* ===========================================================
   UPDATE PRODUCT
=========================================================== */

productsRouter.patch(
  '/:id',
  [
    param('id').isUUID(),

    body('name').optional().trim().isLength({ min: 2, max: 180 }),

    body('sku').optional().trim().isLength({ min: 1, max: 80 }),

    body('categoryId').optional().isUUID(),

    body('purchasePrice').optional().isFloat({ min: 0 }),

    body('sellingPrice').optional().isFloat({ min: 0 }),

    body('discount').optional().isFloat({ min: 0 }),

    body('tax').optional().isFloat({ min: 0 }),

    body('minimumQuantity').optional().isInt({ min: 0 }),

    body('maximumQuantity').optional().isInt({ min: 0 }),

    body('description').optional().trim().isLength({ max: 1000 }),

    validate,
  ],

  async (req, res, next) => {
    try {

      const existingProduct = await query(
  `
  SELECT
    current_quantity,
    minimum_quantity,
    maximum_quantity
  FROM products
  WHERE
    id = $1
    AND user_id = $2
  `,
  [req.params.id, req.user!.id]
);

if (!existingProduct.rows.length) {
  throw new AppError(404, "Product not found");
}

const currentQuantity =
  existingProduct.rows[0].current_quantity;

const minimumQuantity =
  req.body.minimumQuantity ??
  existingProduct.rows[0].minimum_quantity;

const maximumQuantity =
  req.body.maximumQuantity ??
  existingProduct.rows[0].maximum_quantity;

let status = "ACTIVE";

if (currentQuantity === 0) {
  status = "OUT_OF_STOCK";
} else if (currentQuantity <= minimumQuantity) {
  status = "LOW_STOCK";
} else if (currentQuantity > maximumQuantity) {
  status = "OVERSTOCKED";
}


      const result = await query(
        `
        UPDATE products

        SET

            name = COALESCE($1,name),

            sku = COALESCE($2,sku),

            category_id = COALESCE($3,category_id),

            purchase_price = COALESCE($4,purchase_price),

            selling_price = COALESCE($5,selling_price),

            discount = COALESCE($6,discount),

            tax = COALESCE($7,tax),

minimum_quantity = COALESCE($8,minimum_quantity),

maximum_quantity = COALESCE($9,maximum_quantity),

status = COALESCE($10,status),

description = COALESCE($11,description),

updated_at = NOW()

WHERE
    id = $12
AND
    user_id = $13

        RETURNING *
        `,
        [
          req.body.name ?? null,

          req.body.sku ?? null,

          req.body.categoryId ?? null,

          req.body.purchasePrice ?? null,

          req.body.sellingPrice ?? null,

          req.body.discount ?? null,

          req.body.tax ?? null,

          req.body.minimumQuantity ?? null,

          req.body.maximumQuantity ?? null,

          status,
          req.body.description ?? null,

          req.params.id,

          req.user!.id,
        ],
      );

      if (!result.rows.length) {
        throw new AppError(404, 'Product not found');
      }


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
   UPLOAD PRODUCT IMAGE
=========================================================== */

productsRouter.post(
  '/:id/image',
  [param('id').isUUID(), validate, upload.single('image')],
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(422, 'Image is required');
      }

      const imageUrl = await storeImage(req.file);

      console.log("Image URL:", imageUrl);
console.log("Type:", typeof imageUrl);

      const result = await query(
        `
        UPDATE products

        SET
            images =
COALESCE(images, '[]'::jsonb)
||
jsonb_build_array($1::text),
            updated_at = NOW()

        WHERE
            id = $2
        AND
            user_id = $3

        RETURNING *
        `,
        [imageUrl, req.params.id, req.user!.id],
      );

      if (!result.rows.length) {
        throw new AppError(404, 'Product not found');
      }

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
   DELETE PRODUCT
=========================================================== */

productsRouter.delete(
  '/:id',
  [param('id').isUUID(), validate],
  async (req, res, next) => {
    try {
      const result = await query(
        `
        DELETE FROM products

        WHERE
            id = $1
        AND
            user_id = $2

        RETURNING id
        `,
        [req.params.id, req.user!.id],
      );

      if (!result.rows.length) {
        throw new AppError(404, 'Product not found');
      }

      res.json({
        success: true,
        message: 'Product deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  },
);
