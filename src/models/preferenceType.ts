import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { PreferenceType } from "../constants";

export const initPreferenceTypeModel = (
  sequelize: Sequelize
): typeof PreferenceType => {
  PreferenceType.init(
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
      preferenceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      text: {
        type: DataTypes.STRING,
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
      modelName: "PreferenceType",
      tableName: "PreferenceTypes",
    }
  );

  PreferenceType.beforeValidate((preferenceType: PreferenceType) => {
    if (!preferenceType.id) {
      preferenceType.id = uuidv4();
    }
  });

  return PreferenceType;
};
