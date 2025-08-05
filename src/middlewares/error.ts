import { Request, Response, NextFunction } from 'express';

export class CustomError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;

    // Set the prototype explicitly for `instanceof` checks
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}

// Error-handling middleware function
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.log('error - middleware');

  let status = 500;
  let message = 'Internal Server Error';

  if (err instanceof CustomError) {
    status = err.status;
    message = err.message;
  } else if (err instanceof SyntaxError) {
    status = 400;
    message = 'Invalid JSON payload';
  }

  console.error(err);
  res.status(status).json({ type: 'failure', message });
};
