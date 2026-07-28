import type { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from '../utils/errors.js';
export const validate = (req: Request, _res: Response, next: NextFunction) => {
  const result = validationResult(req);
  if (!result.isEmpty())
    return next(
      new AppError(
        422,
        result
          .array()
          .map((x) => x.msg)
          .join(', '),
      ),
    );
  next();
};
