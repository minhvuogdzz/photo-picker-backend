import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // You can change this to any SMTP provider
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, // Use App Password for Gmail
      },
    });
  }

  async sendVerificationCode(to: string, code: string) {
    const mailOptions = {
      from: `"Photo Picker Pro" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Mã xác nhận quên mật khẩu',
      text: `Mã xác nhận của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Khôi phục mật khẩu</h2>
          <p>Mã xác nhận của bạn là:</p>
          <h1 style="color: #4F46E5; letter-spacing: 5px;">${code}</h1>
          <p>Mã này có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Lỗi khi gửi email:', error);
      return false;
    }
  }
  async sendEmail(to: string, subject: string, content: string) {
    const mailOptions = {
      from: `"Photo Picker Pro" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: content,
    };
    try {
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Lỗi khi gửi email:', error);
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
