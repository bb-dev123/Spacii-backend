import db from "../models";
import { CustomError } from "../middlewares/error";
import { Request, Response, NextFunction } from "express";
import {
  Availability,
  Booking,
  AuthenticatedRequest,
  Spot,
  TimeChange,
  Payment,
  User,
  Log,
} from "../constants";
import {
  convertTimeToMinutes,
  normalizeTimeFormat,
  parseCustomDate,
} from "../helpers/timeDateHelpers";
import { InferCreationAttributes, Op, WhereOptions } from "sequelize";
import stripe from "../middlewares/stripe";
import { sendNotification, userLogs } from "../helpers/notificationHelper";
import {
  PLATFORM_FEE,
  STRIPE_FEE_FIXED,
  STRIPE_FEE_PERCENTAGE,
  TAX_RATE,
} from "../constants/payment";
import { parseCustomDateTime } from "../helpers/timeZone";
import { DateTime } from "luxon";

const toTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

async function isTimeWithinAvailability(
  spot: { availabilities: Availability[] | null },
  day: string,
  startTime: string,
  endTime: string
): Promise<void> {
  if (!spot.availabilities || spot.availabilities.length === 0) {
    throw new CustomError(404, "no availability found for this day!");
  }

  const availabilities = spot.availabilities.filter(
    (a: Availability) => a.day === day
  );

  if (availabilities.length === 0) {
    throw new CustomError(404, "no availability found for this day!");
  }

  const newOpenMinutes = convertTimeToMinutes(startTime);
  const newCloseMinutes = convertTimeToMinutes(endTime);

  const isWithinAvailability = availabilities.some((availability) => {
    const availableOpenMinutes = convertTimeToMinutes(availability.startTime);
    const availableCloseMinutes = convertTimeToMinutes(availability.endTime);

    return (
      newOpenMinutes >= availableOpenMinutes &&
      newCloseMinutes <= availableCloseMinutes
    );
  });

  if (!isWithinAvailability) {
    throw new CustomError(
      400,
      "requested time is outside available hours for this spot"
    );
  }
}

const calculateBookingPrice = (
  spotRate: number,
  startDateTime: Date,
  endDateTime: Date
): number => {
  const durationMs = endDateTime.getTime() - startDateTime.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);

  return parseFloat((spotRate * durationHours).toFixed(2));
};

const bookSpot = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    vehicleId,
    spotId,
    startDate,
    endDate,
    day,
    startTime,
    endTime,
    grossAmount,
    type,
  } = req.body as InferCreationAttributes<Booking>;
  const transaction = await db.sequelize.transaction();
  try {
    if (
      !vehicleId ||
      !spotId ||
      !startDate ||
      !endDate ||
      !day ||
      !startTime ||
      !endTime ||
      !type
    ) {
      throw new CustomError(400, "missing required fields");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new CustomError(400, "dates must be in format YYYY-MM-DD");
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new CustomError(400, "times must be in 24-hour format (HH:MM)");
    }

    const spot = await db.Spot.findOne({
      where: { id: spotId },
      include: { model: db.Availability, as: "availabilities" },
      transaction,
    });
    if (!spot) {
      throw new CustomError(404, "spot not found!");
    }

    const timeZone = spot.timeZone || "UTC"; // Default to UTC if not set

    const startDateTime = parseCustomDateTime(startDate, startTime, timeZone);
    const endDateTime = parseCustomDateTime(endDate, endTime, timeZone);
    const currentDateTime = DateTime.now().setZone(timeZone);

    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const startDateDay = daysOfWeek[startDateTime.weekday % 7]; // Luxon weekday: 1=Monday, 7=Sunday

    if (startDateDay !== day) {
      throw new CustomError(
        400,
        `day must match startDate. ${startDate} is a ${startDateDay}, not ${day}`
      );
    }

    const vehicle = await db.Vehicle.findOne({
      where: { id: vehicleId, userId: req.user.id },
      transaction,
    });
    if (!vehicle) {
      throw new CustomError(404, "vehicle not found!");
    }

    if (spot.userId === req.user.id) {
      throw new CustomError(400, "cannot book your own spot");
    }

    if (startDateTime <= currentDateTime) {
      throw new CustomError(
        400,
        "cannot book slots in the past, please select a future date and time."
      );
    }

    if (endDateTime <= startDateTime) {
      throw new CustomError(400, "end time must be after start time");
    }

    const bookingDuration = Math.floor(
      endDateTime.diff(startDateTime, "minutes").minutes
    );

    const calculatedPrice = calculateBookingPrice(
      spot.ratePerHour,
      startDateTime.toJSDate(), // Convert to JS Date if calculateBookingPrice expects it
      endDateTime.toJSDate()
    );
    console.log(calculatedPrice, grossAmount);
    if (grossAmount !== calculatedPrice) {
      throw new CustomError(400, "price does not match calculated price");
    }

    const totalAmountRaw =
      (calculatedPrice * (1 + TAX_RATE + PLATFORM_FEE) + STRIPE_FEE_FIXED) /
      (1 - STRIPE_FEE_PERCENTAGE);

    const totalAmount = toTwoDecimals(totalAmountRaw);
    const stripeFee = toTwoDecimals(
      totalAmount * STRIPE_FEE_PERCENTAGE + STRIPE_FEE_FIXED
    );
    const taxFee = toTwoDecimals(calculatedPrice * TAX_RATE);
    const platformFee = toTwoDecimals(calculatedPrice * PLATFORM_FEE);

    if (type === "normal") {
      await isTimeWithinAvailability(
        spot as Spot & { availabilities: Availability[] | null },
        day,
        startTime,
        endTime
      );

      const MIN_NORMAL_DURATION = 15;
      const MAX_NORMAL_DURATION = 1440;

      if (bookingDuration < MIN_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 15 minutes"
        );
      }

      if (bookingDuration > MAX_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "create custom booking for more than 24 hours"
        );
      }

      const existingBookings = await db.Booking.findAll({
        where: {
          spotId,
          [Op.or]: [
            { status: "accepted" },
            { status: "payment-pending", type: "custom" },
          ],
        },
        transaction,
      });

      for (const booking of existingBookings) {
        const existingStart = parseCustomDateTime(
          booking.startDate,
          booking.startTime,
          timeZone
        );
        const existingEnd = parseCustomDateTime(
          booking.endDate,
          booking.endTime,
          timeZone
        );

        if (
          (startDateTime >= existingStart && startDateTime < existingEnd) ||
          (endDateTime > existingStart && endDateTime <= existingEnd) ||
          (startDateTime <= existingStart && endDateTime >= existingEnd)
        ) {
          throw new CustomError(400, "spot already booked for this time slot");
        }
      }
    } else if (type === "custom") {
      const MIN_CUSTOM_DURATION = 1440; // 1 day in minutes
      const MAX_CUSTOM_DURATION = 43200; // 30 days in minutes

      if (bookingDuration < MIN_CUSTOM_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 1 day for custom bookings"
        );
      }

      if (bookingDuration > MAX_CUSTOM_DURATION) {
        throw new CustomError(400, "booking duration cannot exceed 30 days");
      }

      const existingBookings = await db.Booking.findAll({
        where: {
          spotId,
          status: ["accepted", "payment-pending"],
        },
        transaction,
      });

      for (const existingBooking of existingBookings) {
        const existingStart = parseCustomDateTime(
          existingBooking.startDate,
          existingBooking.startTime,
          timeZone
        );
        const existingEnd = parseCustomDateTime(
          existingBooking.endDate,
          existingBooking.endTime,
          timeZone
        );

        if (
          (startDateTime >= existingStart && startDateTime < existingEnd) ||
          (endDateTime > existingStart && endDateTime <= existingEnd) ||
          (startDateTime <= existingStart && endDateTime >= existingEnd)
        ) {
          throw new CustomError(
            400,
            "booking overlaps with an existing booking for this time period"
          );
        }
      }
    } else {
      throw new CustomError(400, "invalid booking type");
    }

    const initialStatus =
      type === "normal" ? "payment-pending" : "request-pending";
    const newBooking = (await db.Booking.create(
      {
        clientId: req.user.id,
        hostId: spot.userId,
        vehicleId,
        spotId,
        day,
        startDate,
        startTime,
        endDate,
        endTime,
        grossAmount: calculatedPrice,
        type,
        status: initialStatus,
      },
      { transaction }
    )) as InferCreationAttributes<Booking>;

    let paymentIntent = null;
    let payment = null;

    if (type === "normal") {
      const amountInCents = Math.round(totalAmount * 100);

      paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          bookingId: newBooking.id || "",
          userId: req.user.id,
          hostId: spot.userId,
        },
      });

      payment = await db.Payment.create(
        {
          bookingId: newBooking.id || "",
          spotId: newBooking.spotId,
          userId: req.user.id,
          hostId: newBooking.hostId,
          grossAmount: calculatedPrice, // stored in dollars
          stripeFee,
          platformFee,
          taxFee,
          totalAmount,
          currency: "usd",
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
          status: "pending",
        },
        { transaction }
      );
    }

    await transaction.commit();

    if (type === "normal") {
      res.send({
        type: "success",
        message: "booking created pay to confirm",
        data: {
          booking: newBooking,
          payment: {
            stripePaymentIntentId: payment?.stripePaymentIntentId,
            clientSecret: payment?.stripeClientSecret,
            paymentId: payment?.id,
            amount: totalAmount,
            grossAmount: calculatedPrice,
            stripeFee,
            taxFee,
            platformFee,
          },
        },
      });
    } else {
      const recipientLogs = await userLogs(newBooking.hostId);
      if (recipientLogs) {
        const bookingDate = new Date(newBooking.startDate).toLocaleDateString();
        const message = {
          title: "New Booking Request",
          body: `New Booking request for ${bookingDate} at ${newBooking.startTime}, go to requests`,
        };
        const data = {
          type: "booking_request",
          bookingId: newBooking.id,
          date: bookingDate,
          time: newBooking.startTime,
        };

        await db.Notification.create({
          userId: newBooking.hostId,
          bookingId: newBooking.id || null,
          spotId: newBooking.spotId || null,
          vehicleId: newBooking.vehicleId || null,
          title: message.title,
          body: message.body,
          type: data.type,
          data,
          isRead: false,
        });

        for (const log of recipientLogs) {
          if (log.fcmtoken) {
            try {
              await sendNotification(log.fcmtoken, message, data);
            } catch (notificationError) {
              console.error(
                `Failed to send notification to ${log.fcmtoken}:`,
                notificationError
              );
            }
          }
        }
      }
      res.send({
        type: "success",
        message: "booking created and waiting for approval",
        data: newBooking,
      });
    }
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const getBooking = async (req: Request, res: Response, next: NextFunction) => {
  const { bookingId } = req.params;
  try {
    if (!bookingId) {
      throw new CustomError(400, "id is missing");
    }
    const booking = await db.Booking.findByPk(bookingId, {
      include: [
        {
          model: db.Spot,
          as: "spot",
          attributes: { exclude: ["createdAt", "updatedAt"] },
        },
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: { exclude: ["createdAt", "updatedAt"] },
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "image", "name", "email", "phone"],
        },
        {
          model: db.Payment,
          as: "payment",
          attributes: [
            "id",
            "grossAmount",
            "totalAmount",
            "status",
            "createdAt",
          ],
        },
        {
          model: db.TimeChange,
          as: "bookingTimeChange",
          attributes: {
            exclude: ["createdAt", "updatedAt"],
          },
        },
      ],
    });
    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }

    res.send({
      type: "success",
      data: booking,
    });
  } catch (err) {
    next(err);
  }
};

