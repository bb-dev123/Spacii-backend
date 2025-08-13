import { body, param, query } from "express-validator";

export const createVenueValidations = [
  body("name").notEmpty().isString().withMessage("Name is required and must be a string"),
  body("totalSpaces").notEmpty().isInt({ min: 1 }).withMessage("Total spaces is required and must be a positive integer"),
  body("status").optional().isIn(["draft", "published"]).withMessage("Status must be either 'draft' or 'published'"),
  body("tag")
    .notEmpty()
    .isIn(["vibe", "occassion", "architect"])
    .withMessage("Tag is required and must be one of 'vibe', 'occassion', or 'architect'"),
  body("address").notEmpty().isString().withMessage("Address is required and must be a string"),
  body("lat").optional().isFloat({ min: -90, max: 90 }).withMessage("Latitude is required and must be between -90 and 90"),
  body("lng").optional().isFloat({ min: -180, max: 180 }).withMessage("Longitude is required and must be between -180 and 180"),
];

export const getVenueValidations = [
  param("venueId").notEmpty().isUUID().withMessage("Venue ID is required and must be a valid UUID"),
];

export const queryVenuesValidations = [
  query("name").optional().isString().withMessage("Name must be a string"),
  query("tag").optional().isIn(["vibe", "occassion", "architect"]).withMessage("Tag must be one of 'vibe', 'occassion', or 'architect'"),
  query("address").optional().isString().withMessage("Address must be a string"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1 }).withMessage("Limit must be a positive integer"),
];

export const updateVenueValidations = [
  body("id").notEmpty().isUUID().withMessage("Venue ID is required and must be a valid UUID"),
  body("name").notEmpty().isString().withMessage("Name is required and must be a string"),
  body("totalSpaces").notEmpty().isInt({ min: 1 }).withMessage("Total spaces is required and must be a positive integer"),
  body("status").optional().isIn(["draft", "published"]).withMessage("Status must be either 'draft' or 'published'"),
  body("tag")
    .notEmpty()
    .isIn(["vibe", "occassion", "architect"])
    .withMessage("Tag is required and must be one of 'vibe', 'occassion', or 'architect'"),
  body("address").notEmpty().isString().withMessage("Address is required and must be a string"),
  body("lat").optional().isFloat({ min: -90, max: 90 }).withMessage("Latitude is required and must be between -90 and 90"),
  body("lng").optional().isFloat({ min: -180, max: 180 }).withMessage("Longitude is required and must be between -180 and 180"),
];


export const getUserVenuesValidations = [
  query("name").optional().isString().withMessage("Name must be a string"),
  query("tag").optional().isIn(["vibe", "occassion", "architect"]).withMessage("Tag must be one of 'vibe', 'occassion', or 'architect'"),
  query("address").optional().isString().withMessage("Address must be a string"),
  query("status").optional().isIn(["draft", "published"]).withMessage("Status must be either 'draft' or 'published'"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1 }).withMessage("Limit must be a positive integer"),
];

export const deleteVenueValidations = [
  body("id").notEmpty().isUUID().withMessage("Venue ID is required and must be a valid UUID"),
];