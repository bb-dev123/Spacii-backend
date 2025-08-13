import { Router } from "express";
import controller from "../controllers/venueController";
import { verifyUser } from "../middlewares/passport";
import { validateRequest } from "../middlewares/validation";

const router = Router();

// Route handler for vehicle-related endpoints
router.post("/create", verifyUser, createVehicleValidations, validateRequest, controller.createVehicle);
router.get("/single/:vehicleId", getVehicleValidations, validateRequest, controller.getVehicle);
router.get("/user-vehicles", verifyUser, userVehiclesQueryValidations, validateRequest, controller.getUserVehicles);
router.get("/query", vehiclesQueryValidations, validateRequest, controller.queryVehicles);
router.post("/update", verifyUser, updateVehicleValidations, validateRequest, controller.updateVehicle);
router.post("/delete", verifyUser, deleteVehicleValidations, validateRequest, controller.deleteVehicle);

// Export the router
export default router;
