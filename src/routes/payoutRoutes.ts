import { Router } from "express";
import {
  StripeConnectController,
  StripeConnectControllerExtended,
} from "../controllers/payoutController";
import { body, param, query } from "express-validator";
import { validateRequest } from "../middlewares/validation";
import { authenticate } from "../middlewares/authentication";
import { verifyUser } from "../middlewares/passport";
import {
  checkPayoutStatusValidations,
  createConnectAccountValidations,
  createPayoutValidations,
  getPayoutsHistoryValidations,
} from "./validations/payoutValidations";
import express from "express";

const router = Router();

// Public routes
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  StripeConnectController.handleWebhook
);
router.get("/redirect/return", StripeConnectController.handleStripeReturn);
router.get("/redirect/refresh", StripeConnectController.handleStripeRefresh);
// Authenticated routes
router.use(authenticate);

// User routes
router.post(
  "/create-account",
  verifyUser,
  StripeConnectController.createConnectAccount
);
router.get(
  "/account-status",
  verifyUser,
  StripeConnectController.getConnectAccountStatus
);
router.get("/balance", verifyUser, StripeConnectController.getAvailableBalance);
router.post(
  "/payout",
  createPayoutValidations,
  validateRequest,
  verifyUser,
  StripeConnectController.createPayout
);
router.get(
  "/payouts",
  getPayoutsHistoryValidations,
  validateRequest,
  verifyUser,
  StripeConnectController.getPayoutsHistory
);
router.get(
  "/single-payout/:payoutId",
  checkPayoutStatusValidations,
  validateRequest,
  verifyUser,
  StripeConnectControllerExtended.getPayoutDetails
);
router.get(
  "/single-payout-status/:payoutId",
  checkPayoutStatusValidations,
  validateRequest,
  verifyUser,
  StripeConnectController.checkPayoutStatus
);

// Admin-only routes
// router.get('/admin/payouts',
//   query('page').optional().isInt({ min: 1 }),
//   query('limit').optional().isInt({ min: 1, max: 100 }),
//   query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
//   query('userId').optional().isUUID(),
//   validateRequest, verifyUser,
//   PlaidControllerExtensions.getAllPayouts
// );

// router.get('/admin/balance', PlaidControllerExtensions.getAdminAccountBalance);

// router.post('/admin/bulk-payout',
//   bulkPayoutValidation,
//   validateRequest, verifyUser,
//   PlaidControllerExtensions.createBulkPayouts
// );

// router.get('/admin/analytics',
//   query('startDate').optional().isISO8601(),
//   query('endDate').optional().isISO8601(),
//   validateRequest, verifyUser,
//   PlaidControllerExtensions.getPayoutAnalytics
// );

export default router;
