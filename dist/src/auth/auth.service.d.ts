import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyCodeDto, RegisterDto, VerifyRegisterDto } from './dto/auth.dto';
export declare class AuthService {
    private prisma;
    private jwtService;
    private emailService;
    constructor(prisma: PrismaService, jwtService: JwtService, emailService: EmailService);
    login(dto: LoginDto): Promise<{
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
    }>;
    validateSubscription(userId: string, deviceId: string): Promise<{
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
    }>;
    logout(userId: string, deviceId: string): Promise<{
        success: boolean;
    }>;
    register(dto: RegisterDto): Promise<{
        message: string;
    }>;
    verifyRegister(dto: VerifyRegisterDto): Promise<{
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
    }>;
    private generateOTP;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyResetCode(dto: VerifyCodeDto): Promise<{
        valid: boolean;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        success: boolean;
    }>;
}
