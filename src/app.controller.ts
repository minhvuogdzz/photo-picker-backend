import { Controller, Get, Post, Body, Header, Query, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { EmailService } from './email/email.service';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './auth/auth.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('config/public')
  @Header('Cache-Control', 'public, max-age=60')
  async getPublicConfig() {
    const sessionDurationMinutes = await this.authService.getSessionDurationMinutes();

    // Fetch public configurations from SystemConfig (admin-configurable)
    let companyWebsiteUrl = '';
    const launcherBanner = {
      badge: '',
      title: '',
      subtitle: '',
    };

    try {
      const configs = await this.prisma.systemConfig.findMany({
        where: {
          key: {
            in: [
              'company_website_url',
              'launcher_banner_badge',
              'launcher_banner_title',
              'launcher_banner_subtitle',
            ],
          },
        },
      });
      for (const cfg of configs) {
        if (cfg.key === 'company_website_url') companyWebsiteUrl = cfg.value;
        if (cfg.key === 'launcher_banner_badge') launcherBanner.badge = cfg.value;
        if (cfg.key === 'launcher_banner_title') launcherBanner.title = cfg.value;
        if (cfg.key === 'launcher_banner_subtitle') launcherBanner.subtitle = cfg.value;
      }
    } catch {
      // Silently ignore if SystemConfig table doesn't exist yet
    }

    return {
      sessionDurationMinutes,
      companyWebsiteUrl,
      launcherBanner,
    };
  }

  /**
   * Health Check Endpoint
   * 
   * Behavior reality on Vercel Serverless:
   * - Warm container (Liveness): GET /health -> Instant response (~5-15ms), 0 database queries,
   *   0 network hops, minimal CPU.
   * - Cold start: Serverless function still bootstraps NestJS AppModule and PrismaClient.
   * - Readiness: GET /health?readiness=true -> Verifies database ping with a 2-second timeout.
   *   Returns HTTP 503 if database is disconnected/unreachable.
   */
  @Get('health')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  async getHealth(
    @Query('readiness') readiness?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    const isReadiness = readiness === 'true';
    const timestamp = new Date().toISOString();
    const version = process.env.npm_package_version || '2.0.3';

    if (isReadiness) {
      try {
        await Promise.race([
          this.prisma.$runCommandRaw({ ping: 1 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), 2000)),
        ]);
        return {
          status: 'ok',
          service: 'photo-picker-backend',
          timestamp,
          version,
          database: 'connected',
        };
      } catch {
        if (res?.status) {
          res.status(503);
        }
        return {
          status: 'degraded',
          service: 'photo-picker-backend',
          timestamp,
          version,
          database: 'disconnected',
        };
      }
    }

    return {
      status: 'ok',
      service: 'photo-picker-backend',
      timestamp,
      version,
    };
  }

  @Post('feedback')
  async submitFeedback(@Body() body: { name?: string, phone?: string, content: string, imageBase64?: string }) {
    let htmlContent = `
      <h3>Báo cáo lỗi / Phản hồi từ người dùng</h3>
      <p><strong>Họ tên:</strong> ${body.name || 'Không cung cấp'}</p>
      <p><strong>Số điện thoại:</strong> ${body.phone || 'Không cung cấp'}</p>
      <p><strong>Nội dung:</strong><br/>${body.content.replace(/\n/g, '<br/>')}</p>
    `;

    let attachments: any[] = [];

    if (body.imageBase64) {
      // Create a CID for the image to embed it properly in Gmail
      htmlContent += `<br/><h4>Ảnh đính kèm:</h4><img src="cid:feedback-image" style="max-width: 100%; border: 1px solid #ccc;" />`;
      
      // Parse base64 string (e.g., "data:image/jpeg;base64,/9j/4AAQ...")
      const matches = body.imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        attachments.push({
          filename: 'attachment.jpg',
          content: matches[2],
          encoding: 'base64',
          cid: 'feedback-image'
        });
      }
    }

    const success = await this.emailService.sendHtmlEmail(
      'ougvn.it2@gmail.com',
      `Phản hồi hệ thống từ ${body.name || body.phone || 'Người dùng'}`,
      htmlContent,
      attachments
    );

    if (success) {
      return { success: true, message: 'Phản hồi đã được gửi.' };
    } else {
      return { success: false, message: 'Gặp lỗi khi gửi phản hồi. Vui lòng thử lại sau.' };
    }
  }
}
