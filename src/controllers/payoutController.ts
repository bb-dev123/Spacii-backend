import Stripe from "stripe";
import { AuthenticatedRequest, Booking, Payment } from "../constants";
import { NextFunction, Request, Response } from "express";
import { CustomError } from "../middlewares/error";
import db from "../models";
import { Op } from "sequelize";
import { sendNotification, userLogs } from "../helpers/notificationHelper";
import {
  CANCELLATION_FEE_PERCENTAGE,
  MAX_DAILY_PAYOUTS,
  MIN_PAYOUT_AMOUNT,
  PLATFORM_FEE,
  STRIPE_PAYOUT_FEE,
  TAX_RATE,
} from "../constants/payment";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

const payoutAttempts = new Map<string, { count: number; date: string }>();

const checkPayoutRateLimit = (userId: string): boolean => {
  const today = new Date().toISOString().split("T")[0];
  const userAttempts = payoutAttempts.get(userId);

  if (!userAttempts || userAttempts.date !== today) {
    payoutAttempts.set(userId, { count: 1, date: today });
    return true;
  }

  if (userAttempts.count >= MAX_DAILY_PAYOUTS) {
    return false;
  }

  userAttempts.count++;
  return true;
};

interface PaymentWithPayoutItem extends Payment {
  booking: {
    id: string;
    status: string;
    canceledBy: "user" | "host" | null;
  };
}

interface QueryPayoutHistory {
  startDate?: string;
  endDate?: string;
  status?: string;
  page?: string;
  limit?: string;
}

const createPayoutNotification = async (
  userId: string,
  payout: any,
  status: string,
  fee?: number
) => {
  console.log(`Payout notification for user ${userId}: ${status}`);
};

