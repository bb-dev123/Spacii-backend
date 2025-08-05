import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { TimeChange } from "../constants";

export const initTimeChangeModel = (
  sequelize: Sequelize
): typeof TimeChange => {
  TimeChange.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      bookingId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      venueId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      spaceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      hostId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      oldDay: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      oldStartDate: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      oldStartTime: {
        type: DataTypes.STRING,
      },
      oldEndDate: {
        type: DataTypes.STRING,
      },
      oldEndTime: {
        type: DataTypes.STRING,
      },
      newDay: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      newStartDate: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      newStartTime: {
        type: DataTypes.STRING,
      },
      newEndDate: {
        type: DataTypes.STRING,
      },
      newEndTime: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.ENUM("pending", "rejected", "accepted"),
        defaultValue: "pending",
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
      modelName: "TimeChange",
      tableName: "TimeChanges",
    }
  );

  // Properly typed beforeValidate hook
  TimeChange.beforeValidate((timechange: TimeChange) => {
    if (!timechange.id) {
      timechange.id = uuidv4();
    }
  });

  return TimeChange;
};
