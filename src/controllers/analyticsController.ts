import { NextFunction, Response } from "express";
import { AuthenticatedRequest, Payment } from "../constants";
import { CustomError } from "../middlewares/error";
import db from "../models";
import { Op } from "sequelize";

export const PlatformAnalyticsController = {
  // Overall platform dashboard stats
  getPlatformOverview: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      const { period = "30d" } = req.query;
      const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      // Total counts
      const totalUsers = await db.User.count({ where: { type: "user" } });
      const totalSpots = await db.Spot.count();
      const totalVehicles = await db.Vehicle.count();
      const totalBookings = await db.Booking.count();

      // Period-specific metrics
      const periodBookings = await db.Booking.count({
        where: { createdAt: { [Op.gte]: startDate } },
      });

      const periodRevenue =
        (await db.Payment.sum("totalAmount", {
          where: {
            status: "succeeded",
            createdAt: { [Op.gte]: startDate },
          },
        })) || 0;

      const newUsers = await db.User.count({
        where: {
          type: "user",
          createdAt: { [Op.gte]: startDate },
        },
      });

      const newSpots = await db.Spot.count({
        where: { createdAt: { [Op.gte]: startDate } },
      });

      // Active spots (have at least one booking)
      const activeSpots = await db.Spot.count({
        include: [
          {
            model: db.Booking,
            as: "bookings",
            required: true,
            where: { createdAt: { [Op.gte]: startDate } },
          },
        ],
        distinct: true,
      });

      // Average booking value
      const avgBookingValue = (await db.Payment.findOne({
        attributes: [
          [db.sequelize.fn("AVG", db.sequelize.col("amount")), "avgAmount"],
        ],
        where: {
          status: "succeeded",
          createdAt: { [Op.gte]: startDate },
        },
        raw: true,
      })) as Payment & { avgAmount: number };

      res.json({
        type: "success",
        data: {
          overview: {
            totalUsers,
            totalSpots,
            totalVehicles,
            totalBookings,
            newUsers,
            newSpots,
            periodBookings,
            periodRevenue,
            activeSpots,
            avgBookingValue: avgBookingValue?.avgAmount || 0,
          },
          period: `${periodDays} days`,
        },
      });
    } catch (error) {
      console.error("Error getting platform overview:", error);
      next(error);
    }
  },

  // Revenue analytics
  getRevenueAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      const { startDate, endDate, groupBy = "day" } = req.query;

      const whereConditions: any = { status: "succeeded" };
      if (startDate && endDate) {
        whereConditions.createdAt = {
          [Op.between]: [
            new Date(startDate as string),
            new Date(endDate as string),
          ],
        };
      }

      // Revenue by time period
      const truncFunction =
        groupBy === "month" ? "month" : groupBy === "week" ? "week" : "day";

      const revenueByPeriod = await db.Payment.findAll({
        attributes: [
          [
            db.sequelize.fn(
              "DATE_TRUNC",
              truncFunction,
              db.sequelize.col("createdAt")
            ),
            "period",
          ],
          [db.sequelize.fn("SUM", db.sequelize.col("amount")), "totalRevenue"],
          [
            db.sequelize.fn("COUNT", db.sequelize.col("id")),
            "transactionCount",
          ],
          [
            db.sequelize.fn("AVG", db.sequelize.col("amount")),
            "avgTransaction",
          ],
        ],
        where: whereConditions,
        group: [
          db.sequelize.fn(
            "DATE_TRUNC",
            truncFunction,
            db.sequelize.col("createdAt")
          ),
        ],
        order: [
          [
            db.sequelize.fn(
              "DATE_TRUNC",
              truncFunction,
              db.sequelize.col("createdAt")
            ),
            "ASC",
          ],
        ],
        raw: true,
      });

      // Top revenue generating spots
      const topSpots = await db.Payment.findAll({
        attributes: [
          "spotId",
          [db.sequelize.fn("SUM", db.sequelize.col("amount")), "totalRevenue"],
          [
            db.sequelize.fn("COUNT", db.sequelize.col("Payment.id")),
            "bookingCount",
          ],
        ],
        include: [
          {
            model: db.Spot,
            as: "spot",
            attributes: ["name", "address", "ratePerHour"],
            include: [
              {
                model: db.User,
                as: "user",
                attributes: ["name", "email"],
              },
            ],
          },
        ],
        where: whereConditions,
        group: ["spotId", "spot.id", "spot->user.id"],
        order: [[db.sequelize.fn("SUM", db.sequelize.col("amount")), "DESC"]],
        limit: 10,
      });

      // Revenue by vehicle type
      const revenueByVehicleType = await db.Payment.findAll({
        attributes: [
          [db.sequelize.col("booking.vehicle.type"), "vehicleType"],
          [db.sequelize.fn("SUM", db.sequelize.col("amount")), "totalRevenue"],
          [
            db.sequelize.fn("COUNT", db.sequelize.col("Payment.id")),
            "bookingCount",
          ],
        ],
        include: [
          {
            model: db.Booking,
            as: "booking",
            attributes: [],
            include: [
              {
                model: db.Vehicle,
                as: "vehicle",
                attributes: [],
              },
            ],
          },
        ],
        where: whereConditions,
        group: [db.sequelize.col("booking.vehicle.type")],
        raw: true,
      });

      res.json({
        type: "success",
        data: {
          revenueByPeriod,
          topSpots,
          revenueByVehicleType,
        },
      });
    } catch (error) {
      console.error("Error getting revenue analytics:", error);
      next(error);
    }
  },

  // Booking analytics
  getBookingAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      const { startDate, endDate } = req.query;

      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.createdAt = {
          [Op.between]: [
            new Date(startDate as string),
            new Date(endDate as string),
          ],
        };
      }

      // Booking status distribution
      const bookingsByStatus = await db.Booking.findAll({
        attributes: [
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
          [db.sequelize.fn("AVG", db.sequelize.col("price")), "avgPrice"],
        ],
        where: whereConditions,
        group: ["status"],
        raw: true,
      });

      // Bookings by day of week
      const bookingsByDay = await db.Booking.findAll({
        attributes: [
          "day",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: whereConditions,
        group: ["day"],
        raw: true,
      });

      // Booking duration analysis
      const durationAnalysis = await db.Booking.findAll({
        attributes: [
          [
            db.sequelize.fn(
              "AVG",
              db.sequelize.literal(`EXTRACT(EPOCH FROM (
              (CAST("endDate" AS DATE) + CAST("endTime" AS TIME)) - 
              (CAST("startDate" AS DATE) + CAST("startTime" AS TIME))
            )) / 3600`)
            ),
            "avgDurationHours",
          ],
          [
            db.sequelize.fn(
              "MIN",
              db.sequelize.literal(`EXTRACT(EPOCH FROM (
              (CAST("endDate" AS DATE) + CAST("endTime" AS TIME)) - 
              (CAST("startDate" AS DATE) + CAST("startTime" AS TIME))
            )) / 3600`)
            ),
            "minDurationHours",
          ],
          [
            db.sequelize.fn(
              "MAX",
              db.sequelize.literal(`EXTRACT(EPOCH FROM (
              (CAST("endDate" AS DATE) + CAST("endTime" AS TIME)) - 
              (CAST("startDate" AS DATE) + CAST("startTime" AS TIME))
            )) / 3600`)
            ),
            "maxDurationHours",
          ],
        ],
        where: {
          ...whereConditions,
          status: ["completed", "accepted"],
        },
        raw: true,
      });

      // Cancellation analysis
      const cancellationStats = await db.Booking.findAll({
        attributes: [
          "canceledBy",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: {
          ...whereConditions,
          status: "cancelled",
        },
        group: ["canceledBy"],
        raw: true,
      });

      // Most active users (by booking count)
      const topUsers = await db.Booking.findAll({
        attributes: [
          "clientId",
          [
            db.sequelize.fn("COUNT", db.sequelize.col("Booking.id")),
            "bookingCount",
          ],
          [db.sequelize.fn("SUM", db.sequelize.col("price")), "totalSpent"],
        ],
        include: [
          {
            model: db.User,
            as: "client",
            attributes: ["name", "email"],
          },
        ],
        where: whereConditions,
        group: ["clientId", "client.id"],
        order: [
          [db.sequelize.fn("COUNT", db.sequelize.col("Booking.id")), "DESC"],
        ],
        limit: 10,
      });

      res.json({
        type: "success",
        data: {
          bookingsByStatus,
          bookingsByDay,
          durationAnalysis: durationAnalysis[0] || {},
          cancellationStats,
          topUsers,
        },
      });
    } catch (error) {
      console.error("Error getting booking analytics:", error);
      next(error);
    }
  },

  // User analytics

  getUserAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      const { startDate, endDate } = req.query;

      const whereConditions: any = { type: "user" };
      if (startDate && endDate) {
        whereConditions.createdAt = {
          [Op.between]: [
            new Date(startDate as string),
            new Date(endDate as string),
          ],
        };
      }

      // User registration trends
      const registrationTrends = await db.User.findAll({
        attributes: [
          [
            db.sequelize.fn("DATE_TRUNC", "day", db.sequelize.col("createdAt")),
            "date",
          ],
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "registrations"],
        ],
        where: whereConditions,
        group: [
          db.sequelize.fn("DATE_TRUNC", "day", db.sequelize.col("createdAt")),
        ],
        order: [
          [
            db.sequelize.fn("DATE_TRUNC", "day", db.sequelize.col("createdAt")),
            "ASC",
          ],
        ],
        raw: true,
      });

      // User activity levels - using subqueries to avoid JOIN issues
      const userActivity = await db.User.findAll({
        attributes: [
          "id",
          "name",
          "email",
          "createdAt",
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Bookings" 
            WHERE "Bookings"."clientId" = "User"."id"
          )`),
            "totalBookings",
          ],
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Spots" 
            WHERE "Spots"."userId" = "User"."id"
          )`),
            "totalSpots",
          ],
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Vehicles" 
            WHERE "Vehicles"."userId" = "User"."id"
          )`),
            "totalVehicles",
          ],
        ],
        where: { type: "user" },
        order: [
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Bookings" 
            WHERE "Bookings"."clientId" = "User"."id"
          )`),
            "DESC",
          ],
        ],
        limit: 50,
        raw: true,
      });

      // User verification status
      const verificationStats = await db.User.findAll({
        attributes: [
          "isVerified",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: { type: "user" },
        group: ["isVerified"],
        raw: true,
      });

      // Users by registration method
      const registrationMethods = await db.User.findAll({
        attributes: [
          [
            db.sequelize.literal(`CASE 
            WHEN "googleId" IS NOT NULL THEN 'Google'
            WHEN "password" IS NOT NULL THEN 'Email'
            ELSE 'Other'
          END`),
            "method",
          ],
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: { type: "user" },
        group: ["method"],
        raw: true,
      });

      res.json({
        type: "success",
        data: {
          registrationTrends,
          userActivity,
          verificationStats,
          registrationMethods,
        },
      });
    } catch (error) {
      console.error("Error getting user analytics:", error);
      next(error);
    }
  },

  // Spot analytics
  getSpotAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      const { startDate, endDate } = req.query;

      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.createdAt = {
          [Op.between]: [
            new Date(startDate as string),
            new Date(endDate as string),
          ],
        };
      }

      // Spot utilization rates - using subqueries to avoid JOIN issues
      const spotUtilization = await db.Spot.findAll({
        attributes: [
          "id",
          "name",
          "address",
          "ratePerHour",
          "status",
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Bookings" 
            WHERE "Bookings"."spotId" = "Spot"."id"
            ${
              startDate && endDate
                ? `AND "Bookings"."createdAt" BETWEEN '${startDate}' AND '${endDate}'`
                : ""
            }
          )`),
            "totalBookings",
          ],
          [
            db.sequelize.literal(`(
            SELECT COALESCE(SUM("price"), 0) 
            FROM "Bookings" 
            WHERE "Bookings"."spotId" = "Spot"."id"
            ${
              startDate && endDate
                ? `AND "Bookings"."createdAt" BETWEEN '${startDate}' AND '${endDate}'`
                : ""
            }
          )`),
            "totalRevenue",
          ],
          [
            db.sequelize.literal(`(
            SELECT COALESCE(AVG("price"), 0) 
            FROM "Bookings" 
            WHERE "Bookings"."spotId" = "Spot"."id"
            ${
              startDate && endDate
                ? `AND "Bookings"."createdAt" BETWEEN '${startDate}' AND '${endDate}'`
                : ""
            }
          )`),
            "avgBookingPrice",
          ],
        ],
        include: [
          {
            model: db.User,
            as: "user", // Changed from "host" to "user" to match the relation
            attributes: ["name", "email"],
          },
        ],
        order: [
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Bookings" 
            WHERE "Bookings"."spotId" = "Spot"."id"
            ${
              startDate && endDate
                ? `AND "Bookings"."createdAt" BETWEEN '${startDate}' AND '${endDate}'`
                : ""
            }
          )`),
            "DESC",
          ],
        ],
        limit: 20,
      });

      // Spots by status
      const spotsByStatus = await db.Spot.findAll({
        attributes: [
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        group: ["status"],
        raw: true,
      });

      // Average rates by vehicle type
      const ratesByVehicleType = await db.Spot.findAll({
        attributes: [
          "allowedVehicleType",
          [db.sequelize.fn("AVG", db.sequelize.col("ratePerHour")), "avgRate"],
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "spotCount"],
        ],
        group: ["allowedVehicleType"],
        raw: true,
      });

      // Geographic distribution (top areas) - using SUBSTRING instead of LEFT for better compatibility
      const geographicDistribution = await db.Spot.findAll({
        attributes: [
          [
            db.sequelize.fn("SUBSTRING", db.sequelize.col("address"), 1, 50),
            "area",
          ],
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "spotCount"],
          [db.sequelize.fn("AVG", db.sequelize.col("ratePerHour")), "avgRate"],
        ],
        group: [
          db.sequelize.fn("SUBSTRING", db.sequelize.col("address"), 1, 50),
        ],
        order: [[db.sequelize.fn("COUNT", db.sequelize.col("id")), "DESC"]],
        limit: 10,
        raw: true,
      });

      res.json({
        type: "success",
        data: {
          spotUtilization,
          spotsByStatus,
          ratesByVehicleType,
          geographicDistribution,
        },
      });
    } catch (error) {
      console.error("Error getting spot analytics:", error);
      next(error);
    }
  },

  // Vehicle analytics

  getVehicleAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      // Vehicle distribution by type
      const vehiclesByType = await db.Vehicle.findAll({
        attributes: [
          "type",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        group: ["type"],
        raw: true,
      });

      // Vehicle distribution by make
      const vehiclesByMake = await db.Vehicle.findAll({
        attributes: [
          "make",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        group: ["make"],
        order: [[db.sequelize.fn("COUNT", db.sequelize.col("id")), "DESC"]],
        limit: 10,
        raw: true,
      });

      // Most active vehicles - using subqueries to avoid JOIN issues
      const activeVehicles = await db.Vehicle.findAll({
        attributes: [
          "id",
          "name",
          "make",
          "model",
          "type",
          "licensePlate",
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Bookings" 
            WHERE "Bookings"."vehicleId" = "Vehicle"."id"
          )`),
            "bookingCount",
          ],
          [
            db.sequelize.literal(`(
            SELECT COALESCE(SUM("price"), 0) 
            FROM "Bookings" 
            WHERE "Bookings"."vehicleId" = "Vehicle"."id"
          )`),
            "totalSpent",
          ],
        ],
        include: [
          {
            model: db.User,
            as: "user",
            attributes: ["name", "email"],
          },
        ],
        order: [
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Bookings" 
            WHERE "Bookings"."vehicleId" = "Vehicle"."id"
          )`),
            "DESC",
          ],
        ],
        limit: 20,
      });

      // Alternative vehicles per user using subquery approach
      const vehiclesPerUser = await db.User.findAll({
        attributes: [
          [
            db.sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "Vehicles" 
            WHERE "Vehicles"."userId" = "User"."id"
          )`),
            "vehicleCount",
          ],
        ],
        where: { type: "user" },
        raw: true,
      });

      // Process the vehiclesPerUser data to get distribution
      const vehicleDistribution = vehiclesPerUser
        .reduce((acc: any, user: any) => {
          const count = user.vehicleCount;
          const existing = acc.find((item: any) => item.vehicleCount === count);
          if (existing) {
            existing.userCount++;
          } else {
            acc.push({ vehicleCount: count, userCount: 1 });
          }
          return acc;
        }, [])
        .sort((a: any, b: any) => a.vehicleCount - b.vehicleCount);

      res.json({
        type: "success",
        data: {
          vehiclesByType,
          vehiclesByMake,
          activeVehicles,
          vehiclesPerUser: vehicleDistribution,
        },
      });
    } catch (error) {
      console.error("Error getting vehicle analytics:", error);
      next(error);
    }
  },

  // Transaction analytics
  getTransactionAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.user?.type !== "admin") {
        throw new CustomError(403, "Admin access required");
      }

      const { startDate, endDate } = req.query;

      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.createdAt = {
          [Op.between]: [
            new Date(startDate as string),
            new Date(endDate as string),
          ],
        };
      }

      // Payment status distribution
      const paymentsByStatus = await db.Payment.findAll({
        attributes: [
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
          [db.sequelize.fn("SUM", db.sequelize.col("amount")), "totalAmount"],
        ],
        where: whereConditions,
        group: ["status"],
        raw: true,
      });

      // Failed payment analysis
      const failedPayments = await db.Payment.findAll({
        attributes: [
          "errorMessage",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: {
          ...whereConditions,
          status: "failed",
          errorMessage: { [Op.ne]: null },
        },
        group: ["errorMessage"],
        order: [[db.sequelize.fn("COUNT", db.sequelize.col("id")), "DESC"]],
        limit: 10,
        raw: true,
      });

      // Refund analysis
      //   const refundStats = await db.Refund.findAll({
      //     attributes: [
      //       "status",
      //       "reason",
      //       [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
      //       [db.sequelize.fn("SUM", db.sequelize.col("amount")), "totalAmount"],
      //     ],
      //     where: whereConditions,
      //     group: ["status", "reason"],
      //     raw: true,
      //   });

      // Transaction volume by currency
      const transactionsByCurrency = await db.Payment.findAll({
        attributes: [
          "currency",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
          [db.sequelize.fn("SUM", db.sequelize.col("amount")), "totalAmount"],
        ],
        where: whereConditions,
        group: ["currency"],
        raw: true,
      });

      res.json({
        type: "success",
        data: {
          paymentsByStatus,
          failedPayments,
          transactionsByCurrency,
        },
      });
    } catch (error) {
      console.error("Error getting transaction analytics:", error);
      next(error);
    }
  },

  // Time change request analytics
  getTimeChangeAnalytics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
    //   if (req.user?.type !== "admin") {
    //     throw new CustomError(403, "Admin access required");
    //   }

      const { startDate, endDate } = req.query;

      const whereConditions: any = {};
      if (startDate && endDate) {
        whereConditions.createdAt = {
          [Op.between]: [
            new Date(startDate as string),
            new Date(endDate as string),
          ],
        };
      }

      // Time change requests by status
      const changeRequestsByStatus = await db.TimeChange.findAll({
        attributes: [
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: whereConditions,
        group: ["status"],
        raw: true,
      });

      // Most common day changes
      const dayChanges = await db.TimeChange.findAll({
        attributes: [
          "oldDay",
          "newDay",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: whereConditions,
        group: ["oldDay", "newDay"],
        order: [[db.sequelize.fn("COUNT", db.sequelize.col("id")), "DESC"]],
        limit: 10,
        raw: true,
      });

      // Users with most change requests
      const topChangeRequesters = await db.TimeChange.findAll({
        attributes: [
          "clientId",
          [
            db.sequelize.fn("COUNT", db.sequelize.col("TimeChange.id")),
            "requestCount",
          ],
        ],
        include: [
          {
            model: db.User,
            as: "client",
            attributes: ["name", "email"],
          },
        ],
        where: whereConditions,
        group: ["clientId", "client.id"],
        order: [
          [db.sequelize.fn("COUNT", db.sequelize.col("TimeChange.id")), "DESC"],
        ],
        limit: 10,
      });

      res.json({
        type: "success",
        data: {
          changeRequestsByStatus,
          dayChanges,
          topChangeRequesters,
        },
      });
    } catch (error) {
      console.error("Error getting time change analytics:", error);
      next(error);
    }
  },
};
