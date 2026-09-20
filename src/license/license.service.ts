import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { KeyType } from '@prisma/client';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class LicenseService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private authService: AuthService,
  ) {}

  // Generate a random MVD-XXXX-XXXX-XXXX key
  private generateKeyString(): string {
    const segment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `MVD-${segment()}-${segment()}-${segment()}`;
  }

  // Admin: Generate new keys
  async generateKeys(count: number = 1, durationDays: number = 90, keyType: KeyType = 'ORIGINAL') {
    const keys: { key: string; durationDays: number; keyType: KeyType }[] = [];
    for (let i = 0; i < count; i++) {
      keys.push({
        key: this.generateKeyString(),
        durationDays,
        keyType: keyType || 'ORIGINAL',
      });
    }

    await this.prisma.licenseKey.createMany({
      data: keys,
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
      where: { key: keyString.trim().toUpperCase() }
    });

    if (!licenseKey) {
      throw new NotFoundException('Mã key không tồn tại.');
    }
    if (licenseKey.status !== 'UNUSED') {
      throw new BadRequestException('Mã key đã được sử dụng hoặc hết hạn.');
    }

    const isPremiumKey = licenseKey.keyType === 'PREMIUM';

    // Update User Subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId }
    });

    // If user is already LIFETIME and key is ORIGINAL, warn them. But if key is PREMIUM, upgrade them to Premium!
    if (subscription?.status === 'LIFETIME' && !isPremiumKey && subscription?.isPremium) {
      throw new BadRequestException('Tài khoản của bạn đã là bản LIFETIME Premium đầy đủ.');
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

    // If existing sub is LIFETIME, preserve LIFETIME and grant isPremium
    const newStatus = subscription?.status === 'LIFETIME' ? 'LIFETIME' : 'ACTIVE';
    const newPlan = subscription?.plan || 'PROFESSIONAL';
    const grantPremium = isPremiumKey || subscription?.isPremium || false;

    if (!subscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          plan: 'PROFESSIONAL',
          isPremium: grantPremium,
          expiresAt
        }
      });
    } else {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: newStatus,
          plan: newPlan,
          isPremium: grantPremium,
          expiresAt: newStatus === 'LIFETIME' ? subscription.expiresAt : expiresAt
        }
      });
    }

    this.authService.invalidateSubscriptionCache(userId);

    return {
      success: true,
      message: isPremiumKey
        ? 'Kích hoạt thành công Key VIP Premium (Đã mở khóa Kho Tài Nguyên)!'
        : 'Kích hoạt key bản quyền thành công!',
      isPremium: grantPremium,
      expiresAt: newStatus === 'LIFETIME' ? 'LIFETIME' : expiresAt
    };
  }

  // User: Request key via email
  async requestKey(userId: string, data: { name: string; phone: string; email: string; isPremium?: boolean }) {
    const adminEmail = process.env.SMTP_USER;
    if (!adminEmail) {
      throw new BadRequestException('Chưa cấu hình Email Admin');
    }

    const packageType = data.isPremium
      ? '👑 VIP PREMIUM (Bao gồm Kho Tài Nguyên Creative & Đầy đủ tính năng)'
      : 'BẢN QUYỀN CHUẨN (Original Key)';

    const content = `
      Khách hàng gửi yêu cầu cấp Key bản quyền:
      - Họ và tên: ${data.name}
      - Số điện thoại: ${data.phone}
      - Email: ${data.email}
      - Gói yêu cầu: ${packageType}
      - User ID: ${userId}
      
      Vui lòng kiểm tra và cấp mã Key tương ứng cho khách hàng trên Admin Dashboard.
    `;

    await this.emailService.sendEmail(
      adminEmail,
      `[YÊU CẦU CẤP KEY ${data.isPremium ? 'PREMIUM' : 'CHUẨN'}] - PHOTO PICKER PRO`,
      content
    );

    return { success: true };
  }
}
