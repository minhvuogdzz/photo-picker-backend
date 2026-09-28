import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private authService: AuthService,
  ) {}

  // Generate a random MVD-XXXX-XXXX-XXXX key
  public generateKeyString(): string {
    const segment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `MVD-${segment()}-${segment()}-${segment()}`;
  }

  // Admin: Generate new keys
  async generateKeys(
    count: number = 1,
    durationDays: number = 30,
    targetApp: string = 'ALL',
    note?: string,
  ) {
    const keys: { key: string; durationDays: number; targetApp: string; note?: string }[] = [];
    for (let i = 0; i < count; i++) {
      keys.push({
        key: this.generateKeyString(),
        durationDays: durationDays || 30,
        targetApp: targetApp || 'ALL',
        note,
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

  /**
   * Thu hồi phần thời gian mà CHÍNH key này còn đang cấp cho chủ cũ, và trả về
   * số ms được phép chuyển sang tài khoản mới.
   *
   * Nguyên tắc: tổng thời gian trong hệ thống không đổi. Trước đây code xoá sạch
   * entitlement của chủ cũ nhưng vẫn cấp cho chủ mới đủ `durationDays` mới tính từ
   * hiện tại → chuyển key qua lại A→B→A là tạo ra thời hạn vô hạn. Ngoài ra việc
   * xoá sạch entitlement còn làm mất thời hạn do CÁC KEY KHÁC cộng vào.
   */
  private async reclaimFromPreviousOwner(
    oldUserId: string,
    targetApp: string,
    grantedMs: number,
  ): Promise<number> {
    const oldSub = await this.prisma.subscription.findUnique({
      where: { userId: oldUserId },
    });
    if (!oldSub) return 0;

    const oldEntitlements = ((oldSub.entitlements || []) as any[]).map((e) => ({
      app: e.app,
      expiresAt: new Date(e.expiresAt),
      isTrial: !!e.isTrial,
    }));

    // Chỉ xét entitlement trả phí cùng app — không bao giờ thu hồi entitlement dùng thử.
    const idx = oldEntitlements.findIndex((e) => e.app === targetApp && !e.isTrial);
    if (idx < 0) return 0;

    const now = Date.now();
    const oldExpiryMs = oldEntitlements[idx].expiresAt.getTime();

    // Thời gian còn chuyển được = phần chưa dùng, nhưng không vượt quá thời hạn của key.
    const carryOverMs = Math.max(0, Math.min(grantedMs, oldExpiryMs - now));
    if (carryOverMs <= 0) return 0;

    const reducedExpiryMs = oldExpiryMs - carryOverMs;
    const nextEntitlements = [...oldEntitlements];
    if (reducedExpiryMs <= now) {
      nextEntitlements.splice(idx, 1);
    } else {
      nextEntitlements[idx] = {
        ...nextEntitlements[idx],
        expiresAt: new Date(reducedExpiryMs),
      };
    }

    const hasPaid = nextEntitlements.some((e) => !e.isTrial && e.expiresAt.getTime() > now);
    const hasTrial = nextEntitlements.some((e) => e.isTrial && e.expiresAt.getTime() > now);
    const newMaxExpiry =
      nextEntitlements.length > 0
        ? new Date(Math.max(...nextEntitlements.map((e) => e.expiresAt.getTime())))
        : new Date(now);

    await this.prisma.subscription.update({
      where: { id: oldSub.id },
      data: {
        entitlements: nextEntitlements,
        expiresAt: newMaxExpiry,
        status: hasPaid ? 'ACTIVE' : hasTrial ? 'TRIAL' : 'EXPIRED',
      },
    });
    this.authService.invalidateSubscriptionCache(oldUserId);

    return carryOverMs;
  }

  /** Cộng thời hạn vào tài khoản (cộng dồn nếu entitlement cùng app còn hiệu lực). */
  private async grantEntitlement(userId: string, targetApp: string, grantMs: number) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    const now = new Date();

    if (!subscription) {
      const initialExpires = new Date(now.getTime() + grantMs);
      await this.prisma.subscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          plan: 'PROFESSIONAL',
          expiresAt: initialExpires,
          entitlements: [
            {
              app: targetApp,
              expiresAt: initialExpires,
              isTrial: false,
            },
          ],
        },
      });
      return;
    }

    const existingEntitlements = subscription.entitlements || [];
    const existing = existingEntitlements.find((e) => e.app === targetApp && !e.isTrial);

    const baseMs =
      existing && new Date(existing.expiresAt) > now
        ? new Date(existing.expiresAt).getTime()
        : now.getTime();
    const newExpiresAt = new Date(baseMs + grantMs);

    const updatedEntitlements = [
      // Giữ nguyên entitlement dùng thử của app này (nếu có) để không mất quyền trial.
      ...existingEntitlements.filter((e) => !(e.app === targetApp && !e.isTrial)),
      {
        app: targetApp,
        expiresAt: newExpiresAt,
        isTrial: false,
      },
    ];

    const maxExpiresAt = new Date(
      Math.max(...updatedEntitlements.map((e) => new Date(e.expiresAt).getTime())),
    );

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        plan: 'PROFESSIONAL',
        entitlements: updatedEntitlements,
        expiresAt: maxExpiresAt,
      },
    });
  }

  // User: Activate key
  async activateKey(userId: string, keyString: string) {
    const cleanKey = keyString.trim().toUpperCase();
    const licenseKey = await this.prisma.licenseKey.findUnique({
      where: { key: cleanKey }
    });

    if (!licenseKey) {
      throw new NotFoundException('Mã key không tồn tại.');
    }

    const targetApp = licenseKey.targetApp || 'ALL';
    const durationDays = licenseKey.durationDays || 30;
    const appLabel = targetApp === 'ALL' ? 'Toàn bộ Super App' : `Ứng dụng ${targetApp}`;
    const grantedMs = durationDays * 86400000;

    if (licenseKey.status === 'EXPIRED') {
      throw new BadRequestException('Mã key này đã hết hạn sử dụng.');
    }

    // Số thời gian thực sự sẽ cấp cho tài khoản này.
    let effectiveMs = grantedMs;

    if (licenseKey.status === 'ACTIVE') {
      // 1. Key đã kích hoạt trên CHÍNH tài khoản này → coi như resync thành công,
      // KHÔNG cộng thêm thời hạn.
      if (licenseKey.userId === userId) {
        this.authService.invalidateSubscriptionCache(userId);
        return {
          success: true,
          message: `Mã key này đã được kích hoạt thành công vào tài khoản của bạn (${appLabel})!`,
          targetApp,
          durationDays,
        };
      }

      if (!licenseKey.userId) {
        throw new BadRequestException('Mã key đã được sử dụng hoặc không hợp lệ.');
      }

      // 2. Key đang thuộc tài khoản khác → CHUYỂN key sang tài khoản này.
      const oldUserId = licenseKey.userId;

      // CLAIM ATOMIC: chỉ một request duy nhất chuyển được key khỏi chủ cũ.
      const transferClaim = await this.prisma.licenseKey.updateMany({
        where: { id: licenseKey.id, status: 'ACTIVE', userId: oldUserId },
        data: { status: 'ACTIVE', userId, activatedAt: new Date() },
      });
      if (transferClaim.count === 0) {
        throw new BadRequestException('Mã key đang được xử lý ở nơi khác, vui lòng thử lại.');
      }

      effectiveMs = await this.reclaimFromPreviousOwner(oldUserId, targetApp, grantedMs);

      if (effectiveMs <= 0) {
        // Key đã dùng hết thời hạn ở tài khoản trước → khoá vĩnh viễn, không thể
        // dùng vòng lặp chuyển qua lại để tạo thời hạn mới.
        await this.prisma.licenseKey.update({
          where: { id: licenseKey.id },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException(
          'Mã key này đã dùng hết thời hạn ở tài khoản trước đó nên không thể chuyển sang tài khoản mới.',
        );
      }
    } else if (licenseKey.status === 'UNUSED') {
      // CLAIM ATOMIC: hai request cùng lúc với một key thì chỉ một request thành công.
      const claim = await this.prisma.licenseKey.updateMany({
        where: { id: licenseKey.id, status: 'UNUSED' },
        data: { status: 'ACTIVE', userId, activatedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Mã key đã được sử dụng hoặc không hợp lệ.');
      }
    } else {
      throw new BadRequestException('Mã key đã được sử dụng hoặc không hợp lệ.');
    }

    try {
      await this.grantEntitlement(userId, targetApp, effectiveMs);
    } catch (err) {
      this.logger.error(
        `[License] CRITICAL: key ${cleanKey} đã gán cho user ${userId} nhưng KHÔNG cộng được thời hạn (${effectiveMs}ms). Cần admin xử lý thủ công.`,
        err as Error,
      );
      throw err;
    }

    this.authService.invalidateSubscriptionCache(userId);

    const effectiveDays = Math.max(1, Math.round(effectiveMs / 86400000));

    return {
      success: true,
      message: `Kích hoạt thành công gói ${appLabel} (+${effectiveDays} ngày)!`,
      targetApp,
      durationDays: effectiveDays,
    };
  }

  // User: Request key via email (fallback)
  async requestKey(userId: string, data: { name: string; phone: string; email: string; targetApp?: string }) {
    const adminEmail = process.env.SMTP_USER;
    if (!adminEmail) {
      throw new BadRequestException('Chưa cấu hình Email Admin');
    }

    const packageType = data.targetApp === 'ALL'
      ? 'HỆ SINH THÁI SUPER APP (Đầy đủ mọi tính năng)'
      : `ỨNG DỤNG ${data.targetApp || 'PHOTO PICKER PRO'}`;

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
      `[YÊU CẦU CẤP KEY ${packageType}] - PHOTO PICKER PRO`,
      content
    );

    return { success: true };
  }
}
