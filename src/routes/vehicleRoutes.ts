import { Router } from "express";
import controller from "../controllers/vehicleController";
import { verifyUser } from "../middlewares/passport";
import { validateRequest } from "../middlewares/validation";
import { createVehicleValidations, deleteVehicleValidations, getVehicleValidations, updateVehicleValidations, userVehiclesQueryValidations, vehiclesQueryValidations } from "./validations/vehicleValidations";

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
