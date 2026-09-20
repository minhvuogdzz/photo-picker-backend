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
      where: { status: { in: ['ACTIVE', 'LIFETIME'] } }
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
  async updateSubscription(userId: string, data: { plan?: SubscriptionPlan; status?: SubscriptionStatus; addDays?: number; isPremium?: boolean }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (data.plan !== undefined) updateData.plan = data.plan;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.isPremium !== undefined) updateData.isPremium = data.isPremium;
    
    if (data.addDays) {
      let currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : new Date();
      if (currentExpiry < new Date()) {
        currentExpiry = new Date(); // If expired, start from today
      }
      
      const newExpiry = new Date(currentExpiry.getTime() + data.addDays * 24 * 60 * 60 * 1000);
      updateData.expiresAt = newExpiry;
      
      // Auto active if adding days
      if (!data.status && updateData.status !== 'LIFETIME') {
        updateData.status = 'ACTIVE';
      }
    }

    let resultSub;
    if (!user.subscription) {
      resultSub = await this.prisma.subscription.create({
        data: {
          userId,
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
        isPremium: resultSub.isPremium,
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
}
