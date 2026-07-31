import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { SubscriptionCron } from './subscription.cron';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
    }),
    PrismaModule,
    SyncModule,
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionCron],
})
export class SubscriptionModule {}
