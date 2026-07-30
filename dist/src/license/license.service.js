"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const email_service_1 = require("../email/email.service");
const crypto = __importStar(require("crypto"));
let LicenseService = class LicenseService {
    prisma;
    emailService;
    constructor(prisma, emailService) {
        this.prisma = prisma;
        this.emailService = emailService;
    }
    generateKeyString() {
        const segment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
        return `MVD-${segment()}-${segment()}-${segment()}`;
    }
    async generateKeys(count = 1, durationDays = 90) {
        const keys = [];
        for (let i = 0; i < count; i++) {
            keys.push({
                key: this.generateKeyString(),
                durationDays
            });
        }
        await this.prisma.licenseKey.createMany({
            data: keys
        });
        return keys;
    }
    async getAllKeys() {
        return this.prisma.licenseKey.findMany({
            include: {
                user: {
                    select: { email: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }
    async activateKey(userId, keyString) {
        const licenseKey = await this.prisma.licenseKey.findUnique({
            where: { key: keyString }
        });
        if (!licenseKey) {
            throw new common_1.NotFoundException('Mã key không tồn tại.');
        }
        if (licenseKey.status !== 'UNUSED') {
            throw new common_1.BadRequestException('Mã key đã được sử dụng hoặc hết hạn.');
        }
        const subscription = await this.prisma.subscription.findUnique({
            where: { userId }
        });
        if (subscription?.status === 'LIFETIME') {
            throw new common_1.BadRequestException('Tài khoản của bạn đã là bản LIFETIME, không cần kích hoạt thêm.');
        }
        let currentExpiry = subscription?.expiresAt ? new Date(subscription.expiresAt) : new Date();
        if (currentExpiry < new Date()) {
            currentExpiry = new Date();
        }
        const expiresAt = new Date(currentExpiry.getTime() + licenseKey.durationDays * 24 * 60 * 60 * 1000);
        await this.prisma.licenseKey.update({
            where: { id: licenseKey.id },
            data: {
                status: 'ACTIVE',
                userId,
                activatedAt: new Date(),
            }
        });
        if (!subscription) {
            await this.prisma.subscription.create({
                data: {
                    userId,
                    status: 'ACTIVE',
                    plan: 'PROFESSIONAL',
                    expiresAt
                }
            });
        }
        else {
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: 'ACTIVE',
                    plan: 'PROFESSIONAL',
                    expiresAt
                }
            });
        }
        return { success: true, message: 'Kích hoạt key thành công!', expiresAt };
    }
    async requestKey(userId, data) {
        const adminEmail = process.env.SMTP_USER;
        if (!adminEmail) {
            throw new common_1.BadRequestException('Chưa cấu hình Email Admin');
        }
        const content = `
      Khách hàng yêu cầu mua/cấp Key mới:
      - Tên: ${data.name}
      - SĐT: ${data.phone}
      - Email: ${data.email}
      
      Vui lòng liên hệ với khách hàng để cấp key.
    `;
        await this.emailService.sendEmail(adminEmail, 'YÊU CẦU CẤP KEY - PHOTO PICKER PRO', content);
        return { success: true };
    }
};
exports.LicenseService = LicenseService;
exports.LicenseService = LicenseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        email_service_1.EmailService])
], LicenseService);
//# sourceMappingURL=license.service.js.map