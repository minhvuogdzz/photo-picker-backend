import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ScheduleModule } from '@nestjs/schedule';

import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { LicenseModule } from './license/license.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [PrismaModule, AuthModule, SubscriptionModule, EmailModule, AdminModule, LicenseModule, SyncModule, ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
