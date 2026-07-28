import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/errors.js';
export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.get('/me', async (req, res, next) => {
  try {
    const r = await query(
      'SELECT id,name,email,role,avatar_url,created_at FROM users WHERE id=$1',
      [req.user!.id],
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (e) {
    next(e);
  }
});
usersRouter.patch(
  '/me',
  [body('name').optional().trim().isLength({ min: 2, max: 100 }), validate],
  async (req, res, next) => {
    try {
      const r = await query(
        'UPDATE users SET name=COALESCE($1,name),avatar_url=COALESCE($2,avatar_url),updated_at=now() WHERE id=$3 RETURNING id,name,email,role,avatar_url',
        [req.body.name ?? null, req.body.avatarUrl ?? null, req.user!.id],
      );
      res.json({ success: true, data: r.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
usersRouter.patch(
  '/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isStrongPassword({
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const r = await query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id=$1',
        [req.user!.id],
      );
      if (
        !(await bcrypt.compare(
          req.body.currentPassword,
          r.rows[0].password_hash,
        ))
      )
        throw new AppError(422, 'Current password is incorrect');
      await query(
        'UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',
        [await bcrypt.hash(req.body.newPassword, 12), req.user!.id],
      );
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);
