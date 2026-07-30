import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
export declare class LicenseService {
    private prisma;
    private emailService;
    constructor(prisma: PrismaService, emailService: EmailService);
    private generateKeyString;
    generateKeys(count?: number, durationDays?: number): Promise<{
        key: string;
        durationDays: number;
    }[]>;
    getAllKeys(): Promise<({
        user: {
            email: string;
            name: string;
        } | null;
    } & {
        id: string;
        key: string;
        durationDays: number;
        status: import(".prisma/client").$Enums.KeyStatus;
        userId: string | null;
        activatedAt: Date | null;
        createdAt: Date;
    })[]>;
    activateKey(userId: string, keyString: string): Promise<{
        success: boolean;
        message: string;
        expiresAt: Date;
    }>;
    requestKey(userId: string, data: {
        name: string;
        phone: string;
        email: string;
    }): Promise<{
        success: boolean;
    }>;
}
