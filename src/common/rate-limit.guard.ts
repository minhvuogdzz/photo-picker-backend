import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface RateLimitOptions {
  /** Số request tối đa trong một cửa sổ thời gian. */
  limit: number;
  /** Độ dài cửa sổ thời gian (ms). */
  windowMs: number;
  /** Thông báo trả về cho client khi bị chặn. */
  message?: string;
}

export const RATE_LIMIT_KEY = 'mvd:rate-limit';

/**
 * Giới hạn tần suất gọi cho một endpoint. Dùng bộ đếm trong RAM nên không cần thêm
 * dependency và không cần Redis — đủ cho mô hình 1 instance hiện tại.
 *
 * Mục đích: chặn brute-force (đoán license key, đoán mã OTP 6 số, dò mật khẩu).
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface Counter {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, Counter>();
  private lastSweepAt = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const req: any = context.switchToHttp().getRequest();
    if (!req) return true;

    const now = Date.now();
    this.sweep(now);

    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    const userId = req.user?.userId || req.user?.sub || '';
    const route = `${req.method}:${req.route?.path || req.url}`;
    const bucketKey = `${route}|${ip}|${userId}`;

    const existing = this.counters.get(bucketKey);
    if (!existing || existing.resetAt <= now) {
      this.counters.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    existing.count += 1;
    if (existing.count > options.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          errorCode: 'RATE_LIMITED',
          message:
            options.message ||
            `Bạn đã thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSec} giây.`,
          retryAfterSeconds: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /** Dọn các bộ đếm hết hạn mỗi phút để Map không phình theo thời gian. */
  private sweep(now: number) {
    if (now - this.lastSweepAt < 60_000) return;
    this.lastSweepAt = now;
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }
}
