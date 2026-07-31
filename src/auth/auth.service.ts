import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { EmailService } from '../email/email.service';
import { LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyCodeDto, RegisterDto, VerifyRegisterDto } from './dto/auth.dto';
import { SyncGateway } from '../sync/sync.gateway';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private syncGateway: SyncGateway,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { subscription: true },
    });

    if (!user) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
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
    const existingDevice = await this.prisma.device.findFirst({
      where: { userId: user.id },
    });

    if (existingDevice && existingDevice.deviceFingerprint !== dto.deviceFingerprint) {
      // If user hasn't explicitly chosen to force login, throw conflict
      if (!(dto as any).force) {
        throw new BadRequestException({
          statusCode: 409,
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

    // Generate Tokens
    const payload = { sub: user.id, email: user.email, deviceId: dto.deviceFingerprint };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    let daysRemaining: number | null = null;
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

  async validateSubscription(userId: string, deviceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const device = await this.prisma.device.findFirst({
      where: { userId, deviceFingerprint: deviceId },
    });

    if (!device) {
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

    if (user.subscription?.status !== 'ACTIVE' && user.subscription?.status !== 'TRIAL' && user.subscription?.status !== 'LIFETIME') {
      throw new ForbiddenException('SUBSCRIPTION_INVALID');
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

  async logout(userId: string, deviceId: string) {
    await this.prisma.device.deleteMany({
      where: { userId, deviceFingerprint: deviceId },
    });
    return { success: true };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng.');
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

  async verifyRegister(dto: VerifyRegisterDto) {
    const verification = await this.prisma.verificationCode.findFirst({
      where: { email: dto.email, code: dto.code, type: 'EMAIL_VERIFICATION' }
    });

    if (!verification || verification.expiresAt < new Date() || verification.attempts >= 5) {
      throw new BadRequestException('Mã xác nhận không hợp lệ hoặc đã hết hạn');
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

    await this.emailService.sendVerificationCode(user.email, code);

    return { success: true, message: 'Nếu email tồn tại, mã xác nhận đã được gửi.' };
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
}
