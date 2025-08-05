import { Router } from "express";
import controller from "../controllers/bookingLogController";
import { verifyUser } from "../middlewares/passport";
import { bookingLocationValidations } from "./validations/bookingLogValidations";
import { validateRequest } from "../middlewares/validation";

const router = Router();

// Route handler for availability-related endpoints
router.post("/user-checkin", verifyUser, bookingLocationValidations, validateRequest, controller.userCheckin);
router.post("/host-checkin", verifyUser, bookingLocationValidations, validateRequest, controller.hostCheckin);
router.post("/user-checkout", verifyUser, bookingLocationValidations, validateRequest, controller.userCheckout);
router.post("/host-checkout", verifyUser, bookingLocationValidations, validateRequest, controller.hostCheckout);
router.get("/single:bookingId", verifyUser, bookingLocationValidations, validateRequest, controller.getBookingLog);

// Export the router
export default router;
