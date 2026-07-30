import { LicenseService } from './license.service';
import { GenerateKeysDto, ActivateKeyDto, RequestKeyDto } from './dto/license.dto';
export declare class LicenseController {
    private readonly licenseService;
    constructor(licenseService: LicenseService);
    generateKeys(body: GenerateKeysDto): Promise<{
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
    activateKey(req: any, body: ActivateKeyDto): Promise<{
        success: boolean;
        message: string;
        expiresAt: Date;
    }>;
    requestKey(req: any, body: RequestKeyDto): Promise<{
        success: boolean;
    }>;
}
