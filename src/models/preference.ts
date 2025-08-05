import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Preference } from "../constants";

export const initPreferenceModel = (sequelize: Sequelize): typeof Preference => {
  Preference.init(
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
      tag: {
        type: DataTypes.ENUM("vibe", "occasion", "architect"),
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
      modelName: "Preference",
      tableName: "Preferences",
    }
  );

  Preference.beforeValidate((preference: Preference) => {
    if (!preference.id) {
      preference.id = uuidv4();
    }
  });

  return Preference;
};
