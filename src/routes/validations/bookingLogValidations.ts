import { body } from "express-validator";
import { CustomError } from "../../middlewares/error";

export const bookingIdBodyValidation = body("id")
  .exists({ checkFalsy: true })
  .withMessage("id is required")
  .isUUID()
  .withMessage("id must be a valid UUID");

export const locationValidation = body("location")
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
      throw new CustomError(
        400,
        "location must be in GeoJSON format: { type: 'Point', coordinates: [longitude, latitude] }"
      );
    }

    const [lng, lat] = value.coordinates;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new CustomError(400, "location coordinates are out of bounds");
    }

    return true;
  });

// Export validators for reuse
export const bookingLocationValidations = [bookingIdBodyValidation, locationValidation];
