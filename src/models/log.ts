import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Log } from "../constants";

// Define Log model class with proper typing

export const initLogModel = (sequelize: Sequelize): typeof Log => {
  Log.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      fcmtoken: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
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
      modelName: "Log",
      tableName: "Logs",
    }
  );

  // Properly typed beforeValidate hook
  Log.beforeValidate((log: Log) => {
    if (!log.id) {
      log.id = uuidv4();
    }
  });

  return Log;
};
