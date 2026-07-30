import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus, SubscriptionPlan } from '@prisma/client';
export declare class AdminService {
    private prisma;
    constructor(prisma: PrismaService);
    getDashboardStats(): Promise<{
        totalUsers: number;
        activeSubscriptions: number;
        totalDevices: number;
    }>;
    getAllUsers(): Promise<({
        subscription: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.SubscriptionStatus;
            plan: import(".prisma/client").$Enums.SubscriptionPlan;
            expiresAt: Date | null;
            userId: string;
        } | null;
        devices: {
            id: string;
            createdAt: Date;
            deviceFingerprint: string;
            userId: string;
            lastActiveAt: Date;
        }[];
    } & {
        id: string;
        email: string;
        password: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    updateSubscription(userId: string, data: {
        plan?: SubscriptionPlan;
        status?: SubscriptionStatus;
        addDays?: number;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import(".prisma/client").$Enums.SubscriptionStatus;
        plan: import(".prisma/client").$Enums.SubscriptionPlan;
        expiresAt: Date | null;
        userId: string;
    }>;
    suspendUser(userId: string): Promise<{
        success: boolean;
    }>;
    kickDevice(deviceId: string): Promise<{
        success: boolean;
    }>;
    createUser(data: any): Promise<{
        id: string;
        email: string;
        password: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
