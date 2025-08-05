import multer from "multer";
import sharp from "sharp";
import { CustomError } from "./error";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 80 * 1024 * 1024, // 80 MB limit for raw upload (before compression)
    files: 3, // Maximum 3 files
  },
  fileFilter: (req, file, cb) => {
    // Check MIME types
    if (!file.mimetype.startsWith("image/")) {
      return cb(new CustomError(400, "Only image files are allowed!"));
    }
    cb(null, true);
  },
});

const compressImage = async (
  buffer: Buffer,
  originalName: string
): Promise<Buffer> => {
  try {
    const compressedBuffer = await sharp(buffer)
      .resize(1200, 900, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 80,
        progressive: true,
      })
      .toBuffer();

    console.log(
      `Compressed ${originalName}: ${buffer.length} bytes -> ${compressedBuffer.length} bytes`
    );
    return compressedBuffer;
  } catch (error) {
    console.error(`Error compressing image ${originalName}:`, error);
    throw new CustomError(500, "Failed to process image");
  }
};

export const handleMulterUpload = (req: any, res: any, next: any) => {
  upload.array("images", 3)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        switch (err.code) {
          case "LIMIT_FILE_SIZE":
            return next(
              new CustomError(
                400,
                "Image file too large. Please try with a smaller image."
              )
            );
          case "LIMIT_FILE_COUNT":
            return next(new CustomError(400, "Maximum 3 images allowed"));
          case "LIMIT_UNEXPECTED_FILE":
            return next(
              new CustomError(400, "Unexpected field or too many files")
            );
          default:
            return next(new CustomError(400, `Upload error: ${err.message}`));
        }
      }
      return next(err);
    }
    
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      try {
        const compressedFiles = await Promise.all(
          req.files.map(async (file: Express.Multer.File) => {
            const compressedBuffer = await compressImage(
              file.buffer,
              file.originalname
            );

            return {
              ...file,
              buffer: compressedBuffer,
              size: compressedBuffer.length,
              mimetype: "image/jpeg", // All compressed images become JPEG
              originalname: file.originalname.replace(/\.[^/.]+$/, ".jpg"), // Change extension to .jpg
            };
          })
        );

        req.files = compressedFiles;
        console.log(`Successfully compressed ${compressedFiles.length} images`);
      } catch (error) {
        console.error("Error during image compression:", error);
        return next(error);
      }
    }

    next();
  });
};

export default upload;
