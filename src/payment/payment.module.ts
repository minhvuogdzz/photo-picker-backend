import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { EmailModule } from '../email/email.module';
import { LicenseModule } from '../license/license.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, SyncModule, EmailModule, LicenseModule, AuthModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
