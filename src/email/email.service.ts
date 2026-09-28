import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface EmailConfig {
  provider: 'resend' | 'brevo' | 'smtp';
  resendApiKey: string;
  brevoApiKey: string;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Lấy cấu hình email: ưu tiên đọc từ SystemConfig trong Database (do Admin thiết lập),
   * nếu chưa có thì rơi về biến môi trường process.env.
   */
  async getEmailConfig(): Promise<EmailConfig> {
    let configs: { key: string; value: string }[] = [];
    try {
      configs = await this.prisma.systemConfig.findMany({
        where: {
          key: {
            in: [
              'email_provider',
              'resend_api_key',
              'brevo_api_key',
              'smtp_user',
              'smtp_pass',
              'email_from_address',
              'email_from_name',
            ],
          },
        },
      });
    } catch (err) {
      this.logger.warn('Failed to read email config from DB, falling back to ENV', err);
    }

    const map = new Map(configs.map((c) => [c.key, (c.value || '').trim()]));

    const resendApiKey = map.get('resend_api_key') || (process.env.RESEND_API_KEY || '').trim();
    const brevoApiKey = map.get('brevo_api_key') || (process.env.BREVO_API_KEY || '').trim();
    const smtpUser = map.get('smtp_user') || (process.env.SMTP_USER || '').trim();
    const smtpPass = map.get('smtp_pass') || (process.env.SMTP_PASS || '').trim();
    const fromEmail = map.get('email_from_address') || (process.env.EMAIL_FROM || '').trim();
    const fromName = map.get('email_from_name') || 'MVD Academy';

    let provider = (map.get('email_provider') || 'auto').toLowerCase();
    if (provider === 'auto') {
      if (resendApiKey) provider = 'resend';
      else if (brevoApiKey) provider = 'brevo';
      else provider = 'smtp';
    }

    return {
      provider: provider as 'resend' | 'brevo' | 'smtp',
      resendApiKey,
      brevoApiKey,
      smtpUser,
      smtpPass,
      fromEmail,
      fromName,
    };
  }

  /**
   * Gửi qua Resend HTTP API (Port 443 HTTPS - không bao giờ bị chặn trên Render)
   */
  private async sendViaResend(
    apiKey: string,
    fromEmail: string,
    fromName: string,
    to: string,
    subject: string,
    text?: string,
    html?: string,
  ): Promise<boolean> {
    let from = `"${fromName}" <onboarding@resend.dev>`;
    let replyTo: string[] | undefined = undefined;

    const lowerFrom = (fromEmail || '').toLowerCase();
    const isPublicEmail =
      lowerFrom.includes('@gmail.com') ||
      lowerFrom.includes('@yahoo.') ||
      lowerFrom.includes('@hotmail.') ||
      lowerFrom.includes('@outlook.');

    if (fromEmail && !isPublicEmail) {
      from = fromEmail.includes('<') ? fromEmail : `"${fromName}" <${fromEmail}>`;
    } else if (fromEmail && isPublicEmail) {
      // Resend không cho gửi từ @gmail.com nếu chưa verify domain, tự động dùng onboarding@resend.dev và set reply_to
      const cleanEmail = fromEmail.replace(/.*<([^>]+)>.*/, '$1').trim();
      replyTo = [cleanEmail];
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: replyTo,
          subject,
          text: text || undefined,
          html: html || (text ? `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${text}</div>` : undefined),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`[Resend] Lỗi gửi mail tới ${to}: ${JSON.stringify(data)}`);
        return false;
      }
      this.logger.log(`[Resend] Gửi thành công tới ${to}, ID: ${(data as any)?.id}`);
      return true;
    } catch (err) {
      this.logger.error(`[Resend] Lỗi kết nối tới Resend API:`, err);
      return false;
    }
  }

  /**
   * Gửi qua Brevo (Sendinblue) HTTP API (Port 443 HTTPS - hỗ trợ gửi từ Gmail)
   */
  private async sendViaBrevo(
    apiKey: string,
    fromEmail: string,
    fromName: string,
    to: string,
    subject: string,
    text?: string,
    html?: string,
  ): Promise<boolean> {
    const senderEmail = fromEmail.includes('<')
      ? fromEmail.replace(/.*<([^>]+)>.*/, '$1')
      : (fromEmail || 'ougvn.it2@gmail.com');

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: fromName, email: senderEmail },
          to: [{ email: to }],
          subject,
          textContent: text || undefined,
          htmlContent: html || (text ? `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${text}</div>` : undefined),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`[Brevo] Lỗi gửi mail tới ${to}: ${JSON.stringify(data)}`);
        return false;
      }
      this.logger.log(`[Brevo] Gửi thành công tới ${to}, MessageID: ${(data as any)?.messageId}`);
      return true;
    } catch (err) {
      this.logger.error(`[Brevo] Lỗi kết nối tới Brevo API:`, err);
      return false;
    }
  }

  /**
   * Gửi qua SMTP truyền thống (Gmail) — dùng khi chạy local hoặc server mở cổng 465/587
   */
  private async sendViaSmtp(
    smtpUser: string,
    smtpPass: string,
    fromName: string,
    to: string,
    subject: string,
    text?: string,
    html?: string,
    attachments?: any[],
  ): Promise<boolean> {
    if (!smtpUser || !smtpPass) {
      this.logger.error('[SMTP] Chưa cấu hình SMTP_USER hoặc SMTP_PASS');
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName}" <${smtpUser}>`,
      to,
      subject,
      text,
      html,
      attachments,
    };

    try {
      const info = await Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 10000)),
      ]) as any;
      this.logger.log(`[SMTP] Gửi thành công tới ${to}, MessageID: ${info?.messageId}`);
      return true;
    } catch (err) {
      this.logger.error(`[SMTP] Lỗi khi gửi email tới ${to}:`, err);
      return false;
    }
  }

  /**
   * Bộ điều phối gửi mail trung tâm: Tự động chọn HTTP API (Resend / Brevo) hoặc SMTP
   */
  private async dispatchSend(
    to: string,
    subject: string,
    text?: string,
    html?: string,
    attachments?: any[],
  ): Promise<{ success: boolean; provider: string; error?: string }> {
    const config = await this.getEmailConfig();

    if (config.provider === 'resend') {
      if (!config.resendApiKey) {
        return { success: false, provider: 'resend', error: 'Chưa cấu hình Resend API Key.' };
      }
      const ok = await this.sendViaResend(
        config.resendApiKey,
        config.fromEmail,
        config.fromName,
        to,
        subject,
        text,
        html,
      );
      return { success: ok, provider: 'resend', error: ok ? undefined : 'Resend API từ chối gửi thư.' };
    }

    if (config.provider === 'brevo') {
      if (!config.brevoApiKey) {
        return { success: false, provider: 'brevo', error: 'Chưa cấu hình Brevo API Key.' };
      }
      const ok = await this.sendViaBrevo(
        config.brevoApiKey,
        config.fromEmail,
        config.fromName,
        to,
        subject,
        text,
        html,
      );
      return { success: ok, provider: 'brevo', error: ok ? undefined : 'Brevo API từ chối gửi thư.' };
    }

    // SMTP
    const ok = await this.sendViaSmtp(
      config.smtpUser,
      config.smtpPass,
      config.fromName,
      to,
      subject,
      text,
      html,
      attachments,
    );
    return {
      success: ok,
      provider: 'smtp',
      error: ok ? undefined : 'Gửi qua SMTP thất bại (máy chủ Render Free chặn cổng SMTP 465/587).',
    };
  }

  async sendVerificationCode(to: string, code: string): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Xác nhận tài khoản Photo Picker Pro</h2>
        <p>Mã xác nhận của bạn là:</p>
        <h1 style="color: #4F46E5; letter-spacing: 5px;">${code}</h1>
        <p>Mã này có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
      </div>
    `;
    const res = await this.dispatchSend(
      to,
      'Mã xác nhận tài khoản Photo Picker Pro',
      `Mã xác nhận của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`,
      html,
    );
    return res.success;
  }

  async sendEmail(to: string, subject: string, content: string): Promise<boolean> {
    const res = await this.dispatchSend(to, subject, content);
    return res.success;
  }

  async sendHtmlEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<boolean> {
    const res = await this.dispatchSend(to, subject, undefined, html, attachments);
    return res.success;
  }

  async testEmail(to: string): Promise<{ success: boolean; message: string; provider: string }> {
    const config = await this.getEmailConfig();
    const providerName = config.provider.toUpperCase();

    const res = await this.dispatchSend(
      to,
      '[MVD ACADEMY] Thử nghiệm gửi Email thành công',
      `Chúc mừng! Cấu hình gửi email của bạn đã hoạt động chính xác qua dịch vụ ${providerName} lúc ${new Date().toLocaleString('vi-VN')}.`,
      `<div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #10B981; border-radius: 8px; max-width: 500px;">
        <h2 style="color: #10B981; margin-top: 0;">🎉 Gửi Email Thử Nghiệm Thành Công!</h2>
        <p>Hệ thống MVD Academy đã kết nối thành công với cổng gửi mail.</p>
        <p><strong>Dịch vụ sử dụng:</strong> ${providerName}</p>
        <p><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN')}</p>
        <p><strong>Người nhận:</strong> ${to}</p>
      </div>`,
    );

    return {
      success: res.success,
      message: res.success
        ? `Gửi email thử nghiệm thành công qua ${res.provider.toUpperCase()}!`
        : `Gửi thất bại qua ${res.provider.toUpperCase()}: ${res.error || 'Vui lòng kiểm tra lại cấu hình'}`,
      provider: res.provider,
    };
  }
}
