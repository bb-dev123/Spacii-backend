import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { BookingLog } from "../constants";

// Define BookingLog model class with proper typing

export const initBookingLogModel = (
  sequelize: Sequelize
): typeof BookingLog => {
  BookingLog.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      bookingId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      userCheckin: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          checkin: false,
          dateTime: null,
          location: null,
        },
      },
      hostCheckin: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          checkin: false,
          dateTime: null,
          location: null,
        },
      },
      userCheckout: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          checkout: false,
          dateTime: null,
          location: null,
        },
      },
      hostCheckout: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          checkout: false,
          dateTime: null,
          location: null,
        },
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
      modelName: "BookingLog",
      tableName: "BookingLogs",
    }
  );

  // Properly typed beforeValidate hook
  BookingLog.beforeValidate((log: BookingLog) => {
    if (!log.id) {
      log.id = uuidv4();
    }
  });

  return BookingLog;
};
