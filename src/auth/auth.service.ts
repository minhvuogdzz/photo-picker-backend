import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException, BadRequestException, ConflictException, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { EmailService } from '../email/email.service';
import { LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyCodeDto, RegisterDto, VerifyRegisterDto, UpdateProfileDto, ChangePasswordDto } from './dto/auth.dto';
import { SyncGateway } from '../sync/sync.gateway';
import { migrateUsernames } from './username-migration';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private syncGateway: SyncGateway,
  ) {}

  async onApplicationBootstrap() {
    // Only run username migration when explicitly enabled via env flag,
    // avoiding cold start penalties and unnecessary database scans on serverless functions.
    if (process.env.RUN_USERNAME_MIGRATION === 'true') {
      try {
        await migrateUsernames(this.prisma);
      } catch (err) {
        console.error('[AuthService] Error during username auto-migration:', err);
      }
    }
  }

  async login(dto: LoginDto) {
    const identifier = (dto.email || '').trim();
    const lowerIdentifier = identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: lowerIdentifier },
          { username: lowerIdentifier },
          { email: identifier },
          { username: identifier },
        ],
      },
      include: { subscription: true },
    });

    if (!user) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
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
    } else if (user.subscription.status === 'SUSPENDED') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khoá.');
    }

    // Handle device fingerprint
    if (user.role === 'ADMIN') {
      // Admins can log in from anywhere, no device limit
      const currentDevice = await this.prisma.device.findFirst({
        where: { userId: user.id, deviceFingerprint: dto.deviceFingerprint },
      });

      if (!currentDevice) {
        await this.prisma.device.create({
          data: {
            userId: user.id,
            deviceFingerprint: dto.deviceFingerprint,
          },
        });
      } else {
        await this.prisma.device.update({
          where: { id: currentDevice.id },
          data: { lastActiveAt: new Date() },
        });
      }
    } else {
      const existingDevice = await this.prisma.device.findFirst({
        where: { userId: user.id },
      });

      if (existingDevice && existingDevice.deviceFingerprint !== dto.deviceFingerprint) {
        // If user hasn't explicitly chosen to force login, throw conflict
        if (!dto.force) {
          throw new ConflictException({
            statusCode: 409,
            errorCode: 'DEVICE_CONFLICT',
            message: 'Tài khoản này đang được đăng nhập ở thiết bị khác.',
            error: 'Conflict'
          });
        } else {
          // Emit forceLogout to the old device before overwriting
          this.syncGateway.emitToUser(user.id, 'forceLogout', { deviceId: existingDevice.deviceFingerprint });
          
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
      } else if (!existingDevice) {
        await this.prisma.device.create({
          data: {
            userId: user.id,
            deviceFingerprint: dto.deviceFingerprint,
          },
        });
      } else {
        await this.prisma.device.update({
          where: { id: existingDevice.id },
          data: { lastActiveAt: new Date() },
        });
      }
    }

    // Generate Tokens
    const payload = { sub: user.id, email: user.email, deviceId: dto.deviceFingerprint };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '90d' });

    let daysRemaining: number | null = null;
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

    return {
      accessToken,
      refreshToken,
      userId: user.id,
      email: user.email,
      username: user.username || user.email.split('@')[0],
      name: user.name,
      subscription: {
        status: user.subscription?.status || 'INACTIVE',
        plan: user.subscription?.plan || 'STARTER',
        isPremium: user.subscription?.isPremium ?? false,
        expiresAt: user.subscription?.expiresAt || null,
        daysRemaining,
      },
      deviceId: dto.deviceFingerprint,
      lastSyncAt: new Date().toISOString(),
      sessionDurationMinutes: user.subscription?.isPremium === true
        ? 0
        : await this.getSessionDurationMinutes(),
    };
  }

  private sessionDurationCache: { value: number; cachedAt: number } | null = null;

  public async getSessionDurationMinutes(): Promise<number> {
    const now = Date.now();
    if (this.sessionDurationCache && now - this.sessionDurationCache.cachedAt < 60_000) {
      return this.sessionDurationCache.value;
    }
    try {
      const config = await this.prisma.systemConfig.findUnique({
        where: { key: 'session_duration_minutes' },
      });
      const parsed = config ? parseInt(config.value, 10) : 10;
      const valid = !isNaN(parsed) && parsed > 0 ? parsed : 10;
      this.sessionDurationCache = { value: valid, cachedAt: now };
      return valid;
    } catch {
      return 10;
    }
  }

  public setSessionDurationCache(value: number) {
    this.sessionDurationCache = { value, cachedAt: Date.now() };
  }

  // In-memory cache for validateSubscription to relieve MongoDB Atlas from rapid duplicate queries
  private readonly validationCache = new Map<string, { data: any; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

  public invalidateSubscriptionCache(userId?: string) {
    if (!userId) {
      this.validationCache.clear();
      return;
    }
    for (const key of this.validationCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.validationCache.delete(key);
      }
    }
  }

  async validateSubscription(userId: string, deviceId: string) {
    const cacheKey = `${userId}:${deviceId}`;
    const cached = this.validationCache.get(cacheKey);
    const nowMs = Date.now();
    if (cached && nowMs - cached.cachedAt < this.CACHE_TTL_MS) {
      return {
        ...cached.data,
        lastSyncAt: new Date().toISOString(),
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      this.validationCache.delete(cacheKey);
      throw new NotFoundException('User not found');
    }

    const device = await this.prisma.device.findFirst({
      where: { userId, deviceFingerprint: deviceId },
    });

    if (!device) {
      this.validationCache.delete(cacheKey);
      throw new UnauthorizedException('SESSION_EXPIRED');
    }

    let daysRemaining: number | null = null;
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

    if (user.subscription?.status === 'SUSPENDED' || user.subscription?.status === 'CANCELLED') {
      this.validationCache.delete(cacheKey);
      throw new ForbiddenException('SUBSCRIPTION_INVALID');
    }

    const result = {
      userId: user.id,
      email: user.email,
      username: user.username || user.email.split('@')[0],
      name: user.name,
      subscription: {
        status: user.subscription?.status || 'INACTIVE',
        plan: user.subscription?.plan || 'STARTER',
        isPremium: user.subscription?.isPremium ?? false,
        expiresAt: user.subscription?.expiresAt || null,
        daysRemaining,
      },
      deviceId,
      lastSyncAt: new Date().toISOString(),
      sessionDurationMinutes: user.subscription?.isPremium === true
        ? 0
        : await this.getSessionDurationMinutes(),
    };

    this.validationCache.set(cacheKey, { data: result, cachedAt: nowMs });
    return result;
  }

  async refreshToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
      });

      const userId = payload.sub || payload.userId;
      const deviceId = payload.deviceId;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check device
      if (deviceId) {
        const device = await this.prisma.device.findFirst({
          where: { userId, deviceFingerprint: deviceId },
        });
        if (!device) {
          throw new UnauthorizedException('SESSION_EXPIRED');
        }
        await this.prisma.device.update({
          where: { id: device.id },
          data: { lastActiveAt: new Date() },
        });
      }

      const newPayload = { sub: user.id, email: user.email, deviceId };
      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '90d' });

      let daysRemaining: number | null = null;
      if (user.subscription?.expiresAt) {
        const now = new Date();
        const expiresAt = new Date(user.subscription.expiresAt);
        const diffTime = expiresAt.getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        userId: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
        subscription: {
          status: user.subscription?.status || 'INACTIVE',
          plan: user.subscription?.plan || 'STARTER',
          isPremium: user.subscription?.isPremium ?? false,
          expiresAt: user.subscription?.expiresAt || null,
          daysRemaining,
        },
        deviceId,
        lastSyncAt: new Date().toISOString(),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string, deviceId: string) {
    this.invalidateSubscriptionCache(userId);
    await this.prisma.device.deleteMany({
      where: { userId, deviceFingerprint: deviceId },
    });
    return { success: true };
  }

  async register(dto: RegisterDto) {
    const lowerEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: lowerEmail } });
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng.');
    }

    if (dto.username) {
      const cleanUsername = dto.username.trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,30}$/.test(cleanUsername)) {
        throw new BadRequestException('Tên tài khoản không hợp lệ (từ 3-30 ký tự, gồm chữ cái, số, gạch dưới, gạch ngang, dấu chấm).');
      }
      const existingUser = await this.prisma.user.findUnique({ where: { username: cleanUsername } });
      if (existingUser) {
        throw new BadRequestException('Tên tài khoản này đã được sử dụng. Vui lòng chọn tên khác.');
      }
    }

    await this.prisma.verificationCode.deleteMany({
      where: { email: lowerEmail, type: 'EMAIL_VERIFICATION' }
    });

    const code = this.generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.verificationCode.create({
      data: {
        email: lowerEmail,
        code,
        expiresAt,
        type: 'EMAIL_VERIFICATION'
      }
    });

    // Trigger email in background so user doesn't hang/freeze if SMTP is blocked/slow
    this.emailService.sendVerificationCode(lowerEmail, code).catch((err) => {
      console.error('[Register] Failed to send verification email:', err);
    });

    return { 
      message: 'Mã xác nhận đã được gửi thành công.',
      otp: code,
    };
  }

  async verifyRegister(dto: VerifyRegisterDto) {
    const lowerEmail = dto.email.trim().toLowerCase();
    const verification = await this.prisma.verificationCode.findFirst({
      where: { email: lowerEmail, code: dto.code, type: 'EMAIL_VERIFICATION' }
    });

    if (!verification || verification.expiresAt < new Date() || verification.attempts >= 5) {
      throw new BadRequestException('Mã xác nhận không hợp lệ hoặc đã hết hạn');
    }

    let cleanUsername = (dto.username || lowerEmail.split('@')[0]).trim().toLowerCase();
    cleanUsername = cleanUsername.replace(/[^a-z0-9_.-]/g, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      cleanUsername = `user_${Date.now().toString().slice(-4)}`;
    }

    let finalUsername = cleanUsername;
    let suffix = 1;
    while (await this.prisma.user.findUnique({ where: { username: finalUsername } })) {
      finalUsername = `${cleanUsername}${suffix}`;
      suffix++;
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: lowerEmail,
        username: finalUsername,
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
      email: lowerEmail,
      password: dto.password,
      deviceFingerprint: dto.deviceFingerprint
    });
  }

  // Generate random 6-digit code
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      // Don't reveal if user exists or not for security
      return { success: true, message: 'Nếu email tồn tại, mã xác nhận đã được gửi.' };
    }

    // Delete any existing unused codes
    await this.prisma.verificationCode.deleteMany({
      where: { userId: user.id, type: 'PASSWORD_RESET' }
    });

    const code = this.generateOTP();
    // Expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.verificationCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
        type: 'PASSWORD_RESET'
      }
    });

    // Send email in background so response doesn't hang if SMTP is blocked/slow
    this.emailService.sendVerificationCode(user.email, code).catch((err) => {
      console.error('[ForgotPassword] Failed to send email:', err);
    });

    return { 
      success: true, 
      message: 'Nếu email tồn tại, mã xác nhận đã được gửi.',
      otp: code,
    };
  }

  async verifyResetCode(dto: VerifyCodeDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Mã xác nhận không hợp lệ');

    const verification = await this.prisma.verificationCode.findFirst({
      where: { userId: user.id, code: dto.code, type: 'PASSWORD_RESET' }
    });

    if (!verification) {
      throw new BadRequestException('Mã xác nhận không hợp lệ');
    }

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('Mã xác nhận đã hết hạn');
    }

    if (verification.attempts >= 5) {
      throw new BadRequestException('Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.');
    }

    return { valid: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Mã xác nhận không hợp lệ');

    const verification = await this.prisma.verificationCode.findFirst({
      where: { userId: user.id, code: dto.code, type: 'PASSWORD_RESET' }
    });

    if (!verification || verification.expiresAt < new Date() || verification.attempts >= 5) {
      throw new BadRequestException('Mã xác nhận không hợp lệ hoặc đã hết hạn');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    // Delete the code so it can't be used again
    await this.prisma.verificationCode.delete({
      where: { id: verification.id }
    });

    // Logout all devices
    await this.prisma.device.deleteMany({
      where: { userId: user.id }
    });
    
    this.syncGateway.emitToUser(user.id, 'forceLogout', { deviceId: 'all' });

    return { success: true };
  }

  async checkUsername(rawUsername: string) {
    const username = (rawUsername || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return {
        available: false,
        message: 'Tên tài khoản từ 3-30 ký tự, không dấu, chỉ gồm chữ cái, số, gạch dưới, gạch ngang và dấu chấm.',
      };
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      return { available: false, message: 'Tên tài khoản này đã được sử dụng.' };
    }
    return { available: true, message: 'Tên tài khoản hợp lệ và có thể sử dụng.' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const updateData: any = {};

    if (dto.name !== undefined && dto.name.trim() !== '') {
      updateData.name = dto.name.trim();
    }

    if (dto.username !== undefined && dto.username.trim() !== '') {
      const cleanUsername = dto.username.trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,30}$/.test(cleanUsername)) {
        throw new BadRequestException('Tên tài khoản từ 3-30 ký tự, không dấu, chỉ gồm chữ cái, số, gạch dưới, gạch ngang và dấu chấm.');
      }

      if (cleanUsername !== user.username) {
        const existing = await this.prisma.user.findUnique({ where: { username: cleanUsername } });
        if (existing && existing.id !== userId) {
          throw new BadRequestException('Tên tài khoản này đã có người sử dụng. Vui lòng chọn tên khác.');
        }
        updateData.username = cleanUsername;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return {
        userId: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
      };
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return {
      userId: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      name: updatedUser.name,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
    }

    if (dto.newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { success: true, message: 'Đổi mật khẩu thành công.' };
  }

  async logoutOtherDevices(userId: string, currentDeviceId: string) {
    this.invalidateSubscriptionCache(userId);
    await this.prisma.device.deleteMany({
      where: {
        userId,
        deviceFingerprint: { not: currentDeviceId },
      },
    });

    this.syncGateway.emitToUser(userId, 'forceLogout', { deviceId: 'others' });
    return { success: true, message: 'Đã đăng xuất khỏi tất cả các thiết bị khác.' };
  }
}
