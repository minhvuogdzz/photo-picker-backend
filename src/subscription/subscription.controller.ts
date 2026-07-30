import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  async validateSubscription(@Req() req: any) {
    const userId = req.user.userId;
    const deviceId = req.user.deviceId;
    const result = await this.authService.validateSubscription(userId, deviceId);
    return { success: true, data: result };
  }
}
