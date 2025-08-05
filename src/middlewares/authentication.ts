import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../constants";

interface RequestAdmin {
  user?: User;
}

// Authentication middleware
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Access denied",
        message: "No token provided or invalid format",
      });
      return;
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET environment variable is not configured");
    }

    // Decode and verify the token
    const decoded = jwt.verify(token, jwtSecret) as any;

    // Add user information to request object as User type
    req.user = {
      id: decoded.id || decoded.userId,
      email: decoded.email,
      name: decoded.name || null,
      type: decoded.type || "user",
      socialId: decoded.googleId || null,
      image: decoded.image || null,
      phone: decoded.phone || null,
      isVerified: decoded.isVerified || false,
      password: null, // We don't include password in JWT
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    // Continue to next middleware/route handler
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: "Access denied",
        message: "Invalid token",
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: "Access denied",
        message: "Token expired",
      });
      return;
    }

    // Other errors
    console.error("Authentication error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Authentication failed",
    });
  }
};

// Optional: Admin-only middleware (use after authenticate)
export const requireAdmin = (
  req: RequestAdmin,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: "Access denied",
      message: "Authentication required",
    });
    return;
  }

  // Access the type property which exists in your User class
  if (req.user.type !== "admin") {
    res.status(403).json({
      error: "Access denied",
      message: "Admin privileges required",
    });
    return;
  }

  next();
};
