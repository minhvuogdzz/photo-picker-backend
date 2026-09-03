import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';

@Injectable()
export class SubscriptionCron {
  private readonly logger = new Logger(SubscriptionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  // In Vercel serverless environment, in-process 10-second timers keep functions warm
  // and drain CPU/memory quota without reaching clients (since WebSockets do not persist on serverless).
  // Subscription expiry is enforced on-demand during validateSubscription (lazy evaluation)
  // and via the /admin/scan-expired endpoint.
  async handleCron() {
    if (process.env.ENABLE_INTERNAL_CRON !== 'true') {
      return;
    }
    await this.lockExpiredSubscriptions();
  }

  async lockExpiredSubscriptions() {
    // Find all subscriptions that are ACTIVE or TRIAL but have expired
    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
        expiresAt: { lt: new Date() },
      },
    });

    if (expiredSubscriptions.length > 0) {
      this.logger.log(`Found ${expiredSubscriptions.length} expired subscriptions. Locking them...`);
      
      for (const sub of expiredSubscriptions) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'EXPIRED' },
        });

        // Emit websocket event if supported
        this.syncGateway.emitToUser(sub.userId, 'subscriptionExpired', {});
      }
    }
  }
}
