import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';

import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { LicenseModule } from './license/license.module';

@Module({
  imports: [PrismaModule, AuthModule, SubscriptionModule, EmailModule, AdminModule, LicenseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
