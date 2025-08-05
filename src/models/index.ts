import { Sequelize } from "sequelize";
import { initUserModel } from "./user";
import {
  Availability,
  Booking,
  OTP,
  Spot,
  User,
  Vehicle,
  TimeChange,
  Payment,
  Log,
  BookingLog,
  StripeAccount,
  Payout,
  Notification
} from "../constants";
import { initOTPModel } from "./otp";
import { initVehicleModel } from "./vehicle";
import { initSpotModel } from "./space";
import { initAvailabilityModel } from "./availability";
import { initBookingModel } from "./booking";
import { initTimeChangeModel } from "./timechange";
import { initPaymentModel } from "./payment";
import { initLogModel } from "./log";
import { initBookingLogModel } from "./bookingLog";
import { initStripeAccountModel } from "./stripeAccount";
import { initPayoutModel } from "./payout";
import { initNotificationModel } from "./notification";

import dotenv from "dotenv";
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: envFile });

interface DB {
  [key: string]: any;
  sequelize: Sequelize;
  Sequelize: typeof Sequelize;
  User: typeof User;
  OTP: typeof OTP;
  Vehicle: typeof Vehicle;
  Spot: typeof Spot;
  Availability: typeof Availability;
  Booking: typeof Booking;
  TimeChange: typeof TimeChange;
  Payment: typeof Payment;
  Log: typeof Log;
  BookingLog: typeof BookingLog;
  StripeAccount: typeof StripeAccount;
  Payout: typeof Payout;
  Notification: typeof Notification;
}

const db: DB = {} as DB;

const sequelize = new Sequelize(
  process.env.DB_DATABASE ?? "spotie",
  process.env.DB_USERNAME ?? "postgres",
  process.env.DB_PASSWORD ?? "User1234",
  {
    host: process.env.DB_HOST ?? "127.0.0.1",
    dialect: (process.env.DB_DIALECT ?? "postgres") as any,
  }
);

// Initialize models
db.User = initUserModel(sequelize);
db.OTP = initOTPModel(sequelize);
db.Vehicle = initVehicleModel(sequelize);
db.Spot = initSpotModel(sequelize);
db.Availability = initAvailabilityModel(sequelize);
db.Booking = initBookingModel(sequelize);
db.TimeChange = initTimeChangeModel(sequelize);
db.Payment = initPaymentModel(sequelize);
db.Log = initLogModel(sequelize);
db.BookingLog = initBookingLogModel(sequelize);
db.StripeAccount = initStripeAccountModel(sequelize);
db.Payout = initPayoutModel(sequelize);
db.Notification = initNotificationModel(sequelize);

// Initialize model associations if they exist
Object.keys(db).forEach((modelName) => {
  if (db[modelName]?.associate) {
    db[modelName].associate(db);
  }
});

// Sync database
sequelize
  .sync() // Set to true for development to drop and recreate tables
  .then(() => {
    console.log("Database & tables created!");
  })
  .catch((error: any) => {
    console.error("Error creating database & tables:", error);
  });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

db.User.hasMany(db.Log, {
  foreignKey: "userId",
  as: "logs",
  onDelete: "CASCADE",
});

db.Log.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.User.hasMany(db.Notification, {
  foreignKey: "userId",
  as: "notifications",
  onDelete: "CASCADE",
});

db.Notification.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.Spot.hasMany(db.Notification, {
  foreignKey: "spotId",
  as: "notifications",
  onDelete: "CASCADE",
});

db.Notification.belongsTo(db.Spot, {
  foreignKey: "spotId",
  as: "spot",
});

db.Booking.hasMany(db.Notification, {
  foreignKey: "bookingId",
  as: "notifications",
  onDelete: "CASCADE",
});

db.Notification.belongsTo(db.Booking, {
  foreignKey: "bookingId",
  as: "booking",
});

db.Vehicle.hasMany(db.Notification, {
  foreignKey: "vehicleId",
  as: "notifications",
  onDelete: "CASCADE",
});

db.Notification.belongsTo(db.Vehicle, {
  foreignKey: "vehicleId",
  as: "vehicle",
});

db.User.hasMany(db.Spot, {
  foreignKey: "userId",
  as: "spots",
  onDelete: "CASCADE",
});

db.Spot.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

