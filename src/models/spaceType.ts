import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { SpaceType } from "../constants";

export const initSpaceTypeModel = (
  sequelize: Sequelize
): typeof SpaceType => {
  SpaceType.init(
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
      modelName: "SpaceType",
      tableName: "SpaceTypes",
    }
  );

  SpaceType.beforeValidate((SpaceType: SpaceType) => {
    if (!SpaceType.id) {
      SpaceType.id = uuidv4();
    }
  });

  return SpaceType;
};
