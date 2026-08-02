import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateUserDto, UpdateSubscriptionDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
