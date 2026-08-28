import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpdateShowcaseDto } from './dto/showcase.dto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit per image

@Injectable()
export class ShowcaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Get all active showcase images for public client slider
   */
  async getActiveShowcase() {
    return this.prisma.showcaseImage.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get all showcase images for Admin management
   */
  async getAllShowcase() {
    return this.prisma.showcaseImage.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Upload multiple images to Cloudinary with 5MB validation per file and auto compression
   */
  async uploadMultipleShowcaseImages(
    files: Express.Multer.File[],
    titlePrefix?: string,
    startOrder: number = 0,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 file ảnh.');
    }

    // Validate all files before starting upload
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        throw new BadRequestException(
          `File "${file.originalname}" dung lượng ${sizeMb}MB vượt quá giới hạn tối đa cho phép là 5MB.`,
        );
      }

      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(`File "${file.originalname}" không phải là định dạng hình ảnh hợp lệ.`);
      }
    }

    // Upload in parallel
    const uploadPromises = files.map(async (file, idx) => {
      const { url, publicId } = await this.cloudinaryService.uploadImageBuffer(file.buffer);
      
      const cleanFileName = file.originalname ? file.originalname.replace(/\.[^/.]+$/, "") : `Ảnh ${idx + 1}`;
      const title = titlePrefix?.trim()
        ? (files.length > 1 ? `${titlePrefix.trim()} #${idx + 1}` : titlePrefix.trim())
        : cleanFileName;

      return this.prisma.showcaseImage.create({
        data: {
          url,
          publicId,
          title,
          order: Number(startOrder) + idx,
          isActive: true,
        },
      });
    });

    const results = await Promise.all(uploadPromises);
    return results;
  }

  /**
   * Update showcase image title, order, or active state
   */
  async updateShowcaseImage(id: string, dto: UpdateShowcaseDto) {
    const existing = await this.prisma.showcaseImage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy ảnh này trong album.');
    }

    return this.prisma.showcaseImage.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Delete showcase image from Cloudinary and DB
   */
  async deleteShowcaseImage(id: string) {
    const existing = await this.prisma.showcaseImage.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy ảnh này.');
    }

    if (existing.publicId) {
      await this.cloudinaryService.deleteImage(existing.publicId);
    }

    await this.prisma.showcaseImage.delete({ where: { id } });
    return { success: true, message: 'Đã xoá ảnh khỏi album.' };
  }
}
