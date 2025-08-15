import { Request, Response, NextFunction } from "express";
import db from "../models";
import { CustomError } from "../middlewares/error";
import {
  InferCreationAttributes,
  QueryTypes,
  Transaction,
  WhereOptions,
} from "sequelize";
import {
  AuthenticatedRequest,
  PaginationParams,
  QueryVenues,
  Venue,
} from "../constants";
import { Op } from "sequelize";
import { getTimezoneFromLocation } from "../helpers/timeZone";
import { getLocationFromAddress } from "../helpers/locationsHelpers";

const createVenue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    name,
    totalSpaces,
    status = "draft",
    type,
    address,
    lat,
    lng,
  } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!lat || !lng) {
      throw new CustomError(400, "location missing");
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new CustomError(
        400,
        "invalid coordinates. Longitude must be between -180 and 180, latitude between -90 and 90"
      );
    }

    let timeZone: string;
    try {
      timeZone = await getTimezoneFromLocation(latitude, longitude);
    } catch (error) {
      console.error("Failed to get timezone:", error);
      timeZone = "UTC";
    }

    let location = null;
    if (lat && lng) {
      location = {
        type: "Point",
        coordinates: [lng, lat], // Note: longitude first, then latitude
      };
    }
    const newVenue = (await db.Venue.create(
      {
        userId: req.user.id,
        name,
        address,
        status,
        totalSpaces,
        type,
        location,
        timeZone,
      },
      { transaction }
    )) as InferCreationAttributes<Venue>;

    await transaction.commit(); // Commit transaction

    res.send({
      type: "success",
      message: "venue created",
      data: newVenue,
    });
  } catch (err) {
    if (transaction) await transaction.rollback(); // Rollback transaction on error
    next(err); // Pass the error to the global error handler
  }
};

const getVenue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { venueId } = req.params;
    const venue = await db.Venue.findByPk(venueId, {
      attributes: { exclude: ["createdAt", "updatedAt"] },
    });

    if (!venue) {
      throw new CustomError(404, "venue not found!");
    } else {
      res.send({
        type: "success",
        data: venue,
      });
    }
  } catch (err) {
    next(err);
  }
};

