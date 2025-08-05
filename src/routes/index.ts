import { Router, Request, Response } from "express";
import userRoutes from "./userRoutes";
import vehicleRoute from "./vehicleRoutes";
import spotRoute from "./spotRoutes";
import availabilityRoute from "./availabilityRoutes";
import bookingRoute from "./bookingRoutes";
import paymentRoute from "./paymentRoutes";
import bookingLogRoute from "./bookingLogRoutes";
import payoutRoutes from "./payoutRoutes";
// import plaidRoutes from "./plaidRoutes";
import analyticsRoutes from "./analyticsRoutes";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(200).send("You Have Reached the ts backend");
});

router.use("/user", userRoutes);
router.use("/vehicle", vehicleRoute);
router.use("/spot", spotRoute);
router.use("/availability", availabilityRoute);
router.use("/booking", bookingRoute);
router.use("/booking-log", bookingLogRoute);
router.use("/payment", paymentRoute);
router.use("/stripe-payout", payoutRoutes);
// router.use("/plaid", plaidRoutes);
router.use("/admin-analytics", analyticsRoutes);

// 404 handler
router.use((_req: Request, res: Response) => {
  res.status(404).send("404 Page Not Found");
});

export default router;
