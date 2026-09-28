import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<boolean> {
    const user = (process.env.SMTP_USER || '').trim();
    const mailOptions = {
      from: `"MVD Academy" <${user}>`,
      to,
      subject: 'Mã xác nhận tài khoản Photo Picker Pro',
      text: `Mã xác nhận của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Xác nhận tài khoản Photo Picker Pro</h2>
          <p>Mã xác nhận của bạn là:</p>
          <h1 style="color: #4F46E5; letter-spacing: 5px;">${code}</h1>
          <p>Mã này có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
        </div>
      `,
    };

    try {
      await Promise.race([
        this.transporter.sendMail(mailOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 10000)),
      ]);
      return true;
    } catch (error) {
      console.error('[EmailService] Lỗi khi gửi verification code:', error);
      return false;
    }
  }

  async sendEmail(to: string, subject: string, content: string): Promise<boolean> {
    const user = (process.env.SMTP_USER || '').trim();
    const mailOptions = {
      from: `"MVD Academy" <${user}>`,
      to,
      subject,
      text: content,
    };
    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`[EmailService] Email sent successfully to ${to}, messageId: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Lỗi khi gửi email:', error);
      return false;
    }
  }

  async sendHtmlEmail(to: string, subject: string, html: string, attachments?: any[]) {
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Photo Picker Pro" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    };
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }
    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Lỗi khi gửi email HTML:', error);
      return false;
    }
  }
}
