import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { s3 } from "../middlewares/awsS3";

export const uploadSpotImageToS3 = async (file: Express.Multer.File): Promise<string> => {
  const extension = path.extname(file.originalname);
  const key = `spots/${uuidv4()}${extension}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

export const deleteImageFromS3 = async (url: string): Promise<void> => {
  const bucket = process.env.AWS_S3_BUCKET!;
  const key = url.split(`.amazonaws.com/`)[1]; // Extract key from full URL

  if (!key) return;

  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
};

export const uploadUserProfileToS3 = async (file: Express.Multer.File): Promise<string> => {
    const extension = path.extname(file.originalname);
    const key = `user-profiles/${uuidv4()}${extension}`;
  
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
  
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  };
