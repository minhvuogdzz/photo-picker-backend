import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus, SubscriptionPlan, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SyncGateway } from '../sync/sync.gateway';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private syncGateway: SyncGateway,
    private authService: AuthService,
  ) {}

  // 1. Get Dashboard Stats
  async getDashboardStats() {
    const totalUsers = await this.prisma.user.count({ where: { role: 'USER' } });
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { status: 'ACTIVE' }
    });
    const totalDevices = await this.prisma.device.count({
      where: { user: { role: 'USER' } }
    });

    return { totalUsers, activeSubscriptions, totalDevices };
  }

  // 2. Get All Users with their subscriptions and devices
  async getAllUsers() {
    return this.prisma.user.findMany({
      where: { role: 'USER' },
      include: {
        subscription: true,
        devices: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. Extend or update subscription
  async updateSubscription(userId: string, data: { plan?: SubscriptionPlan; status?: SubscriptionStatus; addDays?: number; targetApp?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (data.plan !== undefined) updateData.plan = data.plan;
    if (data.status !== undefined) updateData.status = data.status;
    
    const targetApp = data.targetApp || 'ALL';

    if (data.addDays) {
      const existingEntitlements = user.subscription?.entitlements || [];
      const now = new Date();
      const existing = existingEntitlements.find(e => e.app === targetApp);

      let newExpiry: Date;
      if (existing && new Date(existing.expiresAt) > now) {
        newExpiry = new Date(new Date(existing.expiresAt).getTime() + data.addDays * 24 * 60 * 60 * 1000);
      } else {
        newExpiry = new Date(now.getTime() + data.addDays * 24 * 60 * 60 * 1000);
      }

      const updatedEntitlements = [
        ...existingEntitlements.filter(e => e.app !== targetApp),
        {
          app: targetApp,
          expiresAt: newExpiry,
          isTrial: false,
        }
      ];

      updateData.entitlements = updatedEntitlements;
      updateData.expiresAt = new Date(
        Math.max(...updatedEntitlements.map(e => new Date(e.expiresAt).getTime()))
      );

      // Auto active if adding days
      if (!data.status) {
        updateData.status = 'ACTIVE';
      }
    }

    let resultSub;
    if (!user.subscription) {
      resultSub = await this.prisma.subscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          plan: 'PROFESSIONAL',
          ...updateData,
        }
      });
    } else {
      resultSub = await this.prisma.subscription.update({
        where: { id: user.subscription.id },
        data: updateData,
      });
    }

    const invalidStatuses: SubscriptionStatus[] = [
      'EXPIRED',
      'INACTIVE',
      'SUSPENDED',
      'CANCELLED',
    ];

    if (invalidStatuses.includes(resultSub.status)) {
      await this.prisma.device.deleteMany({ where: { userId } });
      if (resultSub.status === 'SUSPENDED') {
        this.syncGateway.emitToUser(userId, 'accountSuspended', {});
      } else {
        this.syncGateway.emitToUser(userId, 'subscriptionExpired', {});
      }
    } else {
      this.syncGateway.emitToUser(userId, 'subscriptionUpdated', {
        status: resultSub.status,
        plan: resultSub.plan,
        entitlements: resultSub.entitlements,
        expiresAt: resultSub.expiresAt,
      });
    }

    this.authService.invalidateSubscriptionCache(userId);
    return resultSub;
  }


  // 4. Suspend User
  async suspendUser(userId: string) {
    this.authService.invalidateSubscriptionCache(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    if (!user || !user.subscription) throw new NotFoundException('Subscription not found');

    await this.prisma.subscription.update({
      where: { id: user.subscription.id },
      data: { status: 'SUSPENDED' }
    });

    // Kick all devices
    await this.prisma.device.deleteMany({
      where: { userId }
    });
    
    this.syncGateway.emitToUser(userId, 'accountSuspended', {});

    return { success: true };
  }

  // 5. Kick a specific device
  async kickDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId }
    });
    if (device) {
      this.authService.invalidateSubscriptionCache(device.userId);
      this.syncGateway.emitToUser(device.userId, 'forceLogout', { deviceId: device.deviceFingerprint });
      await this.prisma.device.delete({
        where: { id: deviceId }
      });
    }
    return { success: true };
  }

  // 6. Create User Manually
  async createUser(data: any) {
    const lowerEmail = data.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: lowerEmail } });
    if (existing) {
      throw new BadRequestException('Email đã tồn tại');
    }

    let cleanUsername = (data.username || lowerEmail.split('@')[0]).trim().toLowerCase();
    cleanUsername = cleanUsername.replace(/[^a-z0-9_.-]/g, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      cleanUsername = `user_${Date.now().toString().slice(-4)}`;
    }

    let finalUsername = cleanUsername;
    let suffix = 1;
    while (await this.prisma.user.findUnique({ where: { username: finalUsername } })) {
      finalUsername = `${cleanUsername}${suffix}`;
      suffix++;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: lowerEmail,
        username: finalUsername,
        password: hashedPassword,
        name: data.name,
        role: 'USER',
      }
    });

    return user;
  }

  // 7. Scan and warn expired/crack users
  async scanExpired() {
    const expiredUsers = await this.prisma.user.findMany({
      where: {
        role: 'USER',
        OR: [
          { subscription: null },
          { subscription: { status: { in: ['EXPIRED', 'INACTIVE', 'SUSPENDED'] } } },
        ]
      },
      select: { id: true }
    });

    for (const user of expiredUsers) {
      this.syncGateway.emitToUser(user.id, 'copyrightWarning', {
        message: 'MVD Photoshop Academy warning: Tài khoản của bạn không có bản quyền hợp lệ hoặc đã hết hạn dùng thử.'
      });
    }

    return { success: true, count: expiredUsers.length };
  }

  // 8. Notify expiring soon
  async notifyExpiring() {
    const users = await this.prisma.user.findMany({
      where: { role: 'USER', subscription: { isNot: null } },
      include: { subscription: true }
    });

    let count = 0;
    const now = new Date();

    for (const user of users) {
      const sub = user.subscription;
      if (!sub || !sub.expiresAt) continue;

      const diffTime = new Date(sub.expiresAt).getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      if (sub.status === 'TRIAL' && daysRemaining <= 3) {
        this.syncGateway.emitToUser(user.id, 'trialExpiringSoon', {
          daysRemaining,
          message: `Tài khoản của bạn sẽ hết hạn dùng thử sau ${daysRemaining} ngày nữa.`
        });
        count++;
      } else if (sub.status === 'ACTIVE' && daysRemaining <= 7) {
        this.syncGateway.emitToUser(user.id, 'activeExpiringSoon', {
          daysRemaining,
          message: `Tài khoản của bạn sẽ hết hạn sau ${daysRemaining} ngày nữa. Hãy ấn nút đổi quyền lợi để yêu cầu key kích hoạt.`
        });
        count++;
      }
    }

    return { success: true, count };
  }

  // 9. Get System Configurations
  async getSystemConfigs() {
    const configs = await this.prisma.systemConfig.findMany();
    const configMap: Record<string, string> = {
      session_duration_minutes: '10',
    };
    for (const c of configs) {
      configMap[c.key] = c.value;
    }
    return configMap;
  }

  // 10. Update System Configuration
  async updateSystemConfig(key: string, value: string, description?: string) {
    const stringValue = String(value ?? '').trim();

    // SECURITY: chặn lưu giá trị rỗng/không hợp lệ cho các khoá quan trọng.
    // Lưu rỗng `sepay_webhook_api_key` sẽ làm webhook mất xác thực; lưu rỗng thông tin
    // ngân hàng sẽ sinh mã QR sai tài khoản nhận tiền.
    const criticalKeys: Record<string, { label: string; validate?: (v: string) => boolean; hint?: string }> = {
      sepay_webhook_api_key: {
        label: 'SePay Webhook API Key',
        validate: (v) => v.length >= 16,
        hint: 'tối thiểu 16 ký tự',
      },
      bank_bin: {
        label: 'Mã BIN ngân hàng',
        validate: (v) => /^\d{6}$/.test(v),
        hint: 'đúng 6 chữ số',
      },
      bank_account_no: {
        label: 'Số tài khoản ngân hàng',
        validate: (v) => /^\d{6,20}$/.test(v),
        hint: '6-20 chữ số',
      },
      bank_account_name: {
        label: 'Tên chủ tài khoản',
        validate: (v) => v.length >= 3,
      },
      session_duration_minutes: {
        label: 'Thời lượng phiên (phút)',
        validate: (v) => /^\d+$/.test(v) && parseInt(v, 10) > 0 && parseInt(v, 10) <= 10080,
        hint: 'số nguyên từ 1 đến 10080',
      },
      support_zalo_phone: {
        label: 'Số Zalo hỗ trợ',
        // Cho phép 0/+84, dấu cách, chấm, gạch ngang — nhưng phải ra đúng 9-11 chữ số.
        validate: (v) => /^(?:\+?84|0)[0-9][\s.-]*(?:[0-9][\s.-]*){7,9}$/.test(v),
        hint: 'số điện thoại Việt Nam hợp lệ, ví dụ 0869528304',
      },
      legacy_resource_compat: {
        label: 'Chế độ tương thích app cũ (Kho Tài Nguyên)',
        validate: (v) => v === 'true' || v === 'false',
        hint: "chỉ nhận 'true' hoặc 'false'",
      },
    };

    const rule = criticalKeys[key];
    if (rule) {
      if (!stringValue) {
        throw new BadRequestException(
          `${rule.label} không được để trống. Nếu chưa muốn thay đổi, hãy giữ nguyên giá trị cũ.`,
        );
      }
      if (rule.validate && !rule.validate(stringValue)) {
        throw new BadRequestException(
          `${rule.label} không hợp lệ${rule.hint ? ` (${rule.hint})` : ''}.`,
        );
      }
    }

    const updated = await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: stringValue, description },
      update: { value: stringValue, ...(description ? { description } : {}) },
    });

    if (key === 'session_duration_minutes') {
      const minutes = parseInt(stringValue, 10) || 10;
      this.authService.setSessionDurationCache(minutes);
      this.syncGateway.server?.emit('sessionConfigUpdated', { sessionDurationMinutes: minutes });
    }

    return updated;
  }
}
