import { body, param, query } from "express-validator";
import { CustomError } from "../../middlewares/error";

export const createSpotValidations = [
  body("name")
    .notEmpty()
    .withMessage("Name is required")
    .isString()
    .withMessage("Name must be a string"),

  body("address")
    .notEmpty()
    .withMessage("Address is required")
    .isString()
    .withMessage("Address must be a string"),

  body("ratePerHour")
    .notEmpty()
    .withMessage("Rate per hour is required")
    .isNumeric()
    .withMessage("Rate per hour must be a number")
    .custom((value) => {
      if (value < 0) {
        throw new CustomError(401, "Rate per hour must be a positive number");
      }
      return true;
    }),

  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["draft", "published"])
    .withMessage("Status must be either 'draft' or 'published'"),

  // Updated validations for FormData format
  body("allowedVehicleType[compact]")
    .optional()
    .custom((value) => {
      // FormData sends boolean as string, so we need to handle both
      return (
        value === "true" || value === "false" || typeof value === "boolean"
      );
    })
    .withMessage("compact must be a boolean value"),

  body("allowedVehicleType[standard]")
    .optional()
    .custom((value) => {
      return (
        value === "true" || value === "false" || typeof value === "boolean"
      );
    })
    .withMessage("standard must be a boolean value"),

  body("allowedVehicleType[suv]")
    .optional()
    .custom((value) => {
      return (
        value === "true" || value === "false" || typeof value === "boolean"
      );
    })
    .withMessage("suv must be a boolean value"),

  body("location[type]")
    .equals("Point")
    .withMessage("Location type must be 'Point'"),

  body("location[coordinates][0]")
    .isFloat()
    .withMessage("Longitude must be a float"),

  body("location[coordinates][1]")
    .isFloat()
    .withMessage("Latitude must be a float"),

  // Updated validation for availabilities array
  body("availabilities.*.day")
    .optional()
    .isIn(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    .withMessage("Day must be a valid day of the week"),

  body("availabilities.*.startTime")
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Start time must be in HH:MM format"),

  body("availabilities.*.endTime")
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("End time must be in HH:MM format"),
];

export const getSpotValidations = [
  param("spotId")
    .notEmpty()
    .withMessage("Spot ID is required")
    .isUUID()
    .withMessage("Spot ID must be a valid UUID"),
];

export const getUserSpotsValidations = [
  query("name").optional().isString().withMessage("Name must be a string"),

  query("address")
    .optional()
    .isString()
    .withMessage("Address must be a string"),

  query("vehicleType")
    .optional()
    .isIn(["compact", "standard", "suv"])
    .withMessage("Vehicle type must be one of 'compact', 'standard', or 'suv'"),

  query("status")
    .optional()
    .isIn(["draft", "published"])
    .withMessage("Status must be 'draft' or 'published'"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be a positive integer"),
];

export const getHomePageSpotsValidations = [
  query("active")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Active must be a non-negative integer"),

  query("recent")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Recent must be a non-negative integer"),

  query("upcoming")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Upcoming must be a non-negative integer"),

  query("hosted")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Hosted must be a non-negative integer"),
];

export const getAllSpotsValidations = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be a positive integer"),
];

export const querySpotsValidations = [
  query("userId")
    .optional()
    .isUUID()
    .withMessage("User ID must be a valid UUID"),

  query("address")
    .optional()
    .isString()
    .withMessage("Address must be a string"),

  query("minRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("minRate must be a non-negative number"),

  query("maxRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("maxRate must be a non-negative number"),

  query("vehicleType")
    .optional()
    .isIn(["compact", "standard", "suv"])
    .withMessage("vehicleType must be one of 'compact', 'standard', or 'suv'"),

  query("status")
    .optional()
    .isIn(["draft", "published"])
    .withMessage("status must be 'draft' or 'published'"),

  query("date")
    .optional()
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date (YYYY-MM-DD)"),

  query("duration")
    .optional()
    .isInt({ min: 1 })
    .withMessage("duration must be a positive integer"),

  query("startTime")
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("startTime must be in HH:mm format"),

  query("type").optional().isString().withMessage("type must be a string"),

  query("lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("lat must be a valid latitude"),

  query("lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("lng must be a valid longitude"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("limit must be a positive integer"),
];

export const mapViewSpotsValidations = [
  query("userId")
    .optional()
    .isUUID()
    .withMessage("User ID must be a valid UUID"),
  query("minRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("minRate must be a non-negative number"),

  query("maxRate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("maxRate must be a non-negative number"),

  query("vehicleType")
    .optional()
    .isIn(["compact", "standard", "suv"])
    .withMessage("vehicleType must be one of 'compact', 'standard', or 'suv'"),

  query("status")
    .optional()
    .isIn(["draft", "published"])
    .withMessage("status must be 'draft' or 'published'"),

  query("date")
    .optional()
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date (YYYY-MM-DD)"),

  query("duration")
    .optional()
    .isInt({ min: 1 })
    .withMessage("duration must be a positive integer"),

  query("startTime")
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("startTime must be in HH:mm format"),

  query("type").optional().isString().withMessage("type must be a string"),

  query("lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("lat must be a valid latitude"),

  query("lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("lng must be a valid longitude"),
];

export const updateSpotValidations = [
  body("id")
    .notEmpty()
    .isUUID()
    .withMessage("Spot ID is required and must be a valid UUID"),

  body("name").optional().isString().withMessage("Name must be a string"),

  body("address").optional().isString().withMessage("Address must be a string"),

  body("ratePerHour")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Rate per hour must be a non-negative number"),

  body("status")
    .optional()
    .isIn(["draft", "published"])
    .withMessage("Status must be either 'draft' or 'published'"),

  body("location")
    .optional()
    .custom((value) => {
      if (
        typeof value !== "object" ||
        value.type !== "Point" ||
        !Array.isArray(value.coordinates) ||
        value.coordinates.length !== 2 ||
        typeof value.coordinates[0] !== "number" ||
        typeof value.coordinates[1] !== "number"
      ) {
        throw new Error(
          "Location must be a GeoJSON Point with [longitude, latitude]"
        );
      }
      return true;
    }),

  body("allowedVehicleType")
    .optional()
    .custom((value) => {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error("allowedVehicleType must be an object");
      }
      const allowedKeys = ["compact", "standard", "suv"];
      for (const key of Object.keys(value)) {
        if (!allowedKeys.includes(key)) {
          throw new Error(`Invalid vehicle type: ${key}`);
        }
        if (typeof value[key] !== "boolean") {
          throw new Error(`allowedVehicleType.${key} must be a boolean`);
        }
      }
      return true;
    }),
];

export const deleteSpotValidations = [
  body("id")
    .notEmpty()
    .withMessage("Spot ID is required")
    .isUUID()
    .withMessage("Spot ID must be a valid UUID"),
];

export const spotBookedDatesValidations = [
  param("spotId")
    .notEmpty()
    .withMessage("Spot ID is required")
    .isUUID()
    .withMessage("Spot ID must be a valid UUID"),
];

export const suggestedSpotsValidations = [
  query("userId")
    .optional()
    .isUUID()
    .withMessage("User ID must be a valid UUID"),

  query("lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a valid number between -90 and 90"),

  query("lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a valid number between -180 and 180"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be a positive integer"),
];
