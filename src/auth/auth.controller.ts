import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyCodeDto, RegisterDto, VerifyRegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return { success: true, data: result };
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return { success: true, data: result };
  }

  @Post('verify-register')
  async verifyRegister(@Body() dto: VerifyRegisterDto) {
    const result = await this.authService.verifyRegister(dto);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any) {
    const userId = req.user.userId;
    const deviceId = req.user.deviceId;
    await this.authService.logout(userId, deviceId);
    return { success: true };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);
    return { success: true, data: result };
  }

  @Post('verify-reset-code')
  async verifyResetCode(@Body() dto: VerifyCodeDto) {
    const result = await this.authService.verifyResetCode(dto);
    return { success: true, data: result };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    return { success: true, data: result };
  }

}
