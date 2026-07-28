import type { NextFunction, Request, Response } from 'express';
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = error instanceof AppError ? error.statusCode : 500;
  const message =
    error instanceof AppError ? error.message : 'Internal server error';
  if (status === 500)
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
  res.status(status).json({ success: false, message });
}