const getUserVenues = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    name,
    type,
    address,
    status,
    page = "1",
    limit = "5",
  } = req.query as QueryVenues;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Venue> = { userId: req.user.id };

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
    if (type) {
      const typeKeywords = type.replace(/\s+/g, "").toLowerCase();
      const typeWords = type.split(/\s+/).map((word) => `%${word}%`);
      whereClause.type = {
        [Op.or]: [
          { [Op.iLike]: `%${typeKeywords}%` },
          ...typeWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (address) {
      const addressKeywords = address.replace(/\s+/g, "").toLowerCase();
      const addressWords = address.split(/\s+/).map((word) => `%${word}%`);
      whereClause.address = {
        [Op.or]: [
          { [Op.iLike]: `%${addressKeywords}%` },
          ...addressWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (status) {
      if (status !== "draft" && status !== "published") {
        throw new CustomError(404, "invalid status");
      }
      whereClause.status = status;
    }

    const count = await db.Venue.count({ where: whereClause });
    const venues = await db.Venue.findAll({
      where: whereClause,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      limit: limitNum,
      offset: offset,
      order: [["id", "ASC"]],
    });

    if (!venues) {
      throw new CustomError(400, "venues not found");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    if (!venues) {
      throw new CustomError(404, "venues not found!");
    } else {
      res.send({
        type: "success",
        data: venues,
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

const queryVenues = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    name,
    type,
    address,
    page = "1",
    limit = "5",
  } = req.query as QueryVenues;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Venue> = {};

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
    if (type) {
      const typeKeywords = type.replace(/\s+/g, "").toLowerCase();
      const typeWords = type.split(/\s+/).map((word) => `%${word}%`);
      whereClause.type = {
        [Op.or]: [
          { [Op.iLike]: `%${typeKeywords}%` },
          ...typeWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (address) {
      const addressKeywords = address.replace(/\s+/g, "").toLowerCase();
      const addressWords = address.split(/\s+/).map((word) => `%${word}%`);
      whereClause.address = {
        [Op.or]: [
          { [Op.iLike]: `%${addressKeywords}%` },
          ...addressWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }

    const count = await db.Venue.count({ where: whereClause });
    const venues = await db.Venue.findAll({
      where: whereClause,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      limit: limitNum,
      offset: offset,
      order: [["id", "ASC"]],
    });

    if (!venues) {
      throw new CustomError(400, "venues not found");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    if (!venues) {
      throw new CustomError(404, "venues not found!");
    } else {
      res.send({
        type: "success",
        data: venues,
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

interface MapBounds {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
}

const mapViewVenues = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const boundsParam = req.query.bounds as string;
    const bounds: MapBounds = JSON.parse(boundsParam);

    const zoom = parseInt(req.query.zoom as string, 10);
    const name = req.query.name as string | undefined;
    const address = req.query.address as string | undefined;

    if (!bounds || !bounds.northEast || !bounds.southWest) {
      throw new CustomError(400, "map bounds are required");
    }

    const { northEast, southWest } = bounds;
    const zoomLevel = zoom || 10;

    const shouldCluster = zoomLevel < 12;

    const getGridSize = (zoom: number): number => {
      if (zoom <= 3) return 5.0; // Very large clusters for world view
      if (zoom <= 5) return 2.0; // Large clusters for continent view
      if (zoom <= 7) return 1.0; // Medium clusters for country view
      if (zoom <= 9) return 0.5; // Smaller clusters for region view
      if (zoom <= 11) return 0.1; // Small clusters for city view
      return 0.01; // Finest clusters before individual markers
    };

    let whereClause: WhereOptions<Venue> = {};

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

    if (address) {
      const addressKeywords = address.replace(/\s+/g, "").toLowerCase();
      const addressWords = address.split(/\s+/).map((word) => `%${word}%`);
      whereClause.address = {
        [Op.or]: [
          { [Op.iLike]: `%${addressKeywords}%` },
          ...addressWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }

    const boundingBoxCondition = db.sequelize.literal(
      `ST_Contains(
        ST_MakeEnvelope(${southWest.lng}, ${southWest.lat}, ${northEast.lng}, ${northEast.lat}, 4326),
        ST_SetSRID("Venue"."location", 4326)
      )`
    );

    whereClause = {
      ...whereClause,
      location: {
        [Op.ne]: null, // Only include venues with location data
      },
      [Op.and]: db.sequelize.where(boundingBoxCondition, true),
    } as WhereOptions<Venue>;

    let venues: any[];

    if (shouldCluster) {
      const gridSize = getGridSize(zoomLevel);

      const clusterQuery = `
        SELECT 
          COUNT("Venue"."id") as "count",
          AVG(ST_X(ST_SetSRID("Venue"."location", 4326))) as "clusterLng",
          AVG(ST_Y(ST_SetSRID("Venue"."location", 4326))) as "clusterLat",
          FLOOR(ST_X(ST_SetSRID("Venue"."location", 4326)) / ${gridSize}) * ${gridSize} as "gridLng",
          FLOOR(ST_Y(ST_SetSRID("Venue"."location", 4326)) / ${gridSize}) * ${gridSize} as "gridLat",
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', "Venue"."id",
              'name', "Venue"."name",
              'address', "Venue"."address",
              'longitude', ST_X(ST_SetSRID("Venue"."location", 4326)),
              'latitude', ST_Y(ST_SetSRID("Venue"."location", 4326))
            )
          ) as "venues"
        FROM "Venues" AS "Venue"
        WHERE "Venue"."location" IS NOT NULL
          AND ST_Contains(
            ST_MakeEnvelope(${southWest.lng}, ${southWest.lat}, ${
        northEast.lng
      }, ${northEast.lat}, 4326),
            ST_SetSRID("Venue"."location", 4326)
          )
          ${
            name
              ? `AND ("Venue"."name" ILIKE '%${name.replace(/'/g, "''")}%')`
              : ""
          }
          ${
            address
              ? `AND ("Venue"."address" ILIKE '%${address.replace(
                  /'/g,
                  "''"
                )}%')`
              : ""
          }
        GROUP BY 
          FLOOR(ST_X(ST_SetSRID("Venue"."location", 4326)) / ${gridSize}) * ${gridSize},
          FLOOR(ST_Y(ST_SetSRID("Venue"."location", 4326)) / ${gridSize}) * ${gridSize}
        HAVING COUNT("Venue"."id") >= 1
        ORDER BY "count" DESC
        LIMIT 1000
      `;

      venues = await db.sequelize.query(clusterQuery, {
        type: QueryTypes.SELECT,
      });
    } else {
      // Non-clustered query for individual markers at high zoom levels
      let nonClusteredQuery = `
        SELECT 
          "Venue"."id",
          "Venue"."name",
          "Venue"."address",
          "Venue"."type",
          "Venue"."status",
          ST_X(ST_SetSRID("Venue"."location", 4326)) as "longitude",
          ST_Y(ST_SetSRID("Venue"."location", 4326)) as "latitude"
        FROM "Venues" AS "Venue"
        WHERE "Venue"."location" IS NOT NULL
          AND ST_Contains(
            ST_MakeEnvelope(${southWest.lng}, ${southWest.lat}, ${
        northEast.lng
      }, ${northEast.lat}, 4326),
            ST_SetSRID("Venue"."location", 4326)
          )
          ${
            name
              ? `AND ("Venue"."name" ILIKE '%${name.replace(/'/g, "''")}%')`
              : ""
          }
          ${
            address
              ? `AND ("Venue"."address" ILIKE '%${address.replace(
                  /'/g,
                  "''"
                )}%')`
              : ""
          }
        ORDER BY "Venue"."createdAt" DESC
        LIMIT 1000
      `;

      venues = await db.sequelize.query(nonClusteredQuery, {
        type: QueryTypes.SELECT,
      });
    }

    res.send({
      type: "success",
      data: venues,
      meta: {
        zoom: zoomLevel,
        clustered: shouldCluster,
        bounds,
        count: venues.length,
        gridSize: shouldCluster ? getGridSize(zoomLevel) : null,
      },
    });
  } catch (err) {
    console.error("Error in mapViewVenues:", err);
    next(err);
  }
};

const updateVenue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id, name, totalSpaces, status, type, address, lat, lng } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "venue id is missing");
    }

    const venue = await db.Venue.findOne({
      where: { id: id },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      transaction,
    });

    if (!venue) {
      throw new CustomError(404, "venue not found");
    }

    if (venue.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized");
    }
    if (
      lat &&
      lng &&
      (lat !== venue.location.coordinates[1] ||
        lng !== venue.location.coordinates[0])
    ) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);

      if (
        typeof longitude !== "number" ||
        typeof latitude !== "number" ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw new CustomError(
          400,
          "invalid coordinates. Longitude must be between -180 and 180, latitude between -90 and 90"
        );
      }
      venue.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
      let timeZone: string;
      try {
        timeZone = await getTimezoneFromLocation(latitude, longitude);
        venue.timeZone = timeZone;
      } catch (error) {
        console.error("Failed to get timezone:", error);
        timeZone = "UTC";
      }
      const spaces = await db.Space.findAll({
        where: { venueId: venue.id },
        transaction,
      });
      spaces.forEach(async (space) => {
        space.timeZone = timeZone;
        await space.save({ transaction });
      });
    }

    await venue.update(
      {
        name: name ?? venue.name,
        totalSpaces: totalSpaces ?? venue.totalSpaces,
        type: type ?? venue.type,
        status: status ?? venue.status,
        address: address ?? venue.address,
        location: location ?? venue.location,
      },
      { transaction }
    );

    await transaction.commit();

    res.send({
      type: "success",
      message: "venue updated",
      data: venue,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    next(err);
  }
};

const deleteVenue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "venue id is missing");
    }

    const venue = await db.Venue.findOne({
      where: { id: id },
      transaction,
    });

    if (!venue) {
      throw new CustomError(404, "venue not Found!");
    }

    if (venue.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    await venue.destroy({ transaction });
    await transaction.commit();

    res.send({
      type: "success",
      message: "venue deleted",
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    next(err);
  }
};

export default {
  createVenue,
  getVenue,
  getUserVenues,
  queryVenues,
  mapViewVenues,
  updateVenue,
  deleteVenue,
};
