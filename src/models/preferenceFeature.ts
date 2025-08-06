import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { PreferenceFeature } from "../constants";

export const initPreferenceFeatureModel = (
  sequelize: Sequelize
): typeof PreferenceFeature => {
  PreferenceFeature.init(
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
      modelName: "PreferenceFeature",
      tableName: "PreferenceFeatures",
    }
  );

  PreferenceFeature.beforeValidate((preferenceFeature: PreferenceFeature) => {
    if (!preferenceFeature.id) {
      preferenceFeature.id = uuidv4();
    }
  });

  return PreferenceFeature;
};
