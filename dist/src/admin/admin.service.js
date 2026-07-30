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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcryptjs"));
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getDashboardStats() {
        const totalUsers = await this.prisma.user.count({ where: { role: 'USER' } });
        const activeSubscriptions = await this.prisma.subscription.count({
            where: { status: { in: ['ACTIVE', 'LIFETIME'] } }
        });
        const totalDevices = await this.prisma.device.count();
        return { totalUsers, activeSubscriptions, totalDevices };
    }
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
    async updateSubscription(userId, data) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const updateData = {};
        if (data.plan)
            updateData.plan = data.plan;
        if (data.status)
            updateData.status = data.status;
        if (data.addDays) {
            let currentExpiry = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : new Date();
            if (currentExpiry < new Date()) {
                currentExpiry = new Date();
            }
            const newExpiry = new Date(currentExpiry.getTime() + data.addDays * 24 * 60 * 60 * 1000);
            updateData.expiresAt = newExpiry;
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
    async suspendUser(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });
        if (!user || !user.subscription)
            throw new common_1.NotFoundException('Subscription not found');
        await this.prisma.subscription.update({
            where: { id: user.subscription.id },
            data: { status: 'SUSPENDED' }
        });
        await this.prisma.device.deleteMany({
            where: { userId }
        });
        return { success: true };
    }
    async kickDevice(deviceId) {
        await this.prisma.device.delete({
            where: { id: deviceId }
        });
        return { success: true };
    }
    async createUser(data) {
        const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new common_1.BadRequestException('Email đã tồn tại');
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
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
//# sourceMappingURL=admin.service.js.map