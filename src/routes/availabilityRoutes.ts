import { Router } from "express";
import controller from "../controllers/availabilityController";
import { verifyUser } from "../middlewares/passport";
import { createAvailabilityValidations, dateDurationAvailabilityValidations, deleteAvailabilityValidations, updateAvailabilityValidations } from "./validations/availabilityValidations";
import { validateRequest } from "../middlewares/validation";

const router = Router();

// Route handler for availability-related endpoints
router.post("/create", verifyUser, createAvailabilityValidations, validateRequest, controller.createAvailability);
router.post("/update", verifyUser, updateAvailabilityValidations, validateRequest, controller.updateAvailability);
router.post("/delete", verifyUser, deleteAvailabilityValidations, validateRequest, controller.deleteAvailability);
router.get("/date-slots", verifyUser, dateDurationAvailabilityValidations, validateRequest, controller.dateDurationAvailability);

// Export the router
export default router;
