import { CustomError } from "../middlewares/error";
import db from "../models";
import { firebaseAdmin } from "./FirebaseApp";

interface Notification {
  title: string;
  body: string;
  image?: string;
}

/**
 * Send push notification to a specific device token
 * @param token Firebase device token
 * @param notification Notification content (title, body, optional image)
 * @param data Additional data payload to send with notification
 * @returns Promise<string> Message ID if successful
 */
export const sendNotification = async (
  token: string,
  notification: Notification,
  data: any = {}
): Promise<string> => {
  try {
    if (!token) {
      throw new Error("Device token is required");
    }
    if (!notification.title || !notification.body) {
      throw new Error("Notification title and body are required");
    }

    const formattedNotification: any = {
      title: notification.title,
      body: notification.body,
    };

    if (notification.image && notification.image.trim() !== "") {
      formattedNotification.images = notification.image;
    }

    const message = {
      token: token,
      notification: formattedNotification,
      data: data,
    };

    const response = await firebaseAdmin.messaging().send(message);
    console.log("Notification sent successfully:", response);
    return response;
  } catch (error: any) {
    console.error("Error sending notification:", error);
    throw new Error(`Error sending notification: ${error.message || error}`);
  }
};

export const userLogs = async (userId: string) => {
  try {
    if (!userId) {
      throw new CustomError(401, "user id is required");
    }

    const logs = await db.Log.findAll({ where: { userId, active: true } });
    if (logs.length === 0) {
      return null;
    }
    return logs;
  } catch (error: any) {
    console.error("Error finding logs");
  }
};
