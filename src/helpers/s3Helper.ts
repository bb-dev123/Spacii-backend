import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { s3 } from "../middlewares/awsS3";

export const uploadSpaceMediaToS3 = async (
  file: Express.Multer.File
): Promise<string> => {
  const extension = path.extname(file.originalname);
  const isVideo = file.mimetype.startsWith("video/");
  const folder = isVideo ? "space-videos" : "space-images";
  const key = `${folder}/${uuidv4()}${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // Add metadata for better organization
      Metadata: {
        "original-name": file.originalname,
        "file-type": isVideo ? "video" : "image",
      },
    })
  );

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

export const deleteMediaFromS3 = async (url: string): Promise<void> => {
  const bucket = process.env.AWS_S3_BUCKET!;
  const key = url.split(`.amazonaws.com/`)[1]; // Extract key from full URL

  if (!key) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
};

export const uploadUserProfileToS3 = async (
  file: Express.Multer.File
): Promise<string> => {
  const extension = path.extname(file.originalname);
  const key = `user-profiles/${uuidv4()}${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

export const validateMediaFile = (
  file: Express.Multer.File
): {
  isValid: boolean;
  type: "image" | "video" | "unknown";
  error?: string;
} => {
  const allowedImageTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const allowedVideoTypes = [
    "video/mp4",
    "video/avi",
    "video/mov",
    "video/wmv",
    "video/flv",
    "video/webm",
  ];

  if (allowedImageTypes.includes(file.mimetype)) {
    return { isValid: true, type: "image" };
  }

  if (allowedVideoTypes.includes(file.mimetype)) {
    // Check video file size (limit to 100MB for example)
    const maxVideoSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxVideoSize) {
      return {
        isValid: false,
        type: "video",
        error: "Video file too large. Maximum size is 100MB.",
      };
    }
    return { isValid: true, type: "video" };
  }

  return {
    isValid: false,
    type: "unknown",
    error: "Unsupported file type. Only images and videos are allowed.",
  };
};
