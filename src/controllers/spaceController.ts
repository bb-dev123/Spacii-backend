import moment from "moment";
import db from "../models";
import { CustomError } from "../middlewares/error";
import { FindAttributeOptions, Op, WhereOptions } from "sequelize";
import { Request, Response, NextFunction } from "express";
import {
  Availability,
  Booking,
  PaginationParams,
  AuthenticatedRequest,
  Space,
  QuerySpace,
  Venue,
} from "../constants";
import { deleteMediaFromS3, uploadSpaceMediaToS3 } from "../helpers/s3Helper";
import { DateTime } from "luxon";
import {
  convertTimeToMinutes,
  normalizeTimeFormat,
} from "../helpers/timeDateHelpers";

const createSpace = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    venueId,
    name,
    roomNumber,
    capacity,
    status = "draft",
    description,
  } = req.body;

  const transaction = await db.sequelize.transaction();

  try {
    if (!name || !capacity) {
      throw new CustomError(400, "missing field");
    }
    if (status !== "draft" && status !== "published") {
      throw new CustomError(400, "invalid status");
    }

    const venue = await db.Venue.findByPk(venueId, { transaction });
    if (!venue) {
      throw new CustomError(404, "venue not found");
    }

    const newSpace = await db.Space.create(
      {
        userId: req.user.id,
        venueId,
        name,
        roomNumber: roomNumber || null,
        capacity,
        status,
        description: description || null,
        timeZone: venue.timeZone || null,
      },
      { transaction }
    );

    const completeSpace = await db.Space.findByPk(newSpace.id, {
      attributes: {
        exclude: ["createdAt", "updatedAt"],
      },
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: { exclude: ["createdAt", "updatedAt"] },
      },
      transaction,
    });

    await transaction.commit();
    res.send({
      type: "success",
      message: "space added successfully",
      data: completeSpace,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

export const updateSpace = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const {
    id,
    name,
    roomNumber,
    capacity,
    ratePerHour,
    minHours,
    discountHours,
    status,
    availabilities,
    mediaOperations,
  } = req.body;

  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "space Id is missing");
    }

    if (status && status !== "draft" && status !== "published") {
      throw new CustomError(
        400,
        "Invalid status. Must be 'draft' or 'published'"
      );
    }

    const space = await db.Space.findOne({
      where: { id },
      transaction,
    });
    if (!space) {
      throw new CustomError(404, "space not found!");
    }

    if (space.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    let operations: any = {};
    if (mediaOperations) {
      try {
        operations =
          typeof mediaOperations === "string"
            ? JSON.parse(mediaOperations)
            : mediaOperations;
      } catch (error) {
        console.error("Error parsing mediaOperations:", error);
        operations = {};
      }
    }

    const currentMedia = await db.Media.findAll({
      where: { spaceId: id },
      order: [["number", "ASC"]],
      transaction,
    });

    let finalMedia: Array<{
      url: string;
      number: number | null;
      type: "image" | "video";
      id?: string;
    }> = currentMedia.map((m) => ({
      url: m.url,
      number: m.number,
      type: m.url.match(/\.(mp4|avi|mov|wmv|flv|webm)$/i) ? "video" : "image",
      id: m.id,
    }));

    if (operations.delete && Array.isArray(operations.delete)) {
      const urlsToDelete = operations.delete;

      for (const urlToDelete of urlsToDelete) {
        const mediaIndex = finalMedia.findIndex((m) => m.url === urlToDelete);
        if (mediaIndex > -1) {
          const mediaToDelete = finalMedia[mediaIndex];
          finalMedia.splice(mediaIndex, 1);

          if (mediaToDelete.id) {
            await db.Media.destroy({
              where: { id: mediaToDelete.id },
              transaction,
            });
          }

          // Delete from S3 if it's an S3 image/video
          const isS3Media = urlToDelete.includes(
            `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`
          );
          if (isS3Media) {
            try {
              await deleteMediaFromS3(urlToDelete);
            } catch (error) {
              console.error(`Failed to delete media ${urlToDelete}:`, error);
            }
          }
        }
      }
    }

    if (req.files && Array.isArray(req.files)) {
      const newImages = req.files.filter((file) =>
        file.mimetype.startsWith("image/")
      );
      const newVideos = req.files.filter((file) =>
        file.mimetype.startsWith("video/")
      );

      const currentImages = finalMedia.filter((m) => m.type === "image");
      const currentVideos = finalMedia.filter((m) => m.type === "video");

      if (currentImages.length + newImages.length > 10) {
        throw new CustomError(400, "Maximum 10 images allowed");
      }

      if (currentVideos.length + newVideos.length > 3) {
        throw new CustomError(400, "Maximum 3 videos allowed");
      }

      for (const file of req.files) {
        if (
          !file.mimetype.startsWith("image/") &&
          !file.mimetype.startsWith("video/")
        ) {
          throw new CustomError(400, "Only image and video files are allowed");
        }

        const mediaUrl = await uploadSpaceMediaToS3(file);
        const mediaType = file.mimetype.startsWith("video/")
          ? "video"
          : "image";

        finalMedia.push({
          url: mediaUrl,
          number: finalMedia.length + 1, // Temporary number, will be reordered
          type: mediaType,
        });
      }
    }

    // Handle reordering
    if (operations.reorder && Array.isArray(operations.reorder)) {
      const reorderedUrls = operations.reorder;
      const reorderedMedia: typeof finalMedia = [];

      for (let i = 0; i < reorderedUrls.length; i++) {
        const url = reorderedUrls[i];
        const mediaItem = finalMedia.find((m) => m.url === url);
        if (mediaItem) {
          reorderedMedia.push({
            ...mediaItem,
            number: i + 1,
          });
        }
      }

      // Add any remaining media that wasn't in the reorder list
      const remainingMedia = finalMedia.filter(
        (m) => !reorderedUrls.includes(m.url)
      );
      for (const media of remainingMedia) {
        reorderedMedia.push({
          ...media,
          number: reorderedMedia.length + 1,
        });
      }

      finalMedia = reorderedMedia;
    } else {
      // If no reordering specified, just update numbers sequentially
      finalMedia = finalMedia.map((media, index) => ({
        ...media,
        number: index + 1,
      }));
    }

    await db.Media.destroy({
      where: { spaceId: id },
      transaction,
    });

    for (const media of finalMedia) {
      await db.Media.create(
        {
          userId: req.user.id,
          spaceId: id,
          url: media.url,
          number: media.number,
        },
        { transaction }
      );
    }

    await space.update(
      {
        ...(name !== undefined && { name }),
        ...(roomNumber !== undefined && { roomNumber }),
        ...(capacity !== undefined && { capacity }),
        ...(ratePerHour !== undefined && { ratePerHour }),
        ...(minHours !== undefined && { minHours }),
        ...(discountHours !== undefined && { discountHours }),
        ...(status !== undefined && { status }),
      },
      { transaction }
    );

    let hasOverlaps = false;
    let processedAvailabilities: any[] = [];

    if (availabilities && availabilities.length > 0) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

      for (let i = 0; i < availabilities.length; i++) {
        const { day, startTime, endTime } = availabilities[i];

        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
          throw new CustomError(
            400,
            `invalid time format at index ${i}. Times must be in 24-hour format (HH:MM)`
          );
        }

        const normalizedStartTime = normalizeTimeFormat(startTime);
        const normalizedEndTime = normalizeTimeFormat(endTime);

        const startMinutes = convertTimeToMinutes(normalizedStartTime);
        const endMinutes = convertTimeToMinutes(normalizedEndTime);

        if (endMinutes <= startMinutes) {
          throw new CustomError(
            400,
            `end time must be after start time at index ${i}`
          );
        }

        processedAvailabilities.push({
          day,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          startMinutes,
          endMinutes,
        });
      }

      for (let i = 0; i < processedAvailabilities.length && !hasOverlaps; i++) {
        for (let j = i + 1; j < processedAvailabilities.length; j++) {
          const current = processedAvailabilities[i];
          const other = processedAvailabilities[j];

          if (current.day === other.day) {
            if (
              (current.startMinutes >= other.startMinutes &&
                current.startMinutes < other.endMinutes) ||
              (current.endMinutes > other.startMinutes &&
                current.endMinutes <= other.endMinutes) ||
              (current.startMinutes <= other.startMinutes &&
                current.endMinutes >= other.endMinutes)
            ) {
              hasOverlaps = true;
              break;
            }
          }
        }
      }
    }

    if (processedAvailabilities.length > 0 && !hasOverlaps) {
      await db.Availability.bulkCreate(
        processedAvailabilities.map((availability) => ({
          spaceId: space.id,
          day: availability.day,
          startTime: availability.startTime,
          endTime: availability.endTime,
        })),
        { transaction }
      );
    }

    const completeSpace = await db.Space.findByPk(space.id, {
      attributes: {
        exclude: ["createdAt", "updatedAt"],
      },
      include: [
        {
          model: db.Availability,
          as: "availabilities",
          attributes: { exclude: ["createdAt", "updatedAt"] },
        },
        {
          model: db.Media,
          as: "media",
          attributes: { exclude: ["createdAt", "updatedAt"] },
          order: [["number", "ASC"]],
        },
      ],
      transaction,
    });

    await transaction.commit();

    if (hasOverlaps) {
      res.send({
        type: "success",
        message:
          "space updated successfully, but availability overlaps detected. Availabilities were not saved.",
        data: completeSpace,
      });
    } else {
      res.send({
        type: "success",
        message: "space updated successfully",
        data: completeSpace,
      });
    }
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const getSpace = async (req: Request, res: Response, next: NextFunction) => {
  const { spaceId } = req.params;

  try {
    if (!spaceId) {
      throw new CustomError(400, "space id is missing");
    }

    let attributes: FindAttributeOptions | undefined = undefined;
    let whereClause: WhereOptions<Space> = { id: spaceId };

    attributes = { exclude: ["createdAt", "updatedAt"] };

    const space = await db.Space.findOne({
      where: whereClause,
      attributes,
      include: [
        {
          model: db.Availability,
          as: "availabilities",
          attributes: ["id", "day", "startTime", "endTime"],
        },
        {
          model: db.Media,
          as: "media",
          attributes: { exclude: ["createdAt", "updatedAt"] },
          order: [["number", "ASC"]],
        },
        {
          model: db.Booking,
          as: "bookings",
          attributes: {
            exclude: [
              "clientId",
              "hostId",
              "vehicleId",
              "spotId",
              "createdAt",
              "updatedAt",
            ],
          },
        },
      ],
    });

    if (!space) {
      throw new CustomError(404, "space not found!");
    }

    const spaceObj = space.toJSON() as SpaceWithDistance;

    if (spaceObj.availabilities && Array.isArray(spaceObj.availabilities)) {
      const uniqueDaysSet = new Set<string>();

      for (const avail of spaceObj.availabilities) {
        uniqueDaysSet.add(avail.day);
      }

      const weekOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      spaceObj.days = weekOrder.filter((day) => uniqueDaysSet.has(day));

      const dayOrder = {
        Sat: 1,
        Sun: 2,
        Mon: 3,
        Tue: 4,
        Wed: 5,
        Thu: 6,
        Fri: 7,
      };

      spaceObj.availabilities.sort((a, b) => {
        const dayComparison = dayOrder[a.day] - dayOrder[b.day];
        if (dayComparison === 0) {
          return a.startTime.localeCompare(b.startTime);
        }
        return dayComparison;
      });
    }

    res.send({
      type: "success",
      data: spaceObj,
    });
  } catch (err) {
    console.error("Error in getSpace:", err);
    next(err);
  }
};

