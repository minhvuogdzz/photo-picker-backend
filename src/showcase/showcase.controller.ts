import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Header,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ShowcaseService } from './showcase.service';
import { UpdateShowcaseDto, UpdateShowcaseAlbumDto } from './dto/showcase.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class ShowcaseController {
  constructor(private readonly showcaseService: ShowcaseService) {}

  /**
   * Public endpoint for Client App (LoginPage) to fetch active slider photos
   * Uses Edge CDN caching with stale-while-revalidate so images load instantly from edge cache
   * while keeping origin load minimal.
   */
  @Get('showcase')
  @Header(
    'Cache-Control',
    'public, max-age=15, s-maxage=60, stale-while-revalidate=120',
  )
  async getActiveShowcase() {
    const data = await this.showcaseService.getActiveShowcase();
    return { success: true, data };
  }

  // ================= ALBUM SHOWCASE MANAGEMENT =================

  /**
   * Admin: Get all showcase albums (including hidden ones)
   */
  @UseGuards(JwtAuthGuard)
  @Get('admin/showcase/albums')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getAllAlbums() {
    const data = await this.showcaseService.getAllAlbums();
    return { success: true, data };
  }

  /**
   * Admin: Create a new Showcase Album with up to 20 compressed images.
   */
  @UseGuards(JwtAuthGuard)
  @Post('admin/showcase/albums')
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      limits: { files: 20, fileSize: Math.floor(1.5 * 1024 * 1024) - 1 },
    }),
  )
  async createAlbum(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('title') title: string,
    @Body('order') order?: number,
    @Body('isActive') isActive?: string | boolean,
    @Body('description') description?: string,
  ) {
    const activeBool =
      typeof isActive === 'string' ? isActive !== 'false' : isActive !== false;
    const data = await this.showcaseService.createAlbum(
      title,
      files,
      order ? Number(order) : 0,
      activeBool,
      description,
    );
    return {
      success: true,
      data,
      message: `Đã tạo bộ ảnh "${data.title}" với ${data.images.length} ảnh thành công!`,
    };
  }

  /**
   * Admin: Update Showcase Album title, order, or visibility (isActive)
   */
  @UseGuards(JwtAuthGuard)
  @Patch('admin/showcase/albums/:id')
  async updateAlbum(
    @Param('id') id: string,
    @Body() dto: UpdateShowcaseAlbumDto,
  ) {
    const data = await this.showcaseService.updateAlbum(id, dto);
    return { success: true, data, message: 'Cập nhật bộ ảnh thành công!' };
  }

  /**
   * Admin: Delete entire Showcase Album from Cloudinary & DB
   */
  @UseGuards(JwtAuthGuard)
  @Delete('admin/showcase/albums/:id')
  async deleteAlbum(@Param('id') id: string) {
    const result = await this.showcaseService.deleteAlbum(id);
    return result;
  }

  // ================= LEGACY ENDPOINTS =================

  /**
   * Admin: Get all showcase photos (including hidden ones)
   */
  @UseGuards(JwtAuthGuard)
  @Get('admin/showcase')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getAllShowcase() {
    const data = await this.showcaseService.getAllShowcase();
    return { success: true, data };
  }

  /**
   * Admin: Upload multiple photos to Cloudinary and add to Showcase album
   * Supports up to 20 compressed files at once, under 1.5MB each.
   */
  @UseGuards(JwtAuthGuard)
  @Post('admin/showcase/upload')
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      limits: { files: 20, fileSize: Math.floor(1.5 * 1024 * 1024) - 1 },
    }),
  )
  async uploadShowcase(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('title') title?: string,
    @Body('order') order?: number,
  ) {
    const data = await this.showcaseService.uploadMultipleShowcaseImages(
      files,
      title,
      order,
    );
    return {
      success: true,
      data,
      count: data.length,
      message: `Đã upload thành công ${data.length} ảnh lên Cloudinary!`,
    };
  }

  /**
   * Admin: Update title, order or visibility
   */
  @UseGuards(JwtAuthGuard)
  @Patch('admin/showcase/:id')
  async updateShowcase(
    @Param('id') id: string,
    @Body() dto: UpdateShowcaseDto,
  ) {
    const data = await this.showcaseService.updateShowcaseImage(id, dto);
    return { success: true, data, message: 'Cập nhật thành công!' };
  }

  /**
   * Admin: Delete photo from Cloudinary & DB
   */
  @UseGuards(JwtAuthGuard)
  @Delete('admin/showcase/:id')
  async deleteShowcase(@Param('id') id: string) {
    const result = await this.showcaseService.deleteShowcaseImage(id);
    return result;
  }
}
