import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// Validation middleware
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get validation results from express-validator
  const errors = validationResult(req);

  // If there are no validation errors, continue to next middleware
  if (errors.isEmpty()) {
    return next();
  }

  // Extract and format errors
  const formattedErrors = errors.array().map(error => ({
    field: error.type === 'field' ? error.path : error.type,
    message: error.msg,
    value: error.type === 'field' ? (error as any).value : undefined
  }));

  // Return validation error response
  res.status(400).json({
    error: 'Validation failed',
    message: 'Request validation failed',
    details: formattedErrors
  });
};

// Alternative validation middleware that throws errors (for async error handling)
export const validateRequestAsync = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  // Create a validation error object
  const validationError = new Error('Validation failed') as any;
  validationError.status = 400;
  validationError.errors = errors.array();
  validationError.isValidationError = true;

  // Pass error to error handling middleware
  next(validationError);
};