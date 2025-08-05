import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Payment } from "../constants";

export const initPaymentModel = (sequelize: Sequelize): typeof Payment => {
  Payment.init(
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
        unique: true,
      },
      venueId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      spaceId: {
        type: DataTypes.UUID,
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
      grossAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      stripeFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      platformFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      taxFee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: "usd",
      },
      stripePaymentIntentId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stripeClientSecret: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      errorMessage: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "succeeded",
          "failed",
          "cancelled",
          "refunded"
        ),
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
      modelName: "Payment",
      tableName: "Payments",
    }
  );

  Payment.beforeValidate((payment: Payment) => {
    if (!payment.id) {
      payment.id = uuidv4();
    }
  });

  return Payment;
};
