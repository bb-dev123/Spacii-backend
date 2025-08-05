import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { SpaceFeatures } from "../constants";

export const initSpaceFeaturesModel = (
  sequelize: Sequelize
): typeof SpaceFeatures => {
  SpaceFeatures.init(
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
      modelName: "SpaceFeatures",
      tableName: "SpaceFeaturess",
    }
  );

  SpaceFeatures.beforeValidate((SpaceFeatures: SpaceFeatures) => {
    if (!SpaceFeatures.id) {
      SpaceFeatures.id = uuidv4();
    }
  });

  return SpaceFeatures;
};