export const StripeConnectController = {
  createConnectAccount: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const transaction = await db.sequelize.transaction();
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      let stripeAccount = await db.StripeAccount.findOne({
        where: { userId },
      });

      if (!stripeAccount) {

        const account = await stripe.accounts.create({
          type: "express",
          country: "US",
          email: req.user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          individual: {
            first_name: req.user.name || undefined,
            last_name: req.user.name || undefined,
            email: req.user.email || undefined
          }
        });

        console.log("Stripe account created:", account);

        stripeAccount = await db.StripeAccount.create(
          {
            userId,
            accountId: account.id,
            accountType: account.type,
            country: account.country,
            currency: account.default_currency,
            businessType: account.business_type || "individual",
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            requirementsCurrentlyDue:
              account?.requirements?.currently_due || [],
            requirementsPastDue: account?.requirements?.past_due || [],
            isActive: true,
          },
          { transaction }
        );
      }

      const baseUrl = "https://spotie.dev.theevesociety.com";
      const refreshUrl = `${baseUrl}/api/stripe-payout/redirect/refresh`;
      const returnUrl = `${baseUrl}/api/stripe-payout/redirect/return`;

      console.log("Creating account link with URLs:", {
        refreshUrl,
        returnUrl,
      });

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccount.accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      await transaction.commit();

      res.send({
        type: "success",
        message: "Connect account created successfully",
        data: {
          url: accountLink.url,
          accountId: stripeAccount.accountId,
        },
      });
    } catch (error: any) {
      await transaction.rollback();
      console.error("Error creating Stripe Connect account:", error);

      if (error.type === "StripeInvalidRequestError") {
        console.error("Stripe error details:", {
          message: error.message,
          code: error.code,
          param: error.param,
          type: error.type,
        });
        return next(
          new CustomError(400, `Stripe configuration error: ${error.message}`)
        );
      }

      if (error.code === "account_invalid") {
        return next(
          new CustomError(
            400,
            "Invalid account configuration. Please try again."
          )
        );
      }

      next(error);
    }
  },

  handleStripeReturn: async (
    req: any,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log(
        "Stripe Connect return redirect - setup completed successfully"
      );
      console.log("Query params:", req.query);

      if (req.query.error) {
        console.error("Stripe onboarding error:", req.query.error);
        return res.redirect(
          "test://stripe-connect/error?reason=" +
            encodeURIComponent(req?.query?.error)
        );
      }

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Setup Complete</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    text-align: center;
                    background: rgba(255,255,255,0.1);
                    backdrop-filter: blur(10px);
                    padding: 3rem 2rem;
                    border-radius: 20px;
                    box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
                    border: 1px solid rgba(255, 255, 255, 0.18);
                    max-width: 400px;
                    width: 90%;
                }
                .success-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    animation: bounce 2s infinite;
                }
                @keyframes bounce {
                    0%, 20%, 60%, 100% { transform: translateY(0); }
                    40% { transform: translateY(-20px); }
                    80% { transform: translateY(-10px); }
                }
                .spinner {
                    border: 3px solid rgba(255,255,255,0.3);
                    border-top: 3px solid white;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 1rem auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                h1 {
                    margin-bottom: 1rem;
                    font-size: 1.8rem;
                    font-weight: 600;
                }
                p {
                    margin-bottom: 1.5rem;
                    opacity: 0.9;
                    line-height: 1.5;
                }
                .fallback {
                    display: none;
                    margin-top: 2rem;
                }
                .fallback.show {
                    display: block;
                }
                button {
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 1px solid rgba(255,255,255,0.3);
                    padding: 12px 24px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 1rem;
                    font-weight: 500;
                    transition: all 0.3s ease;
                }
                button:hover {
                    background: rgba(255,255,255,0.3);
                    transform: translateY(-2px);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✅</div>
                <h1>Setup Complete!</h1>
                <p>Your payout account has been successfully connected. Redirecting you back to the app...</p>
                <div class="spinner"></div>
                
                <div class="fallback" id="fallback">
                    <p style="font-size: 0.9rem;">If the app didn't open automatically:</p>
                    <button onclick="openApp()">Open App</button>
                </div>
            </div>

            <script>
                const deepLinkUrl = 'test://stripe-connect/return';
                let redirectAttempts = 0;
                const maxAttempts = 3;
                
                function openApp() {
                    console.log('Attempting to open app with:', deepLinkUrl);
                    
                    // Create a hidden iframe to trigger the deep link
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = deepLinkUrl;
                    document.body.appendChild(iframe);
                    
                    // Also try direct navigation
                    window.location.href = deepLinkUrl;
                    
                    redirectAttempts++;
                    
                    // Remove iframe after a short delay
                    setTimeout(() => {
                        if (iframe.parentNode) {
                            iframe.parentNode.removeChild(iframe);
                        }
                    }, 1000);
                }
                
                // Attempt to open the app immediately
                window.onload = function() {
                    console.log('Page loaded, attempting to redirect to app');
                    
                    // Initial attempt after 1 second
                    setTimeout(openApp, 1000);
                    
                    // Retry after 3 seconds if first attempt fails
                    setTimeout(() => {
                        if (redirectAttempts === 1) {
                            openApp();
                        }
                    }, 3000);
                    
                    // Show fallback options after 5 seconds
                    setTimeout(function() {
                        document.getElementById('fallback').classList.add('show');
                    }, 5000);
                };

                // Handle visibility change (when user returns from app)
                document.addEventListener('visibilitychange', function() {
                    if (!document.hidden) {
                        console.log('User returned to browser tab');
                        // Optionally close this tab/window
                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    }
                });
            </script>
        </body>
        </html>
      `;

      res.send(html);
    } catch (error: any) {
      console.error("Error handling Stripe return:", error);
      next(error);
    }
  },

  handleStripeRefresh: async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log("Stripe Connect refresh redirect - setup needs completion");
      console.log("Query params:", req.query);

      // Similar HTML structure but for refresh/incomplete setup
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Setup Required</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                }
                .container {
                    text-align: center;
                    background: rgba(255,255,255,0.1);
                    backdrop-filter: blur(10px);
                    padding: 3rem 2rem;
                    border-radius: 20px;
                    box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
                    border: 1px solid rgba(255, 255, 255, 0.18);
                    max-width: 400px;
                    width: 90%;
                }
                .warning-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
                .spinner {
                    border: 3px solid rgba(255,255,255,0.3);
                    border-top: 3px solid white;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 1rem auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                h1, p, button { /* Same styles as before */ }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="warning-icon">⚠️</div>
                <h1>Setup Incomplete</h1>
                <p>Your account setup requires additional information. Redirecting you back to complete the process...</p>
                <div class="spinner"></div>
                
                <div class="fallback" id="fallback">
                    <p style="font-size: 0.9rem;">If the app didn't open automatically:</p>
                    <button onclick="openApp()">Open App</button>
                </div>
            </div>

            <script>
                const deepLinkUrl = 'test://stripe-connect/refresh';
                
                function openApp() {
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = deepLinkUrl;
                    document.body.appendChild(iframe);
                    window.location.href = deepLinkUrl;
                    
                    setTimeout(() => {
                        if (iframe.parentNode) {
                            iframe.parentNode.removeChild(iframe);
                        }
                    }, 1000);
                }
                
                window.onload = function() {
                    setTimeout(openApp, 1000);
                    setTimeout(() => document.getElementById('fallback').classList.add('show'), 5000);
                };
            </script>
        </body>
        </html>
      `;

      res.send(html);
    } catch (error: any) {
      console.error("Error handling Stripe refresh:", error);
      next(error);
    }
  },

  getConnectAccountStatus: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      const user = await db.User.findByPk(userId);
      const stripeAccount = await db.StripeAccount.findOne({
        where: { userId },
      });

      if (!user || !stripeAccount) {
        res.send({
          type: "success",
          data: {
            hasAccount: false,
            isComplete: false,
          },
        });
        return;
      }

      // Always fetch fresh data from Stripe
      const account = await stripe.accounts.retrieve(stripeAccount.accountId);

      // Update local record with fresh data
      await stripeAccount.update({
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsCurrentlyDue: account?.requirements?.currently_due || [],
        requirementsPastDue: account?.requirements?.past_due || [],
      });

      res.json({
        type: "success",
        data: {
          hasAccount: true,
          isComplete:
            account.details_submitted &&
            account.charges_enabled &&
            account.payouts_enabled,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          country: account.country,
          defaultCurrency: account.default_currency,
          requirementsCurrentlyDue: account?.requirements?.currently_due || [],
          requirementsPastDue: account?.requirements?.past_due || [],
        },
      });
    } catch (error: any) {
      console.error("Error getting Stripe Connect account status:", error);
      next(error);
    }
  },

  handleWebhook: async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }
    console.log("Received Stripe webhook event:", event);

    try {
      switch (event.type as string) {
        // Transfer events
        case "transfer.created":
          await handleTransferCreated(event.data.object as Stripe.Transfer);
          break;
        case "transfer.updated":
          await handleTransferPaid(event.data.object as Stripe.Transfer);
          break;
        case "transfer.reversed":
          await handleTransferReversed(event.data.object as Stripe.Transfer);
          break;

        // Account events
        case "account.updated":
          await handleAccountUpdated(event.data.object as Stripe.Account);
          break;
        case "account.application.deauthorized":
          await handleAccountApplicationWebhook(event);
          break;
        case "account.external_account.created":
        case "account.external_account.deleted":
          await handleAccountApplicationWebhook(event);
          break;

        // Payment events
        case "payment_intent.succeeded":
          await handlePaymentSucceeded(
            event.data.object as Stripe.PaymentIntent
          );
          break;
        case "payment_intent.payment_failed":
          await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        // Capability events
        case "capability.updated":
          await handleCapabilityUpdated(event);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ status: 200, received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  },

  createPayout: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const transaction = await db.sequelize.transaction();
    const { amount } = req.body;

    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      if (!checkPayoutRateLimit(userId)) {
        throw new CustomError(
          429,
          "Daily payout limit exceeded. Maximum 3 payouts per day."
        );
      }

      if (!amount || amount <= 0) {
        throw new CustomError(400, "Valid amount is required");
      }

      if (amount < MIN_PAYOUT_AMOUNT) {
        throw new CustomError(
          400,
          `Minimum payout amount is $${MIN_PAYOUT_AMOUNT.toFixed(2)}`
        );
      }

      const user = await db.User.findByPk(userId, { transaction });
      const stripeAccount = await db.StripeAccount.findOne({
        where: { userId },
        transaction,
      });

      if (!user || !stripeAccount) {
        throw new CustomError(
          404,
          "Stripe Connect account not found. Please complete account setup first."
        );
      }

      const account = await stripe.accounts.retrieve(stripeAccount.accountId);

      if (!account.payouts_enabled) {
        throw new CustomError(
          400,
          "Payout capability not enabled. Please complete your Stripe Connect account setup."
        );
      }

      const availableBalance = await getAvailableBalanceForUser(
        userId,
        transaction
      );

      if (amount > availableBalance) {
        throw new CustomError(
          400,
          `Insufficient funds. Available: $${availableBalance.toFixed(2)}`
        );
      }

      const netAmount = amount - STRIPE_PAYOUT_FEE;

      if (netAmount <= 0) {
        throw new CustomError(
          400,
          `Amount too small. After payout fee of $${STRIPE_PAYOUT_FEE.toFixed(
            2
          )}, net amount would be $${netAmount.toFixed(2)}`
        );
      }

      const payout = await db.Payout.create(
        {
          userId,
          stripeAccountId: stripeAccount.id,
          grossAmount: amount,
          platformFee: PLATFORM_FEE,
          stripeFee: STRIPE_PAYOUT_FEE,
          taxFee: TAX_RATE,
          netAmount,
          currency: "USD",
          status: "pending",
          payoutDate: new Date(),
          transferId: null,
          metadata: {
            originalAmount: amount,
            netAmount,
            stripeFee: STRIPE_PAYOUT_FEE,
          },
        },
        { transaction }
      );

      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(netAmount * 100), // Stripe expects cents
          currency: "usd",
          destination: stripeAccount.accountId,
          description: `Payout for user ${userId}`,
          metadata: {
            payoutId: payout.id.toString(),
            userId: userId.toString(),
            originalAmount: amount.toString(),
          },
        });

        await payout.update(
          {
            status: "processing",
            transferId: transfer.id,
          },
          { transaction }
        );

        await transaction.commit();
        await createPayoutNotification(
          userId,
          payout,
          "initiated",
          STRIPE_PAYOUT_FEE
        );

        res.json({
          type: "success",
          message: "Payout initiated successfully",
          payout: {
            id: payout.id,
            originalAmount: amount,
            stripeFee: STRIPE_PAYOUT_FEE,
            netAmount,
            status: payout.status,
            payoutDate: payout.payoutDate,
            transferId: payout.transferId,
          },
        });
      } catch (transferError: any) {
        await payout.update(
          {
            status: "failed",
            errorMessage: transferError.message || "Transfer failed",
          },
          { transaction }
        );

        await transaction.commit();
        throw new CustomError(
          500,
          `Failed to create payout: ${transferError.message}`
        );
      }
    } catch (error) {
      await transaction.rollback();
      console.error("Error creating payout:", error);
      next(error);
    }
  },

  getAvailableBalance: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      const balanceData = await getDetailedBalanceForUser(userId);
      res.json({
        type: "success",
        data: balanceData,
      });
    } catch (error) {
      console.error("Error getting available balance:", error);
      next(error);
    }
  },

  getPayoutsHistory: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const {
        startDate,
        endDate,
        status,
        page = 1,
        limit = 10,
      } = req.query as QueryPayoutHistory;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      const whereClause: any = { userId };
      if (status) {
        const validStatuses = ["pending", "completed", "failed", "processing"];
        if (!validStatuses.includes(status)) {
          throw new CustomError(400, "Invalid payout status");
        }
        whereClause.status = status;
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (startDate && !dateRegex.test(startDate)) {
        throw new CustomError(400, "startDate must be in format YYYY-MM-DD");
      }

      if (endDate && !dateRegex.test(endDate)) {
        throw new CustomError(400, "endDate must be in format YYYY-MM-DD");
      }

      if (startDate && endDate) {
        whereClause.createdAt = {
          [Op.between]: [new Date(startDate), new Date(endDate)],
        };
      } else if (startDate) {
        whereClause.createdAt = {
          [Op.gte]: new Date(startDate),
        };
      } else if (endDate) {
        whereClause.createdAt = {
          [Op.lte]: new Date(endDate),
        };
      }

      const offset = (Number(page) - 1) * Number(limit);

      const { rows: payouts, count } = await db.Payout.findAndCountAll({
        where: whereClause,
        order: [["createdAt", "DESC"]],
        limit: Number(limit),
        offset,
      });

      res.json({
        type: "success",
        data: {
          payouts,
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
            totalItems: count,
            hasNext: offset + Number(limit) < count,
            hasPrev: Number(page) > 1,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  checkPayoutStatus: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { payoutId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      const payout = await db.Payout.findOne({
        where: { id: payoutId, userId },
      });

      if (!payout) {
        throw new CustomError(404, "Payout not found");
      }

      if (payout.transferId && payout.status === "processing") {
        try {
          const transfer = await stripe.transfers.retrieve(payout.transferId);

          let newStatus: "completed" | "processing" | "pending" | "failed";

          if (transfer.destination_payment) {
            newStatus = "completed";
          } else if (transfer.reversed) {
            newStatus = "failed";
          } else {
            newStatus = "processing";
          }

          if (newStatus !== payout.status) {
            await payout.update({ status: newStatus });
          }
        } catch (transferError) {
          console.error("Error checking transfer status:", transferError);
        }
      }

      res.json({
        type: "success",
        status: payout.status,
        amount: payout.grossAmount,
        payoutDate: payout.payoutDate,
      });
    } catch (error) {
      console.error("Error checking payout status:", error);
      next(error);
    }
  },
};

export async function getAvailableBalanceForUser(
  userId: string,
  transaction?: any
): Promise<number> {
  try {
    const balanceData = await getDetailedBalanceForUser(userId, transaction);
    return balanceData.available;
  } catch (error) {
    console.error("Error in getAvailableBalanceForUser:", error);
    return 0;
  }
}

interface paymentWithBooking extends Payment {
  booking: Booking;
}

async function getDetailedBalanceForUser(
  userId: string,
  transaction?: any
): Promise<{
  available: number;
  availableFormatted: string;
  pending: number;
  pendingFormatted: string;
  totalEarnings: number;
  totalEarningsFormatted: string;
  paidOut: number;
  paidOutFormatted: string;
  refund: number;
  refundFormatted: string;
  refundGain: number;
  refundGainFormatted: string;
  refundLoss: number;
  refundLossFormatted: string;
}> {
  try {
    const hostPayments = (await db.Payment.findAll({
      where: {
        hostId: userId,
        status: "succeeded",
      },
      include: [
        {
          model: db.Booking,
          as: "booking",
          attributes: ["id", "status", "canceledBy"],
        },
      ],
      transaction,
    })) as paymentWithBooking[];

    const clientPayments = (await db.Payment.findAll({
      where: {
        userId: userId,
        status: "succeeded",
      },
      include: [
        {
          model: db.Booking,
          as: "booking",
          attributes: ["id", "status", "canceledBy"],
        },
      ],
      transaction,
    })) as paymentWithBooking[];

    let completedEarnings = 0;
    let pendingEarnings = 0;

    if (hostPayments && Array.isArray(hostPayments)) {
      hostPayments.forEach((payment) => {
        if (payment.grossAmount && !isNaN(Number(payment.grossAmount))) {
          const amount = Number(payment.grossAmount);

          if (payment.booking?.status === "completed") {
            completedEarnings += amount;
          } else if (payment.booking?.status === "accepted") {
            pendingEarnings += amount;
          }
        }
      });
    }

    let refund = 0;
    let refundGain = 0;
    let refundLoss = 0;

    // SCENARIO 1: User cancels booking as CLIENT
    // - User gets refund of (totalAmount - 30% penalty)
    // - User gets refundLoss of 30% penalty
    // - Host gets refundGain of 30% penalty
    const userCancelledBookingsAsClient = clientPayments.filter(
      (payment) =>
        payment.booking?.status === "cancelled" &&
        payment.booking?.canceledBy === "client" &&
        payment.status === "succeeded"
    );

    userCancelledBookingsAsClient.forEach((payment) => {
      if (payment.grossAmount && !isNaN(Number(payment.grossAmount))) {
        const grossAmount = Number(payment.grossAmount);
        const penalty =
          Math.round(grossAmount * CANCELLATION_FEE_PERCENTAGE * 100) / 100; // 30% penalty
        const refundAmount = Math.round((grossAmount - penalty) * 100) / 100; // 70% refund

        refund += refundAmount;
        refundLoss += penalty;
      }
    });

    // SCENARIO 2: Host cancels booking where user is CLIENT
    // - User gets full refund + 30% penalty compensation
    // - User gets refundGain of 30% penalty
    // - Host gets refundLoss of 30% penalty
    const hostCancelledBookingsUserAsClient = clientPayments.filter(
      (payment) =>
        payment.booking?.status === "cancelled" &&
        payment.booking?.canceledBy === "host" &&
        payment.status === "succeeded"
    );

    hostCancelledBookingsUserAsClient.forEach((payment) => {
      if (payment.grossAmount && !isNaN(Number(payment.grossAmount))) {
        const grossAmount = Number(payment.grossAmount);
        const penalty =
          Math.round(grossAmount * CANCELLATION_FEE_PERCENTAGE * 100) / 100; // 30% penalty

        refund += grossAmount; // Full refund
        refundGain += penalty; // 30% compensation
      }
    });

    // SCENARIO 3: User cancels booking as HOST
    // - User (host) gets refundLoss of potential earnings
    // - Client gets refund handled elsewhere
    const userCancelledBookingsAsHost = hostPayments.filter(
      (payment) =>
        payment.booking?.status === "cancelled" &&
        payment.booking?.canceledBy === "host"
    );

    userCancelledBookingsAsHost.forEach((payment) => {
      if (payment.grossAmount && !isNaN(Number(payment.grossAmount))) {
        const grossAmount = Number(payment.grossAmount);
        const penalty =
          Math.round(grossAmount * CANCELLATION_FEE_PERCENTAGE * 100) / 100; // 30% penalty

        refundLoss += penalty;
      }
    });

    // SCENARIO 4: Client cancels booking where user is HOST
    // - User (host) gets refundGain of 30% penalty
    // - Client refund handled elsewhere
    const clientCancelledBookingsUserAsHost = hostPayments.filter(
      (payment) =>
        payment.booking?.status === "cancelled" &&
        payment.booking?.canceledBy === "client"
    );

    clientCancelledBookingsUserAsHost.forEach((payment) => {
      if (payment.grossAmount && !isNaN(Number(payment.grossAmount))) {
        const grossAmount = Number(payment.grossAmount);
        const penalty =
          Math.round(grossAmount * CANCELLATION_FEE_PERCENTAGE * 100) / 100; // 30% penalty

        refundGain += penalty;
      }
    });

    const paidOut =
      (await db.Payout.sum("netAmount", {
        where: {
          userId,
          status: {
            [Op.in]: ["completed", "processing"],
          },
        },
        transaction,
      })) || 0;

    // Calculate totals with proper rounding
    const totalEarnings =
      Math.round((completedEarnings + pendingEarnings) * 100) / 100;
    const available =
      Math.round(
        (completedEarnings + refund + refundGain - refundLoss - paidOut) * 100
      ) / 100;
    const pending = Math.max(0, Math.round(pendingEarnings * 100) / 100);

    return {
      available,
      availableFormatted: `${available.toFixed(2)}`,
      pending,
      pendingFormatted: `${pending.toFixed(2)}`,
      totalEarnings,
      totalEarningsFormatted: `${totalEarnings.toFixed(2)}`,
      paidOut:
        typeof paidOut === "number" ? Math.round(paidOut * 100) / 100 : 0,
      paidOutFormatted: `${(typeof paidOut === "number"
        ? Math.round(paidOut * 100) / 100
        : 0
      ).toFixed(2)}`,
      refund: Math.round(refund * 100) / 100,
      refundFormatted: `${(Math.round(refund * 100) / 100).toFixed(2)}`,
      refundGain: Math.round(refundGain * 100) / 100,
      refundGainFormatted: `${(Math.round(refundGain * 100) / 100).toFixed(2)}`,
      refundLoss: Math.round(refundLoss * 100) / 100,
      refundLossFormatted: `${(Math.round(refundLoss * 100) / 100).toFixed(2)}`,
    };
  } catch (error) {
    console.error("Error in getDetailedBalanceForUser:", error);
    return {
      available: 0,
      availableFormatted: "0.00",
      pending: 0,
      pendingFormatted: "0.00",
      totalEarnings: 0,
      totalEarningsFormatted: "0.00",
      paidOut: 0,
      paidOutFormatted: "0.00",
      refund: 0,
      refundFormatted: "0.00",
      refundGain: 0,
      refundGainFormatted: "0.00",
      refundLoss: 0,
      refundLossFormatted: "0.00",
    };
  }
}

async function handleTransferCreated(transfer: Stripe.Transfer) {
  try {
    const payout = await db.Payout.findOne({
      where: { transferId: transfer.id },
    });

    if (payout) {
      await payout.update({ status: "processing" });
      await createPayoutNotification(payout.userId, payout, "processing");
    }
  } catch (error) {
    console.error("Error handling transfer created:", error);
  }
}

async function handleTransferPaid(transfer: Stripe.Transfer) {
  try {
    const payout = await db.Payout.findOne({
      where: { transferId: transfer.id },
    });

    if (payout) {
      await payout.update({ status: "completed" });
      await createPayoutNotification(payout.userId, payout, "completed");
    }
  } catch (error) {
    console.error("Error handling transfer paid:", error);
  }
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  try {
    const payout = await db.Payout.findOne({
      where: { transferId: transfer.id },
    });

    if (payout) {
      await payout.update({
        status: "failed",
        errorMessage: "Transfer failed",
      });
      await createPayoutNotification(payout.userId, payout, "failed");
    }
  } catch (error) {
    console.error("Error handling transfer failed:", error);
  }
}

async function handleTransferReversed(transfer: Stripe.Transfer) {
  try {
    const payout = await db.Payout.findOne({
      where: { transferId: transfer.id },
    });

    if (payout) {
      await payout.update({
        status: "failed",
        errorMessage: "Transfer was reversed",
      });
      await createPayoutNotification(payout.userId, payout, "failed");
    }
  } catch (error) {
    console.error("Error handling transfer reversed:", error);
  }
}

async function handleAccountUpdated(account: Stripe.Account) {
  try {
    const stripeAccount = await db.StripeAccount.findOne({
      where: { accountId: account.id },
    });

    if (stripeAccount) {
      // Update account details
      await stripeAccount.update({
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsCurrentlyDue: account?.requirements?.currently_due,
        requirementsPastDue: account?.requirements?.past_due,
      });

      const isPayoutsEnabled = account.payouts_enabled;
      const isChargesEnabled = account.charges_enabled;
      const isDetailsSubmitted = account.details_submitted;

      let notificationType = "";

      if (isPayoutsEnabled && isChargesEnabled && isDetailsSubmitted) {
        notificationType = "account_ready";
      } else if ((account.requirements?.currently_due ?? []).length > 0) {
        notificationType = "requirements_needed";
      } else if ((account.requirements?.past_due ?? []).length > 0) {
        notificationType = "requirements_past_due";
      }

      if (notificationType) {
        await createAccountNotification(
          stripeAccount.userId,
          notificationType,
          account
        );
      }
    }
  } catch (error) {
    console.error("Error handling account updated:", error);
  }
}

export const StripeConnectControllerExtended = {
  ...StripeConnectController,

  getPayoutDetails: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { payoutId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      const payout = await db.Payout.findOne({
        where: { id: payoutId, userId },
        include: [
          {
            model: db.PayoutItem,
            as: "items",
            include: [
              {
                model: db.Payment,
                as: "payment",
                include: [
                  {
                    model: db.Booking,
                    as: "booking",
                    attributes: [
                      "id",
                      "startDate",
                      "endDate",
                      "status",
                      "canceledBy",
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!payout) {
        throw new CustomError(404, "Payout not found");
      }

      let stripeTransferDetails = null;
      if (payout.transferId) {
        try {
          const transfer = await stripe.transfers.retrieve(payout.transferId);
          stripeTransferDetails = {
            id: transfer.id,
            amount: transfer.amount / 100, // Convert from cents
            currency: transfer.currency,
            created: new Date(transfer.created * 1000),
            description: transfer.description,
            destination: transfer.destination,
            reversed: transfer.reversed,
          };
        } catch (error) {
          console.error("Error fetching Stripe transfer details:", error);
        }
      }

      res.json({
        type: "success",
        data: {
          payout: {
            ...payout.toJSON(),
            stripeTransferDetails,
          },
        },
      });
    } catch (error) {
      console.error("Error getting payout details:", error);
      next(error);
    }
  },

  getEarningsBreakdown: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { startDate, endDate, period = "month" } = req.query;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      let dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            [Op.between]: [
              new Date(startDate as string),
              new Date(endDate as string),
            ],
          },
        };
      }

      const payments = (await db.Payment.findAll({
        where: {
          hostId: userId,
          status: "succeeded",
          ...dateFilter,
        },
        include: [
          {
            model: db.Booking,
            as: "booking",
            attributes: ["id", "status", "canceledBy", "startDate", "endDate"],
          },
        ],
        order: [["createdAt", "DESC"]],
      })) as PaymentWithPayoutItem[];

      const payouts = await db.Payout.findAll({
        where: {
          userId,
          ...dateFilter,
        },
        order: [["createdAt", "DESC"]],
      });

      let totalEarnings = 0;
      let activeEarnings = 0;
      let cancellationEarnings = 0;
      let refundObligations = 0;

      payments.forEach((payment) => {
        const amount = Number(payment.grossAmount);
        totalEarnings += amount;

        if (payment.booking) {
          if (payment.booking.status === "cancelled") {
            if (payment.booking.canceledBy === "user") {
              // Host gets 30% cancellation fee when user cancels
              cancellationEarnings +=
                Math.round(amount * CANCELLATION_FEE_PERCENTAGE * 100) / 100;
            } else if (payment.booking.canceledBy === "host") {
              // Host must refund original + 30% penalty when host cancels
              refundObligations +=
                amount +
                Math.round(amount * CANCELLATION_FEE_PERCENTAGE * 100) / 100;
            }
          } else {
            activeEarnings += amount;
          }
        } else {
          activeEarnings += amount;
        }
      });

      const totalPaidOut = payouts
        .filter((p) => ["completed", "processing"].includes(p.status))
        .reduce((sum, p) => sum + Number(p.grossAmount), 0);

      const availableForPayout = Math.max(
        0,
        activeEarnings + cancellationEarnings - totalPaidOut - refundObligations
      );

      res.json({
        type: "success",
        data: {
          summary: {
            totalEarnings,
            activeEarnings,
            cancellationEarnings,
            refundObligations,
            totalPaidOut,
            availableForPayout,
          },
          payments: payments.map((p) => ({
            id: p.id,
            amount: p.grossAmount,
            createdAt: p.createdAt,
            booking: p.booking,
          })),
          payouts: payouts.map((p) => ({
            id: p.id,
            amount: p.grossAmount,
            status: p.status,
            createdAt: p.createdAt,
            payoutDate: p.payoutDate,
          })),
        },
      });
    } catch (error) {
      console.error("Error getting earnings breakdown:", error);
      next(error);
    }
  },

  getStripeBalance: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new CustomError(401, "User not authenticated");
      }

      const user = await db.User.findByPk(userId);
      const stripeAccount = await db.StripeAccount.findOne({
        where: { userId },
      });

      if (!user || !stripeAccount) {
        throw new CustomError(404, "Stripe Connect account not found");
      }

      const balance = await stripe.balance.retrieve({
        stripeAccount: stripeAccount.accountId,
      });

      res.json({
        type: "success",
        data: {
          available: balance.available.map((b) => ({
            amount: b.amount / 100, // Convert from cents
            currency: b.currency,
          })),
          pending: balance.pending.map((b) => ({
            amount: b.amount / 100,
            currency: b.currency,
          })),
        },
      });
    } catch (error) {
      console.error("Error getting Stripe balance:", error);
      next(error);
    }
  },
};

const createAccountNotification = async (
  userId: string,
  type: string,
  accountData?: any
) => {
  try {
    let title = "";
    let body = "";
    let notificationType = "account_update";

    switch (type) {
      case "account_ready":
        title = "Stripe Account Ready";
        body =
          "Your Stripe Connect account is fully set up and ready for payouts!";
        break;
      case "requirements_needed":
        title = "Action Required - Stripe Account";
        body =
          "Please complete your Stripe account setup to continue receiving payouts.";
        break;
      case "requirements_past_due":
        title = "Urgent - Stripe Account Setup";
        body =
          "Your Stripe account has past due requirements. Please update immediately to avoid payout interruptions.";
        break;
      case "payout_failed":
        title = "Payout Failed";
        body =
          "Your recent payout failed. Please check your Stripe account or contact support.";
        break;
      case "capabilities_updated":
        title = "Account Capabilities Updated";
        body = "Your Stripe account capabilities have been updated.";
        break;
    }

    await db.Notification.create({
      userId: userId,
      title: title,
      body: body,
      type: notificationType,
      data: {
        notificationType: type,
        accountData: accountData,
      },
      isRead: false,
    });

    const recipientLogs = await userLogs(userId);
    if (recipientLogs) {
      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(
              log.fcmtoken,
              { title, body },
              {
                type: notificationType,
              }
            );
          } catch (notificationError) {
            console.error(`Failed to send notification:`, notificationError);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error creating account notification:", error);
  }
};

async function handleAccountApplicationWebhook(event: Stripe.Event) {
  try {
    const account = event.data.object as Stripe.Account;

    const stripeAccount = await db.StripeAccount.findOne({
      where: { accountId: account.id },
    });

    if (!stripeAccount) {
      console.error("Stripe account not found for ID:", account.id);
      return;
    }

    const user = await db.User.findOne({
      where: { id: stripeAccount.userId },
    });

    if (user) {
      switch (event.type) {
        case "account.application.deauthorized":
          await createAccountNotification(user.id, "account_deauthorized");
          break;
        case "account.external_account.created":
          await createAccountNotification(user.id, "bank_account_added");
          break;
        case "account.external_account.deleted":
          await createAccountNotification(user.id, "bank_account_removed");
          break;
      }
    }
  } catch (error) {
    console.error("Error handling account application webhook:", error);
  }
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    const payment = await db.Payment.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (payment && payment.status !== "succeeded") {
      await payment.update({ status: "succeeded" });
    }
  } catch (error) {
    console.error("Error handling payment succeeded:", error);
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  try {
    const payment = await db.Payment.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (payment) {
      await payment.update({ status: "failed" });

      const booking = await db.Booking.findOne({
        where: { id: payment.bookingId },
      });

      if (booking) {
        await createPaymentFailedNotification(
          booking.clientId,
          booking,
          payment
        );
        await createPaymentFailedNotification(booking.hostId, booking, payment);
      }
    }
  } catch (error) {
    console.error("Error handling payment failed:", error);
  }
}

async function handleCapabilityUpdated(event: Stripe.Event) {
  try {
    const capability = event.data.object as Stripe.Capability;
    const accountId = capability.account as string;

    const stripeAccount = await db.StripeAccount.findOne({
      where: { accountId },
    });

    if (!stripeAccount) {
      console.error("Stripe account not found for ID:", accountId);
      return;
    }

    const user = await db.User.findOne({
      where: { id: stripeAccount.userId },
    });

    if (user) {
      await createAccountNotification(
        user.id,
        "capabilities_updated",
        capability
      );
    }
  } catch (error) {
    console.error("Error handling capability updated:", error);
  }
}

async function createPaymentFailedNotification(
  userId: string,
  booking: any,
  payment: any
) {
  try {
    const isHost = booking.hostId === userId;

    const title = isHost ? "Payment Failed for Your Spot" : "Payment Failed";
    const body = isHost
      ? `Payment for booking #${booking.id} has failed. The booking may be cancelled.`
      : `Your payment for booking #${booking.id} has failed. Please update your payment method.`;

    await db.Notification.create({
      userId: userId,
      title: title,
      body: body,
      type: "payment_failed",
      data: {
        bookingId: booking.id,
        paymentId: payment.id,
        amount: payment.amount,
      },
      isRead: false,
    });

    const recipientLogs = await userLogs(userId);
    if (recipientLogs) {
      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(
              log.fcmtoken,
              { title, body },
              {
                type: "payment_failed",
                bookingId: booking.id,
              }
            );
          } catch (notificationError) {
            console.error(`Failed to send notification:`, notificationError);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error creating payment failed notification:", error);
  }
}
