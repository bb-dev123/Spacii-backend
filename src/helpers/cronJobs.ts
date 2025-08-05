import { Op } from "sequelize";
import db from "../models";
import cron from "node-cron";

export const cronJobs = () => {
  // Schedule cron job to run every day at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("Running daily cleanup job for old notifications...");

      const currentDate = new Date();
      const oneDayAgo = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);

      const deletedNotifications = await db.Notification.destroy({
        where: {
          isRead: true,
          readDate: {
            [Op.lt]: oneDayAgo,
          },
        },
      });
      console.log(`Deleted ${deletedNotifications} old notifications`);
            const deletedOtps = await db.OTP.destroy({
        where: {
          expiresAt: {
            [Op.lt]: oneDayAgo,
          },
        },
      });
      console.log(`Deleted ${deletedOtps} old OTPs`);
    } catch (error) {
      console.error("Error in cron jobs:", error);
    }
  });

  console.log("Cron job scheduled: Daily notification cleanup at midnight");
};
