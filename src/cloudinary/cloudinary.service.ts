import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(`Cloudinary configured successfully with cloud_name: ${cloudName}`);
    } else if (process.env.CLOUDINARY_URL) {
      cloudinary.config({
        cloudinary_url: process.env.CLOUDINARY_URL,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary configured via CLOUDINARY_URL');
    } else {
      this.logger.warn(
        'Cloudinary credentials are not fully set in .env. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }
  }

  /**
   * Upload an image buffer directly to Cloudinary
   */
  async uploadImageBuffer(
    buffer: Buffer,
    folder: string = 'photo-picker-pro/showcase',
  ): Promise<{ url: string; publicId: string }> {
    if (!this.isConfigured) {
      throw new BadRequestException(
        'Cloudinary chưa được cấu hình. Vui lòng thêm CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET vào file .env backend.',
      );
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          quality: 'auto:best',
          fetch_format: 'auto',
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            this.logger.error('Cloudinary upload error:', error);
            return reject(new BadRequestException(`Lỗi upload ảnh lên Cloudinary: ${error.message}`));
          }
          if (!result) {
            return reject(new BadRequestException('Lỗi không xác định khi upload lên Cloudinary'));
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Delete an image from Cloudinary by public ID
   */
  async deleteImage(publicId: string): Promise<boolean> {
    if (!this.isConfigured || !publicId) return false;

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (err) {
      this.logger.error(`Failed to delete Cloudinary image ${publicId}:`, err);
      return false;
    }
  }
}
