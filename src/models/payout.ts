import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Payout } from "../constants";

export const initPayoutModel = (sequelize: Sequelize): typeof Payout => {
  Payout.init(
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
      stripeAccountId: {
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
      netAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: "usd",
      },
      payoutDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      transferId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
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
      modelName: "Payout",
      tableName: "Payouts",
    }
  );

  Payout.beforeValidate((payout: Payout) => {
    if (!payout.id) {
      payout.id = uuidv4();
    }
  });

  return Payout;
};
