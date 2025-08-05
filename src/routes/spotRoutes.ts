import { Router } from "express";
import controller from "../controllers/spotController";
import { verifyUser } from "../middlewares/passport";
import { handleMulterUpload } from "../middlewares/multer";
import { validateRequest } from "../middlewares/validation";
import { createSpotValidations, deleteSpotValidations, getAllSpotsValidations, getHomePageSpotsValidations, getSpotValidations, getUserSpotsValidations, mapViewSpotsValidations, querySpotsValidations, spotBookedDatesValidations, suggestedSpotsValidations, updateSpotValidations } from "./validations/spotValidations";

const router = Router();

// Route handler for spot-related endpoints
router.post("/create", verifyUser, handleMulterUpload, controller.createSpot);
router.post("/update", verifyUser, handleMulterUpload, controller.updateSpot);
router.get("/single/:spotId", getSpotValidations, validateRequest, controller.getSpot);
router.get("/user-spots", verifyUser, getUserSpotsValidations, validateRequest, controller.getUserSpots);
router.get("/home-spots", verifyUser, getHomePageSpotsValidations, validateRequest, controller.getHomePageSpots);
router.get("/all", getAllSpotsValidations, validateRequest, controller.getAllSpots);
router.get("/query", querySpotsValidations, validateRequest, controller.querySpots);
router.get("/map-view", mapViewSpotsValidations, validateRequest, controller.mapViewSpots);
router.get("/booked-dates/:spotId", spotBookedDatesValidations, validateRequest, controller.spotBookedDates)
router.post("/delete", verifyUser, deleteSpotValidations, validateRequest, controller.deleteSpot);
router.get("/suggested", suggestedSpotsValidations, validateRequest, controller.suggestedSpots);

// Export the router
export default router;
