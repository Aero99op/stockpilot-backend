import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new AppError(401, 'Authentication required');
    req.user = jwt.verify(token, env.jwtSecret) as {
      id: string;
      email: string;
      role: string;
    };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired access token'));
  }
}