/* one spot has many availability and availability belongs to one spot */
db.Spot.hasMany(db.Availability, {
  foreignKey: "spotId",
  as: "availabilities",
  onDelete: "CASCADE",
});

db.Availability.belongsTo(db.Spot, {
  foreignKey: "spotId",
  as: "spot",
});

/* one user has many vehicles and vehicle belongs to one user */
db.User.hasMany(db.Vehicle, {
  foreignKey: "userId",
  as: "vehicles",
  onDelete: "CASCADE",
});

db.Vehicle.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

//bookings
/* one user has many bookings and booking belongs to one user */
db.User.hasMany(db.Booking, {
  foreignKey: "clientId",
  as: "clientBookings",
});

db.Booking.belongsTo(db.User, {
  foreignKey: "clientId",
  as: "client",
});

/* one user has many bookings and booking belongs to one user */
db.User.hasMany(db.Booking, {
  foreignKey: "hostId",
  as: "bookings",
});

db.Booking.belongsTo(db.User, {
  foreignKey: "hostId",
  as: "host",
});

/* one spot has many bookings and booking belongs to one spot */
db.Spot.hasMany(db.Booking, {
  foreignKey: "spotId",
  as: "bookings",
});

db.Booking.belongsTo(db.Spot, {
  foreignKey: "spotId",
  as: "spot",
});

/* one vehicle has many bookings and booking belongs to one vehicle */
db.Vehicle.hasMany(db.Booking, {
  foreignKey: "vehicleId",
  as: "bookings",
});

db.Booking.belongsTo(db.Vehicle, {
  foreignKey: "vehicleId",
  as: "vehicle",
});

db.Booking.hasOne(db.BookingLog, {
  foreignKey: "bookingId",
  as: "log",
});
db.BookingLog.belongsTo(db.Booking, {
  foreignKey: "bookingId",
  as: "booking",
});

db.Booking.hasOne(db.TimeChange, {
  foreignKey: "bookingId",
  as: "bookingTimeChange",
});
db.TimeChange.belongsTo(db.Booking, {
  foreignKey: "bookingId",
  as: "booking",
});

db.Spot.hasMany(db.TimeChange, {
  foreignKey: "spotId",
  as: "spotTimeChanges",
  onDelete: "CASCADE",
});

db.TimeChange.belongsTo(db.Spot, {
  foreignKey: "spotId",
  as: "spot",
});

db.User.hasMany(db.TimeChange, {
  foreignKey: "clientId",
  as: "clientTimeChnages",
});

db.TimeChange.belongsTo(db.User, {
  foreignKey: "clientId",
  as: "client",
});

/* one user has many bookings and booking belongs to one user */
db.User.hasMany(db.TimeChange, {
  foreignKey: "hostId",
  as: "hostTimeChanges",
});

db.TimeChange.belongsTo(db.User, {
  foreignKey: "hostId",
  as: "host",
});

// payment relations
db.User.hasMany(db.Payment, {
  foreignKey: "userId",
  as: "userPayments",
});
db.Payment.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.User.hasMany(db.Payment, {
  foreignKey: "hostId",
  as: "hostPayments",
});
db.Payment.belongsTo(db.User, {
  foreignKey: "hostId",
  as: "host",
});

db.Booking.hasOne(db.Payment, {
  foreignKey: "bookingId",
  as: "payment",
});
db.Payment.belongsTo(db.Booking, {
  foreignKey: "bookingId",
  as: "booking",
});

db.Spot.hasMany(db.Payment, {
  foreignKey: "spotId",
  as: "spotPayments",
});
db.Payment.belongsTo(db.Spot, {
  foreignKey: "spotId",
  as: "spot",
});


db.User.hasOne(db.StripeAccount, {
  foreignKey: "userId",
  as: "stripeAccount",
  onDelete: "CASCADE",
});

db.StripeAccount.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.User.hasMany(db.Payout, {
  foreignKey: "userId",
  as: "payouts",
  onDelete: "CASCADE",
});

db.Payout.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.StripeAccount.hasMany(db.Payout, {
  foreignKey: "stripeAccountId",
  as: "payouts",
});

db.Payout.belongsTo(db.StripeAccount, {
  foreignKey: "stripeAccountId",
  as: "stripeAccount",
});

export default db;
