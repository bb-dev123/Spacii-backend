import { Router } from "express";
import {PlatformAnalyticsController, } from "../controllers/analyticsController";
import { verifyUser } from "../middlewares/passport";

const router = Router();

// Route handler for availability-related endpoints
router.get("/platform-overview", verifyUser, PlatformAnalyticsController.getPlatformOverview);
router.get("/revenue-analytics", verifyUser, PlatformAnalyticsController.getRevenueAnalytics);
router.get("/booking-analytics", verifyUser, PlatformAnalyticsController.getBookingAnalytics);
router.get("/user-analytics", verifyUser, PlatformAnalyticsController.getUserAnalytics);
router.get("/spot-analytics", verifyUser, PlatformAnalyticsController.getSpotAnalytics);
router.get("/vehicle-analytics", verifyUser, PlatformAnalyticsController.getVehicleAnalytics);
router.get("/transaction-analytics", verifyUser, PlatformAnalyticsController.getTransactionAnalytics);
router.get("/timechange-analytics", verifyUser, PlatformAnalyticsController.getTimeChangeAnalytics);

// Export the router
export default router;
