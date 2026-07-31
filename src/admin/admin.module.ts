import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [PrismaModule, AuthModule, SyncModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
