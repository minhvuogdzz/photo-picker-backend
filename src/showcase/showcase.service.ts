import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpdateShowcaseDto, UpdateShowcaseAlbumDto } from './dto/showcase.dto';

const MAX_FILE_SIZE = 1.5 * 1024 * 1024;
const MAX_IMAGES_PER_ALBUM = 20;

@Injectable()
export class ShowcaseService {
  private readonly logger = new Logger(ShowcaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Migrate legacy ShowcaseImage records into a default ShowcaseAlbum if no album exists yet
   */
  async ensureLegacyMigration() {
    try {
      const albumCount = await this.prisma.showcaseAlbum.count();
      if (albumCount === 0) {
        const legacyImages = await this.prisma.showcaseImage.findMany({
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        });
        if (legacyImages.length > 0) {
          this.logger.log(
            `Migrating ${legacyImages.length} legacy showcase images into initial ShowcaseAlbum...`,
          );
          const chunkSize = MAX_IMAGES_PER_ALBUM;
          for (let i = 0; i < legacyImages.length; i += chunkSize) {
            const chunk = legacyImages.slice(i, i + chunkSize);
            const albumNum = Math.floor(i / chunkSize) + 1;
            const title =
              legacyImages.length > chunkSize
                ? `Bộ ảnh mẫu #${albumNum}`
                : 'Bộ ảnh mặc định';
            await this.prisma.showcaseAlbum.create({
              data: {
                title,
                description: 'Bộ ảnh tự động chuyển đổi từ dữ liệu trước đây',
                order: albumNum - 1,
                isActive: true,
                images: chunk.map((img, idx) => ({
                  id: img.id,
                  url: img.url,
                  publicId: img.publicId,
                  title: img.title || `Ảnh #${idx + 1}`,
                  order: img.order ?? idx,
                })),
              },
            });
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to run legacy showcase migration:', err);
    }
  }

  /**
   * Get all active showcase images for public client slider (LoginPage)
   * Fetches from active ShowcaseAlbums.
   * If none found, falls back to legacy ShowcaseImage.
   */
  async getActiveShowcase() {
    await this.ensureLegacyMigration();

    const activeAlbums = await this.prisma.showcaseAlbum.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    if (activeAlbums.length > 0) {
      const allActiveImages: Array<{
        id: string;
        url: string;
        publicId?: string | null;
        title?: string | null;
        albumId: string;
        albumTitle: string;
        order: number;
        isActive: boolean;
      }> = [];

      for (const album of activeAlbums) {
        if (album.images && album.images.length > 0) {
          const sorted = [...album.images].sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0),
          );
          for (let idx = 0; idx < sorted.length; idx++) {
            const photo = sorted[idx];
            allActiveImages.push({
              id: photo.id || `${album.id}-${idx}`,
              url: photo.url,
              publicId: photo.publicId,
              title: photo.title || album.title,
              albumId: album.id,
              albumTitle: album.title,
              order: photo.order ?? idx,
              isActive: true,
            });
          }
        }
      }

      if (allActiveImages.length > 0) {
        return allActiveImages;
      }
    }

    // Fallback to legacy showcase images if any
    return this.prisma.showcaseImage.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Admin: Get all showcase albums
   */
  async getAllAlbums() {
    await this.ensureLegacyMigration();
    return this.prisma.showcaseAlbum.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Admin: Create a new ShowcaseAlbum with up to 20 compressed images.
   */
  async createAlbum(
    title: string,
    files: Express.Multer.File[],
    order: number = 0,
    isActive: boolean = true,
    description?: string,
  ) {
    if (!title || !title.trim()) {
      throw new BadRequestException('Vui lòng nhập tên bộ ảnh.');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException(
        'Vui lòng chọn ít nhất 1 file ảnh cho bộ ảnh.',
      );
    }

    if (files.length > MAX_IMAGES_PER_ALBUM) {
      throw new BadRequestException(
        `Một bộ ảnh chỉ được tối đa ${MAX_IMAGES_PER_ALBUM} ảnh (bạn đã chọn ${files.length} ảnh).`,
      );
    }

    // Validate size and mime type
    for (const file of files) {
      if (file.size >= MAX_FILE_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        throw new BadRequestException(
          `File "${file.originalname}" dung lượng ${sizeMb}MB chưa được nén xuống dưới 1,5 MB.`,
        );
      }

      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File "${file.originalname}" không phải là định dạng hình ảnh hợp lệ.`,
        );
      }
    }

    const uploadResults = await Promise.allSettled(
      files.map(async (file, idx) => {
        const { url, publicId } =
          await this.cloudinaryService.uploadImageBuffer(file.buffer);
        const photoTitle = `${title.trim()} #${idx + 1}`;
        return {
          id: publicId || `photo-${Date.now()}-${idx}`,
          url,
          publicId,
          title: photoTitle,
          order: idx,
        };
      }),
    );

    const uploadedPhotos = uploadResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const uploadFailure = uploadResults.find(
      (result) => result.status === 'rejected',
    );

    if (uploadFailure?.status === 'rejected') {
      await Promise.allSettled(
        uploadedPhotos.map((photo) =>
          this.cloudinaryService.deleteImage(photo.publicId),
        ),
      );
      throw uploadFailure.reason;
    }

    try {
      return await this.prisma.showcaseAlbum.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          order: Number(order) || 0,
          isActive: isActive !== false,
          images: uploadedPhotos,
        },
      });
    } catch (error) {
      await Promise.allSettled(
        uploadedPhotos.map((photo) =>
          this.cloudinaryService.deleteImage(photo.publicId),
        ),
      );
      throw error;
    }
  }

  /**
   * Admin: Update ShowcaseAlbum title, order, or isActive
   */
  async updateAlbum(id: string, dto: UpdateShowcaseAlbumDto) {
    const existing = await this.prisma.showcaseAlbum.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bộ ảnh này.');
    }

    return this.prisma.showcaseAlbum.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() }
          : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Admin: Delete entire ShowcaseAlbum and its photos from Cloudinary
   */
  async deleteAlbum(id: string) {
    const existing = await this.prisma.showcaseAlbum.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bộ ảnh này.');
    }

    // Delete photos from Cloudinary
    if (existing.images && existing.images.length > 0) {
      const deletePromises = existing.images
        .filter((photo) => Boolean(photo.publicId))
        .map((photo) => this.cloudinaryService.deleteImage(photo.publicId!));
      await Promise.allSettled(deletePromises);
    }

    await this.prisma.showcaseAlbum.delete({ where: { id } });
    return {
      success: true,
      message: `Đã xoá bộ ảnh "${existing.title}" thành công!`,
    };
  }

  // --- Legacy Methods for backward compatibility ---
  async getAllShowcase() {
    return this.prisma.showcaseImage.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async uploadMultipleShowcaseImages(
    files: Express.Multer.File[],
    titlePrefix?: string,
    startOrder: number = 0,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 file ảnh.');
    }

    for (const file of files) {
      if (file.size >= MAX_FILE_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        throw new BadRequestException(
          `File "${file.originalname}" dung lượng ${sizeMb}MB chưa được nén xuống dưới 1,5 MB.`,
        );
      }

      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File "${file.originalname}" không phải là định dạng hình ảnh hợp lệ.`,
        );
      }
    }

    const uploadPromises = files.map(async (file, idx) => {
      const { url, publicId } = await this.cloudinaryService.uploadImageBuffer(
        file.buffer,
      );
      const cleanFileName = file.originalname
        ? file.originalname.replace(/\.[^/.]+$/, '')
        : `Ảnh ${idx + 1}`;
      const title = titlePrefix?.trim()
        ? files.length > 1
          ? `${titlePrefix.trim()} #${idx + 1}`
          : titlePrefix.trim()
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

    return Promise.all(uploadPromises);
  }

  async updateShowcaseImage(id: string, dto: UpdateShowcaseDto) {
    const existing = await this.prisma.showcaseImage.findUnique({
      where: { id },
    });
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

  async deleteShowcaseImage(id: string) {
    const existing = await this.prisma.showcaseImage.findUnique({
      where: { id },
    });
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
