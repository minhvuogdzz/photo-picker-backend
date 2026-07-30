import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus, SubscriptionPlan, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // 1. Get Dashboard Stats
  async getDashboardStats() {
    const totalUsers = await this.prisma.user.count({ where: { role: 'USER' } });
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { status: { in: ['ACTIVE', 'LIFETIME'] } }
    });
    const totalDevices = await this.prisma.device.count();

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
  async updateSubscription(userId: string, data: { plan?: SubscriptionPlan; status?: SubscriptionStatus; addDays?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (data.plan) updateData.plan = data.plan;
    if (data.status) updateData.status = data.status;
    
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

    if (!user.subscription) {
      return this.prisma.subscription.create({
        data: {
          userId,
          ...updateData,
        }
      });
    }

    return this.prisma.subscription.update({
      where: { id: user.subscription.id },
      data: updateData,
    });
  }

  // 4. Suspend User
  async suspendUser(userId: string) {
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

    return { success: true };
  }

  // 5. Kick a specific device
  async kickDevice(deviceId: string) {
    await this.prisma.device.delete({
      where: { id: deviceId }
    });
    return { success: true };
  }

  // 6. Create User Manually
  async createUser(data: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException('Email đã tồn tại');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: 'USER',
      }
    });

    return user;
  }
}
