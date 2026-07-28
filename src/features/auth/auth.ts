import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../database/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
type User = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  avatar_url: string | null;
};
const tokens = (u: User) => ({
  accessToken: jwt.sign(
    { id: u.id, email: u.email, role: u.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  ),
  refreshToken: jwt.sign({ id: u.id, type: 'refresh' }, env.jwtSecret, {
    expiresIn: '30d',
  }),
});
const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  avatarUrl: u.avatar_url,
});
export const authRouter = Router();
authRouter.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2, max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isStrongPassword({
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    }),
    validate,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const exists = await query('SELECT id FROM users WHERE email=$1', [
        req.body.email,
      ]);
      if (exists.rowCount)
        throw new AppError(409, 'Email is already registered');
      const hash = await bcrypt.hash(req.body.password, 12);
      const result = await query<User>(
        'INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) RETURNING *',
        [req.body.name, req.body.email, hash],
      );
      const user = result.rows[0];
      res
        .status(201)
        .json({
          success: true,
          data: { user: publicUser(user), ...tokens(user) },
        });
    } catch (e) {
      next(e);
    }
  },
);
authRouter.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const r = await query<User>('SELECT * FROM users WHERE email=$1', [
        req.body.email,
      ]);
      const user = r.rows[0];
      if (
        !user ||
        !(await bcrypt.compare(req.body.password, user.password_hash))
      )
        throw new AppError(401, 'Invalid email or password');
      res.json({
        success: true,
        data: { user: publicUser(user), ...tokens(user) },
      });
    } catch (e) {
      next(e);
    }
  },
);
authRouter.post(
  '/refresh',
  [body('refreshToken').notEmpty(), validate],
  async (req, res, next) => {
    try {
      const p = jwt.verify(req.body.refreshToken, env.jwtSecret) as {
        id: string;
        type: string;
      };
      if (p.type !== 'refresh')
        throw new AppError(401, 'Invalid refresh token');
      const r = await query<User>('SELECT * FROM users WHERE id=$1', [p.id]);
      if (!r.rows[0]) throw new AppError(401, 'User not found');
      res.json({ success: true, data: tokens(r.rows[0]) });
    } catch (e) {
      next(new AppError(401, 'Invalid or expired refresh token'));
    }
  },
);
authRouter.post('/logout', authenticate, (_req, res) => res.status(204).send());
