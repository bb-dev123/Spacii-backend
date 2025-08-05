import { body, query } from "express-validator";

export const confirmPaymentValidations = [
  body("paymentId")
    .exists({ checkFalsy: true })
    .withMessage("paymentId is required")
    .isUUID()
    .withMessage("paymentId must be a valid UUID"),

  body("bookingId")
    .exists({ checkFalsy: true })
    .withMessage("bookingId is required")
    .isUUID()
    .withMessage("bookingId must be a valid UUID"),
];

export const failedPaymentValidations = [
  body("paymentId")
    .exists({ checkFalsy: true })
    .withMessage("paymentId is required")
    .isUUID()
    .withMessage("paymentId must be a valid UUID"),

  body("errorMessage")
    .exists({ checkFalsy: true })
    .withMessage("errorMessage is required")
    .isString()
    .withMessage("errorMessage must be a string"),
];

export const refreshPaymentIntentValidations = [
  body("paymentId")
    .exists({ checkFalsy: true })
    .withMessage("paymentId is required")
    .isUUID()
    .withMessage("paymentId must be a valid UUID"),

  body("bookingId")
    .exists({ checkFalsy: true })
    .withMessage("bookingId is required")
    .isUUID()
    .withMessage("bookingId must be a valid UUID"),
];

export const getPaymentQueryValidations = [
  query("status")
    .optional()
    .isIn(["pending", "succeeded", "failed", "cancelled", "refunded"])
    .withMessage("Invalid payment status"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO date"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const queryPaymentValidations = [
  query("userId")
    .optional()
    .isUUID()
    .withMessage("userId must be a valid UUID"),

  query("spotId")
    .optional()
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  ...getPaymentQueryValidations,
];
