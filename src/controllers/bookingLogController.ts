import db from "../models";
import { CustomError } from "../middlewares/error";
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../constants";
import { sendNotification, userLogs } from "../helpers/notificationHelper";

const userCheckin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { bookingId, location } = req.body;
  const transaction = await db.sequelize.transaction(); // Begin transaction
  try {
    if (!bookingId) {
      throw new CustomError(400, "booking id is missing");
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

    const dateTime = new Date().toISOString();
    let bookingLog = await db.BookingLog.findOne({
      where: { bookingId: bookingId },
      transaction,
    });

    if (bookingLog) {
      bookingLog = await bookingLog.update(
        {
          userCheckin: {
            checkin: true,
            dateTime,
            location: location || null,
          },
        },
        { transaction }
      );
    } else {
      bookingLog = await db.BookingLog.create(
        {
          bookingId: bookingId,
          userCheckin: {
            checkin: true,
            dateTime,
            location: location || null,
          },
        },
        { transaction }
      );
    }
    await transaction.commit();

    const recipientLogs = await userLogs(booking.hostId);
    if (recipientLogs) {
      const dateTime = new Date(
        bookingLog.userCheckin.dateTime
      ).toLocaleDateString();
      const message = {
        title: "Vehicle Checked In",
        body: `Vehicle checked in at ${dateTime}`,
      };
      const data = {
        type: "vehicle_check_in_user",
        bookingId: booking.id,
        dateTime: dateTime,
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
      message: "user checked in",
      data: bookingLog,
    });
  } catch (err) {
    await transaction.rollback(); // Rollback transaction on error
    next(err); // Pass the error to the global error handler
  }
};

const hostCheckin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { bookingId, location } = req.body;
  const transaction = await db.sequelize.transaction(); // Begin transaction
  try {
    if (!bookingId) {
      throw new CustomError(400, "booking id is missing");
    }

    const booking = await db.Booking.findOne({
      where: { id: bookingId },
      transaction,
    });
    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }
    if (booking.hostId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    const dateTime = new Date().toISOString();
    let bookingLog = await db.BookingLog.findOne({
      where: { bookingId: bookingId },
      transaction,
    });
    if (bookingLog) {
      await bookingLog.update(
        {
          hostCheckin: {
            checkin: true,
            dateTime,
            location: location || null,
          },
        },
        { transaction }
      );
    } else {
      await db.BookingLog.create(
        {
          bookingId: bookingId,
          hostCheckin: {
            checkin: true,
            dateTime,
            location: location || null,
          },
        },
        { transaction }
      );
    }
    await transaction.commit();

    const recipientLogs = await userLogs(booking.clientId);
    if (recipientLogs) {
      const dateTime = new Date(
        bookingLog?.hostCheckin.dateTime
      ).toLocaleDateString();
      const message = {
        title: "Vehicle Checked In",
        body: `Vehicle checked in at ${dateTime}`,
      };
      const data = {
        type: "vehicle_check_in_host",
        bookingId: booking.id,
        dateTime: dateTime,
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
      message: "user checked in",
    });
  } catch (err) {
    await transaction.rollback(); // Rollback transaction on error
    next(err); // Pass the error to the global error handler
  }
};

const userCheckout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { bookingId, location } = req.body;
  const transaction = await db.sequelize.transaction(); // Begin transaction
  try {
    if (!bookingId) {
      throw new CustomError(400, "booking id is missing");
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

    const dateTime = new Date().toISOString();
    let bookingLog = await db.BookingLog.findOne({
      where: { bookingId: bookingId },
      transaction,
    });

    if (bookingLog) {
      bookingLog = await bookingLog.update(
        {
          userCheckout: {
            checkout: true,
            dateTime,
            location: location || null,
          },
        },
        { transaction }
      );
    } else {
      bookingLog = await db.BookingLog.create(
        {
          bookingId: bookingId,
          userCheckout: {
            checkout: true,
            dateTime,
            location: location || null,
          },
        },
        { transaction }
      );
    }
    await db.Booking.update(
      { status: "completed" },
      { where: { id: bookingId }, transaction }
    );
    await transaction.commit();

    const recipientLogs = await userLogs(booking.hostId);
    if (recipientLogs) {
      const dateTime = new Date(
        bookingLog.userCheckout.dateTime
      ).toLocaleDateString();
      const message = {
        title: "Vehicle Checked Out",
        body: `Vehicle checked out at ${dateTime}`,
      };
      const data = {
        type: "vehicle_check_out_user",
        bookingId: booking.id,
        dateTime: dateTime,
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
      message: "user checked out",
      data: bookingLog,
    });
  } catch (err) {
    await transaction.rollback(); // Rollback transaction on error
    next(err); // Pass the error to the global error handler
  }
};

const hostCheckout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { bookingId, location } = req.body;
  const transaction = await db.sequelize.transaction(); // Begin transaction
  try {
    if (!bookingId) {
      throw new CustomError(400, "booking id is missing");
    }

    const booking = await db.Booking.findOne({
      where: { id: bookingId },
      transaction,
    });
    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }
    if (booking.hostId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }
    const now = new Date();
    const bookingEndDateTime = new Date(
      `${booking.endDate}T${booking.endTime}:00Z`
    );

    if (now < bookingEndDateTime) {
      throw new CustomError(
        400,
        "Cannot checkout before booking end date and time"
      );
    }

    let bookingLog = await db.BookingLog.findOne({
      where: { bookingId: bookingId },
      transaction,
    });
    if (bookingLog) {
      await bookingLog.update(
        {
          hostCheckout: {
            checkout: true,
            now,
            location: location || null,
          },
        },
        { transaction }
      );
    } else {
      await db.BookingLog.create(
        {
          bookingId: bookingId,
          hostCheckout: {
            checkout: true,
            now,
            location: location || null,
          },
        },
        { transaction }
      );
    }
    await db.Booking.update(
      { status: "completed" },
      { where: { id: bookingId }, transaction }
    );
    await transaction.rollback();

    const recipientLogs = await userLogs(booking.clientId);
    if (recipientLogs) {
      const dateTime = new Date(
        bookingLog?.hostCheckout.dateTime
      ).toLocaleDateString();
      const message = {
        title: "Vehicle Checked Out",
        body: `Vehicle checked out at ${dateTime}`,
      };
      const data = {
        type: "vehicle_check_out_host",
        bookingId: booking.id,
        dateTime: dateTime,
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
      message: "user checked out",
    });
  } catch (err) {
    await transaction.rollback(); // Rollback transaction on error
    next(err); // Pass the error to the global error handler
  }
};

const getBookingLog = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { bookingId } = req.params;
  try {
    if (!bookingId) {
      throw new CustomError(400, "booking id is missing");
    }

    const booking = await db.Booking.findOne({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new CustomError(404, "booking not found!");
    }

    const bookingLog = await db.BookingLog.findOne({
      where: { bookingId: bookingId },
    });
    if (!bookingLog) {
      throw new CustomError(404, "booking log not found!");
    }

    res.send({
      type: "success",
      data: bookingLog,
    });
  } catch (err) {
    next(err);
  }
};

export default {
  userCheckin,
  hostCheckin,
  userCheckout,
  hostCheckout,
  getBookingLog,
};
