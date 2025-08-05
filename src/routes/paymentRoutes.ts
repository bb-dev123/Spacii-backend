import express from "express";
import { verifyUser } from "../middlewares/passport";
import { PaymentController } from "../controllers/paymentController";
import { confirmPaymentValidations, failedPaymentValidations, getPaymentQueryValidations, queryPaymentValidations, refreshPaymentIntentValidations } from "./validations/paymentValidations";
import { validateRequest } from "../middlewares/validation";

const router = express.Router();

router.post("/confirm", verifyUser, confirmPaymentValidations, validateRequest, PaymentController.confirmPayment);
router.post("/failed", verifyUser, failedPaymentValidations, validateRequest, PaymentController.failedPayment);
router.post("/refresh", verifyUser, refreshPaymentIntentValidations, validateRequest, PaymentController.refreshPaymentIntent);
router.get("/user", verifyUser, getPaymentQueryValidations, validateRequest, PaymentController.getUserPayment);
router.get("/host", verifyUser, getPaymentQueryValidations, validateRequest, PaymentController.getHostPayment);
router.get("/query", verifyUser, queryPaymentValidations, validateRequest, PaymentController.queryPayment);
router.get("/earnings", verifyUser, PaymentController.getEarnings);

export default router;
