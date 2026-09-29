import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreateOrderDto, SePayWebhookDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Public: Lấy danh sách gói cước & giá bán
   */
  @Get('payment/packages')
  async getPricingPackages() {
    const data = await this.paymentService.getPricingPackages();
    return { success: true, data };
  }

  /**
   * Public: Lấy thông tin tài khoản ngân hàng chuyển khoản
   */
  @Get('payment/bank-info')
  async getBankConfig() {
    const data = await this.paymentService.getBankConfig();
    return { success: true, data };
  }

  /**
   * Client: Tạo đơn hàng thanh toán VietQR
   */
  @UseGuards(JwtAuthGuard)
  @Post('payment/create-order')
  async createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user.userId;
    const data = await this.paymentService.createOrder(userId, dto);
    return { success: true, data };
  }

  /**
   * Client: Tra cứu trạng thái đơn hàng (polling)
   */
  @UseGuards(JwtAuthGuard)
  @Get('payment/order/:orderCode/status')
  async getOrderStatus(@Req() req: any, @Param('orderCode') orderCode: string) {
    // Bắt buộc truyền userId: chỉ chủ đơn mới xem được trạng thái + generatedKey.
    const data = await this.paymentService.getOrderStatus(orderCode, req.user.userId);
    return { success: true, data };
  }

  /**
   * Client: Lấy danh sách đơn hàng đã mua của tôi
   */
  @UseGuards(JwtAuthGuard)
  @Get('payment/orders/my')
  async getMyOrders(@Req() req: any) {
    const userId = req.user.userId;
    const data = await this.paymentService.getMyOrders(userId);
    return { success: true, data };
  }

  /**
   * Webhook: Nhận thông báo giao dịch tự động từ SePay
   */
  @Post('payment/sepay-webhook')
  async handleSePayWebhook(
    @Body() payload: SePayWebhookDto,
    @Headers() headers: Record<string, string>,
  ) {
    return this.paymentService.handleSePayWebhook(payload, headers);
  }

  /**
   * Admin: Lấy danh sách tất cả đơn hàng & doanh thu
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/orders')
  async getAllOrders() {
    const data = await this.paymentService.getAllOrders();
    return { success: true, data };
  }

  /**
   * Admin: Duyệt thủ công đơn hàng và xuất key
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/orders/:id/approve')
  async manualApproveOrder(@Param('id') orderId: string) {
    return this.paymentService.manualApproveOrder(orderId);
  }

  /**
   * Admin: Gửi lại email xác nhận kèm mã bản quyền cho khách
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/orders/:id/resend-email')
  async resendOrderEmail(@Param('id') orderId: string) {
    return this.paymentService.resendOrderEmail(orderId);
  }
}