const getUserSpaces = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { name, status, page = "1", limit = "5" } = req.query as QuerySpace;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Space> = { userId: req.user.id };

    if (name) {
      const nameKeywords = name.replace(/\s+/g, "").toLowerCase();
      const nameWords = name.split(/\s+/).map((word) => `%${word}%`);
      whereClause.name = {
        [Op.or]: [
          { [Op.iLike]: `%${nameKeywords}%` },
          ...nameWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }

    if (status) {
      if (status !== "draft" && status !== "published") {
        throw new CustomError(400, "invalid status");
      }
      whereClause.status = status;
    }
    let order: any[] = [["id", "ASC"]];

    const count = await db.Space.count({
      where: whereClause,
    });

    const spaces = await db.Space.findAll({
      attributes: { exclude: ["createdAt", "updatedAt"] },
      where: whereClause,
      include: [
        {
          model: db.Availability,
          as: "availabilities",
          attributes: ["id", "day", "startTime", "endTime"],
        },
        {
          model: db.Media,
          as: "media",
          attributes: { exclude: ["createdAt", "updatedAt"] },
          order: [["number", "ASC"]],
        },
      ],
      limit: limitNum,
      offset: offset,
      order,
    });

    if (!spaces) {
      throw new CustomError(404, "no space found!");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    res.send({
      type: "success",
      data: spaces,
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

interface HomePageSpaceQuery {
  active?: string;
  recent?: string;
  upcoming?: string;
  hosted?: string;
}

const getHomePageSpaces = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    active = "3",
    recent = "5",
    upcoming = "3",
    hosted = "3",
  } = req.query as HomePageSpaceQuery;
  const userId = req.user.id;

  try {
    if (!userId) {
      throw new CustomError(400, "user id is missing");
    }

    const hostedSpots = await db.Spot.findAll({
      where: { userId: userId },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      limit: parseInt(hosted, 10),
      order: [["id", "ASC"]],
    });

    const today = moment().format("D-M-YYYY");
    const currentTime = moment().format("h:mmA");

    const activeBookings = await db.Booking.findAll({
      where: {
        clientId: userId,
        status: "accepted",
        [Op.and]: [
          {
            [Op.or]: [
              {
                startDate: { [Op.lt]: today },
              },
              {
                startDate: today,
                startTime: { [Op.lte]: currentTime },
              },
            ],
          },
          {
            [Op.or]: [
              {
                endDate: { [Op.gt]: today },
              },
              {
                endDate: today,
                endTime: { [Op.gte]: currentTime },
              },
            ],
          },
        ],
      },
      limit: parseInt(active, 10),
      order: [["startTime", "ASC"]],
    });

    // Recent bookings
    const recentBookings = await db.Booking.findAll({
      where: {
        clientId: userId,
        status: ["accepted", "completed"],
        [Op.or]: [
          { endDate: { [Op.lt]: today } },
          {
            endDate: today,
            endTime: { [Op.lt]: currentTime },
          },
        ],
      },
      limit: parseInt(recent, 10),
      order: [
        ["endDate", "DESC"],
        ["endTime", "DESC"],
      ],
    });

    // Upcoming bookings
    const upcomingBookings = await db.Booking.findAll({
      where: {
        clientId: userId,
        status: "accepted",
        [Op.or]: [
          { startDate: { [Op.gt]: today } },
          {
            startDate: today,
            startTime: { [Op.gt]: currentTime },
          },
        ],
      },
      attributes: {
        exclude: [
          "clientId",
          "hostId",
          "vehicleId",
          "canceledBy",
          "createdAt",
          "updatedAt",
        ],
      },
      include: [
        {
          model: db.Spot,
          as: "spot",
          attributes: { exclude: ["createdAt", "updatedAt"] },
        },
      ],
      limit: parseInt(upcoming, 10),
      order: [
        ["startDate", "ASC"],
        ["startTime", "ASC"],
      ],
    });

    const activeSpots = await db.Spot.findAll({
      where: {
        id: {
          [Op.in]: activeBookings.map((booking: Booking) => booking.spaceId),
        },
      },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: [],
        required: true,
      },
      limit: parseInt(active, 10),
      order: [["id", "ASC"]],
    });

    const recentSpots = await db.Spot.findAll({
      where: {
        id: {
          [Op.in]: recentBookings.map((booking: Booking) => booking.spaceId),
        },
        status: "published",
      },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: [],
        required: true,
      },
      limit: parseInt(recent, 10),
      order: [["id", "ASC"]],
    });

    const allSpots = {
      hosted: hostedSpots,
      active: activeSpots,
      recent: recentSpots,
      upcoming: upcomingBookings,
    };

    res.send({
      type: "success",
      data: allSpots,
    });
  } catch (err) {
    next(err);
  }
};

interface SpaceWithDistance extends Space {
  distanceMiles?: number;
  distance?: string;
  availabilities?: Availability[];
  days?: any;
}

const querySpaces = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    userId,
    name,
    minRate,
    maxRate,
    status = "published",
    date,
    duration,
    startTime,
    type,
    lat,
    lng,
    page = "1",
    limit = "5",
  } = req.query as QuerySpace & { startTime?: string; type?: string };

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let dayOfWeek: string | null = null;
    if (date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        throw new CustomError(400, "invalid date format, use YYYY-MM-DD");
      }

      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new CustomError(400, "invalid date");
      }

      const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dayOfWeek = daysOfWeek[dateObj.getDay()];
    }

    let durationInMinutes: number | null = null;
    if (duration) {
      durationInMinutes = parseInt(duration, 10);

      if (isNaN(durationInMinutes)) {
        throw new CustomError(400, "duration must be a valid number");
      }

      if (
        type === "normal" &&
        (durationInMinutes < 15 || durationInMinutes > 1440)
      ) {
        throw new CustomError(
          400,
          "duration must be between 15 minutes and 24 hours for normal bookings"
        );
      } else if (
        type === "custom" &&
        (durationInMinutes < 1440 || durationInMinutes > 43200)
      ) {
        throw new CustomError(
          400,
          "duration must be between 1 day and 30 days for custom bookings"
        );
      } else if (
        !type &&
        (durationInMinutes < 15 || durationInMinutes > 1440)
      ) {
        throw new CustomError(
          400,
          "duration must be between 15 minutes and 24 hours"
        );
      }
    }

    if (startTime) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(startTime)) {
        throw new CustomError(
          400,
          "startTime must be in 24-hour format (HH:MM)"
        );
      }
    }

    if (type && type !== "normal" && type !== "custom") {
      throw new CustomError(400, "type must be either 'normal' or 'custom'");
    }

    const convertTimeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const parseCustomDate = (dateStr: string, timeStr: string): Date => {
      const [year, month, day] = dateStr.split("-").map(Number);
      const [hours, minutes] = timeStr.split(":").map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    };

    let whereClause: WhereOptions<Space> = {};

    if (userId) {
      whereClause.userId = { [Op.ne]: userId };
    }
    if (name) {
      const nameKeywords = name.replace(/\s+/g, "").toLowerCase();
      const nameWords = name.split(/\s+/).map((word) => `%${word}%`);
      whereClause.name = {
        [Op.or]: [
          { [Op.iLike]: `%${nameKeywords}%` },
          ...nameWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }

    if (status) {
      if (status !== "draft" && status !== "published") {
        throw new CustomError(400, "invalid status");
      }
      whereClause.status = status;
    }

    if (minRate || maxRate) {
      whereClause.ratePerHour = {};
      if (minRate) {
        (whereClause.ratePerHour as any)[Op.gte] = parseFloat(minRate);
      }
      if (maxRate) {
        (whereClause.ratePerHour as any)[Op.lte] = parseFloat(maxRate);
      }
    }

    let attributes: FindAttributeOptions | undefined = undefined;
    let order: any[] = [["id", "ASC"]];

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (isNaN(latNum) || isNaN(lngNum)) {
        throw new CustomError(400, "invalid latitude or longitude");
      }
      const searchRadiusMiles = 10;
      const searchRadiusMeters = searchRadiusMiles * 1609.34;

      attributes = {
        include: [
          [
            db.sequelize.literal(
              `ST_Distance(
                location::geography, 
                ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography
              ) / 1609.34`
            ),
            "distanceMiles",
          ],
        ],
        exclude: ["createdAt", "updatedAt"],
      };

      const spatialCondition = db.sequelize.literal(
        `ST_DWithin(
          location::geography, 
          ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography, 
          ${searchRadiusMeters}
        )`
      );

      whereClause = {
        ...whereClause,
        [Op.and]: db.sequelize.where(spatialCondition, true),
      } as WhereOptions<Space>;

      order = [[db.sequelize.literal('"distanceMiles"'), "ASC"]];
    }

    const count = await db.Space.count({
      where: whereClause,
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: [],
        required: true,
      },
    });

    const spaces = (await db.Space.findAll({
      attributes,
      where: whereClause,
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: ["id", "day", "startTime", "endTime"],
        required: true,
      },
      limit: limitNum,
      offset: offset,
      order,
    })) as unknown as SpaceWithDistance[];

    if (!spaces) {
      throw new CustomError(404, "no space found!");
    }

    let filteredSpaces = spaces;

    if (date && startTime && durationInMinutes && type) {
      const endTime = (() => {
        const startMinutes = convertTimeToMinutes(startTime);
        const endMinutes = startMinutes + durationInMinutes;
        const hours = Math.floor(endMinutes / 60) % 24; // Handle day overflow
        const minutes = endMinutes % 60;
        return `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`;
      })();

      const endDate = (() => {
        if (durationInMinutes <= 1440) {
          return date; // Same day
        }
        const startDateObj = new Date(date);
        const daysToAdd = Math.floor(durationInMinutes / 1440);
        startDateObj.setDate(startDateObj.getDate() + daysToAdd);
        return startDateObj.toISOString().split("T")[0];
      })();

      const startDateTime = parseCustomDate(date, startTime);
      const endDateTime = parseCustomDate(endDate, endTime);

      const spaceIds = spaces.map((space) => space.id);
      const existingBookings = await db.Booking.findAll({
        where: {
          spaceId: { [Op.in]: spaceIds },
          status: ["accepted", "payment-pending"],
        },
      });

      const bookingsBySpace = existingBookings.reduce((acc, booking) => {
        if (!acc[booking.spaceId]) {
          acc[booking.spaceId] = [];
        }
        acc[booking.spaceId].push(booking);
        return acc;
      }, {} as Record<string, any[]>);

      filteredSpaces = spaces.filter((space) => {
        if (type === "normal") {
          if (!space.availabilities || !Array.isArray(space.availabilities)) {
            return false;
          }

          const dayAvailabilities = space.availabilities.filter(
            (availability) => availability.day === dayOfWeek
          );

          if (dayAvailabilities.length === 0) {
            return false;
          }

          const requestedStartMinutes = convertTimeToMinutes(startTime);
          const requestedEndMinutes = convertTimeToMinutes(endTime);

          const hasValidAvailability = dayAvailabilities.some(
            (availability) => {
              const availStartMinutes = convertTimeToMinutes(
                availability.startTime
              );
              const availEndMinutes = convertTimeToMinutes(
                availability.endTime
              );

              return (
                requestedStartMinutes >= availStartMinutes &&
                requestedEndMinutes <= availEndMinutes
              );
            }
          );

          if (!hasValidAvailability) {
            return false;
          }
        }

        const spaceBookings = bookingsBySpace[space.id] || [];

        for (const booking of spaceBookings) {
          const existingStart = parseCustomDate(
            booking.startDate,
            booking.startTime
          );
          const existingEnd = parseCustomDate(booking.endDate, booking.endTime);

          if (
            (startDateTime >= existingStart && startDateTime < existingEnd) ||
            (endDateTime > existingStart && endDateTime <= existingEnd) ||
            (startDateTime <= existingStart && endDateTime >= existingEnd)
          ) {
            return false; // Spot is not available due to booking conflict
          }
        }

        return true; // Spot is available
      });
    } else if (dayOfWeek && durationInMinutes) {
      filteredSpaces = spaces.filter((space) => {
        if (!space.availabilities || !Array.isArray(space.availabilities)) {
          return false;
        }

        const dayAvailabilities = space.availabilities.filter(
          (availability) => availability.day === dayOfWeek
        );

        if (dayAvailabilities.length === 0) {
          return false;
        }
        return dayAvailabilities.some((availability) => {
          const startTimeParts = availability.startTime.split(":");
          const endTimeParts = availability.endTime.split(":");

          const startMinutes =
            parseInt(startTimeParts[0], 10) * 60 +
            parseInt(startTimeParts[1], 10);
          const endMinutes =
            parseInt(endTimeParts[0], 10) * 60 + parseInt(endTimeParts[1], 10);

          const availableDuration = endMinutes - startMinutes;

          return availableDuration >= durationInMinutes;
        });
      });
    }

    // Format the distance to show as "0.23 miles" and deduplicate availabilities
    const spacesWithFormattedDistance = filteredSpaces.map((space) => {
      const spaceObj = space.toJSON() as SpaceWithDistance;

      if (spaceObj.availabilities && Array.isArray(spaceObj.availabilities)) {
        const uniqueDaysSet = new Set<string>();

        for (const avail of spaceObj.availabilities) {
          uniqueDaysSet.add(avail.day);
        }

        const weekOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        spaceObj.days = weekOrder.filter((day) => uniqueDaysSet.has(day));
      }

      if (spaceObj.distanceMiles !== undefined) {
        spaceObj.distance = `${parseFloat(
          spaceObj.distanceMiles.toString()
        ).toFixed(2)} miles`;
      }

      return spaceObj;
    });

    const filteredCount = spacesWithFormattedDistance.length;
    const totalPages = Math.ceil(filteredCount / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    res.send({
      type: "success",
      data: spacesWithFormattedDistance,
      pagination: {
        totalItems: filteredCount,
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

const mapViewSpaces = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    userId,
    minRate,
    maxRate,
    status = "published",
    date,
    duration,
    startTime,
    type,
    lat,
    lng,
  } = req.query as QuerySpace & { startTime?: string; type?: string };

  try {
    let dayOfWeek: string | null = null;
    if (date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        throw new CustomError(400, "invalid date format, use YYYY-MM-DD");
      }

      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new CustomError(400, "invalid date");
      }

      const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dayOfWeek = daysOfWeek[dateObj.getDay()];
    }

    let durationInMinutes: number | null = null;
    if (duration) {
      durationInMinutes = parseInt(duration, 10);

      if (isNaN(durationInMinutes)) {
        throw new CustomError(400, "duration must be a valid number");
      }

      if (
        type === "normal" &&
        (durationInMinutes < 15 || durationInMinutes > 1440)
      ) {
        throw new CustomError(
          400,
          "duration must be between 15 minutes and 24 hours for normal bookings"
        );
      } else if (
        type === "custom" &&
        (durationInMinutes < 1440 || durationInMinutes > 43200)
      ) {
        throw new CustomError(
          400,
          "duration must be between 1 day and 30 days for custom bookings"
        );
      } else if (
        !type &&
        (durationInMinutes < 15 || durationInMinutes > 1440)
      ) {
        throw new CustomError(
          400,
          "duration must be between 15 minutes and 24 hours"
        );
      }
    }
    if (startTime) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(startTime)) {
        throw new CustomError(
          400,
          "startTime must be in 24-hour format (HH:MM)"
        );
      }
    }

    if (type && type !== "normal" && type !== "custom") {
      throw new CustomError(400, "type must be either 'normal' or 'custom'");
    }

    const convertTimeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const parseCustomDate = (dateStr: string, timeStr: string): Date => {
      const [year, month, day] = dateStr.split("-").map(Number);
      const [hours, minutes] = timeStr.split(":").map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    };

    let whereClause: WhereOptions<Space> = {};

    if (status) {
      if (status !== "draft" && status !== "published") {
        throw new CustomError(400, "invalid status");
      }
      whereClause.status = status;
    }

    if (userId) {
      whereClause.userId = { [Op.ne]: userId };
    }

    if (minRate || maxRate) {
      whereClause.ratePerHour = {};
      if (minRate) {
        (whereClause.ratePerHour as any)[Op.gte] = parseFloat(minRate);
      }
      if (maxRate) {
        (whereClause.ratePerHour as any)[Op.lte] = parseFloat(maxRate);
      }
    }

    let attributes: FindAttributeOptions | undefined = undefined;
    let order: any[] = [["id", "ASC"]];

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (isNaN(latNum) || isNaN(lngNum)) {
        throw new CustomError(400, "invalid latitude or longitude");
      }
      const searchRadiusMiles = 10;
      const searchRadiusMeters = searchRadiusMiles * 1609.34;

      attributes = {
        include: [
          [
            db.sequelize.literal(
              `ST_Distance(
                location::geography, 
                ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography
              ) / 1609.34`
            ),
            "distanceMiles",
          ],
        ],
        exclude: ["createdAt", "updatedAt"],
      };

      const spatialCondition = db.sequelize.literal(
        `ST_DWithin(
          location::geography, 
          ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography, 
          ${searchRadiusMeters}
        )`
      );

      whereClause = {
        ...whereClause,
        [Op.and]: db.sequelize.where(spatialCondition, true),
      } as WhereOptions<Space>;

      order = [[db.sequelize.literal('"distanceMiles"'), "ASC"]];
    }

    const includeAvailabilities =
      (date && startTime && durationInMinutes && type) ||
      (dayOfWeek && durationInMinutes);

    const spaces = (await db.Spot.findAll({
      attributes,
      where: whereClause,
      include: includeAvailabilities
        ? {
            model: db.Availability,
            as: "availabilities",
            attributes: ["id", "day", "startTime", "endTime"],
            required: true,
          }
        : undefined,
      order,
    })) as unknown as SpaceWithDistance[];

    if (!spaces) {
      throw new CustomError(404, "no space found!");
    }

    let filteredSpaces = spaces;

    // Only perform availability-based filtering when availabilities are loaded
    if (
      includeAvailabilities &&
      date &&
      startTime &&
      durationInMinutes &&
      type
    ) {
      const endTime = (() => {
        const startMinutes = convertTimeToMinutes(startTime);
        const endMinutes = startMinutes + durationInMinutes;
        const hours = Math.floor(endMinutes / 60) % 24; // Handle day overflow
        const minutes = endMinutes % 60;
        return `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`;
      })();

      const endDate = (() => {
        if (durationInMinutes <= 1440) {
          return date; // Same day
        }
        const startDateObj = new Date(date);
        const daysToAdd = Math.floor(durationInMinutes / 1440);
        startDateObj.setDate(startDateObj.getDate() + daysToAdd);
        return startDateObj.toISOString().split("T")[0];
      })();

      const startDateTime = parseCustomDate(date, startTime);
      const endDateTime = parseCustomDate(endDate, endTime);

      const spaceIds = spaces.map((space) => space.id);
      const existingBookings = await db.Booking.findAll({
        where: {
          spaceId: { [Op.in]: spaceIds },
          status: ["accepted", "payment-pending"],
        },
      });

      const bookingsBySpace = existingBookings.reduce((acc, booking) => {
        if (!acc[booking.spaceId]) {
          acc[booking.spaceId] = [];
        }
        acc[booking.spaceId].push(booking);
        return acc;
      }, {} as Record<string, any[]>);

      filteredSpaces = spaces.filter((space) => {
        if (type === "normal") {
          if (!space.availabilities || !Array.isArray(space.availabilities)) {
            return false;
          }

          const dayAvailabilities = space.availabilities.filter(
            (availability) => availability.day === dayOfWeek
          );

          if (dayAvailabilities.length === 0) {
            return false;
          }

          const requestedStartMinutes = convertTimeToMinutes(startTime);
          const requestedEndMinutes = convertTimeToMinutes(endTime);

          const hasValidAvailability = dayAvailabilities.some(
            (availability) => {
              const availStartMinutes = convertTimeToMinutes(
                availability.startTime
              );
              const availEndMinutes = convertTimeToMinutes(
                availability.endTime
              );

              return (
                requestedStartMinutes >= availStartMinutes &&
                requestedEndMinutes <= availEndMinutes
              );
            }
          );

          if (!hasValidAvailability) {
            return false;
          }
        }

        const spaceBookings = bookingsBySpace[space.id] || [];

        for (const booking of spaceBookings) {
          const existingStart = parseCustomDate(
            booking.startDate,
            booking.startTime
          );
          const existingEnd = parseCustomDate(booking.endDate, booking.endTime);

          if (
            (startDateTime >= existingStart && startDateTime < existingEnd) ||
            (endDateTime > existingStart && endDateTime <= existingEnd) ||
            (startDateTime <= existingStart && endDateTime >= existingEnd)
          ) {
            return false;
          }
        }

        return true;
      });
    } else if (includeAvailabilities && dayOfWeek && durationInMinutes) {
      filteredSpaces = spaces.filter((space) => {
        if (!space.availabilities || !Array.isArray(space.availabilities)) {
          return false;
        }

        const dayAvailabilities = space.availabilities.filter(
          (availability) => availability.day === dayOfWeek
        );

        if (dayAvailabilities.length === 0) {
          return false;
        }
        return dayAvailabilities.some((availability) => {
          const startTimeParts = availability.startTime.split(":");
          const endTimeParts = availability.endTime.split(":");

          const startMinutes =
            parseInt(startTimeParts[0], 10) * 60 +
            parseInt(startTimeParts[1], 10);
          const endMinutes =
            parseInt(endTimeParts[0], 10) * 60 + parseInt(endTimeParts[1], 10);

          const availableDuration = endMinutes - startMinutes;

          return availableDuration >= durationInMinutes;
        });
      });
    }

    const responseData = filteredSpaces.map((space) => ({
      id: space.id,
      price: space.ratePerHour,
    }));

    res.send({
      type: "success",
      data: responseData,
    });
  } catch (err) {
    console.error("Error in querySpots:", err);
    next(err);
  }
};

