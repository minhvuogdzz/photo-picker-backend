import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { LicenseService } from './license.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GenerateKeysDto, ActivateKeyDto, RequestKeyDto } from './dto/license.dto';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('generate')
  generateKeys(@Body() body: GenerateKeysDto) {
    return this.licenseService.generateKeys(body.count, body.durationDays);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('keys')
  getAllKeys() {
    return this.licenseService.getAllKeys();
  }

  @UseGuards(JwtAuthGuard)
  @Post('activate')
  activateKey(@Req() req: any, @Body() body: ActivateKeyDto) {
    return this.licenseService.activateKey(req.user.userId, body.key);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request')
  requestKey(@Req() req: any, @Body() body: RequestKeyDto) {
    return this.licenseService.requestKey(req.user.userId, body);
  }
}
