import { AuthService } from '../auth/auth.service';
export declare class SubscriptionController {
    private readonly authService;
    constructor(authService: AuthService);
    validateSubscription(req: any): Promise<{
        success: boolean;
        data: {
            userId: string;
            email: string;
            name: string;
            subscription: {
                status: "TRIAL" | "ACTIVE" | "LIFETIME";
                plan: import(".prisma/client").$Enums.SubscriptionPlan;
                expiresAt: Date | null;
                daysRemaining: number | null;
            };
            deviceId: string;
            lastSyncAt: string;
        };
    }>;
}
