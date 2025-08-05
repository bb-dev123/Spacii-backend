import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Space } from "../constants";

export const initSpaceModel = (sequelize: Sequelize): typeof Space => {
  Space.init(
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
      venueId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      images: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
      videos: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
      roomNumber: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      tag: {
        type: DataTypes.ENUM("vibe", "occassion", "architect"),
        allowNull: false,
      },
      ratePerHour: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.0,
      },
      minHours: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      discountHours: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("draft", "published"),
        defaultValue: "draft",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      modelName: "Space",
      tableName: "Spaces",
    }
  );

  Space.beforeValidate((Space: Space) => {
    if (!Space.id) {
      Space.id = uuidv4();
    }
  });

  return Space;
};
