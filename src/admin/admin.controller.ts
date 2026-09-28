import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateUserDto, UpdateSubscriptionDto } from './dto/admin.dto';
import { EmailService } from '../email/email.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly emailService: EmailService,
  ) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return this.adminService.createUser(body);
  }

  @Post('users/:id/subscription')
  updateSubscription(
    @Param('id') userId: string,
    @Body() body: UpdateSubscriptionDto
  ) {
    return this.adminService.updateSubscription(userId, body);
  }

  @Post('users/:id/suspend')
  suspendUser(@Param('id') userId: string) {
    return this.adminService.suspendUser(userId);
  }

  @Post('devices/:id/kick')
  kickDevice(@Param('id') deviceId: string) {
    return this.adminService.kickDevice(deviceId);
  }

  @Post('scan-expired')
  scanExpired() {
    return this.adminService.scanExpired();
  }

  @Post('notify-expiring')
  notifyExpiring() {
    return this.adminService.notifyExpiring();
  }

  @Get('config')
  getSystemConfigs() {
    return this.adminService.getSystemConfigs();
  }

  @Post('config')
  updateSystemConfig(@Body() body: { key: string; value: string; description?: string }) {
    return this.adminService.updateSystemConfig(body.key, body.value, body.description);
  }

  @Post('email/test')
  async testEmail(@Body() body: { to: string }) {
    const result = await this.emailService.testEmail(body.to || 'ougvn.it2@gmail.com');
    return { success: result.success, data: result };
  }
}
