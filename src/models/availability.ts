import { DataTypes, Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Availability } from "../constants";


export const initAvailabilityModel = (sequelize: Sequelize): typeof Availability => {
  Availability.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      spaceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      day: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.STRING,
      },
      endTime: {
        type: DataTypes.STRING,
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
      modelName: "Availability",
      tableName: "Availabilitys",
    }
  );

  // Properly typed beforeValidate hook
  Availability.beforeValidate((availability: Availability) => {
    if (!availability.id) {
      availability.id = uuidv4();
    }
  });

  return Availability;
};
