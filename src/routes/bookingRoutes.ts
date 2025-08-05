import { Router } from "express";
import controller from "../controllers/bookingController";
import { verifyUser } from "../middlewares/passport";
import { bookSpotValidations, changeTimeValidations, combinedBookingQueryValidations, getBookingValidations, getPastBookingsValidations, getQueryBookingsValidations, getUserBookingsValidations, queryTimeChangeValidations, timeChangeIdValidation, updateBookingValidations, updateTimeChangeValidations } from "./validations/bookingValidations";
import { validateRequest } from "../middlewares/validation";
import { bookingIdBodyValidation } from "./validations/bookingLogValidations";

const router = Router();

// Route handler for booking-related endpoints
router.post("/book", verifyUser, bookSpotValidations, validateRequest, controller.bookSpot);
router.get("/single/:bookingId", getBookingValidations, validateRequest, controller.getBooking);
router.get("/client-bookings", verifyUser, getUserBookingsValidations, validateRequest, controller.getClientBookings);
router.get("/host-bookings", verifyUser, getUserBookingsValidations, validateRequest, controller.getHostBookings);
router.get("/query", getQueryBookingsValidations, validateRequest, controller.getQueryBookings);
router.get("/client-past-bookings", verifyUser, getPastBookingsValidations, validateRequest, controller.getPastBookings);
// router.post("/update", verifyUser, updateBookingValidations, validateRequest, controller.updateBooking);
router.post("/cancel", verifyUser, bookingIdBodyValidation, validateRequest, controller.cancelBooking);
router.post("/accept-request", verifyUser, bookingIdBodyValidation, validateRequest, controller.acceptBooking);
router.post("/deny-request", verifyUser, bookingIdBodyValidation, validateRequest, controller.denyBookingRequest);
router.post("/timechange", verifyUser, changeTimeValidations, validateRequest, controller.changeTime);
router.post("/accept-timechange", verifyUser, timeChangeIdValidation, validateRequest, controller.acceptTimeChange);
router.post("/deny-timechange", verifyUser, timeChangeIdValidation, validateRequest, controller.denyTimeChange);
router.post("/update-timechange", verifyUser, updateTimeChangeValidations, validateRequest, controller.updateTimeChange);
router.get("/query-timechange", verifyUser, queryTimeChangeValidations, validateRequest, controller.queryTimeChange);
router.get("/combined-booking-timechange", combinedBookingQueryValidations, verifyUser, validateRequest, controller.combinedBookingAndTimeChangeAndPaymentPending);

// Export the router
export default router;
