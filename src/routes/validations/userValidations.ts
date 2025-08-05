import { body, query } from "express-validator";

export const signupValidations = [
  body("name").optional().isString().withMessage("Name must be a string"),

  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Email must be valid"),

  body("phone")
    .optional()
    .isMobilePhone("any")
    .withMessage("Phone number must be valid"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  body("fcmtoken")
    .optional()
    .isString()
    .withMessage("FCM token must be a string"),
];

export const verifyEmailValidations = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Email must be valid"),

  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .isString()
    .withMessage("OTP must be a string"),
];

export const loginValidations = [
  body("type")
    .notEmpty()
    .withMessage("Login type is required")
    .isIn(["credentials", "google", "apple"])
    .withMessage(
      "Login type must be either 'credentials', 'google', or 'apple'"
    ),

  body("email")
    .if(body("type").equals("credentials"))
    .notEmpty()
    .withMessage("Email is required for credentials login")
    .isEmail()
    .withMessage("Must be a valid email"),

  body("password")
    .if(body("type").equals("credentials"))
    .notEmpty()
    .withMessage("Password is required for credentials login"),

  body("idtoken")
    .if(body("type").custom((t) => t === "google" || t === "apple"))
    .notEmpty()
    .withMessage("ID token is required for Google or Apple login"),

  body("fcmtoken")
    .optional()
    .isString()
    .withMessage("FCM token must be a string"),
];

export const forgotPasswordValidations = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Email must be valid"),
];

export const resetPasswordValidations = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),

  body("resetToken")
    .notEmpty()
    .withMessage("Reset token is required")
    .isString()
    .withMessage("Reset token must be a string"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters long"),
];

export const updateProfileValidations = [
  body("name").optional().isString().withMessage("Name must be a string"),

  body("phone")
    .optional()
    .isMobilePhone("any")
    .withMessage("Phone must be a valid mobile number"),
];

export const queryNotificationsValidations = [
  query("isRead")
    .optional()
    .isBoolean()
    .withMessage("isRead must be a boolean value"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be a positive integer"),
];

export const idValidation = [
  body("id")
    .exists({ checkFalsy: true })
    .withMessage("ID is required")
    .isUUID()
    .withMessage("ID must be a valid UUID"),
];

export const usersQueryValidations = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("name").optional().isString().withMessage("Name must be a string"),
  query("email")
    .optional()
    .isEmail()
    .withMessage("Email must be a valid email"),
  body("phone")
    .optional()
    .isMobilePhone("any")
    .withMessage("Phone must be a valid mobile number"),
];
