import { body, param, query } from "express-validator";
import { CustomError } from "../../middlewares/error";

export const createConnectAccountValidations = [
  body("refresh_url")
    .exists({ checkFalsy: true })
    .withMessage("refresh_url is required")
    .isURL()
    .withMessage("refresh_url must be a valid URL"),

  body("return_url")
    .exists({ checkFalsy: true })
    .withMessage("return_url is required")
    .isURL()
    .withMessage("return_url must be a valid URL"),
];

export const createPayoutValidations = [
  body("amount")
    .exists({ checkFalsy: true })
    .withMessage("Amount is required")
    .isNumeric()
    .withMessage("Amount must be a number")
    .custom((value) => {
      if (value <= 0) {
        throw new CustomError(400, "Amount must be greater than 0");
      }
      return true;
    }),
];

export const getPayoutsHistoryValidations = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO date"),

  query("status")
    .optional()
    .isString()
    .withMessage("status must be a string"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const checkPayoutStatusValidations = [
  param("payoutId")
    .exists()
    .withMessage("payoutId is required")
    .isUUID()
    .withMessage("payoutId must be a valid UUID"),
];

export const getEarningsBreakdownValidations = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO8601 date (YYYY-MM-DD)"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO8601 date (YYYY-MM-DD)"),

  query("period")
    .optional()
    .isIn(["day", "week", "month"])
    .withMessage("period must be one of: day, week, month"),
];