interface QueryBooking {
  startDate?: string;
  status?: string;
  day?: string;
  vehicleId?: string;
  spotId?: string;
  page?: string;
  limit?: string;
}

const getClientBookings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user.id;
  const {
    startDate,
    status,
    page = "1",
    limit = "5",
  } = req.query as QueryBooking;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    if (!userId) {
      throw new CustomError(400, "userId is missing");
    }

    const currentDate = new Date().toISOString().split("T")[0];

    let whereCondition: Record<string, any> = {
      clientId: userId,
      startDate: {
        [Op.gte]: currentDate,
      },
    };

    if (status) {
      if (
        status !== "payment-pending" &&
        status !== "request-pending" &&
        status !== "accepted" &&
        status !== "rejected" &&
        status !== "completed" &&
        status !== "cancelled"
      ) {
        throw new CustomError(400, "invalid status");
      }
      whereCondition.status = status;
    }

    if (startDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate)) {
        throw new CustomError(400, "dates must be in format YYYY-MM-DD");
      }
      whereCondition.startDate = {
        [Op.gte]: startDate,
      };
    }

    const count = await db.Booking.count({ where: whereCondition });

    const bookings = await db.Booking.findAll({
      where: whereCondition,
      include: [
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
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: ["id", "type", "licensePlate", "name"],
        },
        {
          model: db.User,
          as: "host",
          attributes: ["id", "image", "name", "email", "phone"],
        },
      ],
      limit: limitNum,
      offset,
      order: [["startDate", "ASC"]],
    });

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;
    res.send({
      type: "success",
      data: bookings,
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
};

const getHostBookings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user.id;
  const {
    startDate,
    status,
    spotId,
    page = "1",
    limit = "5",
  } = req.query as QueryBooking;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    if (!userId) {
      throw new CustomError(400, "userId is missing");
    }

    let whereCondition: Record<string, any> = { hostId: userId };

    if (status) {
      if (
        status !== "payment-pending" &&
        status !== "request-pending" &&
        status !== "accepted" &&
        status !== "rejected" &&
        status !== "completed" &&
        status !== "cancelled"
      ) {
        throw new CustomError(400, "invalid status");
      }
      whereCondition.status = status;
    }

    if (spotId) {
      whereCondition.spotId = spotId;
    }

    if (startDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate)) {
        throw new CustomError(400, "dates must be in format YYYY-MM-DD");
      }
      whereCondition.startDate = {
        [Op.gte]: startDate,
      };
    }

    const count = await db.Booking.count({ where: whereCondition });

    const bookings = await db.Booking.findAll({
      where: whereCondition,
      include: [
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
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: ["id", "type", "licensePlate", "name"],
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "image", "name", "email", "phone"],
        },
      ],
      limit: limitNum,
      offset: offset,
      order: [["startDate", "ASC"]],
    });

    let pendingBalance = 0;
    let completedBalance = 0;

    if (!status || status === "accepted") {
      const pendingBookings = await db.Booking.findAll({
        where: { hostId: userId, status: "accepted" },
        attributes: ["grossAmount"],
      });

      pendingBalance = pendingBookings.reduce((total, booking) => {
        return total + (Number(booking.grossAmount) || 0);
      }, 0);
    }

    if (!status || status === "completed") {
      const completedBookings = await db.Booking.findAll({
        where: { hostId: userId, status: "completed" },
        attributes: ["grossAmount"],
      });

      completedBalance = completedBookings.reduce((total, booking) => {
        return total + (Number(booking.grossAmount) || 0);
      }, 0);
    }

    const bookingsWithBalance = bookings.map((booking) => {
      return {
        ...booking.toJSON(),
        balance: booking.grossAmount || 0,
      };
    });

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    const responseData: any = {
      type: "success",
      data: bookingsWithBalance,
      pagination: {
        totalItems: count,
        itemsPerPage: limitNum,
        currentPage: pageNum,
        totalPages,
        nextPage,
      },
    };

    if (status === "accepted") {
      responseData.pendingBalance = pendingBalance;
    } else if (status === "completed") {
      responseData.completedBalance = completedBalance;
    } else if (!status) {
      responseData.pendingBalance = pendingBalance;
      responseData.completedBalance = completedBalance;
    }

    res.send(responseData);
  } catch (err) {
    next(err);
  }
};

