import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

export interface EmailConfig {
  provider: 'resend' | 'brevo' | 'smtp' | 'auto';
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
    const fromName = map.get('email_from_name') || 'MVD Tech & Design Studio';

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
      if (ok) return { success: true, provider: 'resend' };

      // Fallback nếu Resend thất bại (do chưa verify domain hoặc bị hạn chế)
      if (config.brevoApiKey) {
        this.logger.warn(`[Resend] Gửi thất bại tới ${to}, đang tự động chuyển hướng qua Brevo...`);
        const brevoOk = await this.sendViaBrevo(config.brevoApiKey, config.fromEmail, config.fromName, to, subject, text, html);
        if (brevoOk) return { success: true, provider: 'brevo' };
      }
      return { success: false, provider: 'resend', error: 'Resend API từ chối gửi thư (chưa xác minh tên miền trên resend.com/domains).' };
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
      if (ok) return { success: true, provider: 'brevo' };

      // Fallback qua Resend
      if (config.resendApiKey) {
        this.logger.warn(`[Brevo] Gửi thất bại tới ${to}, đang tự động chuyển hướng qua Resend...`);
        const resendOk = await this.sendViaResend(config.resendApiKey, config.fromEmail, config.fromName, to, subject, text, html);
        if (resendOk) return { success: true, provider: 'resend' };
      }
      return { success: false, provider: 'brevo', error: 'Brevo API từ chối gửi thư.' };
    }

    // Provider auto: Ưu tiên Brevo -> Resend -> SMTP
    if (config.provider === 'auto') {
      if (config.brevoApiKey) {
        const ok = await this.sendViaBrevo(config.brevoApiKey, config.fromEmail, config.fromName, to, subject, text, html);
        if (ok) return { success: true, provider: 'brevo' };
      }
      if (config.resendApiKey) {
        const ok = await this.sendViaResend(config.resendApiKey, config.fromEmail, config.fromName, to, subject, text, html);
        if (ok) return { success: true, provider: 'resend' };
      }
      if (config.smtpUser && config.smtpPass) {
        const ok = await this.sendViaSmtp(config.smtpUser, config.smtpPass, config.fromName, to, subject, text, html, attachments);
        if (ok) return { success: true, provider: 'smtp' };
      }
      return { success: false, provider: 'auto', error: 'Tất cả các cổng gửi email đều thất bại.' };
    }

    // SMTP truyền thống
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
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; max-width: 500px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="display: inline-block; padding: 6px 14px; background: #0f172a; border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 700; margin-bottom: 16px;">
          MVD TECH & DESIGN STUDIO
        </div>
        <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">Xác nhận tài khoản của bạn</h2>
        <p style="color: #475569; font-size: 14px;">Mã xác thực OTP của bạn là:</p>
        <div style="background: #f1f5f9; padding: 14px 20px; border-radius: 8px; text-align: center; margin: 16px 0;">
          <span style="font-family: monospace; font-size: 26px; font-weight: 800; color: #0284c7; letter-spacing: 6px;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">Mã này có hiệu lực trong 10 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
      </div>
    `;
    const res = await this.dispatchSend(
      to,
      'Mã xác nhận tài khoản MVD Tech & Design Studio',
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
      '[MVD TECH & DESIGN STUDIO] Thử nghiệm gửi Email thành công',
      `Chúc mừng! Cấu hình gửi email của bạn đã hoạt động chính xác qua dịch vụ ${providerName} lúc ${new Date().toLocaleString('vi-VN')}.`,
      `<div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #10B981; border-radius: 8px; max-width: 500px;">
        <h2 style="color: #10B981; margin-top: 0;">🎉 Gửi Email Thử Nghiệm Thành Công!</h2>
        <p>Hệ thống MVD Tech & Design Studio đã kết nối thành công với cổng gửi mail.</p>
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
