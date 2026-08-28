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
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ResourceService } from './resource.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';


@Controller()
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

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
   * Client / Direct Download: Stream direct file or redirect to Google Drive link
   */
  @Get('resources/:id/download')
  async downloadResource(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
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
  @UseGuards(JwtAuthGuard)
  @Get('admin/resources')
  async getAllAdminResources() {
    const data = await this.resourceService.getAllAdminResources();
    return { success: true, data };
  }

  /**
   * Admin: Create new resource with file or Google Drive
   */
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @Delete('admin/resources/:id')
  async deleteResource(@Param('id') id: string) {
    return this.resourceService.deleteResource(id);
  }
}
