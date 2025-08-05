import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Booking } from "../constants";


export const initBookingModel = (sequelize: Sequelize): typeof Booking => {
  Booking.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      hostId: {
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
      day: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startDate: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      endTime: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      grossAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.0,
      },
      status: {
        type: DataTypes.ENUM(
          "payment-pending",
          "request-pending",
          "rejected",
          "accepted",
          "completed",
          "cancelled"
        ),
        defaultValue: "payment-pending",
      },
      type: {
        type: DataTypes.ENUM("normal", "custom"),
        defaultValue: "normal",
      },
      canceledBy: {
        type: DataTypes.ENUM("client", "host", "admin"),
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
      modelName: "Booking",
      tableName: "Bookings",
    }
  );

  // Properly typed beforeValidate hook
  Booking.beforeValidate((booking: Booking) => {
    if (!booking.id) {
      booking.id = uuidv4();
    }
  });

  return Booking;
};
