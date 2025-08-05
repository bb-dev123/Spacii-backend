import {
  DataTypes,
  Sequelize,
} from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { OTP } from "../constants";

export const initOTPModel = (sequelize: Sequelize): typeof OTP => {
  OTP.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      otp: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      resetToken:{
        type: DataTypes.STRING,
      },
      purpose: {
        type: DataTypes.ENUM("email_verification", "password_reset"),
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
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
      modelName: "OTP",
      tableName: "OTPs",
    }
  );

  OTP.beforeValidate((otp: OTP) => {
    if (!otp.id) {
      otp.id = uuidv4();
    }
  });

  return OTP;
};
