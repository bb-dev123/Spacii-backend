import { Response, NextFunction } from "express";
import db from "../models";
import { Transaction, WhereOptions } from "sequelize";
import { AuthenticatedRequest, Payment, QueryPayment } from "../constants";
import { CustomError } from "../middlewares/error";
import stripe from "../middlewares/stripe";
import { Op } from "sequelize";

export const PaymentController = {
  confirmPayment: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { paymentId, bookingId } = req.body;
    const transaction = await db.sequelize.transaction();

    try {
      if (!paymentId || !bookingId) {
        throw new CustomError(400, "payment id and booking id are required");
      }

      const payment = await db.Payment.findOne({
        where: {
          id: paymentId,
        },
        transaction,
      });
      if (!payment) {
        throw new CustomError(404, "payment not found");
      }

      const booking = await db.Booking.findOne({
        where: {
          id: bookingId,
        },
        transaction,
      });
      if (!booking) {
        throw new CustomError(404, "booking not found");
      }
      if (booking.id !== payment.bookingId) {
        throw new CustomError(404, "booking payment not verified");
      }

      const stripePayment = await stripe.paymentIntents.retrieve(
        payment.stripePaymentIntentId
      );

      if (!stripePayment) {
        throw new CustomError(404, "payment not found on stripe");
      }
      if (stripePayment.status !== "succeeded") {
        throw new CustomError(400, "payment has not been completed on stripe");
      }

      await payment.update({ status: "succeeded" }, { transaction });
      await booking.update({ status: "accepted" }, { transaction });

      await transaction.commit();

      res.send({
        type: "success",
        message: "payment confirmed successfully",
      });
    } catch (err) {
      await transaction.rollback();
      next(err);
    }
  },

  failedPayment: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { paymentId, errorMessage } = req.body;
    const transaction = await db.sequelize.transaction();

    try {
      if (!paymentId) {
        throw new CustomError(400, "payment id is required");
      }

      const payment = await db.Payment.findOne({
        where: {
          id: paymentId,
        },
        transaction,
      });

      if (!payment) {
        throw new CustomError(404, "payment not found");
      }

      const stripePayment = await stripe.paymentIntents.retrieve(
        payment.stripePaymentIntentId
      );
      console.log("stripePayment", stripePayment);
      if (!stripePayment) {
        throw new CustomError(404, "payment not found on stripe");
      }
      if (stripePayment.status === "succeeded") {
        throw new CustomError(400, "payment was successful");
      }

      await payment.update(
        { status: "failed", errorMessage: errorMessage || "" },
        { transaction }
      );
      await transaction.commit();

      res.send({
        type: "success",
        message: "payment was unsuccessful, please try again",
      });
    } catch (err) {
      await transaction.rollback();
      next(err);
    }
  },

  refreshPaymentIntent: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { bookingId, paymentId } = req.body;
    const transaction = await db.sequelize.transaction();

    try {
      if (!paymentId || !bookingId) {
        throw new CustomError(400, "payment id and booking id are required");
      }

      const booking = await db.Booking.findOne({
        where: {
          id: bookingId,
        },
        transaction,
      });
      if (!booking) {
        throw new CustomError(404, "booking not found");
      }

      const payment = await db.Payment.findOne({
        where: {
          id: paymentId,
        },
        transaction,
      });
      if (!payment) {
        throw new CustomError(404, "payment not found");
      }

      if (!payment.stripePaymentIntentId) {
        throw new CustomError(400, "no payment intent found for this booking");
      }

      let stripePayment;
      try {
        stripePayment = await stripe.paymentIntents.retrieve(
          payment.stripePaymentIntentId
        );
      } catch (stripeError) {
        console.error(
          "Error retrieving payment intent from Stripe:",
          stripeError
        );
        stripePayment = { status: "not_found" };
      }

      if (stripePayment.status === "succeeded") {
        throw new CustomError(400, "payment was successful");
      }

      // Create a new payment intent if:
      // 1. The current one is expired (requires_payment_method after a failure)
      // 2. The current one is canceled
      // 3. The current one cannot be found
      let paymentIntent;
      const needsNewIntent = [
        "requires_payment_method",
        "canceled",
        "not_found",
      ].includes(stripePayment.status);

      if (needsNewIntent) {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(booking.grossAmount * 100), // Convert to cents
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });

        await payment.update(
          {
            stripePaymentIntentId: paymentIntent.id,
            stripeClientSecret: paymentIntent.client_secret,
            status: "pending",
          },
          { transaction }
        );

        await transaction.commit();

        res.json({
          type: "success",
          message: "created new payment intent",
          data: {
            booking,
            payment: {
              clientSecret: paymentIntent.client_secret,
              paymentId: payment.id,
              amount: payment.grossAmount,
              stripePaymentIntentId: paymentIntent.id,
            },
          },
        });
      } else {
        // The existing payment intent is still valid (e.g., requires_confirmation, requires_action, etc.)
        await transaction.commit();

        res.json({
          type: "success",
          message: "using existing payment intent",
          data: {
            booking,
            payment: {
              clientSecret: payment.stripeClientSecret,
              paymentId: payment.id,
              amount: payment.grossAmount,
              stripePaymentIntentId: payment.stripePaymentIntentId,
            },
          },
        });
      }
      return;
    } catch (error) {
      await transaction.rollback();
      console.error("Error refreshing payment intent:", error);
      next(error);
    }
  },

  // Webhook handler for Stripe events
  handleWebhook: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    let event;
    const signature = req.headers["stripe-signature"];

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(
        req.body,
        signature as string,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );

      // Handle specific events
      switch (event.type) {
        case "payment_intent.succeeded":
          await handlePaymentIntentSucceeded(event.data.object);
          break;
        case "payment_intent.payment_failed":
          await handlePaymentIntentFailed(event.data.object);
          break;
      }

      res.send({ type: "success", received: true });
    } catch (err: any) {
      console.error("webhook error:", err);
      res.status(400).send(`webhook Error: ${err.message}`);
    }
  },

  getUserPayment: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const {
      status,
      startDate,
      endDate,
      page = "1",
      limit = "5",
    } = req.query as QueryPayment;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    try {
      let whereClause: WhereOptions<Payment> = { clientId: req.user.id };

      if (status) {
        if (
          status !== "pending" &&
          status !== "succeeded" &&
          status !== "failed" &&
          status !== "cancelled" &&
          status !== "refunded"
        ) {
          throw new CustomError(400, "invalid status");
        }
        whereClause.status = status;
      }

      if (startDate || endDate) {
        const dateFilters: any = {};

        if (startDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(startDate)) {
            throw new CustomError(
              400,
              "invalid startDate format, use YYYY-MM-DD"
            );
          }

          const startDateObj = new Date(startDate);
          if (isNaN(startDateObj.getTime())) {
            throw new CustomError(400, "invalid startDate");
          }

          // Set the time to start of day (00:00:00) for precise filtering
          startDateObj.setHours(0, 0, 0, 0);
          dateFilters[Op.gte] = startDateObj;
        }

        if (endDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(endDate)) {
            throw new CustomError(
              400,
              "invalid endDate format, use YYYY-MM-DD"
            );
          }

          const endDateObj = new Date(endDate);
          if (isNaN(endDateObj.getTime())) {
            throw new CustomError(400, "invalid endDate");
          }

          endDateObj.setHours(23, 59, 59, 999);

          if (startDate) {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);

            if (endDateObj < startDateObj) {
              throw new CustomError(400, "endDate must be after startDate");
            }
          }

          dateFilters[Op.lte] = endDateObj;
        }

        whereClause = {
          ...whereClause,
          updatedAt: dateFilters,
        };
      }

      const count = await db.Payment.count({ where: whereClause });
      const payments = await db.Payment.findAll({
        where: whereClause,
        include: [
          {
            model: db.Booking,
            as: "booking",
            attributes: ["id", "grossAmount", "startDate", "endDate", "status"],
          },
          {
            model: db.Spot,
            as: "spot",
            attributes: [
              "id",
              "name",
              "images",
              "address",
              "ratePerHour",
              "location",
            ],
          },
        ],
        limit: limitNum,
        offset: offset,
        order: [["updatedAt", "DESC"]], // Changed from createdAt to updatedAt to match filtering
      });

      if (!payments) {
        throw new CustomError(404, "no payment history found");
      }

      const totalPages = Math.ceil(count / limitNum);
      const nextPage = pageNum < totalPages ? pageNum + 1 : null;

      res.send({
        type: "success",
        data: payments,
        pagination: {
          totalItems: count,
          itemsPerPage: limitNum,
          currentPage: pageNum,
          totalPages,
          nextPage,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  getHostPayment: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const {
      status,
      startDate,
      endDate,
      page = "1",
      limit = "5",
    } = req.query as QueryPayment;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    try {
      let whereClause: WhereOptions<Payment> = { hostId: req.user.id };

      if (status) {
        if (
          status !== "pending" &&
          status !== "succeeded" &&
          status !== "failed" &&
          status !== "cancelled" &&
          status !== "refunded"
        ) {
          throw new CustomError(400, "invalid status");
        }
        whereClause.status = status;
      }

      if (startDate || endDate) {
        const dateFilters: any = {};

        if (startDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(startDate)) {
            throw new CustomError(
              400,
              "invalid startDate format, use YYYY-MM-DD"
            );
          }

          const startDateObj = new Date(startDate);
          if (isNaN(startDateObj.getTime())) {
            throw new CustomError(400, "invalid startDate");
          }

          startDateObj.setHours(0, 0, 0, 0);
          dateFilters[Op.gte] = startDateObj;
        }

        if (endDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(endDate)) {
            throw new CustomError(
              400,
              "invalid endDate format, use YYYY-MM-DD"
            );
          }

          const endDateObj = new Date(endDate);
          if (isNaN(endDateObj.getTime())) {
            throw new CustomError(400, "invalid endDate");
          }

          // Set the time to end of day (23:59:59.999) for precise filtering
          endDateObj.setHours(23, 59, 59, 999);

          if (startDate) {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);

            if (endDateObj < startDateObj) {
              throw new CustomError(400, "endDate must be after startDate");
            }
          }

          dateFilters[Op.lte] = endDateObj;
        }

        whereClause = {
          ...whereClause,
          updatedAt: dateFilters,
        };
      }

      const count = await db.Payment.count({ where: whereClause });

      const payments = await db.Payment.findAll({
        where: whereClause,
        include: [
          {
            model: db.Booking,
            as: "booking",
            attributes: ["id", "grossAmount", "startDate", "endDate", "status"],
          },
          {
            model: db.Spot,
            as: "spot",
            attributes: [
              "id",
              "name",
              "images",
              "address",
              "ratePerHour",
              "location",
            ],
          },
        ],
        limit: limitNum,
        offset: offset,
        order: [["updatedAt", "DESC"]], // Changed from createdAt to updatedAt to match filtering
      });

      if (!payments) {
        throw new CustomError(404, "no payment history found");
      }

      const totalPages = Math.ceil(count / limitNum);
      const nextPage = pageNum < totalPages ? pageNum + 1 : null;

      res.send({
        type: "success",
        data: payments,
        pagination: {
          totalItems: count,
          itemsPerPage: limitNum,
          currentPage: pageNum,
          totalPages,
          nextPage,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  queryPayment: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const {
      userId,
      spotId,
      status,
      startDate,
      endDate,
      page = "1",
      limit = "5",
    } = req.query as QueryPayment;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    try {
      let whereClause: WhereOptions<Payment> = {};

      if (userId) {
        whereClause.clientId = userId;
      }
      if (spotId) {
        whereClause.clientId = spotId;
      }
      if (status) {
        if (
          status !== "pending" &&
          status !== "succeeded" &&
          status !== "failed" &&
          status !== "cancelled" &&
          status !== "refunded"
        ) {
          throw new CustomError(400, "invalid status");
        }
        whereClause.status = status;
      }

      if (startDate || endDate) {
        const dateFilters: any = {};

        if (startDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(startDate)) {
            throw new CustomError(
              400,
              "invalid startDate format, use YYYY-MM-DD"
            );
          }

          const startDateObj = new Date(startDate);
          if (isNaN(startDateObj.getTime())) {
            throw new CustomError(400, "invalid startDate");
          }

          startDateObj.setHours(0, 0, 0, 0);
          dateFilters[Op.gte] = startDateObj;
        }

        if (endDate) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(endDate)) {
            throw new CustomError(
              400,
              "invalid endDate format, use YYYY-MM-DD"
            );
          }
          const endDateObj = new Date(endDate);
          if (isNaN(endDateObj.getTime())) {
            throw new CustomError(400, "invalid endDate");
          }

          endDateObj.setHours(23, 59, 59, 999);

          if (startDate) {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);

            if (endDateObj < startDateObj) {
              throw new CustomError(400, "endDate must be after startDate");
            }
          }

          dateFilters[Op.lte] = endDateObj;
        }

        whereClause = {
          ...whereClause,
          updatedAt: dateFilters,
        };
      }

      const count = await db.Payment.count({ where: whereClause });

      const payments = await db.Payment.findAll({
        where: whereClause,
        include: [
          {
            model: db.Booking,
            as: "booking",
            attributes: ["id", "grossAmount", "startDate", "endDate", "status"],
          },
          {
            model: db.Spot,
            as: "spot",
            attributes: [
              "id",
              "name",
              "images",
              "address",
              "ratePerHour",
              "location",
            ],
          },
        ],
        limit: limitNum,
        offset: offset,
        order: [["updatedAt", "DESC"]], // Changed from createdAt to updatedAt to match filtering
      });

      if (!payments) {
        throw new CustomError(404, "no payment history found");
      }

      const totalPages = Math.ceil(count / limitNum);
      const nextPage = pageNum < totalPages ? pageNum + 1 : null;

      res.send({
        type: "success",
        data: payments,
        pagination: {
          totalItems: count,
          itemsPerPage: limitNum,
          currentPage: pageNum,
          totalPages,
          nextPage,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  getEarnings: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const payments = await db.Payment.findAll({
        where: {
          hostId: req.user.id,
          status: "succeeded",
        },
        include: [
          {
            model: db.Booking,
            as: "booking",
            include: [
              { model: db.Spot, as: "spot" },
              {
                model: db.User,
                as: "client",
                attributes: ["id", "image", "name", "email", "phone"],
              },
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      // Calculate total earnings
      const totalEarnings = payments.reduce((sum: number, payment: Payment) => {
        return sum + payment.grossAmount;
      }, 0);

      res.send({
        type: "success",
        message: "earnings retrieved",
        data: {
          payments,
          totalEarnings,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

async function handlePaymentIntentSucceeded(paymentIntent: any) {
  const { bookingId, userId, hostId } = paymentIntent.metadata;
  const transaction = await db.sequelize.transaction();

  try {
    const payment = await db.Payment.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
      transaction,
    });

    if (!payment) {
      console.error(`Payment not found for paymentIntent: ${paymentIntent.id}`);
      await transaction.rollback();
      return;
    }

    await payment.update(
      {
        status: "succeeded",
        updatedAt: new Date(),
      },
      { transaction }
    );

    const booking = await db.Booking.findOne({
      where: { id: bookingId },
      transaction,
    });

    if (!booking) {
      console.error(`Booking not found for ID: ${bookingId}`);
      await transaction.rollback();
      return;
    }

    await booking.update(
      {
        status: "accepted",
        updatedAt: new Date(),
      },
      { transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error("Error processing successful payment:", error);
  }
}

async function handlePaymentIntentFailed(paymentIntent: any) {
  const { bookingId } = paymentIntent.metadata;
  const transaction = await db.sequelize.transaction();

  try {
    const payment = await db.Payment.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
      transaction,
    });

    if (!payment) {
      console.error(`Payment not found for paymentIntent: ${paymentIntent.id}`);
      await transaction.rollback();
      return;
    }

    // Update payment status
    await payment.update(
      {
        status: "failed",
        updatedAt: new Date(),
      },
      { transaction }
    );

    // Find the booking
    const booking = await db.Booking.findOne({
      where: { id: bookingId },
      transaction,
    });

    if (booking) {
      await db.Notification.create(
        {
          userId: booking.clientId,
          type: "payment_failed",
          title: "Payment Failed",
          body: `Your Payment was failed. Please try again or contact support`,
          data: {
            bookingId: booking.id,
          },
          isRead: false,
        },
        { transaction }
      );
    }

    await transaction.commit();
    console.log(`Failed payment for booking #${bookingId} recorded`);
  } catch (error) {
    await transaction.rollback();
    console.error("Error processing failed payment:", error);
  }
}