const getQueryBookings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const {
    startDate,
    day,
    vehicleId,
    spotId,
    status,
    page = "1",
    limit = "5",
  } = req.query as QueryBooking;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let whereConditions: Record<string, any> = {};

  if (startDate) whereConditions.startDate = startDate;
  if (day) whereConditions.day = day;
  if (vehicleId) whereConditions.vehicleId = vehicleId;
  if (spotId) whereConditions.spotId = spotId;
  if (status) {
    if (
      status !== "payment-pending" &&
      status !== "request-pending" &&
      status !== "accepted" &&
      status !== "rejected" &&
      status !== "completed" &&
      status !== "cancelled"
    ) {
      throw new CustomError(400, "invalid status");
    }
    whereConditions.status = status;
  }

  try {
    const count = await db.Booking.count({
      where: whereConditions,
    });

    const bookings = await db.Booking.findAll({
      where: whereConditions,
      include: [
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
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: ["id", "type", "licensePlate", "name"],
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "image", "name", "email", "phone"],
        },
      ],
      limit: limitNum,
      offset,
      order: [["id", "ASC"]], // Consistent ordering
    });

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    if (!bookings) {
      throw new CustomError(404, "bookings not found!");
    } else {
      res.send({
        type: "success",
        data: bookings,
        pagination: {
          totalItems: count,
          itemsPerPage: limitNum,
          currentPage: pageNum,
          totalPages,
          nextPage,
        },
      });
    }
  } catch (err) {
    next(err);
  }
};

