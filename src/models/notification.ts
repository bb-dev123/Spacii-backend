import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Notification } from "../constants";

// Define Notification model class with proper typing

export const initNotificationModel = (
  sequelize: Sequelize
): typeof Notification => {
  Notification.init(
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
      spotId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      bookingId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      vehicleId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      body: {
        type: DataTypes.STRING,
        defaultValue: true,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      data: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      readDate: {
        type: DataTypes.DATE,
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
      modelName: "Notification",
      tableName: "Notifications",
    }
  );

  // Properly typed beforeValidate hook
  Notification.beforeValidate((Notification: Notification) => {
    if (!Notification.id) {
      Notification.id = uuidv4();
    }
  });

  return Notification;
};
