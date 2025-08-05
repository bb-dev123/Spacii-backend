import db from "../models";
import bcrypt from "bcrypt";
import { CustomError } from "../middlewares/error";
import { getToken } from "../middlewares/jwtToken";
import { Op, WhereOptions } from "sequelize";
import { generateOTP, sendEmail } from "../helpers/emailHelpers";
import cron from "node-cron";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest, Notification, User } from "../constants";
import crypto from "crypto";
import { deleteImageFromS3, uploadUserProfileToS3 } from "../helpers/s3Helper";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: envFile });

// runs every 24 hours
export const cleanupOldRecords = () => {
  cron.schedule("0 0 * * *", async () => {
    await User.destroy({
      where: {
        isVerified: false,
        createdAt: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    await Notification.destroy({
      where: {
        isRead: true,
        readDate: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
  });
};

const handleEmailError = (res: Response, email: string) => {
  console.error(`Failed to send email to ${email}`);
  return res.status(400).json({
    type: "error",
    message:
      "could not send verification email. please check your email address and try again.",
  });
};

const signup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { name, email, phone, password, fcmtoken } = req.body;
  const transaction = await db.sequelize.transaction();

  try {
    if (!email || !password) {
      throw new CustomError(400, "email and password are required");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new CustomError(400, "invalid email format");
    }

    const existingUser = await db.User.findOne({
      where: { email },
      attributes: ["id", "image", "name", "email", "phone"],
      transaction,
    });

    if (existingUser?.isVerified) {
      throw new CustomError(400, "email already exists");
    }

    let userId, userName;

    if (existingUser) {
      userId = existingUser.id;
      userName = existingUser.name;
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await db.User.create(
        {
          name: name || null,
          email,
          password: hashedPassword,
          isVerified: false,
          blocked: false,
          payoutEnabled: false,
          image: null,
          phone: phone || null,
          socialId: null,
        },
        { transaction }
      );
      userId = newUser.id;
      userName = newUser.name;
    }

    if (fcmtoken) {
      await db.Log.create(
        {
          userId,
          fcmtoken,
          active: true,
        },
        { transaction }
      );
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await db.OTP.create(
      {
        email,
        otp: otpHash,
        purpose: "email_verification",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      { transaction }
    );

    try {
      await sendEmail(
        email,
        "Email Verification",
        `Your OTP is: ${otp}. Valid for 5 minutes.`
      );
    } catch (emailError) {
      console.error(`Failed to send email to ${email}`, emailError);
      handleEmailError(res, email);
    }
    await transaction.commit();

    res.status(200).json({
      type: "success",
      message: "signup successful - verify your email to activate your account",
      data: {
        id: userId,
        name: userName,
        email,
        isVerified: false,
      },
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const verifyEmail = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const transaction = await db.sequelize.transaction();
  try {
    const { email, otp } = req.body;

    const user = await db.User.findOne({ where: { email }, transaction });
    if (!user) throw new CustomError(404, "user not found");
    if (user.isVerified) throw new CustomError(400, "email already verified");

    const otpRecord = await db.OTP.findOne({
      where: {
        email,
        purpose: "email_verification",
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction,
    });
    if (!otpRecord) throw new CustomError(400, "invalid or expired OTP");

    const validOTP = await bcrypt.compare(otp, otpRecord.otp);
    if (!validOTP) throw new CustomError(400, "invalid OTP");

    await user.update({ isVerified: true }, { transaction });
    await db.OTP.destroy({
      where: { email, purpose: "email_verification" },
      transaction,
    });

    const accessToken = getToken(user);
    await transaction.commit();

    res.send({
      type: "success",
      message: "email verified successfully",
      accessToken,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        isVerified: true,
        type: user.type,
        phone: user.phone,
      },
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const client = new OAuth2Client(process.env.GOOGLE_OAUTH_WEB_ID);

const appleJwksClient = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

// Function to get Apple's public key
const getApplePublicKey = (header: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    appleJwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        const signingKey = key?.getPublicKey();
        resolve(signingKey!);
      }
    });
  });
};

// Function to verify Apple ID token
const verifyAppleToken = async (idToken: string) => {
  try {
    // Decode header to get kid
    const header = jwt.decode(idToken, { complete: true })?.header;
    if (!header) {
      throw new Error("Invalid token header");
    }

    const publicKey = await getApplePublicKey(header);

    const decoded = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      audience: process.env.APPLE_BUNDLE_ID, // Your app's bundle ID
      issuer: "https://appleid.apple.com",
    });

    return decoded;
  } catch (error) {
    throw new Error("Apple token verification failed");
  }
};

const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const transaction = await db.sequelize.transaction();
  const { email, password, type, idtoken, fcmtoken } = req.body;
  console.log(process.env.GOOGLE_OAUTH_WEB_ID);
  try {
    let user;

    if (type === "credentials") {
      if (!email || !password)
        throw new CustomError(400, "email and password are required.");

      const existingUser = await db.User.findOne({ where: { email } });
      if (!existingUser) {
        throw new CustomError(404, "user not found.");
      }
      if (existingUser.blocked) {
        throw new CustomError(
          403,
          "cannot signin with this email, contact support."
        );
      }

      if (!existingUser.password || !existingUser.isVerified) {
        throw new CustomError(401, "user not verified or password not set.");
      }

      const validPassword = await bcrypt.compare(
        password,
        existingUser.password
      );
      if (!validPassword)
        throw new CustomError(401, "incorrect email or password.");

      user = existingUser;
    } else if (type === "google") {
      if (!idtoken) throw new CustomError(400, "Google ID token is required.");
      console.log("Google ID token:", idtoken, process.env.GOOGLE_OAUTH_WEB_ID);
      try {
        const ticket = await client.verifyIdToken({
          idToken: idtoken,
          audience: process.env.GOOGLE_OAUTH_WEB_ID,
        });

        const payload = ticket.getPayload();

        if (!payload || !payload.sub || !payload.email) {
          throw new CustomError(401, "invalid google token payload");
        }

        if (payload.aud !== process.env.GOOGLE_OAUTH_WEB_ID) {
          throw new CustomError(401, "invalid google token audience");
        }

        if (
          payload.iss !== "https://accounts.google.com" &&
          payload.iss !== "accounts.google.com"
        ) {
          throw new CustomError(401, "invalid google token issuer");
        }

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          throw new CustomError(401, "google token expired");
        }

        const googleId = payload.sub;
        const googleEmail = payload.email;

        user = await db.User.findOne({
          where: { email: googleEmail },
          transaction,
        });

        if (!user) {
          user = await db.User.create(
            {
              socialId: googleId,
              password: null,
              isVerified: false,
              payoutEnabled: false,
              blocked: false,
              name: payload.name ?? null,
              email: googleEmail,
              image: payload.picture ?? null,
            },
            { transaction }
          );
        } else {
          if (user.blocked) {
            throw new CustomError(403, "user is blocked.");
          }
          let userUpdated = false;

          if (!user.socialId) {
            user.socialId = googleId;
            userUpdated = true;
          }

          if (
            payload.picture &&
            (!user.image || user.image !== payload.picture)
          ) {
            user.image = payload.picture;
            userUpdated = true;
          }
          if (payload.name && !user.name) {
            user.name = payload.name;
            userUpdated = true;
          }
          if (userUpdated) {
            await user.save({ transaction });
          }
        }
      } catch (error) {
        console.error("Google token verification failed:", error);
        throw new CustomError(401, "invalid google token");
      }
    } else if (type === "apple") {
      if (!idtoken) throw new CustomError(400, "apple id token is required.");

      try {
        const payload = (await verifyAppleToken(idtoken)) as any;

        if (!payload || !payload.sub) {
          throw new CustomError(401, "invalid apple token payload");
        }

        if (payload.aud !== process.env.APPLE_BUNDLE_ID) {
          throw new CustomError(401, "invalid apple token audience");
        }

        if (payload.iss !== "https://appleid.apple.com") {
          throw new CustomError(401, "invalid apple token issuer");
        }

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          throw new CustomError(401, "apple token expired");
        }

        const appleId = payload.sub;
        const appleEmail = payload.email;

        let userEmail = appleEmail;

        if (!userEmail) {
          // Apple sometimes provides a private relay email or no email at all
          // In such cases, we'll use the Apple ID to create a unique identifier
          userEmail = `${appleId}@apple.privaterelay.appleid.com`;
        }

        user = await db.User.findOne({
          where: {
            [Op.or]: [{ email: userEmail }, { socialId: appleId }],
          },
          transaction,
        });

        if (!user) {
          user = await db.User.create(
            {
              socialId: appleId,
              password: null,
              isVerified: false,
              payoutEnabled: false,
              blocked: false,
              name: payload.name ?? null,
              email: userEmail,
              image: null,
            },
            { transaction }
          );
        } else {
          if (user.blocked) {
            throw new CustomError(403, "user is blocked.");
          }
          let userUpdated = false;

          if (!user.socialId) {
            user.socialId = appleId;
            userUpdated = true;
          }

          // Update email if it was a placeholder and now we have a real one
          if (
            appleEmail &&
            user.email.includes("@apple.privaterelay.appleid.com") &&
            appleEmail !== user.email
          ) {
            user.email = appleEmail;
            userUpdated = true;
          }

          if (userUpdated) {
            await user.save({ transaction });
          }
        }
      } catch (error) {
        console.error("Apple token verification failed:", error);
        throw new CustomError(401, "invalid apple token");
      }
    } else {
      throw new CustomError(400, "invalid login type");
    }

    if (fcmtoken) {
      const existingLog = await db.Log.findOne({
        where: { userId: user.id, fcmtoken, active: true },
        transaction,
      });

      if (!existingLog) {
        await db.Log.create(
          {
            userId: user.id,
            fcmtoken,
            active: true,
          },
          { transaction }
        );
      }
    }

    await transaction.commit();
    const accessToken = getToken(user);

    const completeUser = await db.User.findByPk(user.id, {
      attributes: ["id", "image", "name", "email", "type", "phone"],
    });

    res.send({
      type: "success",
      message: "login successful",
      accessToken,
      data: completeUser,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Logout
const logout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const log = await db.Log.findOne({
      where: { userId: req.user.id, active: true },
    });
    if (log) {
      await log.update({ active: false });
    }
    res.send({ type: "success", message: "user logged out" });
  } catch (err) {
    next(err);
  }
};

// Forgot Password
const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const transaction = await db.sequelize.transaction();
  try {
    const { email } = req.body;

    const user = await db.User.findOne({ where: { email }, transaction });

    if (!user) {
      await transaction.commit();
      res.status(200).json({
        type: "success",
        message: "If account exists, reset OTP sent",
      });
      return;
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await db.OTP.destroy({
      where: { email, purpose: "password_reset" },
      transaction,
    });
    await db.OTP.create(
      {
        email,
        otp: otpHash,
        purpose: "password_reset",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      { transaction }
    );

    await transaction.commit();

    await sendEmail(
      email,
      "Password Reset",
      `Your OTP is: ${otp}. Valid for 5 minutes.`
    );
    res.status(200).json({
      type: "success",
      message: "password reset OTP sent if account exists",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Verify Reset OTP
const verifyResetOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { email, otp } = req.body;

    const otpRecord = await db.OTP.findOne({
      where: {
        email,
        purpose: "password_reset",
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction,
    });
    if (!otpRecord) throw new CustomError(400, "invalid or expired OTP");

    const validOTP = await bcrypt.compare(otp, otpRecord.otp);
    if (!validOTP) throw new CustomError(400, "invalid OTP");

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    await otpRecord.update({ resetToken: resetTokenHash }, { transaction });
    await transaction.commit();

    res.send({
      type: "success",
      message: "OTP verified successfully",
      resetToken,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Reset Password
const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { email, resetToken, newPassword } = req.body;

    const otpRecord = await db.OTP.findOne({
      where: {
        email,
        purpose: "password_reset",
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction,
    });

    if (!otpRecord || !otpRecord.resetToken) {
      throw new CustomError(400, "invalid or expired reset token");
    }

    const validToken = await bcrypt.compare(resetToken, otpRecord.resetToken);
    if (!validToken) throw new CustomError(400, "invalid reset token");

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.User.update(
      { password: hashedPassword },
      { where: { email }, transaction }
    );

    await db.OTP.destroy({
      where: { email, purpose: "password_reset" },
      transaction,
    });
    await transaction.commit();

    res.send({ type: "success", message: "password reset successful" });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Resend Verification OTP
const resendVerificationOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const transaction = await db.sequelize.transaction();
  try {
    const { email } = req.body;

    const user = await db.User.findOne({ where: { email }, transaction });
    if (!user || user.isVerified) {
      await transaction.commit();
      res.status(200).json({
        type: "success",
        message: "If account exists, verification OTP resent",
      });
      return;
    }

    await db.OTP.destroy({
      where: { email, purpose: "email_verification" },
      transaction,
    });

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await db.OTP.create(
      {
        email,
        otp: otpHash,
        purpose: "email_verification",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      { transaction }
    );

    await transaction.commit();

    await sendEmail(email, "New Verification Code", `Your new OTP is: ${otp}`);
    res.status(200).json({
      type: "success",
      message: "verification OTP resent check email",
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// Get User
const getUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user) {
      const user = await db.User.findOne({
        where: { id: req.user.id },
        attributes: ["id", "image", "name", "email", "phone"],
      });
      res.send({ type: "success", data: user });
    } else {
      throw new CustomError(404, "user not found!");
    }
  } catch (err) {
    next(err);
  }
};

// Update Profile
const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { name, phone } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!name || !phone) {
      throw new CustomError(400, "name or phone is missing");
    }
    const user = await db.User.findOne({
      where: { id: req.user?.id },
      attributes: ["id", "image", "name", "email", "phone"],
      transaction,
    });
    if (!user) throw new CustomError(404, "user not found!");

    let newimages = user.image;

    if (req.file) {
      // Check if the existing image is from your S3 bucket
      const isS3Image = user.image?.includes(
        `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`
      );

      if (isS3Image && user.image) {
        await deleteImageFromS3(user.image);
      }

      newimages = await uploadUserProfileToS3(req.file);
    }

    await user.update({ name, phone, image: newimages }, { transaction });
    await transaction.commit();

    res.send({ type: "success", message: "profile updated", data: user });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

interface NotificationQuery {
  isRead?: boolean;
  page?: number;
  limit?: number;
}

const queryNotifications = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { isRead, page = 1, limit = 5 } = req.query as NotificationQuery;

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 5)); // Cap at 100
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<Notification> = { userId: req.user.id };

    if (isRead !== undefined) {
      whereClause.isRead = isRead;
    }

    const count = await db.Notification.count({
      where: whereClause,
    });

    const notifications = await db.Notification.findAll({
      where: whereClause,
      include: [
        {
          model: db.User,
          as: "user",
          attributes: ["id", "name", "email", "image", "phone"],
        },
        {
          model: db.Booking,
          as: "booking",
          attributes: ["id", "status", "startDate", "startTime", "price"],
        },
        {
          model: db.Spot,
          as: "spot",
          attributes: ["id", "name", "location", "images", "address"],
        },
        {
          model: db.Vehicle,
          as: "vehicle",
          attributes: ["id", "name", "type", "licensePlate", "color"],
        },
      ],
      limit: limitNum,
      offset: offset,
      order: [["createdAt", "DESC"]], // Add ordering for consistent pagination
    });

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    res.send({
      type: "success",
      data: notifications,
      pagination: {
        totalItems: count,
        itemsPerPage: limitNum,
        currentPage: pageNum,
        totalPages,
        nextPage,
      },
    });
  } catch (err) {
    console.error("Error in queryNotifications:", err); // Fixed console message
    next(err);
  }
};

const readNotification = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!id) {
      throw new CustomError(400, "id is missing");
    }
    const notification = await db.Notification.findOne({
      where: { id: id },
      transaction,
    });
    if (!notification) throw new CustomError(404, "notification not found!");

    await notification.update(
      { isRead: true, readDate: new Date() },
      { transaction }
    );
    await transaction.commit();

    res.send({ type: "success", message: "notification marked as read" });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

const blockUnblock = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.body;
  const transaction = await db.sequelize.transaction();
  try {
    if (!id) {
      throw new CustomError(400, "id is missing");
    }
    if (req.user.type !== "admin") {
      throw new CustomError(403, "only admins can block/unblock users");
    }
    const user = await db.User.findByPk(id, {
      transaction,
      attributes: ["id", "name", "email", "phone", "blocked"],
    });
    if (!user) throw new CustomError(404, "user not found!");

    await user.update({ blocked: !user.blocked }, { transaction });
    await transaction.commit();

    res.send({
      type: "success",
      message: `user ${user.blocked ? "blocked" : "unblocked"}`,
    });
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

export interface QueryUsers {
  name?: string;
  email?: string;
  phone?: string;
  page?: string;
  limit?: string;
}

const queryUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const {
    name,
    email,
    phone,
    page = "1",
    limit = "5",
  } = req.query as QueryUsers;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause: WhereOptions<User> = { type: "user" }; // Exclude admin users

    if (email) {
      const emailKeywords = email.replace(/\s+/g, "").toLowerCase();
      const emailWords = email.split(/\s+/).map((word) => `%${word}%`);
      whereClause.email = {
        [Op.or]: [
          { [Op.iLike]: `%${emailKeywords}%` },
          ...emailWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (name) {
      const nameKeywords = name.replace(/\s+/g, "").toLowerCase();
      const nameWords = name.split(/\s+/).map((word) => `%${word}%`);
      whereClause.name = {
        [Op.or]: [
          { [Op.iLike]: `%${nameKeywords}%` },
          ...nameWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }
    if (phone) {
      const phoneKeywords = phone.replace(/\s+/g, "").toLowerCase();
      const phoneWords = phone.split(/\s+/).map((word) => `%${word}%`);
      whereClause.phone = {
        [Op.or]: [
          { [Op.iLike]: `%${phoneKeywords}%` },
          ...phoneWords.map((word) => ({ [Op.iLike]: word })),
        ],
      };
    }

    const count = await db.User.count({ where: whereClause });
    const users = await db.User.findAll({
      where: whereClause,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      limit: limitNum,
      offset: offset,
      order: [["id", "ASC"]],
    });

    if (!users) {
      throw new CustomError(400, "users not found");
    }

    const totalPages = Math.ceil(count / limitNum);
    const nextPage = pageNum < totalPages ? pageNum + 1 : null;

    if (!users) {
      throw new CustomError(404, "users not found!");
    } else {
      res.send({
        type: "success",
        data: users,
        pagination: {
          totalItems: count,
          itemsPerPage: limitNum,
          currentPage: pageNum,
          totalPages,
          nextPage,
        },
      });
    }
  } catch (err) {
    next(err);
  }
};

export default {
  login,
  logout,
  verifyEmail,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  resendVerificationOTP,
  getUser,
  signup,
  updateProfile,
  queryNotifications,
  readNotification,
  blockUnblock,
  queryUsers,
};
