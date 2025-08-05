import db from "../models";
import { CustomError } from "../middlewares/error";
import { Response, NextFunction } from "express";
import { AuthenticatedRequest, Availability, Spot } from "../constants";
import {
  convertTimeToMinutes,
  minutesToTimeString,
  timeStringToMinutes,
} from "../helpers/timeDateHelpers";
import { Op } from "sequelize";
import { DateTime } from "luxon";

const createAvailability = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    spotId,
    day,
    startTime,
    endTime,
    similarDays = [],
    replaceOverlapping = "false", // 'true', 'ignore', 'false'
  } = req.body;

  type ValidDay = "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

  type ConflictAvailability = {
    id: string;
    day: ValidDay;
    startTime: string;
    endTime: string;
  };

  const validDays: ValidDay[] = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ];

  if (!validDays.includes(day as ValidDay)) {
    throw new CustomError(
      400,
      "invalid day format. Use: Mon, Tue, Wed, Thu, Fri, Sat, Sun"
    );
  }

  if (Array.isArray(similarDays) && similarDays.length > 0) {
    for (const similarDay of similarDays) {
      if (!validDays.includes(similarDay as ValidDay)) {
        throw new CustomError(
          400,
          "invalid similarDay format. Use: Mon, Tue, Wed, Thu, Fri, Sat, Sun"
        );
      }
    }
  }

  const transaction = await db.sequelize.transaction();

  try {
    if (!spotId || !day || !startTime || !endTime) {
      throw new CustomError(400, "field is missing");
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new CustomError(
        400,
        `invalid time format, time must be in 24-hour format (HH:MM)`
      );
    }

    if (endTime <= startTime) {
      throw new CustomError(400, "end time must be greater than start time");
    }

    const spot = await db.Spot.findOne({
      where: { id: spotId },
      transaction,
    });
    if (!spot) {
      throw new CustomError(404, "spot not found!");
    }
    if (spot.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    let daysToProcess: ValidDay[] = [day as ValidDay];
    if (Array.isArray(similarDays) && similarDays.length > 0) {
      daysToProcess = [
        ...new Set([day as ValidDay, ...(similarDays as ValidDay[])]), // Remove duplicates
      ];
    }

    const newOpenMinutes = convertTimeToMinutes(startTime);
    const newCloseMinutes = convertTimeToMinutes(endTime);

    const existingAvailabilities = await db.Availability.findAll({
      where: {
        spotId,
        day: { [Op.in]: daysToProcess },
      },
      transaction,
    });

    const overlappingAvailabilities: Availability[] = [];
    const overlappingDays = new Set<string>();
    const conflictDetails: Record<string, ConflictAvailability[]> = {};
    const daysWithoutOverlap: ValidDay[] = [];

    for (const currentDay of daysToProcess) {
      const dayAvailabilities = existingAvailabilities.filter(
        (av) => av.day === currentDay
      );

      const dayOverlaps: Availability[] = [];

      for (const availability of dayAvailabilities) {
        const existingOpenMinutes = convertTimeToMinutes(
          availability.startTime
        );
        const existingCloseMinutes = convertTimeToMinutes(availability.endTime);

        const hasOverlap =
          newOpenMinutes < existingCloseMinutes &&
          newCloseMinutes > existingOpenMinutes;

        if (hasOverlap) {
          dayOverlaps.push(availability);
        }
      }

      if (dayOverlaps.length > 0) {
        overlappingAvailabilities.push(...dayOverlaps);
        overlappingDays.add(currentDay);
        conflictDetails[currentDay] = dayOverlaps.map(
          (av: Availability): ConflictAvailability => ({
            id: av.id,
            day: av.day,
            startTime: av.startTime,
            endTime: av.endTime,
          })
        );
      } else {
        daysWithoutOverlap.push(currentDay);
      }
    }

    if (replaceOverlapping === "false") {
      // If overlap is false and there are overlapping availabilities, return conflict
      if (overlappingAvailabilities.length > 0) {
        await transaction.rollback();

        const overlappingDaysArray = Array.from(overlappingDays);

        res.status(409).json({
          type: "conflict",
          message: `Availability overlaps with existing slots on: ${overlappingDaysArray.join(
            ", "
          )}`,
          conflictDetails: {
            overlappingDays: overlappingDaysArray,
            overlappingAvailabilities: conflictDetails,
            newAvailability: {
              day,
              startTime,
              endTime,
              similarDays,
            },
          },
        });
        return;
      }

      // If no overlapping availabilities, create for all days
      const createdAvailabilities: Availability[] = [];
      for (const currentDay of daysToProcess) {
        const newAvailability = await db.Availability.create(
          {
            spotId,
            day: currentDay,
            startTime,
            endTime,
          },
          { transaction }
        );
        createdAvailabilities.push(newAvailability);
      }

      const updatedSpot = await db.Spot.findOne({
        where: { id: spotId },
        include: {
          model: db.Availability,
          as: "availabilities",
          attributes: { exclude: ["updatedAt", "createdAt"] },
        },
        attributes: { exclude: ["updatedAt", "createdAt"] },
        transaction,
      });

      await transaction.commit();

      res.json({
        type: "success",
        message: `availability added for ${daysToProcess.length} day(s)!`,
        data: updatedSpot,
        created: createdAvailabilities.length,
        replaced: 0,
      });
      return;
    }

    let replacedCount = 0;
    let daysToCreate: ValidDay[] = [];

    if (replaceOverlapping === "true") {
      // Replace overlapping: delete old overlapping ones for overlapping days,
      // and create for all days (both overlapping and non-overlapping)
      if (overlappingAvailabilities.length > 0) {
        const overlappingIds = overlappingAvailabilities.map(
          (av: Availability) => av.id
        );
        replacedCount = await db.Availability.destroy({
          where: {
            id: { [Op.in]: overlappingIds },
          },
          transaction,
        });
      }
      daysToCreate = daysToProcess;
    } else if (replaceOverlapping === "ignore") {
      // Ignore overlapping: only create for days without overlap
      daysToCreate = daysWithoutOverlap;
    }

    const createdAvailabilities: Availability[] = [];
    for (const currentDay of daysToCreate) {
      const newAvailability = await db.Availability.create(
        {
          spotId,
          day: currentDay,
          startTime,
          endTime,
        },
        { transaction }
      );
      createdAvailabilities.push(newAvailability);
    }

    const updatedSpot = await db.Spot.findOne({
      where: { id: spotId },
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: { exclude: ["updatedAt", "createdAt"] },
      },
      attributes: { exclude: ["updatedAt", "createdAt"] },
      transaction,
    });

    await transaction.commit();

    let message;
    if (replaceOverlapping === "true" && replacedCount > 0) {
      message = `availability added for ${daysToCreate.length} day(s) and ${replacedCount} overlapping slot(s) replaced!`;
    } else if (replaceOverlapping === "ignore" && overlappingDays.size > 0) {
      message = `availability added for ${daysToCreate.length} day(s), ${overlappingDays.size} day(s) with overlaps were ignored!`;
    } else {
      message = `availability added for ${daysToCreate.length} day(s)!`;
    }

    res.json({
      type: "success",
      message,
      data: updatedSpot,
      created: createdAvailabilities.length,
      replaced: replacedCount,
      ...(replaceOverlapping === "ignore" &&
        overlappingDays.size > 0 && {
          ignoredDays: Array.from(overlappingDays),
          ignoredCount: overlappingDays.size,
        }),
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const updateAvailability = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    id,
    spotId,
    day,
    startTime,
    endTime,
    replaceOverlapping = "false",
  } = req.body;

  type ValidDay = "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

  type ConflictAvailability = {
    id: string;
    day: ValidDay;
    startTime: string;
    endTime: string;
  };

  const validDays: ValidDay[] = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ];

  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "availability id is missing");
    }

    if (!spotId || !day || !startTime || !endTime) {
      throw new CustomError(400, "field is missing");
    }

    if (!validDays.includes(day as ValidDay)) {
      throw new CustomError(
        400,
        "invalid day format. Use: Mon, Tue, Wed, Thu, Fri, Sat, Sun"
      );
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new CustomError(
        400,
        `invalid time format, time must be in 24-hour format (HH:MM)`
      );
    }

    if (endTime <= startTime) {
      throw new CustomError(400, "end time must be greater than start time");
    }

    const spot = await db.Spot.findOne({
      where: { id: spotId },
      transaction,
    });
    if (!spot) {
      throw new CustomError(404, "spot not found!");
    }
    if (spot.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    const availability = await db.Availability.findOne({
      where: { id: id },
      transaction,
    });
    if (!availability) {
      throw new CustomError(404, "availability not found!");
    }

    const newOpenMinutes = convertTimeToMinutes(startTime);
    const newCloseMinutes = convertTimeToMinutes(endTime);

    const existingAvailabilities = await db.Availability.findAll({
      where: {
        spotId,
        day,
        id: { [Op.ne]: id }, // Exclude the current availability
      },
      transaction,
    });

    const overlappingAvailabilities: Availability[] = [];
    const conflictDetails: ConflictAvailability[] = [];

    for (const existingAvailability of existingAvailabilities) {
      const existingOpenMinutes = convertTimeToMinutes(
        existingAvailability.startTime
      );
      const existingCloseMinutes = convertTimeToMinutes(
        existingAvailability.endTime
      );

      const hasOverlap =
        newOpenMinutes < existingCloseMinutes &&
        newCloseMinutes > existingOpenMinutes;

      if (hasOverlap) {
        overlappingAvailabilities.push(existingAvailability);
        conflictDetails.push({
          id: existingAvailability.id,
          day: existingAvailability.day,
          startTime: existingAvailability.startTime,
          endTime: existingAvailability.endTime,
        });
      }
    }

    if (
      overlappingAvailabilities.length > 0 &&
      replaceOverlapping === "false"
    ) {
      await transaction.rollback();

      res.status(409).json({
        type: "conflict",
        message: `Updated availability overlaps with existing slots on ${day}`,
        conflictDetails: {
          currentAvailability: {
            id: availability.id,
            day: availability.day,
            startTime: availability.startTime,
            endTime: availability.endTime,
          },
          overlappingAvailabilities: conflictDetails,
          updatedAvailability: {
            id,
            day,
            startTime,
            endTime,
          },
        },
      });
      return;
    }

    let replacedCount = 0;

    if (overlappingAvailabilities.length > 0 && replaceOverlapping === "true") {
      const overlappingIds = overlappingAvailabilities.map(
        (av: Availability) => av.id
      );
      replacedCount = await db.Availability.destroy({
        where: {
          id: { [Op.in]: overlappingIds },
        },
        transaction,
      });
    }

    await availability.update(
      {
        day: day,
        startTime: startTime,
        endTime: endTime,
      },
      { transaction }
    );

    const updatedSpot = await db.Spot.findOne({
      where: { id: spotId },
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: { exclude: ["updatedAt", "createdAt"] },
      },
      attributes: { exclude: ["updatedAt", "createdAt"] },
      transaction,
    });

    await transaction.commit();

    let message;
    if (replaceOverlapping === "true" && replacedCount > 0) {
      message = `availability updated and ${replacedCount} overlapping slot(s) replaced!`;
    } else {
      message = "availability updated!";
    }

    res.json({
      type: "success",
      message,
      data: updatedSpot,
      updated: 1,
      replaced: replacedCount,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const deleteAvailability = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { spotId, id } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!spotId || !id) {
      throw new CustomError(400, "spotId or availability id is missing");
    }

    const spot = await db.Spot.findOne({
      where: { id: spotId },
      transaction,
    });
    if (!spot) {
      throw new CustomError(404, "spot not Found!");
    }
    if (spot.userId !== req.user.id) {
      throw new CustomError(404, "user unautherized!");
    }

    const availability = await db.Availability.findOne({
      where: { id: id },
      transaction,
    });
    if (!availability) {
      throw new CustomError(404, "spot not Found!");
    }

    await availability.destroy({ transaction });
    await transaction.commit();

    res.send({
      type: "success",
      message: "availability deleted",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const dateDurationAvailability = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { spotId, date, duration } = req.query;
  try {
    if (
      typeof spotId !== "string" ||
      typeof date !== "string" ||
      typeof duration !== "string"
    ) {
      throw new CustomError(400, "missing or invalid query parameters");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new CustomError(400, "dates must be in format YYYY-MM-DD");
    }

    let durationNumber = parseInt(duration, 10);
    if (
      isNaN(durationNumber) ||
      durationNumber < 15 ||
      durationNumber > 43200
    ) {
      throw new CustomError(
        400,
        "minimum duration is 15 minutes and max is 30 days"
      );
    }

    if (durationNumber > 1440) {
      durationNumber = 15;
    }

    // First, get the spot to access its timezone
    const spot = await db.Spot.findOne({
      where: { id: spotId },
      include: [
        {
          model: db.Availability,
          as: "availabilities",
        },
      ],
    });

    if (!spot) {
      throw new CustomError(404, "spot not found");
    }

    // Use spot's timezone for all date operations
    const now = DateTime.now().setZone(spot.timeZone);
    const requestDate = DateTime.fromISO(date, { zone: spot.timeZone });

    if (!requestDate.isValid) {
      throw new CustomError(400, "invalid date values");
    }

    // Check if the request date is in the past (comparing in spot's timezone)
    const today = now.startOf("day");
    if (requestDate < today) {
      throw new CustomError(400, "cannot check availability for past dates");
    }

    const dayAbbreviations = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeek = dayAbbreviations[requestDate.weekday % 7]; // DateTime.weekday is 1-7, we need 0-6
    const formattedDate = date;

    // Filter availabilities for the specific day
    const typedSpot = spot as Spot & { availabilities: Availability[] };
    const dayAvailabilities = typedSpot.availabilities.filter(
      (availability) => availability.day === dayOfWeek
    );

    if (dayAvailabilities.length === 0) {
      throw new CustomError(404, "no availability for this day");
    }

    const bookings = await db.Booking.findAll({
      where: {
        spotId: spotId,
        status: {
          [Op.notIn]: ["cancelled", "rejected"],
        },
        [Op.or]: [
          // booking that starts before and ends after the given date
          {
            startDate: { [Op.lte]: formattedDate },
            endDate: { [Op.gte]: formattedDate },
          },
          { startDate: formattedDate },
          { endDate: formattedDate },
        ],
      },
    });

    const slots = [];

    for (const availability of dayAvailabilities) {
      const startMinutes = timeStringToMinutes(availability.startTime);
      const endMinutes = timeStringToMinutes(availability.endTime);

      // Check if this is a 23:59 end time
      const isSpecialEndTime = availability.endTime === "23:59";

      // Special handling for the case where end time is 23:59
      if (isSpecialEndTime) {
        // Generate slots as normal but handle the final slot differently
        for (
          let slotStart = startMinutes;
          slotStart < endMinutes;
          slotStart += durationNumber
        ) {
          let slotEnd = slotStart + durationNumber;

          // If this slot would end after endMinutes, cap it at endMinutes (23:59)
          if (slotEnd > endMinutes) {
            slotEnd = endMinutes;
          }

          if (slotEnd > slotStart) {
            slots.push({
              start: minutesToTimeString(slotStart),
              end: minutesToTimeString(slotEnd),
              booked: false,
            });
          }
        }
      } else {
        for (
          let slotStart = startMinutes;
          slotStart + durationNumber <= endMinutes;
          slotStart += durationNumber
        ) {
          const slotEnd = slotStart + durationNumber;
          slots.push({
            start: minutesToTimeString(slotStart),
            end: minutesToTimeString(slotEnd),
            booked: false,
          });
        }
      }
    }

    // Get current time in spot's timezone for filtering past slots
    const currentTimeInSpotZone = DateTime.now().setZone(spot.timeZone);
    const currentMinutes =
      currentTimeInSpotZone.hour * 60 + currentTimeInSpotZone.minute;
    const isToday = requestDate.hasSame(currentTimeInSpotZone, "day");

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotStartMinutes = timeStringToMinutes(slot.start);
      const slotEndMinutes = timeStringToMinutes(slot.end);

      // Skip past slots if this is today
      if (isToday && slotEndMinutes <= currentMinutes) {
        slot.booked = true; // Mark as booked so it's filtered out or shown as unavailable
        continue;
      }

      for (const booking of bookings) {
        const bookingStartDate = booking.startDate;
        const bookingEndDate = booking.endDate;

        // Case 1: Booking spans multiple days including this date
        if (
          bookingStartDate < formattedDate &&
          bookingEndDate > formattedDate
        ) {
          slot.booked = true;
          break;
        }
        // Case 2: Same day booking - check if ANY part of the booking overlaps with this slot
        else if (
          bookingStartDate === formattedDate &&
          bookingEndDate === formattedDate
        ) {
          const bookingStartMinutes = timeStringToMinutes(booking.startTime);
          const bookingEndMinutes = timeStringToMinutes(booking.endTime);

          if (
            !(
              bookingEndMinutes <= slotStartMinutes ||
              bookingStartMinutes >= slotEndMinutes
            )
          ) {
            slot.booked = true;
            break;
          }
        }
        // Case 3: Booking starts on this date
        else if (bookingStartDate === formattedDate) {
          const bookingStartMinutes = timeStringToMinutes(booking.startTime);
          if (bookingStartMinutes < slotEndMinutes) {
            slot.booked = true;
            break;
          }
        }
        // Case 4: Booking ends on this date
        else if (bookingEndDate === formattedDate) {
          const bookingEndMinutes = timeStringToMinutes(booking.endTime);
          if (bookingEndMinutes > slotStartMinutes) {
            slot.booked = true;
            break;
          }
        }
      }
    }

    // Filter out past slots or slots marked as booked
    const availableSlots = slots.filter((slot) => !slot.booked);

    availableSlots.sort((a, b) => {
      const aMinutes = timeStringToMinutes(a.start);
      const bMinutes = timeStringToMinutes(b.start);
      return aMinutes - bMinutes;
    });

    res.send({
      type: "success",
      message: "availability slots",
      data: {
        slots: availableSlots, // Only return available slots
        date: formattedDate,
        duration,
      },
    });
  } catch (err) {
    next(err);
  }
};

export default {
  createAvailability,
  updateAvailability,
  deleteAvailability,
  dateDurationAvailability,
};
