import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
    }),
  ],
  controllers: [SubscriptionController],
})
export class SubscriptionModule {}
