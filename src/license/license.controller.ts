import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { LicenseService } from './license.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GenerateKeysDto, ActivateKeyDto, RequestKeyDto } from './dto/license.dto';
import { RateLimitGuard, RateLimit } from '../common/rate-limit.guard';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('generate')
  async generateKeys(@Body() body: GenerateKeysDto) {
    const result = await this.licenseService.generateKeys(body.count, body.durationDays, body.targetApp, body.note);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('keys')
  async getAllKeys() {
    const result = await this.licenseService.getAllKeys();
    return { success: true, data: result };
  }

  // Chống dò key: key chỉ có 12 ký tự hex nên nếu không giới hạn tần suất thì bot
  // có thể thử hàng nghìn key mỗi giây.
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    limit: 10,
    windowMs: 60_000,
    message: 'Bạn đã thử kích hoạt key quá nhiều lần. Vui lòng chờ một phút rồi thử lại.',
  })
  @Post('activate')
  async activateKey(@Req() req: any, @Body() body: ActivateKeyDto) {
    const result = await this.licenseService.activateKey(req.user.userId, body.key);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('request')
  async requestKey(@Req() req: any, @Body() body: RequestKeyDto) {
    const result = await this.licenseService.requestKey(req.user.userId, body);
    return { success: true, data: result };
  }
}
