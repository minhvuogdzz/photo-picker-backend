import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

interface AccessTokenPayload {
  readonly sub?: string;
  readonly deviceId?: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    readonly userId: string;
    readonly email: string;
    readonly deviceId: string;
    readonly role: string;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret:
            process.env.JWT_SECRET ||
            'super-secret-jwt-key-replace-in-production',
        },
      );

      const userId = payload.sub;
      const deviceId = payload.deviceId;
      if (!userId || !deviceId) {
        throw new UnauthorizedException('SESSION_EXPIRED');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) {
        throw new UnauthorizedException('SESSION_EXPIRED');
      }

      const device = await this.prisma.device.findFirst({
        where: { userId, deviceFingerprint: deviceId },
        select: { id: true },
      });
      if (!device) {
        throw new UnauthorizedException('SESSION_EXPIRED');
      }

      request.user = {
        userId,
        email: user.email,
        deviceId,
        role: user.role,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token invalid or expired');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