const deleteSpace = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const spaceId = req.body.id;
  const transaction = await db.sequelize.transaction();
  try {
    if (!spaceId) {
      throw new CustomError(400, "space id is missing");
    }
    const space = await db.Space.findOne({
      where: { id: spaceId },
      transaction,
    });
    if (!space) {
      throw new CustomError(404, "space not Found!");
    }
    if (space.userId !== req.user.id) {
      throw new CustomError(403, "user unautherized!");
    }

    await space.destroy({ transaction });
    await transaction.commit();
    res.send({
      type: "success",
      message: "space deleted",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// const spaceBookedDates = async (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   const spaceId = req.params.spaceId;
//   const { duration, type } = req.query as {
//     duration?: string;
//     type?: "normal" | "custom";
//   };

//   try {
//     if (!spaceId) {
//       throw new CustomError(400, "space id is missing");
//     }

//     if (!duration) {
//       throw new CustomError(400, "duration is required");
//     }

//     if (!type || !["normal", "custom"].includes(type)) {
//       throw new CustomError(
//         400,
//         "type is required and must be either 'normal' or 'custom'"
//       );
//     }

//     const durationMinutes = parseInt(duration);
//     if (isNaN(durationMinutes) || durationMinutes <= 0) {
//       throw new CustomError(
//         400,
//         "duration must be a positive number in minutes"
//       );
//     }
//     if (type === "normal" && (durationMinutes < 15 || durationMinutes > 1440)) {
//       throw new CustomError(
//         400,
//         "duration must be between 15 minutes and 24 hours for normal bookings"
//       );
//     }

//     if (
//       type === "custom" &&
//       (durationMinutes < 1440 || durationMinutes > 43200)
//     ) {
//       throw new CustomError(
//         400,
//         "duration must be between 1 and 30 days for custom bookings"
//       );
//     }

//     const space = await db.Space.findOne({
//       where: { id: spaceId },
//       attributes: ["id", "timeZone"],
//       include:[
//         {
//           model: db.Venue,
//           as: "venue",
//         }
//       ]
//     }) as Space & { venue: Venue };

//     if (!space) {
//       throw new CustomError(404, "space not Found!");
//     }

//     const nowInSpaceTz = DateTime.now().setZone(space?.venue?.timeZone);
//     const todayInSpaceTz = nowInSpaceTz.toFormat("yyyy-MM-dd");
//     const currentTimeInSpaceTz = nowInSpaceTz.toFormat("HH:mm");

//     console.log("Today in Space Time Zone:", todayInSpaceTz, nowInSpaceTz);
//     console.log("Current Time in Space Time Zone:", currentTimeInSpaceTz);

//     // Get bookings from today onwards
//     const bookings = await db.Booking.findAll({
//       where: {
//         spaceId: space.id,
//         status: { [Op.in]: ["accepted", "payment-pending", "request-pending"] },
//         startDate: { [Op.gte]: todayInSpaceTz },
//       },
//       attributes: ["startDate", "endDate", "startTime", "endTime"],
//       order: [
//         ["startDate", "ASC"],
//         ["startTime", "ASC"],
//       ],
//     });

//     if (type === "custom") {
//       const durationDays = Math.ceil(durationMinutes / 1440);
//       const isMultiDay = durationDays > 1;

//       const generateDateRange = (
//         startDate: string,
//         endDate: string
//       ): string[] => {
//         const dates: string[] = [];
//         let current = DateTime.fromFormat(startDate, "yyyy-MM-dd", {
//           zone: space.venue.timeZone,
//         });
//         const end = DateTime.fromFormat(endDate, "yyyy-MM-dd", {
//           zone: space.venue.timeZone,
//         });

//         while (current <= end) {
//           dates.push(current.toFormat("yyyy-MM-dd"));
//           current = current.plus({ days: 1 });
//         }

//         return dates;
//       };

//       const directlyBookedDates: string[] = [];
//       const bookedDateRanges: {
//         startDate: string;
//         endDate: string;
//         startTime: string;
//         endTime: string;
//       }[] = [];

//       bookings.forEach((booking) => {
//         bookedDateRanges.push({
//           startDate: booking.startDate,
//           endDate: booking.endDate,
//           startTime: booking.startTime,
//           endTime: booking.endTime,
//         });

//         const dateRange = generateDateRange(booking.startDate, booking.endDate);
//         directlyBookedDates.push(...dateRange);
//       });

//       let allBlockedDates = [...directlyBookedDates];

//       if (isMultiDay) {
//         const sortedBookedDates = [...new Set(directlyBookedDates)]
//           .sort()
//           .map((date) =>
//             DateTime.fromFormat(date, "yyyy-MM-dd", { zone: space.venue.timeZone })
//           );

//         let checkDate = DateTime.fromFormat(todayInSpaceTz, "yyyy-MM-dd", {
//           zone: space.venue.timeZone,
//         });
//         const maxCheckDate =
//           sortedBookedDates.length > 0
//             ? sortedBookedDates[sortedBookedDates.length - 1].plus({
//                 days: durationDays,
//               })
//             : checkDate.plus({ days: 90 });

//         while (checkDate <= maxCheckDate) {
//           const checkDateStr = checkDate.toFormat("yyyy-MM-dd");

//           if (!directlyBookedDates.includes(checkDateStr)) {
//             let hasConflict = false;
//             for (let i = 0; i < durationDays; i++) {
//               const dateToCheck = checkDate.plus({ days: i });
//               const dateStr = dateToCheck.toFormat("yyyy-MM-dd");

//               if (directlyBookedDates.includes(dateStr)) {
//                 hasConflict = true;
//                 break;
//               }
//             }

//             if (hasConflict) {
//               allBlockedDates.push(checkDateStr);
//             }
//           }

//           checkDate = checkDate.plus({ days: 1 });
//         }
//       }

//       const uniqueBlockedDates = [...new Set(allBlockedDates)].sort();

//       // Find first available date for custom bookings
//       let firstAvailableDate: string | null = null;
//       let searchDate = DateTime.fromFormat(todayInSpaceTz, "yyyy-MM-dd", {
//         zone: space.venue.timeZone,
//       });
//       const maxSearchDays = 90;
//       let searchDays = 0;

//       while (searchDays < maxSearchDays && !firstAvailableDate) {
//         const searchDateStr = searchDate.toFormat("yyyy-MM-dd");

//         if (isMultiDay) {
//           let canBook = true;
//           for (let i = 0; i < durationDays; i++) {
//             const dateToCheck = searchDate.plus({ days: i });
//             const dateStr = dateToCheck.toFormat("yyyy-MM-dd");

//             if (directlyBookedDates.includes(dateStr)) {
//               canBook = false;
//               break;
//             }
//           }

//           if (canBook) {
//             firstAvailableDate = searchDateStr;
//           }
//         } else {
//           if (!uniqueBlockedDates.includes(searchDateStr)) {
//             firstAvailableDate = searchDateStr;
//           }
//         }

//         searchDate = searchDate.plus({ days: 1 });
//         searchDays++;
//       }

//       res.send({
//         type: "success",
//         bookedDates: uniqueBlockedDates,
//         firstAvailableDate,
//       });
//     } else {
//       // For normal bookings, check space availabilities
//       const spaceAvailabilities = await db.Availability.findAll({
//         where: {
//           spaceId: space.id,
//         },
//         attributes: ["day", "startTime", "endTime"],
//       });

//       const fullyBookedDates: string[] = [];

//       // Create a map of bookings by date
//       const bookingsByDate = new Map<
//         string,
//         Array<{
//           startTime: string;
//           endTime: string;
//         }>
//       >();

//       bookings.forEach((booking) => {
//         let current = DateTime.fromFormat(booking.startDate, "yyyy-MM-dd", {
//           zone: space.venue.timeZone,
//         });
//         const end = DateTime.fromFormat(booking.endDate, "yyyy-MM-dd", {
//           zone: space.venue.timeZone,
//         });

//         while (current <= end) {
//           const dateStr = current.toFormat("yyyy-MM-dd");

//           if (!bookingsByDate.has(dateStr)) {
//             bookingsByDate.set(dateStr, []);
//           }

//           bookingsByDate.get(dateStr)!.push({
//             startTime: booking.startTime,
//             endTime: booking.endTime,
//           });

//           current = current.plus({ days: 1 });
//         }
//       });

//       // Helper function to convert day number to day string
//       const getDayString = (
//         dayNumber: number
//       ): "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" => {
//         const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
//         return days[dayNumber % 7] as
//           | "Sat"
//           | "Sun"
//           | "Mon"
//           | "Tue"
//           | "Wed"
//           | "Thu"
//           | "Fri";
//       };

//       // Check availability for each day up to 90 days from today
//       let checkDate = DateTime.fromFormat(todayInSpaceTz, "yyyy-MM-dd", {
//         zone: space.venue.timeZone,
//       });
//       const maxCheckDays = 90;

//       for (let i = 0; i < maxCheckDays; i++) {
//         const dateStr = checkDate.toFormat("yyyy-MM-dd");
//         const dayOfWeek = checkDate.weekday; // 1 = Monday, 7 = Sunday
//         const dayString = getDayString(dayOfWeek);

//         // Check if space is available on this day of week
//         const dayAvailability = spaceAvailabilities.find(
//           (avail) => avail.day === dayString
//         );

//         if (!dayAvailability) {
//           // No availability defined for this day, mark as booked
//           fullyBookedDates.push(dateStr);
//         } else {
//           // Check if there's enough time available considering bookings
//           const dayBookings = bookingsByDate.get(dateStr) || [];
//           const sortedBookings = dayBookings.sort((a, b) =>
//             a.startTime.localeCompare(b.startTime)
//           );

//           let hasAvailableSlot = false;
//           const availStartTime = dayAvailability.startTime;
//           const availEndTime = dayAvailability.endTime;

//           // For today, check if current time affects availability
//           let effectiveStartTime = availStartTime;
//           if (dateStr === todayInSpaceTz) {
//             const currentMinutes = nowInSpaceTz.hour * 60 + nowInSpaceTz.minute;
//             const availStartMinutes =
//               DateTime.fromFormat(availStartTime, "HH:mm").hour * 60 +
//               DateTime.fromFormat(availStartTime, "HH:mm").minute;

//             if (currentMinutes > availStartMinutes) {
//               effectiveStartTime = currentTimeInSpaceTz;
//             }
//           }

//           if (sortedBookings.length === 0) {
//             // No bookings, check if duration fits in available time
//             const availStart = DateTime.fromFormat(
//               `${dateStr} ${effectiveStartTime}`,
//               "yyyy-MM-dd HH:mm",
//               { zone: space.venue.timeZone }
//             );
//             const availEnd = DateTime.fromFormat(
//               `${dateStr} ${availEndTime}`,
//               "yyyy-MM-dd HH:mm",
//               { zone: space.venue.timeZone }
//             );

//             if (
//               availEnd.diff(availStart, "minutes").minutes >= durationMinutes
//             ) {
//               hasAvailableSlot = true;
//             }
//           } else {
//             // Check slot before first booking
//             const firstBookingStart = DateTime.fromFormat(
//               `${dateStr} ${sortedBookings[0].startTime}`,
//               "yyyy-MM-dd HH:mm",
//               { zone: space.venue.timeZone }
//             );
//             const availStart = DateTime.fromFormat(
//               `${dateStr} ${effectiveStartTime}`,
//               "yyyy-MM-dd HH:mm",
//               { zone: space.venue.timeZone }
//             );

//             if (
//               firstBookingStart.diff(availStart, "minutes").minutes >=
//               durationMinutes
//             ) {
//               hasAvailableSlot = true;
//             }

//             // Check slots between bookings
//             if (!hasAvailableSlot) {
//               for (let j = 0; j < sortedBookings.length - 1; j++) {
//                 const currentEnd = DateTime.fromFormat(
//                   `${dateStr} ${sortedBookings[j].endTime}`,
//                   "yyyy-MM-dd HH:mm",
//                   { zone: space.venue.timeZone }
//                 );
//                 const nextStart = DateTime.fromFormat(
//                   `${dateStr} ${sortedBookings[j + 1].startTime}`,
//                   "yyyy-MM-dd HH:mm",
//                   { zone: space.venue.timeZone }
//                 );

//                 if (
//                   nextStart.diff(currentEnd, "minutes").minutes >=
//                   durationMinutes
//                 ) {
//                   hasAvailableSlot = true;
//                   break;
//                 }
//               }
//             }

//             // Check slot after last booking
//             if (!hasAvailableSlot) {
//               const lastBookingEnd = DateTime.fromFormat(
//                 `${dateStr} ${
//                   sortedBookings[sortedBookings.length - 1].endTime
//                 }`,
//                 "yyyy-MM-dd HH:mm",
//                 { zone: space.venue.timeZone }
//               );
//               const availEnd = DateTime.fromFormat(
//                 `${dateStr} ${availEndTime}`,
//                 "yyyy-MM-dd HH:mm",
//                 { zone: space.venue.timeZone }
//               );

//               if (
//                 availEnd.diff(lastBookingEnd, "minutes").minutes >=
//                 durationMinutes
//               ) {
//                 hasAvailableSlot = true;
//               }
//             }
//           }

//           if (!hasAvailableSlot) {
//             fullyBookedDates.push(dateStr);
//           }
//         }

//         checkDate = checkDate.plus({ days: 1 });
//       }

//       // Find first available date for normal bookings
//       let firstAvailableDate: string | null = null;
//       let searchDate = DateTime.fromFormat(todayInSpaceTz, "yyyy-MM-dd", {
//         zone: space.venue.timeZone,
//       });
//       const maxSearchDays = 90;
//       let searchDays = 0;

//       while (searchDays < maxSearchDays && !firstAvailableDate) {
//         const searchDateStr = searchDate.toFormat("yyyy-MM-dd");

//         if (!fullyBookedDates.includes(searchDateStr)) {
//           firstAvailableDate = searchDateStr;
//         }

//         searchDate = searchDate.plus({ days: 1 });
//         searchDays++;
//       }

//       res.send({
//         type: "success",
//         bookedDates: fullyBookedDates.sort(),
//         firstAvailableDate,
//       });
//     }
//   } catch (err) {
//     next(err);
//   }
// };

const suggestedSpaces = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { userId, lat, lng, page = "1", limit = "5" } = req.query as QuerySpace;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Space> = {
      status: "published",
    };

    if (userId) {
      whereClause.userId = { [Op.ne]: userId };
    }
    let attributes: FindAttributeOptions | undefined = undefined;
    let order: any[] = [["id", "ASC"]]; // Default order

    if (lat && lng) {
      attributes = {
        include: [
          [
            db.sequelize.literal(
              `ST_Distance(
                location::geography, 
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              ) / 1609.34`
            ),
            "distanceMiles",
          ],
        ],
        exclude: ["createdAt", "updatedAt"],
      };

      order = [[db.sequelize.literal('"distanceMiles"'), "ASC"]];
    } else {
      order = [["ratePerHour", "ASC"]];
    }

    const count = await db.Spot.count({
      where: whereClause,
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: [],
        required: true,
      },
    });

    const spaces = (await db.Space.findAll({
      attributes,
      where: whereClause,
      include: {
        model: db.Availability,
        as: "availabilities",
        attributes: ["id", "day", "startTime", "endTime"],
        required: true,
      },
      limit: limitNum,
      offset: offset,
      order,
    })) as unknown as SpaceWithDistance[];

    if (!spaces) {
      throw new CustomError(404, "No spaces found!");
    }

    const spacesWithFormattedDistance = spaces.map((space) => {
      const spaceObj = space.toJSON() as SpaceWithDistance;

      if (spaceObj.availabilities && Array.isArray(spaceObj.availabilities)) {
        const uniqueDaysSet = new Set<string>();

        for (const avail of spaceObj.availabilities) {
          uniqueDaysSet.add(avail.day);
        }

        const weekOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        spaceObj.days = weekOrder.filter((day) => uniqueDaysSet.has(day));
      }

      if (spaceObj.distanceMiles !== undefined) {
        spaceObj.distance = `${parseFloat(
          spaceObj.distanceMiles.toString()
        ).toFixed(2)} miles`;
      }

      return spaceObj;
    });

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    res.send({
      type: "success",
      data: spacesWithFormattedDistance,
      pagination: {
        totalItems: count,
        itemsPerPage: limitNum,
        currentPage: pageNum,
        totalPages,
        nextPage,
      },
    });
  } catch (err) {
    console.error("Error in suggestedSpots:", err);
    next(err);
  }
};

export default {
  createSpace,
  getSpace,
  getUserSpaces,
  getHomePageSpaces,
  querySpaces,
  mapViewSpaces,
  updateSpace,
  deleteSpace,
  suggestedSpaces,
  // spaceBookedDates,
};
