import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { SyncGateway } from '../sync/sync.gateway';
import * as path from 'path';

@Injectable()
export class ResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}


  /**
   * Public: Get active resources for client app (lightweight, excludes large fileData)
   */
  async getActiveResources(category?: string, search?: string) {
    const where: any = { isActive: true };

    if (category && category !== 'all') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { fileFormat: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
        { hashtags: { has: search } },
      ];
    }

    return this.prisma.resource.findMany({
      where,
      select: {
        id: true,
        category: true,
        title: true,
        description: true,
        hashtags: true,
        isVip: true,
        isHot: true,
        fileFormat: true,
        rating: true,
        size: true,
        downloadType: true,
        downloadUrl: true,
        fileName: true,
        author: true,
        downloads: true,
        isActive: true,
        order: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Admin: Get all resources (including inactive)
   */
  async getAllAdminResources() {
    return this.prisma.resource.findMany({
      select: {
        id: true,
        category: true,
        title: true,
        description: true,
        hashtags: true,
        isVip: true,
        isHot: true,
        fileFormat: true,
        rating: true,
        size: true,
        downloadType: true,
        downloadUrl: true,
        fileName: true,
        fileSize: true,
        author: true,
        downloads: true,
        isActive: true,
        order: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get single resource
   */
  async getResourceById(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      select: {
        id: true,
        category: true,
        title: true,
        description: true,
        hashtags: true,
        isVip: true,
        isHot: true,
        fileFormat: true,
        rating: true,
        size: true,
        downloadType: true,
        downloadUrl: true,
        fileName: true,
        author: true,
        downloads: true,
        isActive: true,
        order: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!resource) {
      throw new NotFoundException('Không tìm thấy tài nguyên');
    }

    return resource;
  }

  /**
   * Admin: Create new resource with direct file or Google Drive URL
   */
  async createResource(dto: any, file?: Express.Multer.File) {
    let fileData: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;
    let detectedFormat = dto.fileFormat || '.ZIP';
    let detectedSize = dto.size || '0 MB';
    const downloadType = dto.downloadType || (file ? 'DIRECT' : 'DRIVE');

    if (file) {
      // Direct file upload constraint: max 5MB
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new BadRequestException('Tệp tải trực tiếp vượt quá giới hạn 5MB. Vui lòng dùng liên kết Google Drive!');
      }

      fileData = file.buffer.toString('base64');
      fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      mimeType = file.mimetype || 'application/octet-stream';
      fileSize = file.size;

      const ext = path.extname(fileName).toUpperCase();
      if (ext) {
        detectedFormat = ext;
      }

      if (!dto.size) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        detectedSize = `${mb} MB`;
      }
    }

    // Parse hashtags if received as string from FormData
    let parsedHashtags: string[] = [];
    if (Array.isArray(dto.hashtags)) {
      parsedHashtags = dto.hashtags;
    } else if (typeof dto.hashtags === 'string') {
      try {
        parsedHashtags = JSON.parse(dto.hashtags);
      } catch {
        parsedHashtags = dto.hashtags.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    const created = await this.prisma.resource.create({
      data: {
        category: (dto.category || 'Tài nguyên khác').trim(),
        title: (dto.title || '').trim(),
        description: (dto.description || '').trim(),
        hashtags: parsedHashtags,
        isVip: dto.isVip === true || dto.isVip === 'true',
        isHot: dto.isHot === true || dto.isHot === 'true',
        fileFormat: detectedFormat.trim(),
        rating: Number(dto.rating) || 5.0,
        size: detectedSize.trim(),
        downloadType,
        downloadUrl: dto.downloadUrl?.trim() || null,
        fileData,
        fileName,
        mimeType,
        fileSize,
        author: (dto.author || 'MVD Academy').trim(),
        isActive: dto.isActive !== false && dto.isActive !== 'false',
        order: Number(dto.order) || 0,
      },
    });

    // Real-time broadcast to all connected apps
    this.syncGateway.broadcastEvent('resource:updated', {
      action: 'create',
      resourceId: created.id,
      title: created.title,
    });

    return created;
  }

  /**
   * Admin: Update resource
   */
  async updateResource(id: string, dto: any, file?: Express.Multer.File) {
    const existing = await this.prisma.resource.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài nguyên cần cập nhật');
    }

    const updateData: any = {};

    if (dto.category !== undefined) updateData.category = String(dto.category).trim();
    if (dto.title !== undefined) updateData.title = String(dto.title).trim();
    if (dto.description !== undefined) updateData.description = String(dto.description).trim();
    if (dto.isVip !== undefined) updateData.isVip = dto.isVip === true || dto.isVip === 'true';
    if (dto.isHot !== undefined) updateData.isHot = dto.isHot === true || dto.isHot === 'true';
    if (dto.fileFormat !== undefined) updateData.fileFormat = String(dto.fileFormat).trim();
    if (dto.rating !== undefined) updateData.rating = Number(dto.rating);
    if (dto.size !== undefined) updateData.size = String(dto.size).trim();
    if (dto.downloadType !== undefined) updateData.downloadType = dto.downloadType;
    if (dto.downloadUrl !== undefined) updateData.downloadUrl = dto.downloadUrl?.trim();
    if (dto.author !== undefined) updateData.author = String(dto.author).trim();
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive === true || dto.isActive === 'true';
    if (dto.order !== undefined) updateData.order = Number(dto.order);


    if (dto.hashtags !== undefined) {
      if (Array.isArray(dto.hashtags)) {
        updateData.hashtags = dto.hashtags;
      } else if (typeof dto.hashtags === 'string') {
        try {
          updateData.hashtags = JSON.parse(dto.hashtags);
        } catch {
          updateData.hashtags = dto.hashtags.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }
    }

    if (file) {
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new BadRequestException('Tệp tải trực tiếp vượt quá giới hạn 5MB.');
      }
      updateData.fileData = file.buffer.toString('base64');
      updateData.fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      updateData.mimeType = file.mimetype || 'application/octet-stream';
      updateData.fileSize = file.size;
      updateData.downloadType = 'DIRECT';
    }

    const updated = await this.prisma.resource.update({
      where: { id },
      data: updateData,
    });

    // Real-time broadcast to all connected apps
    this.syncGateway.broadcastEvent('resource:updated', {
      action: 'update',
      resourceId: updated.id,
      title: updated.title,
    });

    return updated;
  }

  /**
   * Admin: Delete resource
   */
  async deleteResource(id: string) {
    const existing = await this.prisma.resource.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài nguyên');
    }
    await this.prisma.resource.delete({ where: { id } });

    // Real-time broadcast to all connected apps
    this.syncGateway.broadcastEvent('resource:updated', {
      action: 'delete',
      resourceId: id,
    });

    return { success: true, message: 'Đã xóa tài nguyên thành công!' };
  }


  /**
   * Download handler (Increments download counter and returns file payload)
   */
  async downloadResource(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
    });

    if (!resource || !resource.isActive) {
      throw new NotFoundException('Tài nguyên không tồn tại hoặc đã bị ẩn');
    }

    // Increment download counter
    await this.prisma.resource.update({
      where: { id },
      data: { downloads: { increment: 1 } },
    });

    return resource;
  }
}
