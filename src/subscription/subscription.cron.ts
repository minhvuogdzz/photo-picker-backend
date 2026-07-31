import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';

@Injectable()
export class SubscriptionCron {
  private readonly logger = new Logger(SubscriptionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
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

        // Emit websocket event to kick them out instantly
        this.syncGateway.emitToUser(sub.userId, 'subscriptionExpired', {});
      }
    }
  }
}
