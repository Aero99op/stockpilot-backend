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

  // Terminal mein error logs dikhane ke liye
  const timestamp = new Date().toLocaleTimeString();
  console.error(`\x1b[31m[Backend Error - ${timestamp}] Status ${status}: ${message}\x1b[0m`);

  if (status === 500 || !(error instanceof AppError)) {
    console.error(error instanceof Error ? error.stack : error);
  }

  res.status(status).json({ success: false, message });
}
