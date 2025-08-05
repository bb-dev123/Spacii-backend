import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { StripeAccount } from "../constants";

export const initStripeAccountModel = (
  sequelize: Sequelize
): typeof StripeAccount => {
  StripeAccount.init(
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
      accountId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      accountType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      country: {
        type: DataTypes.STRING,
        defaultValue: "US",
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: "usd",
      },
      businessType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      payoutsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      detailsSubmitted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      requirementsCurrentlyDue: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      requirementsPastDue: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      deactivatedAt: {
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
      modelName: "StripeAccount",
      tableName: "StripeAccounts",
    }
  );

  StripeAccount.beforeValidate((stripeAccount: StripeAccount) => {
    if (!stripeAccount.id) {
      stripeAccount.id = uuidv4();
    }
  });

  return StripeAccount;
};
