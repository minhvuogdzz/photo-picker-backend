import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response, Request } from 'express';
import { ResourceService } from './resource.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Client: Get active resources for Resource Hub
   */
  @Get('resources')
  async getActiveResources(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.resourceService.getActiveResources(category, search);
    return { success: true, data };
  }

  /**
   * Client: Get single resource info
   */
  @Get('resources/:id')
  async getResourceById(@Param('id') id: string) {
    const data = await this.resourceService.getResourceById(id);
    return { success: true, data };
  }

  /**
   * Xác thực JWT + kiểm tra quyền 'resources' / 'ALL'. Ném lỗi nếu không đủ quyền.
   * SECURITY: phải gọi TRƯỚC khi đọc tài nguyên — trước đây controller gọi
   * downloadResource(id) (đọc file + tăng bộ đếm downloads) rồi mới xác thực, nên
   * người lạ vẫn bơm được số liệu tải và tạo tải nặng cho server.
   */
  private async assertDownloadPermission(
    req: Request,
    queryToken?: string,
    allowLegacyAnonymous = false,
  ) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : queryToken;

    if (!bearerToken) {
      // App desktop <= 2.4.4 gọi endpoint này KHÔNG kèm token. Chặn ngay sẽ làm mọi
      // máy chưa cập nhật mất chức năng tải, nên trong thời gian tương thích thì cho
      // qua; admin tắt `legacy_resource_compat` là siết lại.
      if (allowLegacyAnonymous) return;
      throw new UnauthorizedException('Tải tài nguyên yêu cầu đăng nhập tài khoản.');
    }

    try {
      const payload: any = await this.jwtService.verifyAsync(bearerToken, {
        secret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
      });
      const userId = payload?.sub || payload?.userId;
      if (!userId) {
        throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true },
      });

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại.');
      }

      if (user.role !== 'ADMIN') {
        const now = new Date();
        const sub = user.subscription;
        const entitlements: any[] = (sub as any)?.entitlements || [];

        const hasAccess = entitlements.some(
          (e: any) =>
            (e.app === 'ALL' || e.app === 'resources') &&
            new Date(e.expiresAt) > now,
        ) || (sub?.expiresAt && new Date(sub.expiresAt) > now && sub.status === 'ACTIVE');

        if (!hasAccess) {
          throw new ForbiddenException(
            'Bạn cần gia hạn gói Kho Tài Nguyên hoặc Gói Toàn Hệ Sinh Thái để tải tài nguyên này.',
          );
        }
      }
    } catch (err: any) {
      if (err instanceof ForbiddenException || err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
  }

  /**
   * Client: Lấy link tải ngoài (Google Drive) — CHỈ khi đã đăng nhập và còn quyền.
   * Danh sách công khai không còn trả `downloadUrl` nữa nên link chỉ đi qua đây.
   */
  @UseGuards(JwtAuthGuard)
  @Get('resources/:id/download-link')
  async getDownloadLink(@Param('id') id: string, @Req() req: Request) {
    await this.assertDownloadPermission(req);

    const resource = await this.resourceService.downloadResource(id);
    if (!resource.downloadUrl) {
      throw new BadRequestException('Tài nguyên này chưa có liên kết tải hợp lệ.');
    }

    return { success: true, data: { downloadUrl: resource.downloadUrl } };
  }

  /**
   * Client / Direct Download: Stream direct file or redirect to Google Drive link
   * Validates JWT token and active subscription entitlement for 'resources' or 'ALL'
   */
  @Get('resources/:id/download')
  async downloadResource(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('token') queryToken: string,
    @Res() res: Response,
  ) {
    await this.assertDownloadPermission(
      req,
      queryToken,
      await this.resourceService.isLegacyCompatEnabled(),
    );

    const resource = await this.resourceService.downloadResource(id);

    if (resource.downloadType === 'DRIVE' && resource.downloadUrl) {
      return res.redirect(resource.downloadUrl);
    }

    if (resource.downloadType === 'DIRECT' && resource.fileData) {
      const buffer = Buffer.from(resource.fileData, 'base64');
      const safeFilename = encodeURIComponent(resource.fileName || `${resource.title}.zip`);
      
      res.setHeader('Content-Type', resource.mimeType || 'application/zip');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      );

      return res.end(buffer);
    }

    if (resource.downloadUrl) {
      return res.redirect(resource.downloadUrl);
    }

    throw new BadRequestException('Tài nguyên này chưa được tải file đính kèm hoặc link tải hợp lệ.');
  }

  /**
   * Admin: Get all resources list
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/resources')
  async getAllAdminResources() {
    const data = await this.resourceService.getAllAdminResources();
    return { success: true, data };
  }

  /**
   * Admin: Create new resource with file or Google Drive
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/resources')
  @UseInterceptors(FileInterceptor('file'))
  async createResource(
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data = await this.resourceService.createResource(body, file);
    return {
      success: true,
      data,
      message: 'Đã thêm tài nguyên thành công!',
    };
  }

  /**
   * Admin: Update resource
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/resources/:id')
  @UseInterceptors(FileInterceptor('file'))
  async updateResource(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data = await this.resourceService.updateResource(id, body, file);
    return {
      success: true,
      data,
      message: 'Cập nhật tài nguyên thành công!',
    };
  }

  /**
   * Admin: Delete resource
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/resources/:id')
  async deleteResource(@Param('id') id: string) {
    return this.resourceService.deleteResource(id);
  }
}
