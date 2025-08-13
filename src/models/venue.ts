import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Venue } from "../constants";

export const initVenueModel = (sequelize: Sequelize): typeof Venue => {
  Venue.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      totalSpaces: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("draft", "published"),
        defaultValue: "draft",
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      location: {
        type: DataTypes.GEOMETRY("POINT"),
        allowNull: true,
      },
      timeZone: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "UTC",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "Venue",
      tableName: "Venues",
    }
  );

  Venue.beforeValidate((Venue: Venue) => {
    if (!Venue.id) {
      Venue.id = uuidv4();
    }
  });

  return Venue;
};
