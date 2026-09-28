import { Controller, Post, Body, UseGuards, Req, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyCodeDto, RegisterDto, VerifyRegisterDto, UpdateProfileDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimitGuard, RateLimit } from '../common/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(RateLimitGuard)
  @RateLimit({
    limit: 20,
    windowMs: 60_000,
    message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ một phút rồi thử lại.',
  })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return { success: true, data: result };
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    const result = await this.authService.refreshToken(refreshToken);
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

  @Get('check-username')
  async checkUsername(@Query('username') username: string) {
    const result = await this.authService.checkUsername(username);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const userId = req.user.userId;
    const result = await this.authService.updateProfile(userId, dto);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const userId = req.user.userId;
    const result = await this.authService.changePassword(userId, dto);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-others')
  async logoutOthers(@Req() req: any) {
    const userId = req.user.userId;
    const deviceId = req.user.deviceId;
    const result = await this.authService.logoutOtherDevices(userId, deviceId);
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

  @UseGuards(RateLimitGuard)
  @RateLimit({
    limit: 5,
    windowMs: 10 * 60_000,
    message: 'Bạn đã yêu cầu mã xác nhận quá nhiều lần. Vui lòng thử lại sau.',
  })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);
    return { success: true, data: result };
  }

  // Chống brute-force mã OTP 6 chữ số (1 triệu khả năng) từ nhiều tài khoản khác nhau.
  @UseGuards(RateLimitGuard)
  @RateLimit({
    limit: 15,
    windowMs: 10 * 60_000,
    message: 'Bạn đã nhập mã xác nhận quá nhiều lần. Vui lòng thử lại sau.',
  })
  @Post('verify-reset-code')
  async verifyResetCode(@Body() dto: VerifyCodeDto) {
    const result = await this.authService.verifyResetCode(dto);
    return { success: true, data: result };
  }

  @UseGuards(RateLimitGuard)
  @RateLimit({
    limit: 15,
    windowMs: 10 * 60_000,
    message: 'Bạn đã thử đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau.',
  })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    return { success: true, data: result };
  }

}
