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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const email_service_1 = require("../email/email.service");
let AuthService = class AuthService {
    prisma;
    jwtService;
    emailService;
    constructor(prisma, jwtService, emailService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.emailService = emailService;
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
            include: { subscription: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Sai email hoặc mật khẩu');
        }
        const passwordMatches = await bcrypt.compare(dto.password, user.password);
        if (!passwordMatches) {
            throw new common_1.UnauthorizedException('Sai email hoặc mật khẩu');
        }
        if (!user.subscription) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            user.subscription = await this.prisma.subscription.create({
                data: {
                    userId: user.id,
                    status: 'TRIAL',
                    plan: 'STARTER',
                    expiresAt
                }
            });
        }
        else if (user.subscription.status === 'SUSPENDED') {
            throw new common_1.ForbiddenException('Tài khoản của bạn đã bị khoá.');
        }
        const existingDevice = await this.prisma.device.findUnique({
            where: { deviceFingerprint: dto.deviceFingerprint },
        });
        if (!existingDevice) {
            await this.prisma.device.deleteMany({
                where: { userId: user.id },
            });
            await this.prisma.device.create({
                data: {
                    userId: user.id,
                    deviceFingerprint: dto.deviceFingerprint,
                },
            });
        }
        else {
            await this.prisma.device.update({
                where: { id: existingDevice.id },
                data: { lastActiveAt: new Date() },
            });
        }
        const payload = { sub: user.id, email: user.email, deviceId: dto.deviceFingerprint };
        const accessToken = this.jwtService.sign(payload);
        const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
        let daysRemaining = null;
        if (user.subscription?.expiresAt) {
            const now = new Date();
            const expiresAt = new Date(user.subscription.expiresAt);
            const diffTime = expiresAt.getTime() - now.getTime();
            daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        }
        return {
            accessToken,
            refreshToken,
            userId: user.id,
            email: user.email,
            name: user.name,
            subscription: {
                status: user.subscription?.status || 'INACTIVE',
                plan: user.subscription?.plan || 'STARTER',
                expiresAt: user.subscription?.expiresAt || null,
                daysRemaining,
            },
            deviceId: dto.deviceFingerprint,
            lastSyncAt: new Date().toISOString(),
        };
    }
    async validateSubscription(userId, deviceId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const device = await this.prisma.device.findFirst({
            where: { userId, deviceFingerprint: deviceId },
        });
        if (!device) {
            throw new common_1.UnauthorizedException('SESSION_EXPIRED');
        }
        let daysRemaining = null;
        if (user.subscription?.expiresAt) {
            const now = new Date();
            const expiresAt = new Date(user.subscription.expiresAt);
            const diffTime = expiresAt.getTime() - now.getTime();
            daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            if (daysRemaining === 0 && user.subscription.status !== 'LIFETIME') {
                await this.prisma.subscription.update({
                    where: { id: user.subscription.id },
                    data: { status: 'EXPIRED' }
                });
                user.subscription.status = 'EXPIRED';
            }
        }
        if (user.subscription?.status !== 'ACTIVE' && user.subscription?.status !== 'TRIAL' && user.subscription?.status !== 'LIFETIME') {
            throw new common_1.ForbiddenException('SUBSCRIPTION_INVALID');
        }
        return {
            userId: user.id,
            email: user.email,
            name: user.name,
            subscription: {
                status: user.subscription.status,
                plan: user.subscription.plan,
                expiresAt: user.subscription.expiresAt,
                daysRemaining,
            },
            deviceId,
            lastSyncAt: new Date().toISOString(),
        };
    }
    async logout(userId, deviceId) {
        await this.prisma.device.deleteMany({
            where: { userId, deviceFingerprint: deviceId },
        });
        return { success: true };
    }
    async register(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) {
            throw new common_1.BadRequestException('Email đã được sử dụng.');
        }
        await this.prisma.verificationCode.deleteMany({
            where: { email: dto.email, type: 'EMAIL_VERIFICATION' }
        });
        const code = this.generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await this.prisma.verificationCode.create({
            data: {
                email: dto.email,
                code,
                expiresAt,
                type: 'EMAIL_VERIFICATION'
            }
        });
        await this.emailService.sendVerificationCode(dto.email, code);
        return { message: 'Mã xác nhận đã được gửi.' };
    }
    async verifyRegister(dto) {
        const verification = await this.prisma.verificationCode.findFirst({
            where: { email: dto.email, code: dto.code, type: 'EMAIL_VERIFICATION' }
        });
        if (!verification || verification.expiresAt < new Date() || verification.attempts >= 5) {
            throw new common_1.BadRequestException('Mã xác nhận không hợp lệ hoặc đã hết hạn');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password: hashedPassword,
                name: dto.name,
                role: 'USER',
            }
        });
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await this.prisma.subscription.create({
            data: {
                userId: user.id,
                status: 'TRIAL',
                plan: 'STARTER',
                expiresAt
            }
        });
        await this.prisma.verificationCode.delete({ where: { id: verification.id } });
        return this.login({
            email: dto.email,
            password: dto.password,
            deviceFingerprint: dto.deviceFingerprint
        });
    }
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    async forgotPassword(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user) {
            return { success: true, message: 'Nếu email tồn tại, mã xác nhận đã được gửi.' };
        }
        await this.prisma.verificationCode.deleteMany({
            where: { userId: user.id, type: 'PASSWORD_RESET' }
        });
        const code = this.generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await this.prisma.verificationCode.create({
            data: {
                userId: user.id,
                code,
                expiresAt,
                type: 'PASSWORD_RESET'
            }
        });
        await this.emailService.sendVerificationCode(user.email, code);
        return { success: true, message: 'Nếu email tồn tại, mã xác nhận đã được gửi.' };
    }
    async verifyResetCode(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user)
            throw new common_1.BadRequestException('Mã xác nhận không hợp lệ');
        const verification = await this.prisma.verificationCode.findFirst({
            where: { userId: user.id, code: dto.code, type: 'PASSWORD_RESET' }
        });
        if (!verification) {
            throw new common_1.BadRequestException('Mã xác nhận không hợp lệ');
        }
        if (verification.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Mã xác nhận đã hết hạn');
        }
        if (verification.attempts >= 5) {
            throw new common_1.BadRequestException('Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.');
        }
        return { valid: true };
    }
    async resetPassword(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user)
            throw new common_1.BadRequestException('Mã xác nhận không hợp lệ');
        const verification = await this.prisma.verificationCode.findFirst({
            where: { userId: user.id, code: dto.code, type: 'PASSWORD_RESET' }
        });
        if (!verification || verification.expiresAt < new Date() || verification.attempts >= 5) {
            throw new common_1.BadRequestException('Mã xác nhận không hợp lệ hoặc đã hết hạn');
        }
        const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });
        await this.prisma.verificationCode.delete({
            where: { id: verification.id }
        });
        await this.prisma.device.deleteMany({
            where: { userId: user.id }
        });
        return { success: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        email_service_1.EmailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map