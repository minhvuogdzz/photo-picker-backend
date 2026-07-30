import { AuthService } from './auth.service';
import { LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyCodeDto, RegisterDto, VerifyRegisterDto } from './dto/auth.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<{
        success: boolean;
        data: {
            accessToken: string;
            refreshToken: string;
            userId: string;
            email: string;
            name: string;
            subscription: {
                status: import(".prisma/client").$Enums.SubscriptionStatus;
                plan: import(".prisma/client").$Enums.SubscriptionPlan;
                expiresAt: Date | null;
                daysRemaining: number | null;
            };
            deviceId: string;
            lastSyncAt: string;
        };
    }>;
    register(dto: RegisterDto): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    verifyRegister(dto: VerifyRegisterDto): Promise<{
        success: boolean;
        data: {
            accessToken: string;
            refreshToken: string;
            userId: string;
            email: string;
            name: string;
            subscription: {
                status: import(".prisma/client").$Enums.SubscriptionStatus;
                plan: import(".prisma/client").$Enums.SubscriptionPlan;
                expiresAt: Date | null;
                daysRemaining: number | null;
            };
            deviceId: string;
            lastSyncAt: string;
        };
    }>;
    logout(req: any): Promise<{
        success: boolean;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        success: boolean;
        data: {
            success: boolean;
            message: string;
        };
    }>;
    verifyResetCode(dto: VerifyCodeDto): Promise<{
        success: boolean;
        data: {
            valid: boolean;
        };
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        success: boolean;
        data: {
            success: boolean;
        };
    }>;
}
