import { Request, Response, NextFunction } from "express";
import db from "../models";
import { CustomError } from "../middlewares/error";
import { InferCreationAttributes, Transaction, WhereOptions } from "sequelize";
import {
  AuthenticatedRequest,
  PaginationParams,
  QueryVehicles,
  Vehicle,
} from "../constants";
import { Op } from "sequelize";

const createVehicle = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const transaction = await db.sequelize.transaction();
  try {
    const { name, make, type, model, licensePlate, color } =
      req.body as InferCreationAttributes<Vehicle>;

    if (!licensePlate) {
      throw new CustomError(400, "license plate is missing");
    }
    if (type !== "compact" && type !== "standard" && type !== "suv") {
      throw new CustomError(400, "vehicle type is invalid");
    }

    const existingVehicle = await db.Vehicle.findOne({
      where: { licensePlate },
    });

    if (existingVehicle) {
      throw new CustomError(400, "vehicle already registered");
    }

    const newVehicle = (await db.Vehicle.create(
      {
        userId: req.user.id,
        name,
        make,
        type,
        model,
        licensePlate,
        color,
      },
      { transaction }
    )) as InferCreationAttributes<Vehicle>;

    await transaction.commit(); // Commit transaction

    res.send({
      type: "success",
      message: "vehicle registered!",
      data: newVehicle,
    });
  } catch (err) {
    if (transaction) await transaction.rollback(); // Rollback transaction on error
    next(err); // Pass the error to the global error handler
  }
};

const getVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { vehicleId } = req.params;
    const vehicle = await db.Vehicle.findByPk(vehicleId, {
      attributes: { exclude: ["createdAt", "updatedAt"] },
    });

    if (!vehicle) {
      throw new CustomError(404, "vehicle not found!");
    } else {
      res.send({
        type: "success",
        data: vehicle,
      });
    }
  } catch (err) {
    next(err);
  }
};

const getUserVehicles = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    name,
    licensePlate,
    type,
    page = "1",
    limit = "5",
  } = req.query as QueryVehicles;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Vehicle> = { userId: req.user.id };

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
    if (licensePlate) {
      const licensePlateKeywords = licensePlate
        .replace(/\s+/g, "")
        .toLowerCase();
      const licensePlateWords = licensePlate
        .split(/\s+/)
        .map((word) => `%${word}%`);
      whereClause.licensePlate = {
        [Op.or]: [
          { [Op.iLike]: `%${licensePlateKeywords}%` },
          ...licensePlateWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (type) {
      if (type !== "standard" && type !== "suv" && type !== "compact") {
        throw new CustomError(404, "invalid type");
      }
      whereClause.type = type;
    }

    const count = await db.Vehicle.count({ where: whereClause });
    const vehicles = await db.Vehicle.findAll({
      where: whereClause,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      limit: limitNum,
      offset: offset,
      order: [["id", "ASC"]],
    });

    if (!vehicles) {
      throw new CustomError(400, "vehicles not found");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    if (!vehicles) {
      throw new CustomError(404, "vehicles not found!");
    } else {
      res.send({
        type: "success",
        data: vehicles,
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

const queryVehicles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    userId,
    name,
    licensePlate,
    type,
    page = "1",
    limit = "5",
  } = req.query as QueryVehicles;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Vehicle> = {};

    if (userId) {
      const user = await db.User.findByPk(userId);
      if (!user) {
        throw new CustomError(404, "user not found!");
      }
      whereClause.userId = userId;
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
    if (licensePlate) {
      const licensePlateKeywords = licensePlate
        .replace(/\s+/g, "")
        .toLowerCase();
      const licensePlateWords = licensePlate
        .split(/\s+/)
        .map((word) => `%${word}%`);
      whereClause.licensePlate = {
        [Op.or]: [
          { [Op.iLike]: `%${licensePlateKeywords}%` },
          ...licensePlateWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (type) {
      if (type !== "standard" && type !== "suv" && type !== "compact") {
        throw new CustomError(404, "invalid type");
      }
      whereClause.type = type;
    }

    const count = await db.Vehicle.count({ where: whereClause });
    const vehicles = await db.Vehicle.findAll({
      where: whereClause,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      limit: limitNum,
      offset: offset,
      order: [["id", "ASC"]],
    });

    if (!vehicles) {
      throw new CustomError(400, "vehicles not found");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    if (!vehicles) {
      throw new CustomError(404, "vehicles not found!");
    } else {
      res.send({
        type: "success",
        data: vehicles,
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

const updateVehicle = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id, name, make, type, model, licensePlate, color } =
    req.body as Vehicle;
  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "vehicleId is missing");
    }

    if (type && type !== "compact" && type !== "standard" && type !== "suv") {
      throw new CustomError(400, "vehicle type is invalid");
    }

    const vehicle = await db.Vehicle.findOne({
      where: { id: id },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      transaction,
    });

    if (!vehicle) {
      throw new CustomError(404, "vehicle not found");
    }

    if (vehicle.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized");
    }

    if (licensePlate && licensePlate !== vehicle.licensePlate) {
      const existingVehicle = await db.Vehicle.findOne({
        where: { licensePlate },
        transaction,
      });

      if (existingVehicle) {
        throw new CustomError(
          400,
          "license plate already registered to another vehicle"
        );
      }
    }

    await vehicle.update(
      {
        name: name ?? vehicle.name,
        make: make ?? vehicle.make,
        type: type ?? vehicle.type,
        model: model ?? vehicle.model,
        licensePlate: licensePlate ?? vehicle.licensePlate,
        color: color ?? vehicle.color,
      },
      { transaction }
    );

    await transaction.commit();

    res.send({
      type: "success",
      message: "vehicle updated",
      data: vehicle,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    next(err);
  }
};

const deleteVehicle = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!id) {
      throw new CustomError(400, "vehicle id is missing");
    }

    const vehicle = await db.Vehicle.findOne({
      where: { id: id },
      transaction,
    });

    if (!vehicle) {
      throw new CustomError(404, "vehicle not Found!");
    }

    if (vehicle.userId !== req.user.id) {
      throw new CustomError(403, "user unauthorized!");
    }

    await vehicle.destroy({ transaction });
    await transaction.commit();

    res.send({
      type: "success",
      message: "vehicle deleted",
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    next(err);
  }
};

export default {
  createVehicle,
  getVehicle,
  getUserVehicles,
  queryVehicles,
  updateVehicle,
  deleteVehicle,
};
