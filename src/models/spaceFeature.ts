import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { SpaceFeature } from "../constants";

export const initSpaceFeatureModel = (
  sequelize: Sequelize
): typeof SpaceFeature => {
  SpaceFeature.init(
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
      modelName: "SpaceFeature",
      tableName: "SpaceFeatures",
    }
  );

  SpaceFeature.beforeValidate((spaceFeature: SpaceFeature) => {
    if (!spaceFeature.id) {
      spaceFeature.id = uuidv4();
    }
  });

  return SpaceFeature;
};
