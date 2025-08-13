import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Media } from "../constants";

export const initMediaModel = (sequelize: Sequelize): typeof Media => {
  Media.init(
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
      spaceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("image", "video"),
        allowNull: false,
      },
      number: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      text: {
        type: DataTypes.STRING,
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
      modelName: "Media",
      tableName: "Medias",
    }
  );

  Media.beforeValidate((media: Media) => {
    if (!media.id) {
      media.id = uuidv4();
    }
  });

  return Media;
};
