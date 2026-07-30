import { AdminService } from './admin.service';
import { CreateUserDto, UpdateSubscriptionDto } from './dto/admin.dto';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
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
            userId: string;
            deviceFingerprint: string;
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
    createUser(body: CreateUserDto): Promise<{
        id: string;
        email: string;
        password: string;
        name: string;
        role: import(".prisma/client").$Enums.Role;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateSubscription(userId: string, body: UpdateSubscriptionDto): Promise<{
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
}
