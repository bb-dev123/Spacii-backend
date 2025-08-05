import { body, param, query } from "express-validator";

export const bookSpotValidations = [
  body("vehicleId")
    .exists({ checkFalsy: true })
    .withMessage("vehicleId is required")
    .isUUID()
    .withMessage("vehicleId must be a valid UUID"),

  body("spotId")
    .exists({ checkFalsy: true })
    .withMessage("spotId is required")
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  body("startDate")
    .exists({ checkFalsy: true })
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid date"),

  body("endDate")
    .exists({ checkFalsy: true })
    .withMessage("endDate is required")
    .isISO8601()
    .withMessage("endDate must be a valid date"),

  body("day").exists({ checkFalsy: true }).withMessage("day is required"),

  body("startTime")
    .exists({ checkFalsy: true })
    .withMessage("startTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("startTime must be in HH:mm format"),

  body("endTime")
    .exists({ checkFalsy: true })
    .withMessage("endTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("endTime must be in HH:mm format"),

  body("grossAmount")
    .optional()
    .isNumeric()
    .withMessage("grossAmount must be a number"),

  body("type")
    .optional()
    .isIn(["normal", "custom"])
    .withMessage("type must be either 'normal' or 'custom'"),
];

export const getBookingValidations = [
  param("bookingId")
    .exists({ checkFalsy: true })
    .withMessage("bookingId is required")
    .isUUID()
    .withMessage("bookingId must be a valid UUID"),
];

export const getUserBookingsValidations = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid date"),

  query("status")
    .optional()
    .isIn([
      "payment-pending",
      "request-pending",
      "rejected",
      "accepted",
      "completed",
      "cancelled",
    ])
    .withMessage("Invalid booking status"),
    
  query("spotId")
    .optional()
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const getQueryBookingsValidations = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid date"),

  query("day").optional().isString(),

  query("vehicleId")
    .optional()
    .isUUID()
    .withMessage("vehicleId must be a valid UUID"),

  query("spotId")
    .optional()
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  query("status")
    .optional()
    .isIn([
      "payment-pending",
      "request-pending",
      "rejected",
      "accepted",
      "completed",
      "cancelled",
    ])
    .withMessage("Invalid booking status"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const getPastBookingsValidations = [
  query("vehicleId")
    .optional()
    .isUUID()
    .withMessage("vehicleId must be a valid UUID"),

  query("spotId")
    .optional()
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const updateBookingValidations = [
  body("id")
    .exists({ checkFalsy: true })
    .withMessage("id is required")
    .isUUID()
    .withMessage("id must be a valid UUID"),

  body("vehicleId")
    .exists({ checkFalsy: true })
    .withMessage("vehicleId is required")
    .isUUID()
    .withMessage("vehicleId must be a valid UUID"),

  body("startDate")
    .exists({ checkFalsy: true })
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid date"),

  body("endDate")
    .exists({ checkFalsy: true })
    .withMessage("endDate is required")
    .isISO8601()
    .withMessage("endDate must be a valid date"),

  body("day").exists({ checkFalsy: true }).withMessage("day is required"),

  body("startTime")
    .exists({ checkFalsy: true })
    .withMessage("startTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("startTime must be in HH:mm format"),

  body("endTime")
    .exists({ checkFalsy: true })
    .withMessage("endTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("endTime must be in HH:mm format"),

  body("type")
    .optional()
    .isIn(["normal", "custom"])
    .withMessage("type must be either 'normal' or 'custom'"),
];

export const bookingIdBodyValidation = [
  body("id")
    .exists({ checkFalsy: true })
    .withMessage("Booking ID is required")
    .isUUID()
    .withMessage("Booking ID must be a valid UUID"),
];

export const changeTimeValidations = [
  body("bookingId")
    .exists({ checkFalsy: true })
    .withMessage("bookingId is required")
    .isUUID()
    .withMessage("bookingId must be a valid UUID"),

  body("newDay").exists({ checkFalsy: true }).withMessage("newDay is required"),

  body("newStartDate")
    .exists({ checkFalsy: true })
    .withMessage("newStartDate is required")
    .isISO8601()
    .withMessage("newStartDate must be a valid date"),

  body("newStartTime")
    .exists({ checkFalsy: true })
    .withMessage("newStartTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("newStartTime must be in HH:mm format"),

  body("newEndDate")
    .exists({ checkFalsy: true })
    .withMessage("newEndDate is required")
    .isISO8601()
    .withMessage("newEndDate must be a valid date"),

  body("newEndTime")
    .exists({ checkFalsy: true })
    .withMessage("newEndTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("newEndTime must be in HH:mm format"),
];

export const timeChangeIdValidation = [
  body("timeChangeId")
    .exists({ checkFalsy: true })
    .withMessage("timeChangeId is required")
    .isUUID()
    .withMessage("timeChangeId must be a valid UUID"),
];

export const updateTimeChangeValidations = [
  body("timeChangeId")
    .exists({ checkFalsy: true })
    .withMessage("timeChangeId is required")
    .isUUID()
    .withMessage("timeChangeId must be a valid UUID"),

  body("newDay").exists({ checkFalsy: true }).withMessage("newDay is required"),

  body("newStartDate")
    .exists({ checkFalsy: true })
    .withMessage("newStartDate is required")
    .isISO8601()
    .withMessage("newStartDate must be a valid date"),

  body("newStartTime")
    .exists({ checkFalsy: true })
    .withMessage("newStartTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("newStartTime must be in HH:mm format"),

  body("newEndDate")
    .exists({ checkFalsy: true })
    .withMessage("newEndDate is required")
    .isISO8601()
    .withMessage("newEndDate must be a valid date"),

  body("newEndTime")
    .exists({ checkFalsy: true })
    .withMessage("newEndTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("newEndTime must be in HH:mm format"),
];

export const queryTimeChangeValidations = [
  query("id").optional().isUUID().withMessage("id must be a valid UUID"),

  query("bookingId")
    .optional()
    .isUUID()
    .withMessage("bookingId must be a valid UUID"),

  query("spotId")
    .optional()
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  query("clientId")
    .optional()
    .isUUID()
    .withMessage("clientId must be a valid UUID"),

  query("hostId")
    .optional()
    .isUUID()
    .withMessage("hostId must be a valid UUID"),

  query("status")
    .optional()
    .isIn(["pending", "rejected", "accepted"])
    .withMessage("status must be one of: pending, rejected, accepted"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const combinedBookingQueryValidations = [
  query("vehicleId")
    .optional()
    .isUUID()
    .withMessage("vehicleId must be a valid UUID"),

  query("spotId")
    .optional()
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];
