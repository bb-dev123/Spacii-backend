import { body, param, query } from "express-validator";

export const createVehicleValidations = [
  body("name").notEmpty().isString().withMessage("Name is required and must be a string"),
  body("make").notEmpty().isString().withMessage("Make is required and must be a string"),
  body("type").notEmpty().isString().withMessage("Type is required and must be a string"),
  body("model").notEmpty().isString().withMessage("Model is required and must be a string"),
  body("licensePlate").notEmpty().isString().withMessage("License Plate is required and must be a string"),
  body("color").notEmpty().isString().withMessage("Color is required and must be a string"),
];

export const getVehicleValidations = [
  param("vehicleId").notEmpty().isUUID().withMessage("Vehicle ID is required and must be a valid UUID"),
];

export const updateVehicleValidations = [
  body("id").notEmpty().isUUID().withMessage("Vehicle ID is required and must be a valid UUID"),
  body("name").notEmpty().isString().withMessage("Name is required and must be a string"),
  body("make").notEmpty().isString().withMessage("Make is required and must be a string"),
  body("type").notEmpty().isString().withMessage("Type is required and must be a string"),
  body("model").notEmpty().isString().withMessage("Model is required and must be a string"),
  body("licensePlate").notEmpty().isString().withMessage("License Plate is required and must be a string"),
  body("color").notEmpty().isString().withMessage("Color is required and must be a string"),
];

export const userVehiclesQueryValidations = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("name").optional().isString().withMessage("Name must be a string"),
  query("licensePlate").optional().isString().withMessage("License Plate must be a string"),
  query("type").optional().isString().withMessage("Type must be a string"),
];

export const vehiclesQueryValidations = [
query("userId").optional().isUUID().withMessage("User ID must be a valid UUID"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("name").optional().isString().withMessage("Name must be a string"),
  query("licensePlate").optional().isString().withMessage("License Plate must be a string"),
  query("type").optional().isString().withMessage("Type must be a string"),
];

export const deleteVehicleValidations = [
  body("id").notEmpty().isUUID().withMessage("Vehicle ID is required and must be a valid UUID"),
];