const getPastBookings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const {
    vehicleId,
    spotId,
    page = "1",
    limit = "5",
  } = req.query as QueryBooking;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const now = new Date();
  const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD format
  const currentTime = now.toTimeString().split(" ")[0].substring(0, 5); // HH:MM format

  let whereConditions: Record<string, any> = {
    [Op.or]: [
      {
        endDate: {
          [Op.lt]: currentDate,
        },
      },
      {
        endDate: currentDate,
        endTime: {
          [Op.lt]: currentTime,
        },
      },
    ],
    status: {
      [Op.in]: ["accepted", "completed"],
    },
    clientId: req.user.id,
  };

  if (vehicleId) whereConditions.vehicleId = vehicleId;
  if (spotId) whereConditions.spotId = spotId;

  try {
    const count = await db.Booking.count({
      where: whereConditions,
    });

    const bookings = await db.Booking.findAll({
      where: whereConditions,
      include: [
        {
          model: db.Spot,
          as: "spot",
          attributes: ["id", "name", "images", "address", "ratePerHour"],
        },
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: ["id", "type", "licensePlate", "name"],
        },
        {
          model: db.User,
          as: "host",
          attributes: ["id", "image", "name", "email", "phone"],
        },
      ],
      limit: limitNum,
      offset,
      order: [
        ["endDate", "DESC"],
        ["endTime", "DESC"],
      ],
    });

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    res.send({
      type: "success",
      data: bookings,
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
};

const updateBooking = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { id, vehicleId, startDate, endDate, day, startTime, endTime, type } =
    req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "booking id is missing");
    }

    const booking = await db.Booking.findOne({
      where: { id },
      transaction,
    });
    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }

    if (booking.clientId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    if (startDate || endDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (startDate && !dateRegex.test(startDate)) {
        throw new CustomError(400, "startDate must be in format YYYY-MM-DD");
      }

      if (endDate && !dateRegex.test(endDate)) {
        throw new CustomError(400, "endDate must be in format YYYY-MM-DD");
      }
    }

    if (startTime || endTime) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

      if (startTime && !timeRegex.test(startTime)) {
        throw new CustomError(
          400,
          "startTime must be in 24-hour format (HH:MM)"
        );
      }

      if (endTime && !timeRegex.test(endTime)) {
        throw new CustomError(400, "endTime must be in 24-hour format (HH:MM)");
      }

      // Normalize time formats to ensure consistent comparison
      if (startTime) {
        req.body.startTime = normalizeTimeFormat(startTime);
      }

      if (endTime) {
        req.body.endTime = normalizeTimeFormat(endTime);
      }
    }

    if (vehicleId) {
      const vehicle = await db.Vehicle.findOne({
        where: { id: vehicleId, userId: req.user.id },
        transaction,
      });

      if (!vehicle) {
        throw new CustomError(404, "vehicle not found!");
      }
    }

    const spot = await db.Spot.findOne({
      where: { id: booking.spotId },
      include: { model: db.Availability, as: "availabilities" },
      transaction,
    });
    if (!spot) {
      throw new CustomError(404, "spot not found!");
    }

    const updatedStartDate = startDate || booking.startDate;
    const updatedEndDate = endDate || booking.endDate;
    const updatedStartTime = startTime || booking.startTime;
    const updatedEndTime = endTime || booking.endTime;
    const updatedDay = day || booking.day;
    const updatedType = type || booking.type;

    const updatedStartDateTime = parseCustomDate(
      updatedStartDate,
      updatedStartTime
    );
    const updatedEndDateTime = parseCustomDate(updatedEndDate, updatedEndTime);
    const currentDateTime = new Date();

    if (updatedStartDateTime <= currentDateTime) {
      throw new CustomError(
        400,
        "cannot book slots in the past, please select a future date and time."
      );
    }

    if (updatedEndDateTime <= updatedStartDateTime) {
      throw new CustomError(400, "end time must be after start time");
    }

    const bookingDuration = Math.floor(
      (updatedEndDateTime.getTime() - updatedStartDateTime.getTime()) /
        (1000 * 60)
    ); // Duration in minutes

    if (updatedType === "normal") {
      await isTimeWithinAvailability(
        spot as Spot & { availabilities: Availability[] | null },
        updatedDay,
        updatedStartTime,
        updatedEndTime
      );

      const MIN_NORMAL_DURATION = 15; // 15 minutes
      const MAX_NORMAL_DURATION = 1440; // 1 day

      if (bookingDuration < MIN_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 15 minutes for normal bookings"
        );
      }

      if (bookingDuration > MAX_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "booking duration cannot exceed 1 day for normal bookings"
        );
      }

      const existingBookings = await db.Booking.findAll({
        where: {
          spotId: booking.spotId,
          day: updatedDay,
          status: "approved",
          id: { [Op.ne]: id }, // Exclude the current booking from overlap check
        },
        transaction,
      });

      for (const existingBooking of existingBookings) {
        const existingStart = parseCustomDate(
          existingBooking.startDate,
          existingBooking.startTime
        );
        const existingEnd = parseCustomDate(
          existingBooking.endDate,
          existingBooking.endTime
        );

        if (
          (updatedStartDateTime >= existingStart &&
            updatedStartDateTime < existingEnd) ||
          (updatedEndDateTime > existingStart &&
            updatedEndDateTime <= existingEnd) ||
          (updatedStartDateTime <= existingStart &&
            updatedEndDateTime >= existingEnd)
        ) {
          throw new CustomError(400, "spot already booked for this time slot");
        }
      }
    } else if (updatedType === "custom") {
      const MIN_CUSTOM_DURATION = 1440; // 1 day in minutes
      const MAX_CUSTOM_DURATION = 43200; // 30 days in minutes

      if (bookingDuration < MIN_CUSTOM_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 1 day for custom bookings"
        );
      }

      if (bookingDuration > MAX_CUSTOM_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be less than or equal to 30 days for custom bookings"
        );
      }
    }

    await booking.update(
      {
        vehicleId: vehicleId || booking.vehicleId,
        startDate: updatedStartDate,
        endDate: updatedEndDate,
        day: updatedDay,
        startTime: updatedStartTime,
        endTime: updatedEndTime,
        type: updatedType,
      },
      { transaction }
    );

    await transaction.commit();
    res.send({
      type: "success",
      message: "booking updated successfully",
      data: booking,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const cancelBooking = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!id) {
      throw new CustomError(400, "id is missing");
    }

    const booking = (await db.Booking.findOne({
      where: { id: id },
      include: [
        { model: db.Payment, as: "payment" },
        {
          model: db.User,
          as: "client",
          attributes: ["id"],
        },
        {
          model: db.User,
          as: "host",
          attributes: ["id"],
        },
        {
          model: db.Spot,
          as: "spot",
          attributes: ["timeZone"],
        },
      ],
      transaction,
    })) as Booking & {
      payment?: Payment;
      client?: User & { logs?: Log[] };
      host?: User & { logs?: Log[] };
      spot: { timeZone: string };
    };

    if (!booking) {
      throw new CustomError(404, "booking not Found!");
    }

    if (booking.clientId !== req.user.id && booking.hostId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    if (booking.status === "cancelled") {
      throw new CustomError(404, "booking already cancelled");
    }

    const timeZone = booking.spot.timeZone || "UTC";

    const bookingStart = parseCustomDateTime(
      booking.startDate,
      booking.startTime,
      timeZone
    );
    const currentTime = DateTime.now().setZone(timeZone);
    const hoursDifference = bookingStart.diff(currentTime, "hours").hours;

    if (hoursDifference < 24) {
      throw new CustomError(
        400,
        "bookings can only be canceled at least 24 hours before the start time"
      );
    }

    const payment = await db.Payment.findOne({
      where: {
        bookingId: id,
      },
      transaction,
    });
    if (!payment) {
      throw new CustomError(404, "payment not found for this booking");
    }
    if (payment.status === "pending" && payment.stripePaymentIntentId) {
      await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
    }

    await booking.update(
      {
        status: "cancelled",
        canceledBy: req.user.id === booking.clientId ? "client" : "host",
      },
      { transaction }
    );

    await transaction.commit();

    const isCanceledByClient = req.user.id === booking.clientId;
    const cancelerName = isCanceledByClient ? "client" : "host";

    const recipientLogs = isCanceledByClient
      ? await userLogs(booking.hostId)
      : await userLogs(booking.clientId);
    if (recipientLogs) {
      const bookingDate = new Date(booking.startDate).toLocaleDateString();
      const message = {
        title: "Booking Cancelled",
        body: `${
          isCanceledByClient ? "Host" : "Client"
        } has cancelled the booking scheduled for ${bookingDate} at ${
          booking.startTime
        }`,
      };
      const data = {
        type: "booking_cancelled",
        bookingId: booking.id.toString(),
        cancelledBy: cancelerName,
        date: bookingDate,
        time: booking.startTime,
      };

      await db.Notification.create({
        userId: isCanceledByClient ? booking.hostId : booking.clientId,
        bookingId: booking.id || null,
        spotId: booking.spotId || null,
        vehicleId: booking.vehicleId || null,
        title: message.title,
        body: message.body,
        type: data.type,
        data,
        isRead: false,
      });

      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(log.fcmtoken, message, data);
          } catch (notificationError) {
            console.error(
              `Failed to send notification to ${log.fcmtoken}:`,
              notificationError
            );
          }
        }
      }
    }

    res.send({
      type: "success",
      message: `booking cancelled by ${cancelerName}`,
      data: booking,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const acceptBooking = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!id) {
      throw new CustomError(400, "id is missing");
    }

    const booking = (await db.Booking.findOne({
      where: { id },
      include: {
        model: db.Spot,
        as: "spot",
        attributes: ["timeZone"],
      },
      transaction,
    })) as Booking & { spot: { timeZone: string } };

    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }

    if (booking.hostId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    if (booking.status === "payment-pending") {
      throw new CustomError(
        400,
        "booking already approved, payment is pending"
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (
      !dateRegex.test(booking.startDate) ||
      !dateRegex.test(booking.endDate)
    ) {
      throw new CustomError(400, "dates must be in format YYYY-MM-DD");
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (
      !timeRegex.test(booking.startTime) ||
      !timeRegex.test(booking.endTime)
    ) {
      throw new CustomError(400, "times must be in 24-hour format (HH:MM)");
    }

    const timeZone = booking.spot.timeZone || "UTC";

    const newBookingStart = parseCustomDateTime(
      booking.startDate,
      booking.startTime,
      timeZone
    );
    const newBookingEnd = parseCustomDateTime(
      booking.endDate,
      booking.endTime,
      timeZone
    );
    const currentDateTime = DateTime.now().setZone(timeZone);

    if (newBookingStart <= currentDateTime) {
      throw new CustomError(
        400,
        "cannot approve bookings in the past, please select a future date and time."
      );
    }

    if (newBookingEnd <= newBookingStart) {
      throw new CustomError(400, "end time must be after start time");
    }

    const existingBookings = await db.Booking.findAll({
      where: {
        spotId: booking.spotId,
        status: "payment-pending",
        id: { [Op.ne]: id }, // Exclude the current booking
      },
      transaction,
    });

    for (const existingBooking of existingBookings) {
      const existingStart = parseCustomDateTime(
        existingBooking.startDate,
        existingBooking.startTime,
        timeZone
      );
      const existingEnd = parseCustomDateTime(
        existingBooking.endDate,
        existingBooking.endTime,
        timeZone
      );

      if (
        (newBookingStart >= existingStart && newBookingStart < existingEnd) ||
        (newBookingEnd > existingStart && newBookingEnd <= existingEnd) ||
        (newBookingStart <= existingStart && newBookingEnd >= existingEnd)
      ) {
        throw new CustomError(
          400,
          "booking overlaps with an existing approved booking, cancel the existing booking if you want to proceed"
        );
      }
    }

    await booking.update({ status: "payment-pending" }, { transaction });

    const totalAmount =
      (booking.grossAmount * (1 + TAX_RATE + PLATFORM_FEE) + STRIPE_FEE_FIXED) /
      (1 - STRIPE_FEE_PERCENTAGE);

    const stripeFee = totalAmount * STRIPE_FEE_PERCENTAGE + STRIPE_FEE_FIXED;
    const taxFee = booking.grossAmount * TAX_RATE;
    const platformFee = booking.grossAmount * PLATFORM_FEE;

    const amountInCents = Math.round(totalAmount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingId: booking.id || "",
        userId: booking.clientId,
        hostId: booking.hostId,
      },
    });

    await db.Payment.create(
      {
        bookingId: booking.id || "",
        spotId: booking.spotId,
        userId: booking.clientId,
        hostId: booking.hostId,
        grossAmount: booking.grossAmount, // stored in dollars
        stripeFee,
        platformFee,
        taxFee,
        totalAmount, // stored in dollars
        currency: "usd",
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
        status: "pending",
      },
      { transaction }
    );

    await transaction.commit();
    const recipientLogs = await userLogs(booking.clientId);
    if (recipientLogs) {
      const bookingDate = new Date(booking.startDate).toLocaleDateString();
      const message = {
        title: "Booking Request Accepted",
        body: `Booking request accepted for ${bookingDate} at ${booking.startTime}, pay to confirm`,
      };
      const data = {
        type: "booking_accepted",
        bookingId: booking.id,
        date: bookingDate,
        time: booking.startTime,
      };

      await db.Notification.create({
        userId: booking.clientId,
        bookingId: booking.id || null,
        spotId: booking.spotId || null,
        vehicleId: booking.vehicleId || null,
        title: message.title,
        body: message.body,
        type: data.type,
        data,
        isRead: false,
      });

      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(log.fcmtoken, message, data);
          } catch (notificationError) {
            console.error(
              `Failed to send notification to ${log.fcmtoken}:`,
              notificationError
            );
          }
        }
      }
    }
    res.send({
      type: "success",
      message: "booking accepted successfully",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const denyBookingRequest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!id) {
      throw new CustomError(400, "id is missing");
    }
    const booking = await db.Booking.findOne({
      where: { id: id },
      transaction,
    });
    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }
    if (booking.hostId !== req.user.id && booking.clientId !== req.user.id) {
      throw new CustomError(403, "user unautherized!");
    }
    if (booking.status === "accepted") {
      throw new CustomError(400, "you can't cancel approved booking");
    }

    await booking.destroy({ transaction });
    await transaction.commit();

    const recipientLogs = await userLogs(booking.clientId);
    if (recipientLogs) {
      const bookingDate = new Date(booking.startDate).toLocaleDateString();
      const message = {
        title: "Booking Request Declined",
        body: `Booking request declined for ${bookingDate} at ${booking.startTime}, try different time or spot`,
      };
      const data = {
        type: "booking_rejected",
        bookingId: booking.id,
        date: bookingDate,
        time: booking.startTime,
      };

      await db.Notification.create({
        userId: booking.clientId,
        bookingId: booking.id || null,
        spotId: booking.spotId || null,
        vehicleId: booking.vehicleId || null,
        title: message.title,
        body: message.body,
        type: data.type,
        data,
        isRead: false,
      });

      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(log.fcmtoken, message, data);
          } catch (notificationError) {
            console.error(
              `Failed to send notification to ${log.fcmtoken}:`,
              notificationError
            );
          }
        }
      }
    }
    res.send({
      type: "success",
      message: "request deleted",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const changeTime = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    bookingId,
    newDay,
    newStartDate,
    newStartTime,
    newEndDate,
    newEndTime,
  } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (
      !bookingId ||
      !newDay ||
      !newStartDate ||
      !newStartTime ||
      !newEndDate ||
      !newEndTime
    ) {
      throw new CustomError(400, "missing required fields");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newStartDate) || !dateRegex.test(newEndDate)) {
      throw new CustomError(400, "dates must be in format YYYY-MM-DD");
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
      throw new CustomError(400, "times must be in 24-hour format (HH:MM)");
    }

    const booking = await db.Booking.findOne({
      where: { id: bookingId },
      transaction,
    });

    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }

    if (booking.clientId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    const newStartDateTime = parseCustomDate(newStartDate, newStartTime);
    const newEndDateTime = parseCustomDate(newEndDate, newEndTime);
    const currentDateTime = new Date();
    const originalStartDateTime = parseCustomDate(
      booking.startDate,
      booking.startTime
    );

    const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (
      originalStartDateTime.getTime() - currentDateTime.getTime() <
      oneDayInMs
    ) {
      throw new CustomError(
        400,
        "booking time can only be changed at least 1 day before the original booking time"
      );
    }

    if (newStartDateTime <= currentDateTime) {
      throw new CustomError(
        400,
        "cannot book slots in the past, please select a future date and time."
      );
    }

    if (newEndDateTime <= newStartDateTime) {
      throw new CustomError(400, "end time must be after start time");
    }

    const bookingDuration = Math.floor(
      (newEndDateTime.getTime() - newStartDateTime.getTime()) / (1000 * 60)
    );

    if (booking.type === "normal") {
      const MIN_NORMAL_DURATION = 15;
      const MAX_NORMAL_DURATION = 1440; // 1 day in minutes

      if (bookingDuration < MIN_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 15 minutes"
        );
      }

      if (bookingDuration > MAX_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "create custom booking for more than 24 hours"
        );
      }

      const spot = await db.Spot.findOne({
        where: { id: booking.spotId },
        include: { model: db.Availability, as: "availabilities" },
        transaction,
      });

      if (!spot) {
        throw new CustomError(404, "spot not found!");
      }

      await isTimeWithinAvailability(
        spot as Spot & { availabilities: Availability[] | null },
        newDay,
        newStartTime,
        newEndTime
      );

      const existingBookings = await db.Booking.findAll({
        where: {
          spotId: booking.spotId,
          day: newDay,
          status: "accepted",
          id: { [Op.ne]: bookingId }, // Exclude current booking
        },
        transaction,
      });

      for (const existingBooking of existingBookings) {
        const existingStart = parseCustomDate(
          existingBooking.startDate,
          existingBooking.startTime
        );
        const existingEnd = parseCustomDate(
          existingBooking.endDate,
          existingBooking.endTime
        );

        if (
          (newStartDateTime >= existingStart &&
            newStartDateTime < existingEnd) ||
          (newEndDateTime > existingStart && newEndDateTime <= existingEnd) ||
          (newStartDateTime <= existingStart && newEndDateTime >= existingEnd)
        ) {
          throw new CustomError(400, "spot already booked for this time slot");
        }
      }

      await booking.update(
        {
          day: newDay,
          startDate: newStartDate,
          startTime: newStartTime,
          endDate: newEndDate,
          endTime: newEndTime,
        },
        { transaction }
      );

      const recipientLogs = await userLogs(booking.hostId);
      if (recipientLogs) {
        const bookingDate = new Date(booking.startDate).toLocaleDateString();
        const message = {
          title: "Booking Time Changed",
          body: `Booking time for ${bookingDate} at ${booking.startTime}, has been changed to ${newStartDate} at ${newStartTime}`,
        };
        const data = {
          type: "booking_timechanged",
          bookingId: booking.id,
          date: bookingDate,
          time: booking.startTime,
        };

        await db.Notification.create({
          userId: booking.hostId,
          bookingId: booking.id || null,
          spotId: booking.spotId || null,
          vehicleId: booking.vehicleId || null,
          title: message.title,
          body: message.body,
          type: data.type,
          data,
          isRead: false,
        });

        for (const log of recipientLogs) {
          if (log.fcmtoken) {
            try {
              await sendNotification(log.fcmtoken, message, data);
            } catch (notificationError) {
              console.error(
                `Failed to send notification to ${log.fcmtoken}:`,
                notificationError
              );
            }
          }
        }
      }

      await transaction.commit();
      res.send({
        type: "success",
        message: "booking time updated successfully",
        data: booking,
      });
    } else if (booking.type === "custom") {
      const MIN_CUSTOM_DURATION = 1440; // 1 day in minutes
      const MAX_CUSTOM_DURATION = 43200; // 30 days in minutes

      if (bookingDuration < MIN_CUSTOM_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 1 day for custom bookings"
        );
      }

      if (bookingDuration > MAX_CUSTOM_DURATION) {
        throw new CustomError(400, "booking duration cannot exceed 30 days");
      }

      const existingTimeChange = await db.TimeChange.findOne({
        where: { bookingId: bookingId },
        transaction,
      });

      if (existingTimeChange) {
        throw new CustomError(
          400,
          "time change request already exists, wait for host response"
        );
      }

      await db.TimeChange.create(
        {
          bookingId: booking.id,
          spotId: booking.spotId,
          hostId: booking.hostId,
          clientId: booking.clientId,
          oldDay: booking.day,
          oldStartDate: booking.startDate,
          oldStartTime: booking.startTime,
          oldEndDate: booking.endDate,
          oldEndTime: booking.endTime,
          newDay,
          newStartDate,
          newStartTime,
          newEndDate,
          newEndTime,
          status: "pending",
        },
        { transaction }
      );

      await transaction.commit();

      const recipientLogs = await userLogs(booking.hostId);
      if (recipientLogs) {
        const bookingDate = new Date(booking.startDate).toLocaleDateString();
        const message = {
          title: "Booking Time Change Request",
          body: `Booking time change is requested from ${bookingDate} at ${booking.startTime}, to ${newStartDate} at ${newStartTime}`,
        };
        const data = {
          type: "booking_timechange_request",
          bookingId: booking.id,
          date: bookingDate,
          time: booking.startTime,
        };

        await db.Notification.create({
          userId: booking.hostId,
          bookingId: booking.id || null,
          spotId: booking.spotId || null,
          vehicleId: booking.vehicleId || null,
          title: message.title,
          body: message.body,
          type: data.type,
          data,
          isRead: false,
        });

        for (const log of recipientLogs) {
          if (log.fcmtoken) {
            try {
              await sendNotification(log.fcmtoken, message, data);
            } catch (notificationError) {
              console.error(
                `Failed to send notification to ${log.fcmtoken}:`,
                notificationError
              );
            }
          }
        }
      }

      res.send({
        type: "success",
        message: "time change request submitted and awaiting approval",
      });
    } else {
      throw new CustomError(400, "invalid booking type");
    }
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const acceptTimeChange = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { timeChangeId } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!timeChangeId) {
      throw new CustomError(400, "time change id is missing");
    }

    const timeChange = await db.TimeChange.findOne({
      where: { id: timeChangeId, status: "pending" },
      include: [{ model: db.Booking, as: "booking" }],
      transaction,
    });

    if (!timeChange) {
      throw new CustomError(
        404,
        "time change request not found or already processed"
      );
    }

    if (timeChange.hostId !== req.user.id) {
      throw new CustomError(403, "user unauthorized");
    }

    const booking = timeChange?.get("booking") as Booking;
    if (!booking) {
      throw new CustomError(404, "booking not found");
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (
      !dateRegex.test(timeChange.newStartDate) ||
      !dateRegex.test(timeChange.newEndDate)
    ) {
      throw new CustomError(400, "dates must be in format YYYY-MM-DD");
    }

    // Validate time formats
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (
      !timeRegex.test(timeChange.newStartTime) ||
      !timeRegex.test(timeChange.newEndTime)
    ) {
      throw new CustomError(400, "times must be in 24-hour format (HH:MM)");
    }

    const newStartDateTime = parseCustomDate(
      timeChange.newStartDate,
      timeChange.newStartTime
    );
    const newEndDateTime = parseCustomDate(
      timeChange.newEndDate,
      timeChange.newEndTime
    );

    const currentDateTime = new Date();

    // Check if new start time is in the past
    if (newStartDateTime <= currentDateTime) {
      throw new CustomError(
        400,
        "cannot approve time changes for past dates, please select a future date and time."
      );
    }

    // Check if end time is after start time
    if (newEndDateTime <= newStartDateTime) {
      throw new CustomError(400, "end time must be after start time");
    }

    const existingBookings = await db.Booking.findAll({
      where: {
        spotId: timeChange.spotId,
        id: { [Op.ne]: timeChange.bookingId }, // Exclude current booking
        status: "accepted",
      },
      transaction,
    });

    // Check for conflicts
    for (const existingBooking of existingBookings) {
      const existingStart = parseCustomDate(
        existingBooking.startDate,
        existingBooking.startTime
      );
      const existingEnd = parseCustomDate(
        existingBooking.endDate,
        existingBooking.endTime
      );

      if (
        (newStartDateTime >= existingStart && newStartDateTime < existingEnd) ||
        (newEndDateTime > existingStart && newEndDateTime <= existingEnd) ||
        (newStartDateTime <= existingStart && newEndDateTime >= existingEnd)
      ) {
        throw new CustomError(
          400,
          "time slot conflicts with another booking, cancel the other bookings in this time if you want to accept this one"
        );
      }
    }

    await booking.update(
      {
        day: timeChange.newDay,
        startDate: timeChange.newStartDate,
        startTime: timeChange.newStartTime,
        endDate: timeChange.newEndDate,
        endTime: timeChange.newEndTime,
      },
      { transaction }
    );

    await timeChange.destroy({ transaction });
    await transaction.commit();

    const recipientLogs = await userLogs(booking.clientId);
    if (recipientLogs) {
      const bookingDate = new Date(booking.startDate).toLocaleDateString();
      const message = {
        title: "Booking Time Change Accepted",
        body: `Booking time change is accepted from ${timeChange.newStartDate} at ${timeChange.newStartDate}`,
      };
      const data = {
        type: "booking_timechange_accepted",
        bookingId: booking.id,
        date: bookingDate,
        time: booking.startTime,
      };

      await db.Notification.create({
        userId: booking.clientId,
        bookingId: booking.id || null,
        spotId: booking.spotId || null,
        vehicleId: booking.vehicleId || null,
        title: message.title,
        body: message.body,
        type: data.type,
        data,
        isRead: false,
      });

      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(log.fcmtoken, message, data);
          } catch (notificationError) {
            console.error(
              `Failed to send notification to ${log.fcmtoken}:`,
              notificationError
            );
          }
        }
      }
    }

    res.send({
      type: "success",
      message: "time change request accepted",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Update Time Change Request
const updateTimeChange = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    timeChangeId,
    newDay,
    newStartDate,
    newStartTime,
    newEndDate,
    newEndTime,
  } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (
      !timeChangeId ||
      !newDay ||
      !newStartDate ||
      !newStartTime ||
      !newEndDate ||
      !newEndTime
    ) {
      throw new CustomError(400, "missing required fields");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newStartDate) || !dateRegex.test(newEndDate)) {
      throw new CustomError(400, "dates must be in format YYYY-MM-DD");
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
      throw new CustomError(400, "times must be in 24-hour format (HH:MM)");
    }

    const timeChange = await db.TimeChange.findOne({
      where: { id: timeChangeId },
      include: [{ model: db.Booking, as: "booking" }],
      transaction,
    });

    if (!timeChange) {
      throw new CustomError(404, "time change request not found");
    }

    if (timeChange.clientId !== req.user.id) {
      throw new CustomError(403, "user unauthorized");
    }

    const booking = timeChange?.get("booking") as Booking;
    if (!booking) {
      throw new CustomError(404, "booking not found");
    }

    const newStartDateTime = parseCustomDate(newStartDate, newStartTime);
    const newEndDateTime = parseCustomDate(newEndDate, newEndTime);
    const currentDateTime = new Date();
    const originalStartDateTime = parseCustomDate(
      booking.startDate,
      booking.startTime
    );

    const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (
      originalStartDateTime.getTime() - currentDateTime.getTime() <
      oneDayInMs
    ) {
      throw new CustomError(
        400,
        "booking time can only be changed at least 1 day before the original booking time"
      );
    }

    if (newStartDateTime <= currentDateTime) {
      throw new CustomError(
        400,
        "cannot book slots in the past, please select a future date and time."
      );
    }

    if (newEndDateTime <= newStartDateTime) {
      throw new CustomError(400, "end time must be after start time");
    }

    const bookingDuration = Math.floor(
      (newEndDateTime.getTime() - newStartDateTime.getTime()) / (1000 * 60)
    );

    if (booking.type === "normal") {
      const MIN_NORMAL_DURATION = 15;
      const MAX_NORMAL_DURATION = 1440; // 1 day in minutes

      if (bookingDuration < MIN_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 15 minutes"
        );
      }

      if (bookingDuration > MAX_NORMAL_DURATION) {
        throw new CustomError(
          400,
          "create custom booking for more than 24 hours"
        );
      }

      const spot = await db.Spot.findOne({
        where: { id: booking.spotId },
        include: { model: db.Availability, as: "availabilities" },
        transaction,
      });

      if (!spot) {
        throw new CustomError(404, "spot not found!");
      }

      await isTimeWithinAvailability(
        spot as Spot & { availabilities: Availability[] | null },
        newDay,
        newStartTime,
        newEndTime
      );

      // Check for conflicts with existing bookings
      const existingBookings = await db.Booking.findAll({
        where: {
          spotId: booking.spotId,
          day: newDay,
          status: "accepted",
          id: { [Op.ne]: booking.id }, // Exclude current booking
        },
        transaction,
      });

      for (const existingBooking of existingBookings) {
        const existingStart = parseCustomDate(
          existingBooking.startDate,
          existingBooking.startTime
        );
        const existingEnd = parseCustomDate(
          existingBooking.endDate,
          existingBooking.endTime
        );

        if (
          (newStartDateTime >= existingStart &&
            newStartDateTime < existingEnd) ||
          (newEndDateTime > existingStart && newEndDateTime <= existingEnd) ||
          (newStartDateTime <= existingStart && newEndDateTime >= existingEnd)
        ) {
          throw new CustomError(400, "spot already booked for this time slot");
        }
      }
    } else if (booking.type === "custom") {
      const MIN_CUSTOM_DURATION = 1440; // 1 day in minutes
      const MAX_CUSTOM_DURATION = 43200; // 30 days in minutes

      if (bookingDuration < MIN_CUSTOM_DURATION) {
        throw new CustomError(
          400,
          "booking duration must be at least 1 day for custom bookings"
        );
      }

      if (bookingDuration > MAX_CUSTOM_DURATION) {
        throw new CustomError(400, "booking duration cannot exceed 30 days");
      }
    } else {
      throw new CustomError(400, "invalid booking type");
    }

    await timeChange.update(
      {
        newDay,
        newStartDate,
        newStartTime,
        newEndDate,
        newEndTime,
        status: "pending", // Reset status to pending for host review
      },
      { transaction }
    );

    await transaction.commit();

    const recipientLogs = await userLogs(booking.hostId);
    if (recipientLogs) {
      const bookingDate = new Date(booking.startDate).toLocaleDateString();
      const message = {
        title: "Booking Time Change Request Updated",
        body: `Booking time change is requested from ${bookingDate} at ${booking.startTime}, to ${newStartDate} at ${newStartTime}`,
      };
      const data = {
        type: "booking_timechange_updated",
        bookingId: booking.id,
        date: bookingDate,
        time: booking.startTime,
      };

      await db.Notification.create({
        userId: booking.hostId,
        bookingId: booking.id || null,
        spotId: booking.spotId || null,
        vehicleId: booking.vehicleId || null,
        title: message.title,
        body: message.body,
        type: data.type,
        data,
        isRead: false,
      });

      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(log.fcmtoken, message, data);
          } catch (notificationError) {
            console.error(
              `Failed to send notification to ${log.fcmtoken}:`,
              notificationError
            );
          }
        }
      }
    }

    res.send({
      type: "success",
      message: "time change request updated and pending review",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Deny Time Change Request
const denyTimeChange = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { timeChangeId } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!timeChangeId) {
      throw new CustomError(400, "time change id is missing");
    }

    const timeChange = await db.TimeChange.findOne({
      where: { id: timeChangeId, status: "pending" },
      transaction,
    });

    if (!timeChange) {
      throw new CustomError(
        404,
        "time change request not found or already processed"
      );
    }

    if (
      timeChange.hostId !== req.user.id &&
      timeChange.clientId !== req.user.id
    ) {
      throw new CustomError(403, "user unauthorized");
    }

    await timeChange.update({ status: "rejected" }, { transaction });
    await transaction.commit();

    const recipientLogs = await userLogs(timeChange.clientId);
    if (recipientLogs) {
      const bookingDate = new Date(
        timeChange.newStartDate
      ).toLocaleDateString();
      const message = {
        title: "Booking Time Change Denied",
        body: `Booking time change is declined to ${bookingDate} at ${timeChange.newStartTime}`,
      };
      const data = {
        type: "booking_timechange_rejected",
        bookingId: timeChange.bookingId,
        date: bookingDate,
        time: timeChange.newStartTime,
      };

      await db.Notification.create({
        userId: timeChange.clientId,
        bookingId: timeChange.id || null,
        spotId: timeChange.spotId || null,
        title: message.title,
        body: message.body,
        type: data.type,
        data,
        isRead: false,
      });

      for (const log of recipientLogs) {
        if (log.fcmtoken) {
          try {
            await sendNotification(log.fcmtoken, message, data);
          } catch (notificationError) {
            console.error(
              `Failed to send notification to ${log.fcmtoken}:`,
              notificationError
            );
          }
        }
      }
    }

    res.send({
      type: "success",
      message: "time change request rejected",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

interface TimeChangeQuery {
  id?: string;
  bookingId?: string;
  spotId?: string;
  hostId?: string;
  clientId?: string;
  status?: string;
  page?: string;
  limit?: string;
}

const queryTimeChange = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    id,
    bookingId,
    spotId,
    clientId,
    hostId,
    status = "pending",
    page = "1",
    limit = "5",
  } = req.query as TimeChangeQuery;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<TimeChange> = { status };

    if (id) {
      whereClause.id = id;
    }
    if (spotId) {
      whereClause.spotId = spotId;
    }
    if (bookingId) {
      whereClause.bookingId = bookingId;
    }
    if (hostId) {
      whereClause.hostId = hostId;
    }
    if (clientId) {
      whereClause.clientId = clientId;
    }

    const count = await db.TimeChange.count({
      where: whereClause,
    });

    const timeChange = await db.TimeChange.findAll({
      where: whereClause,
      limit: limitNum,
      offset: offset,
    });

    if (!timeChange) {
      throw new CustomError(404, "no time change found!");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    res.send({
      type: "success",
      data: timeChange,
      pagination: {
        totalItems: count,
        itemsPerPage: limitNum,
        currentPage: pageNum,
        totalPages,
        nextPage,
      },
    });
  } catch (err) {
    console.error("Error in querySpots:", err);
    next(err);
  }
};

interface CombineBookingTimeChange {
  vehicleId?: string;
  spotId?: string;
  page?: string;
  limit?: string;
}

const combinedBookingAndTimeChangeAndPaymentPending = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    vehicleId,
    spotId,
    page = "1",
    limit = "5",
  } = req.query as CombineBookingTimeChange;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  const userId = req.user.id;
  const now = new Date();
  const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD format
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

  let bookingWhereConditions: Record<string, any> = {
    status: "request-pending",
    hostId: userId,
    [Op.or]: [
      {
        startDate: {
          [Op.gt]: currentDate,
        },
      },
      {
        [Op.and]: [
          {
            startDate: currentDate,
          },
          {
            startTime: {
              [Op.gt]: currentTime,
            },
          },
        ],
      },
    ],
  };

  let paymentWhereConditions: Record<string, any> = {
    status: "payment-pending",
    type: "custom",
    clientId: userId,
    [Op.or]: [
      {
        startDate: {
          [Op.gt]: currentDate,
        },
      },
      {
        [Op.and]: [
          {
            startDate: currentDate,
          },
          {
            startTime: {
              [Op.gt]: currentTime,
            },
          },
        ],
      },
    ],
  };

  let timechangeWhereConditions: Record<string, any> = {
    hostId: userId,
    [Op.or]: [
      {
        oldStartDate: {
          [Op.gt]: currentDate,
        },
      },
      {
        [Op.and]: [
          {
            oldStartDate: currentDate,
          },
          {
            oldStartTime: {
              [Op.gt]: currentTime,
            },
          },
        ],
      },
    ],
  };

  try {
    if (!userId) {
      throw new CustomError(400, "userId is required");
    }
    if (vehicleId) {
      const vehicle = await db.Vehicle.findOne({
        where: { id: vehicleId },
      });
      if (!vehicle) {
        throw new CustomError(404, "vehicle not found!");
      }
      bookingWhereConditions.vehicleId = vehicleId;
    }

    if (spotId) {
      const spot = await db.Spot.findOne({
        where: { id: spotId },
      });
      if (!spot) {
        throw new CustomError(404, "spot not found!");
      }
      bookingWhereConditions.spotId = spotId;
      timechangeWhereConditions.spotId = spotId;
    }

    const bookingCount = await db.Booking.count({
      where: bookingWhereConditions,
    });

    const timeChangeCount = await db.TimeChange.count({
      where: timechangeWhereConditions,
    });

    const totalCount = bookingCount + timeChangeCount;
    const totalPages = Math.ceil(totalCount / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    const bookings = await db.Booking.findAll({
      where: bookingWhereConditions,
      include: [
        {
          model: db.Spot,
          as: "spot",
          attributes: {
            exclude: [
              "userId",
              "status",
              "allowedVehicleType",
              "createdAt",
              "updatedAt",
            ],
          },
        },
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: {
            exclude: ["model", "name", "createdAt", "updatedAt"],
          },
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "image", "name", "email", "phone"],
        },
      ],
    });

    const bookingsWithType = bookings.map((booking) => ({
      ...booking.toJSON(),
      requestType: "booking",
    }));

    const timeChanges = await db.TimeChange.findAll({
      where: timechangeWhereConditions,
      include: [
        {
          model: db.Spot,
          as: "spot",
          attributes: {
            exclude: [
              "userId",
              "status",
              "allowedVehicleType",
              "createdAt",
              "updatedAt",
            ],
          },
        },
        {
          model: db.Booking,
          as: "booking",
          include: [
            {
              model: db.Vehicle,
              as: "vehicle",
              attributes: {
                exclude: ["model", "createdAt", "updatedAt"],
              },
            },
          ],
          attributes: [
            "id",
            "day",
            "startDate",
            "startTime",
            "grossAmount",
            "status",
            "type",
          ],
        },
        {
          model: db.User,
          as: "client",
          attributes: ["id", "image", "name", "email", "phone"],
        },
      ],
    });

    const timeChangesWithType = timeChanges.map((timeChange) => ({
      ...timeChange.toJSON(),
      requestType: "timeChange",
    }));

    const pendingPayments = (await db.Booking.findAll({
      where: paymentWhereConditions,
      include: [
        {
          model: db.Payment,
          as: "payment",
          attributes: {
            exclude: ["createdAt", "updatedAt"],
          },
        },
        {
          model: db.Spot,
          as: "spot",
          attributes: {
            exclude: ["userId", "status", "createdAt", "updatedAt"],
          },
        },
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: {
            exclude: ["model", "createdAt", "updatedAt"],
          },
        },
      ],
    })) as (Booking & { payment: Payment })[];

    const pendingPaymentWithType = pendingPayments.map((pendingPayment) => ({
      ...pendingPayment.toJSON(),
      requestType: "payment",
      paymentIntent: {
        stripePaymentIntentId: pendingPayment.payment.stripePaymentIntentId,
        clientSecret: pendingPayment.payment.stripeClientSecret,
        paymentId: pendingPayment.payment.id,
        amount: pendingPayment.grossAmount,
      },
    }));

    const combinedResults = [
      ...bookingsWithType,
      ...timeChangesWithType,
      ...pendingPaymentWithType,
    ].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const paginatedResults = combinedResults.slice(offset, offset + limitNum);

    res.send({
      type: "success",
      data: paginatedResults,
      pagination: {
        totalItems: totalCount,
        itemsPerPage: limitNum,
        currentPage: pageNum,
        totalPages,
        nextPage,
      },
    });
  } catch (err) {
    next(err);
  }
};

export default {
  bookSpot,
  getBooking,
  getClientBookings,
  getHostBookings,
  getQueryBookings,
  getPastBookings,
  updateBooking,
  cancelBooking,
  acceptBooking,
  denyBookingRequest,
  changeTime,
  acceptTimeChange,
  denyTimeChange,
  updateTimeChange,
  queryTimeChange,
  combinedBookingAndTimeChangeAndPaymentPending,
};
