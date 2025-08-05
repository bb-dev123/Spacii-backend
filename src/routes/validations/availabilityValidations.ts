import { body, query } from "express-validator";
import { CustomError } from "../../middlewares/error";

const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const createAvailabilityValidations = [
  body("spotId")
    .exists({ checkFalsy: true })
    .withMessage("spotId is required")
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  body("day")
    .exists({ checkFalsy: true })
    .withMessage("day is required")
    .isIn(validDays)
    .withMessage(`day must be one of: ${validDays.join(", ")}`),

  body("startTime")
    .exists({ checkFalsy: true })
    .withMessage("startTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("startTime must be in HH:mm format"),

  body("endTime")
    .exists({ checkFalsy: true })
    .withMessage("endTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("endTime must be in HH:mm format")
    .custom((endTime, { req }) => {
      const [startHour, startMin] = req.body.startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const start = startHour * 60 + startMin;
      const end = endHour * 60 + endMin;
      if (start >= end) {
        throw new CustomError(400, "endTime must be after startTime");
      }
      return true;
    }),

  body("similarDays")
    .optional()
    .isArray()
    .withMessage("similarDays must be an array")
    .custom((arr) => {
      for (const day of arr) {
        if (!validDays.includes(day)) {
          throw new CustomError(400, `Invalid day in similarDays: ${day}`);
        }
      }
      return true;
    }),
  body("replaceOverlapping")
    .optional()
    .isIn(["false", "true", "ignore"])
    .withMessage(
      "replaceOverlapping must be either 'false', 'true' or 'ignore'"
    ),
];

export const updateAvailabilityValidations = [
  body("id")
    .exists({ checkFalsy: true })
    .withMessage("id is required")
    .isUUID()
    .withMessage("id must be a valid UUID"),

  body("spotId")
    .exists({ checkFalsy: true })
    .withMessage("spotId is required")
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  body("day")
    .exists({ checkFalsy: true })
    .withMessage("day is required")
    .isIn(validDays)
    .withMessage(`day must be one of: ${validDays.join(", ")}`),

  body("startTime")
    .exists({ checkFalsy: true })
    .withMessage("startTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("startTime must be in HH:mm format"),

  body("endTime")
    .exists({ checkFalsy: true })
    .withMessage("endTime is required")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("endTime must be in HH:mm format")
    .custom((endTime, { req }) => {
      const [startHour, startMin] = req.body.startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const start = startHour * 60 + startMin;
      const end = endHour * 60 + endMin;
      if (start >= end) {
        throw new CustomError(400, "endTime must be after startTime");
      }
      return true;
    }),
  body("replaceOverlapping")
    .optional()
    .isIn(["false", "true"])
    .withMessage(
      "replaceOverlapping must be either 'false' or 'true'"
    ),
];

export const deleteAvailabilityValidations = [
  body("id")
    .exists({ checkFalsy: true })
    .withMessage("id is required")
    .isUUID()
    .withMessage("id must be a valid UUID"),

  body("spotId")
    .exists({ checkFalsy: true })
    .withMessage("spotId is required")
    .isUUID()
    .withMessage("spotId must be a valid UUID"),
];

export const dateDurationAvailabilityValidations = [
  query("spotId")
    .exists({ checkFalsy: true })
    .withMessage("spotId is required")
    .isUUID()
    .withMessage("spotId must be a valid UUID"),

  query("date")
    .exists({ checkFalsy: true })
    .withMessage("date is required")
    .isISO8601()
    .withMessage("date must be a valid date (YYYY-MM-DD)"),

  query("duration")
    .exists({ checkFalsy: true })
    .withMessage("duration is required")
    .isNumeric()
    .withMessage("duration must be a number")
    .custom((value) => {
      if (Number(value) <= 0) {
        throw new CustomError(400, "duration must be greater than 0");
      }
      return true;
    }),
];
