import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { EmailService } from './email/email.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly emailService: EmailService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
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
