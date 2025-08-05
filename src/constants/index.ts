import { Request } from "express";
import {
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";

export class Log extends Model<
  InferAttributes<Log>,
  InferCreationAttributes<Log, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare fcmtoken: string;
  declare active: boolean;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<
    Notification,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare spotId: string | null;
  declare bookingId: string | null;
  declare vehicleId: string | null;
  declare title: string;
  declare body: string;
  declare type: string;
  declare data: any;
  declare isRead: boolean;
  declare readDate: Date | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: any;
  otp?: any;
  email?: string;
}

export interface PaginationParams {
  page?: string;
  limit?: string;
}

export class OTP extends Model<
  InferAttributes<OTP>,
  InferCreationAttributes<OTP, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare otp: string;
  declare resetToken: string | null;
  declare purpose: "email_verification" | "password_reset";
  declare expiresAt: Date;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class Preference extends Model<
  InferAttributes<Preference>,
  InferCreationAttributes<
    Preference,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare tag: "vibe" | "occassion" | "architect";

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class PreferenceType extends Model<
  InferAttributes<PreferenceType>,
  InferCreationAttributes<
    PreferenceType,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare preferenceId: string;
  declare userId: string;
  declare text: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class PreferenceFeature extends Model<
  InferAttributes<PreferenceType>,
  InferCreationAttributes<
    PreferenceType,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare preferenceId: string;
  declare userId: string;
  declare text: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare socialId: string | null;
  declare email: string;
  declare name: string | null;
  declare image: string | null;
  declare phone: string | null;
  declare dob: string | null;
  declare NID_PASSPORT: string | null;
  declare country: string | null;
  declare state: string | null;
  declare city: string | null;
  declare address: string | null;
  declare zipCode: string | null;
  declare password: string | null;
  declare isVerified: boolean;
  declare blocked: boolean;
  declare payoutEnabled: boolean | null;
  declare type: "user" | "admin" | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class Venue extends Model<
  InferAttributes<Venue>,
  InferCreationAttributes<Venue, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare name: string;
  declare spaces: number;
  declare status: "draft" | "published";
  declare type: string;
  declare address: string;
  declare location: string;
  declare timeZone: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class Space extends Model<
  InferAttributes<Space>,
  InferCreationAttributes<Space, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare venueId: string;
  declare name: string;
  declare images: string[] | null;
  declare videos: string[] | null;
  declare roomNumber: number | null;
  declare capacity: number | null;
  declare tag: "vibe" | "occassion" | "architect";
  declare status: "draft" | "published";
  declare description: string | null;
  declare ratePerHour: number;
  declare minHours: number | null;
  declare discountHours: number | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class SpaceType extends Model<
  InferAttributes<PreferenceType>,
  InferCreationAttributes<
    PreferenceType,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare spaceId: string;
  declare userId: string;
  declare text: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class SpaceFeatures extends Model<
  InferAttributes<PreferenceType>,
  InferCreationAttributes<
    PreferenceType,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare spaceId: string;
  declare userId: string;
  declare text: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class Availability extends Model<
  InferAttributes<Availability>,
  InferCreationAttributes<
    Availability,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare spaceId: string;
  declare day: "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  declare startTime: string;
  declare endTime: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}
export class Booking extends Model<
  InferAttributes<Booking>,
  InferCreationAttributes<Booking, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare clientId: string;
  declare hostId: string;
  declare venueId: string;
  declare spaceId: string;
  declare day: "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  declare startDate: string;
  declare startTime: string;
  declare endDate: string;
  declare endTime: string;
  declare grossAmount: number; // Original booking amount
  declare status:
    | "request-pending"
    | "payment-pending"
    | "rejected"
    | "accepted"
    | "completed"
    | "cancelled";
  declare type: "normal" | "custom";
  declare canceledBy: "client" | "host" | "admin" | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class BookingLog extends Model<
  InferAttributes<BookingLog>,
  InferCreationAttributes<
    BookingLog,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare userCheckin: any;
  declare hostCheckin: any;
  declare userCheckout: any;
  declare hostCheckout: any;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export class Payment extends Model<
  InferAttributes<Payment>,
  InferCreationAttributes<Payment>
> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare venueId: string;
  declare spaceId: string;
  declare clientId: string; // person making the payment (client)
  declare hostId: string; // person receiving the payment
  declare grossAmount: number; // Total amount before fees
  declare stripeFee: number; // Stripe payout fee
  declare platformFee: number; // platform payout fee
  declare taxFee: number; // Tax amount (host responsibility)
  declare totalAmount: number; // Final amount transferred (grossAmount + stripeFee + taxAmount + platformFee)
  declare currency: string;
  declare stripePaymentIntentId: string;
  declare stripeClientSecret: string | null;
  declare errorMessage: string | null;
  declare status: "pending" | "succeeded" | "failed" | "cancelled" | "refunded";

  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export class StripeAccount extends Model<
  InferAttributes<StripeAccount>,
  InferCreationAttributes<
    StripeAccount,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare accountId: string; // Stripe Connect account ID
  declare accountType: string; // "express" | "standard" | "custom"
  declare country: string | null; // Country code (e.g., "US", "CA")
  declare currency: string | null;
  declare businessType: string | null;
  declare payoutsEnabled: boolean;
  declare detailsSubmitted: boolean;
  declare requirementsCurrentlyDue: any | null; // JSON array of required fields
  declare requirementsPastDue: any | null; // JSON array of past due fields
  declare isActive: CreationOptional<boolean>;
  declare deactivatedAt: Date | null;

  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export class Payout extends Model<
  InferAttributes<Payout>,
  InferCreationAttributes<Payout, { omit: "id" | "createdAt" | "updatedAt" }>
> {
  declare id: CreationOptional<string>;
  declare userId: string; // host receiving the payout
  declare stripeAccountId: string; // Reference to Stripe Connect account
  declare grossAmount: number; // Total amount before fees
  declare stripeFee: number; // Stripe payout fee
  declare platformFee: number; // platform payout fee
  declare taxFee: number; // Tax amount (host responsibility)
  declare netAmount: number; // Final amount transferred (grossAmount - stripeFee - taxAmount)
  declare currency: string;
  declare status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";
  declare payoutDate: Date | null;
  declare transferId: string | null; // Stripe transfer ID
  declare errorMessage: string | null;
  declare metadata: any | null;

  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export class TimeChange extends Model<
  InferAttributes<TimeChange>,
  InferCreationAttributes<
    TimeChange,
    { omit: "id" | "createdAt" | "updatedAt" }
  >
> {
  declare id: CreationOptional<string>;
  declare bookingId: string;
  declare venueId: string;
  declare spaceId: string;
  declare hostId: string;
  declare clientId: string;
  declare oldDay: "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  declare oldStartDate: string;
  declare oldStartTime: string;
  declare oldEndDate: string;
  declare oldEndTime: string;
  declare newDay: "Sat" | "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  declare newStartDate: string;
  declare newStartTime: string;
  declare newEndDate: string;
  declare newEndTime: string;
  declare status: "pending" | "rejected" | "accepted"; // ENUM type

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export interface QuerySpace {
  name?: string;
  userId?: string;
  address?: string;
  minRate?: string;
  maxRate?: string;
  vehicleType?: string;
  status?: string;
  date?: string;
  duration?: string;
  lat?: string;
  lng?: string;
  page?: string;
  limit?: string;
}

export interface QueryVehicles {
  userId?: string;
  name?: string;
  licensePlate?: string;
  type?: string;
  page?: string;
  limit?: string;
}

export interface QueryPayment {
  hostId?: string;
  userId?: string;
  spotId?: string;
  status?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
}
