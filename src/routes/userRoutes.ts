import { Router } from "express";
import controller from "../controllers/userController";
import { verifyAdmin, verifyUser } from "../middlewares/passport";
import { signupLimiter } from "../helpers/emailHelpers";
import upload from "../middlewares/multer";
import { body, query } from "express-validator";
import { validateRequest } from "../middlewares/validation";
import {
  forgotPasswordValidations,
  idValidation,
  loginValidations,
  queryNotificationsValidations,
  resetPasswordValidations,
  signupValidations,
  updateProfileValidations,
  usersQueryValidations,
  verifyEmailValidations,
} from "./validations/userValidations";

const router = Router();

router.post("/login", loginValidations, validateRequest, controller.login);
router.post("/logout", verifyUser, controller.logout);
router.post(
  "/signup",
  signupValidations,
  validateRequest,
  signupLimiter,
  controller.signup
);
router.post(
  "/verify-email",
  body("email").notEmpty().isEmail().withMessage("Invalid email format"),
  body("otp").notEmpty().isString().withMessage("Invalid OTP format"),
  validateRequest,
  controller.verifyEmail
);
router.post("/forgot-password", forgotPasswordValidations, validateRequest, controller.forgotPassword);
router.post("/password-reset-otp", verifyEmailValidations, validateRequest, controller.verifyResetOTP);
router.post("/reset-password", resetPasswordValidations, validateRequest, controller.resetPassword);
router.post("/resend-password-otp", body("email").notEmpty().isEmail().withMessage("Invalid email format"), validateRequest, controller.resendVerificationOTP);
router.get("/profile", verifyUser, controller.getUser);
router.post(
  "/update-profile",
  updateProfileValidations,
  validateRequest,
  verifyUser,
  upload.single("image"),
  controller.updateProfile
);
router.post("/block-unblock", verifyAdmin, idValidation, validateRequest, controller.blockUnblock);
router.get("/query", verifyAdmin, usersQueryValidations, validateRequest, controller.queryUsers);

export default router;
