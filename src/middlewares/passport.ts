import passport from "passport";
import {
  Strategy as JwtStrategy,
  ExtractJwt,
  StrategyOptions,
} from "passport-jwt";
import { Request, Response, NextFunction } from "express";
import db from "../models"; // adjust path based on your structure
import { CustomError } from "./error";
import dotenv from "dotenv";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: envFile });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

interface JwtPayload {
  id: string;
}

// JWT Strategy options
const userOpts: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET,
};

const adminOpts: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET,
};

// User JWT Strategy
passport.use(
  "jwt-user",
  new JwtStrategy(userOpts, async (jwtPayload: JwtPayload, done) => {
    try {
      const user = await db.User.findByPk(jwtPayload.id, {
        attributes: {
          exclude: ["password", "socialId", "createdAt", "updatedAt"],
        },
      });
      if (user) {
        return done(null, user);
      }

      return done(null, false);
    } catch (err) {
      return done(err, false);
    }
  })
);

// Admin JWT Strategy
passport.use(
  "jwt-admin",
  new JwtStrategy(adminOpts, async (jwtPayload: JwtPayload, done) => {
    try {
      const user = await db.User.findByPk(jwtPayload.id, {
        attributes: {
          exclude: ["password", "socialId", "createdAt", "updatedAt"],
        },
      });
      
      if (user && user.type === "admin") {
        return done(null, user);
      }

      return done(null, false);
    } catch (err) {
      return done(err, false);
    }
  })
);

export const verifyUser = passport.authenticate("jwt-user", { session: false });
export const verifyAdmin = passport.authenticate("jwt-admin", { session: false });

export { passport };