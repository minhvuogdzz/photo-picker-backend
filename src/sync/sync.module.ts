import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SyncGateway } from './sync.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [SyncGateway],
  exports: [SyncGateway],
})
export class SyncModule {}
