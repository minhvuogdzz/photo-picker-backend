import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';

@Injectable()
export class LicenseService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService
  ) {}

  // Generate a random MVD-XXXX-XXXX-XXXX key
  private generateKeyString(): string {
    const segment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `MVD-${segment()}-${segment()}-${segment()}`;
  }

  // Admin: Generate new keys
  async generateKeys(count: number = 1, durationDays: number = 90) {
    const keys: {key: string, durationDays: number}[] = [];
    for (let i = 0; i < count; i++) {
      keys.push({
        key: this.generateKeyString(),
        durationDays
      });
    }

    await this.prisma.licenseKey.createMany({
      data: keys
    });

    return keys;
  }

  // Admin: Get all keys
  async getAllKeys() {
    return this.prisma.licenseKey.findMany({
      include: {
        user: {
          select: { email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // User: Activate key
  async activateKey(userId: string, keyString: string) {
    // Check if key exists and is UNUSED
    const licenseKey = await this.prisma.licenseKey.findUnique({
      where: { key: keyString }
    });

    if (!licenseKey) {
      throw new NotFoundException('Mã key không tồn tại.');
    }
    if (licenseKey.status !== 'UNUSED') {
      throw new BadRequestException('Mã key đã được sử dụng hoặc hết hạn.');
    }

    // Check if user already has an active key? Requirement says "1 key per account" but maybe it means active at a time, or they can stack?
    // "mỗi tài khoản chỉ được 1 key" -> We will just update their subscription and mark key as used by them.
    
    // Update User Subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId }
    });

    if (subscription?.status === 'LIFETIME') {
      throw new BadRequestException('Tài khoản của bạn đã là bản LIFETIME, không cần kích hoạt thêm.');
    }

    // Calculate new expiration date (adding to existing if valid)
    let currentExpiry = subscription?.expiresAt ? new Date(subscription.expiresAt) : new Date();
    if (currentExpiry < new Date()) {
      currentExpiry = new Date();
    }
    const expiresAt = new Date(currentExpiry.getTime() + licenseKey.durationDays * 24 * 60 * 60 * 1000);

    // Update LicenseKey
    await this.prisma.licenseKey.update({
      where: { id: licenseKey.id },
      data: {
        status: 'ACTIVE',
        userId,
        activatedAt: new Date(),
      }
    });


    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          plan: 'PROFESSIONAL',
          expiresAt
        }
      });
    } else {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          plan: 'PROFESSIONAL',
          expiresAt
        }
      });
    }

    return { success: true, message: 'Kích hoạt key thành công!', expiresAt };
  }

  // User: Request key via email
  async requestKey(userId: string, data: { name: string, phone: string, email: string }) {
    const adminEmail = process.env.SMTP_USER;
    if (!adminEmail) {
      throw new BadRequestException('Chưa cấu hình Email Admin');
    }

    const content = `
      Khách hàng yêu cầu mua/cấp Key mới:
      - Tên: ${data.name}
      - SĐT: ${data.phone}
      - Email: ${data.email}
      
      Vui lòng liên hệ với khách hàng để cấp key.
    `;

    await this.emailService.sendEmail(
      adminEmail,
      'YÊU CẦU CẤP KEY - PHOTO PICKER PRO',
      content
    );

    return { success: true };
  }
}
