import { Sequelize } from "sequelize";
import {
  Availability,
  Booking,
  OTP,
  Venue,
  Space,
  Media,
  Tag,
  User,
  TimeChange,
  Payment,
  BookingLog,
  StripeAccount,
  Payout,
} from "../constants";
import { initUserModel } from "./user";
import { initOTPModel } from "./otp";
import { initVenueModel } from "./venue";
import { initSpaceModel } from "./space";
import { initMediaModel } from "./media";
import { initTagModel } from "./tag";
import { initAvailabilityModel } from "./availability";
import { initBookingModel } from "./booking";
import { initTimeChangeModel } from "./timechange";
import { initPaymentModel } from "./payment";
import { initBookingLogModel } from "./bookingLog";
import { initStripeAccountModel } from "./stripeAccount";
import { initPayoutModel } from "./payout";

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
  Venue: typeof Venue;
  Space: typeof Space;
  Media: typeof Media;
  Tag: typeof Tag;
  Availability: typeof Availability;
  Booking: typeof Booking;
  TimeChange: typeof TimeChange;
  Payment: typeof Payment;
  BookingLog: typeof BookingLog;
  StripeAccount: typeof StripeAccount;
  Payout: typeof Payout;
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
db.Venue = initVenueModel(sequelize);
db.Space = initSpaceModel(sequelize);
db.Media = initMediaModel(sequelize);
db.Tag = initTagModel(sequelize);
db.Availability = initAvailabilityModel(sequelize);
db.Booking = initBookingModel(sequelize);
db.TimeChange = initTimeChangeModel(sequelize);
db.Payment = initPaymentModel(sequelize);
db.BookingLog = initBookingLogModel(sequelize);
db.StripeAccount = initStripeAccountModel(sequelize);
db.Payout = initPayoutModel(sequelize);

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

db.User.hasMany(db.Venue, {
  foreignKey: "userId",
  as: "venues",
  onDelete: "CASCADE",
});

db.Venue.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.User.hasMany(db.Space, {
  foreignKey: "userId",
  as: "spaces",
  onDelete: "CASCADE",
});

db.Space.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

db.Venue.hasMany(db.Space, {
  foreignKey: "venueId",
  as: "spaces",
  onDelete: "CASCADE",
});
db.Space.belongsTo(db.Venue, {
  foreignKey: "venueId",
  as: "venue",
});

User.hasMany(db.Tag, {
  foreignKey: "userId",
  as: "tags",
  onDelete: "CASCADE",
});
db.Tag.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});


db.Space.hasMany(db.Tag, {
  foreignKey: "spaceId",
  as: "tags",
  onDelete: "CASCADE",
});
db.Tag.belongsTo(db.Space, {
  foreignKey: "spaceId",
  as: "space",
});

db.Space.hasMany(db.Media, {
  foreignKey: "spaceId",
  as: "media",
  onDelete: "CASCADE",
});
db.Media.belongsTo(db.Space, {
  foreignKey: "spaceId",
  as: "space",
});


/* one space has many availability and availability belongs to one space */
db.Space.hasMany(db.Availability, {
  foreignKey: "spaceId",
  as: "availabilities",
  onDelete: "CASCADE",
});

db.Availability.belongsTo(db.Space, {
  foreignKey: "spaceId",
  as: "space",
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

/* one space has many bookings and booking belongs to one space */
db.Space.hasMany(db.Booking, {
  foreignKey: "spaceId",
  as: "bookings",
});

db.Booking.belongsTo(db.Space, {
  foreignKey: "spaceId",
  as: "space",
});

/* one venue has many bookings and booking belongs to one venue */
db.Venue.hasMany(db.Booking, {
  foreignKey: "venueId",
  as: "bookings",
});

db.Booking.belongsTo(db.Venue, {
  foreignKey: "venueId",
  as: "venue",
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

db.Space.hasMany(db.TimeChange, {
  foreignKey: "spaceId",
  as: "spaceTimeChanges",
  onDelete: "CASCADE",
});

db.TimeChange.belongsTo(db.Space, {
  foreignKey: "spaceId",
  as: "space",
});

db.User.hasMany(db.TimeChange, {
  foreignKey: "clientId",
  as: "clientTimeChanges",
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

db.Space.hasMany(db.Payment, {
  foreignKey: "spaceId",
  as: "spacePayments",
});
db.Payment.belongsTo(db.Space, {
  foreignKey: "spaceId",
  as: "space",
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
