import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { EmailService } from '../email/email.service';
import { LicenseService } from '../license/license.service';
import { CreateOrderDto, SePayWebhookDto } from './dto/payment.dto';
import * as crypto from 'crypto';

export interface PricingPackage {
  id: string;
  targetApp: string;
  name: string;
  durationDays: number;
  price: number;
  originalPrice?: number;
  badge?: string;
  isPopular?: boolean;
}

export const DEFAULT_PACKAGES: PricingPackage[] = [
  // Gói Toàn Hệ Sinh Thái Super App
  {
    id: 'super_1m',
    targetApp: 'ALL',
    name: 'Gói Super App 1 Tháng',
    durationDays: 30,
    price: 99000,
    originalPrice: 129000,
  },
  {
    id: 'super_3m',
    targetApp: 'ALL',
    name: 'Gói Super App 3 Tháng',
    durationDays: 90,
    price: 149000,
    originalPrice: 249000,
    badge: 'Phổ biến',
    isPopular: true,
  },
  {
    id: 'super_6m',
    targetApp: 'ALL',
    name: 'Gói Super App 6 Tháng',
    durationDays: 180,
    price: 249000,
    originalPrice: 399000,
  },
  {
    id: 'super_12m',
    targetApp: 'ALL',
    name: 'Gói Super App 12 Tháng',
    durationDays: 365,
    price: 499000,
    originalPrice: 899000,
    badge: 'Tiết kiệm nhất',
  },

  // Gói Riêng Cho Photo Picker Pro (Lọc ảnh)
  {
    id: 'picker_1m',
    targetApp: 'photo-picker',
    name: 'Gói Photo Picker Pro 1 Tháng',
    durationDays: 30,
    price: 49000,
    originalPrice: 79000,
  },
  {
    id: 'picker_3m',
    targetApp: 'photo-picker',
    name: 'Gói Photo Picker Pro 3 Tháng',
    durationDays: 90,
    price: 129000,
    originalPrice: 199000,
  },
  {
    id: 'picker_6m',
    targetApp: 'photo-picker',
    name: 'Gói Photo Picker Pro 6 Tháng',
    durationDays: 180,
    price: 229000,
    originalPrice: 329000,
  },
  {
    id: 'picker_12m',
    targetApp: 'photo-picker',
    name: 'Gói Photo Picker Pro 12 Tháng',
    durationDays: 365,
    price: 329000,
    originalPrice: 529000,
    badge: 'Ưu đãi năm',
  },
];

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private syncGateway: SyncGateway,
    private emailService: EmailService,
    private licenseService: LicenseService,
  ) {}

  // 1. Get Pricing Packages (from DB SystemConfig or defaults)
  async getPricingPackages(): Promise<PricingPackage[]> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'pricing_packages' },
    });

    if (config?.value) {
      try {
        const parsed = JSON.parse(config.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (err) {
        this.logger.error('Failed to parse pricing_packages config from DB:', err);
      }
    }

    return DEFAULT_PACKAGES;
  }

  // 2. Get Bank Transfer & VietQR Config
  async getBankConfig() {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: ['bank_bin', 'bank_account_no', 'bank_account_name'],
        },
      },
    });

    const map = new Map(configs.map((c) => [c.key, (c.value || '').trim()]));

    const bankBin = map.get('bank_bin') || (process.env.BANK_BIN || '').trim();
    const bankAccountNo = map.get('bank_account_no') || (process.env.BANK_ACCOUNT_NO || '').trim();
    const bankAccountName =
      map.get('bank_account_name') || (process.env.BANK_ACCOUNT_NAME || '').trim();

    // SECURITY: Tuyệt đối KHÔNG fallback về một số tài khoản hardcode. Nếu cấu hình
    // thiếu/rỗng mà vẫn sinh QR thì khách sẽ chuyển tiền vào tài khoản của người khác
    // và không có cách nào đối soát hay hoàn lại. Thà báo lỗi rõ ràng còn hơn QR sai.
    const missing: string[] = [];
    if (!/^\d{6}$/.test(bankBin)) missing.push('Mã BIN ngân hàng (6 chữ số)');
    if (!/^\d{6,20}$/.test(bankAccountNo)) missing.push('Số tài khoản ngân hàng');
    if (!bankAccountName) missing.push('Tên chủ tài khoản');

    if (missing.length > 0) {
      this.logger.error(
        `[BankConfig] Cấu hình thanh toán không hợp lệ, thiếu: ${missing.join(', ')}`,
      );
      throw new ServiceUnavailableException(
        `Hệ thống thanh toán chưa được cấu hình đầy đủ (${missing.join(', ')}). Vui lòng liên hệ quản trị viên.`,
      );
    }

    return { bankBin, bankAccountNo, bankAccountName };
  }

  // 3. Create Order — SERVER validates package pricing, client only sends packageId
  async createOrder(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    // SERVER-SIDE VALIDATION: Look up package by ID from pricing table
    const packages = await this.getPricingPackages();
    const pkg = packages.find((p) => p.id === dto.packageId);
    if (!pkg) {
      throw new BadRequestException(`Gói dịch vụ "${dto.packageId}" không tồn tại.`);
    }

    // Use server-defined values — NEVER trust client for price/duration
    const amount = pkg.price;
    const durationDays = pkg.durationDays;
    const targetApp = pkg.targetApp;
    const packageName = pkg.name;

    // Generate cryptographically random orderCode (harder to guess)
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    let orderCode = `MVD${randomPart}`;
    while (await this.prisma.order.findUnique({ where: { orderCode } })) {
      const retry = crypto.randomBytes(4).toString('hex').toUpperCase();
      orderCode = `MVD${retry}`;
    }

    const order = await this.prisma.order.create({
      data: {
        orderCode,
        userId,
        buyerName: dto.buyerName.trim(),
        buyerEmail: dto.buyerEmail.trim().toLowerCase(),
        buyerPhone: dto.buyerPhone.trim(),
        targetApp,
        packageName,
        amount,
        durationDays,
        status: 'PENDING',
      },
    });

    const bank = await this.getBankConfig();
    const qrUrl = `https://img.vietqr.io/image/${bank.bankBin}-${bank.bankAccountNo}-compact2.png?amount=${order.amount}&addInfo=${order.orderCode}&accountName=${encodeURIComponent(bank.bankAccountName)}`;

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      amount: order.amount,
      packageName: order.packageName,
      targetApp: order.targetApp,
      durationDays: order.durationDays,
      qrUrl,
      bankInfo: {
        bankBin: bank.bankBin,
        bankAccountNo: bank.bankAccountNo,
        bankAccountName: bank.bankAccountName,
        orderCode: order.orderCode,
        amount: order.amount,
      },
    };
  }

  // 4. Get Order Status (for Client polling)
  // SECURITY: bắt buộc lọc theo userId — response có chứa generatedKey, nếu không lọc thì
  // bất kỳ user đã đăng nhập nào biết orderCode đều đọc được key của người khác (IDOR).
  async getOrderStatus(orderCode: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderCode, userId },
      select: {
        id: true,
        orderCode: true,
        status: true,
        amount: true,
        paidAmount: true,
        generatedKey: true,
        targetApp: true,
        durationDays: true,
        packageName: true,
        paidAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    return order;
  }

  // 5. Get User Orders History
  async getMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * So sánh chuỗi bí mật theo thời gian hằng số để không rò rỉ thông tin qua timing.
   */
  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Trích xuất các mã đơn hàng khả dĩ từ nội dung chuyển khoản.
   *
   * orderCode hiện tại = "MVD" + 8 ký tự HEX (crypto.randomBytes(4)), ví dụ MVD3F9A2B1C.
   * Các đơn cũ có thể là "MVD" + 6 chữ số. Ngân hàng lại thường dán thêm ký tự vào sát mã
   * ("...MVD3F9A2B1CTUTKHOAN..."), nên ta sinh mọi tiền tố dài 6..12 rồi để DB quyết định
   * mã nào là thật. Quét cả `code`, `content` và `description` vì SePay đặt mã ở các trường
   * khác nhau tuỳ cấu hình.
   */
  private extractOrderCodeCandidates(payload: SePayWebhookDto): string[] {
    const sources = [payload.code, payload.content, payload.description];
    const candidates = new Set<string>();

    for (const source of sources) {
      if (!source) continue;
      const text = String(source).toUpperCase();
      const regex = /MVD[\s._-]*([0-9A-Z]{6,})/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const blob = match[1];
        for (let len = Math.min(blob.length, 12); len >= 6; len--) {
          candidates.add(`MVD${blob.slice(0, len)}`);
        }
      }
    }

    return Array.from(candidates);
  }

  // 6. Handle SePay Webhook
  async handleSePayWebhook(payload: SePayWebhookDto, headers: Record<string, string> = {}) {
    this.logger.log(
      `[SePay Webhook] Incoming transaction id: ${payload.id}, amount: ${payload.transferAmount}`,
    );

    const authHeader = (headers['authorization'] || headers['apikey'] || headers['x-api-key'] || '').trim();

    // Verify API Key (Check DB config first, then ENV)
    const dbConfig = await this.prisma.systemConfig.findUnique({
      where: { key: 'sepay_webhook_api_key' },
    });
    const configuredApiKey =
      (dbConfig?.value || '').trim() || (process.env.SEPAY_WEBHOOK_API_KEY || '').trim();

    // SECURITY: fail-closed. Nếu chưa cấu hình API Key (hoặc admin lưu ô đó rỗng) thì
    // TỪ CHỐI, tuyệt đối không "cho qua" — nếu không thì bất kỳ ai biết URL webhook đều
    // activate được đơn hàng mà không cần chuyển tiền.
    // Trả 503 để SePay retry (tối đa 7 lần trong ~5 giờ), đủ thời gian admin cấu hình lại.
    if (!configuredApiKey) {
      this.logger.error(
        '[SePay Webhook] REJECTED: chưa cấu hình "sepay_webhook_api_key" (Admin > Cấu hình giá & ngân hàng) và cũng không có ENV SEPAY_WEBHOOK_API_KEY.',
      );
      throw new ServiceUnavailableException('Webhook chưa được cấu hình API Key.');
    }

    if (!authHeader) {
      this.logger.warn('[SePay Webhook] REJECTED: thiếu Authorization header.');
      throw new UnauthorizedException('Webhook API Key is required.');
    }

    const cleanHeader = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();
    if (
      !this.safeCompare(cleanHeader, configuredApiKey) &&
      !this.safeCompare(authHeader, configuredApiKey)
    ) {
      // Không log giá trị header để tránh ghi secret vào log.
      this.logger.warn('[SePay Webhook] REJECTED: Authorization header không khớp API Key.');
      throw new UnauthorizedException('Invalid Webhook API Key');
    }

    const transactionIdStr = String(payload.id);

    // Idempotency: Check if transaction already processed
    const existingOrder = await this.prisma.order.findFirst({
      where: { sepayTransactionId: transactionIdStr },
    });

    if (existingOrder) {
      this.logger.log(`[SePay Webhook] Transaction ${transactionIdStr} already processed. Returning success.`);
      return { success: true, message: 'Transaction already processed' };
    }

    // Extract order code from transfer content / code / description
    const candidates = this.extractOrderCodeCandidates(payload);
    if (candidates.length === 0) {
      this.logger.warn(
        `[SePay Webhook] No MVD order code found. code="${payload.code || ''}" content="${payload.content || ''}"`,
      );
      return { success: true, message: 'No matching order code pattern' };
    }

    const matchedOrders = await this.prisma.order.findMany({
      where: { orderCode: { in: candidates } },
    });

    if (matchedOrders.length === 0) {
      this.logger.warn(
        `[SePay Webhook] Không tìm thấy đơn nào khớp các mã khả dĩ: ${candidates.join(', ')}`,
      );
      return { success: true, message: 'Order not found' };
    }

    // Ưu tiên mã dài nhất (khớp chính xác nhất) nếu có nhiều mã cùng khớp.
    const order = matchedOrders.sort((a, b) => b.orderCode.length - a.orderCode.length)[0];
    const orderCode = order.orderCode;

    if (order.status === 'PAID') {
      this.logger.log(`[SePay Webhook] Order ${orderCode} already marked as PAID`);
      return { success: true, message: 'Order already paid' };
    }

    // Cộng dồn số tiền đã nhận: khách chuyển thiếu nhiều lần nhưng tổng đủ thì vẫn phải fulfil.
    const accumulatedPaid = (order.paidAmount || 0) + payload.transferAmount;

    // Check if sufficient amount transferred
    if (accumulatedPaid >= order.amount) {
      // 1. Generate unique License Key (chưa gửi cho khách)
      const keyString = this.licenseService.generateKeyString();

      const createdKey = await this.prisma.licenseKey.create({
        data: {
          key: keyString,
          targetApp: order.targetApp,
          durationDays: order.durationDays,
          status: 'UNUSED',
          orderId: order.id,
          note: `Tự động tạo từ SePay đơn ${order.orderCode} (Giao dịch ${transactionIdStr})`,
        },
      });

      // 2. CLAIM ATOMIC: chỉ duy nhất 1 webhook chuyển được đơn sang PAID.
      // SePay có thể gửi trùng cùng lúc, hoặc retry sau khi request trước timeout giữa đường —
      // nếu dùng read-then-write như trước thì sẽ tạo 2 key và cộng đôi thời hạn cho khách.
      // Ghi sepayTransactionId NGAY trong bước claim này, trước khi activate/gửi mail.
      const claim = await this.prisma.order.updateMany({
        where: { id: order.id, status: { not: 'PAID' } },
        data: {
          status: 'PAID',
          generatedKey: keyString,
          sepayTransactionId: transactionIdStr,
          paidAmount: accumulatedPaid,
          paidAt: new Date(),
          paymentNote: payload.content || `Giao dịch SePay ${transactionIdStr}`,
        },
      });

      if (claim.count === 0) {
        // Một webhook khác đã xử lý đơn này xong trước → huỷ key vừa tạo để không còn key mồ côi.
        await this.prisma.licenseKey
          .delete({ where: { id: createdKey.id } })
          .catch(() => undefined);
        this.logger.log(
          `[SePay Webhook] Order ${orderCode} đã được webhook khác xử lý. Bỏ qua bản trùng.`,
        );
        return { success: true, message: 'Order already paid' };
      }

      // 3. Auto-activate key into user's account immediately
      if (order.userId) {
        try {
          await this.licenseService.activateKey(order.userId, keyString);
          this.logger.log(`[SePay Webhook] Auto-activated key ${keyString} into user ${order.userId} account`);
        } catch (actErr) {
          this.logger.warn(`[SePay Webhook] Auto-activation notice (can still be manually activated):`, actErr);
        }
      }

      // 4. Send Email with Key to Customer
      await this.sendLicenseEmail(order, keyString, accumulatedPaid);

      // 5. Emit WebSocket event to Client App
      this.syncGateway.emitToUser(order.userId, 'paymentSuccess', {
        orderCode: order.orderCode,
        key: keyString,
        packageName: order.packageName,
        targetApp: order.targetApp,
        durationDays: order.durationDays,
      });

      this.logger.log(`[SePay Webhook] Order ${orderCode} fulfilled successfully. Generated key: ${keyString}`);
      return { success: true, message: 'Order fulfilled successfully' };
    } else {
      // Partial payment — ghi luôn sepayTransactionId để lần giao dịch này không bị
      // cộng dồn hai lần nếu SePay gửi lặp (idempotency check ở đầu hàm sẽ chặn).
      await this.prisma.order.updateMany({
        where: { id: order.id, status: { not: 'PAID' } },
        data: {
          status: 'PARTIAL',
          sepayTransactionId: transactionIdStr,
          paidAmount: accumulatedPaid,
          paymentNote: `Thanh toán thiếu: đã nhận ${accumulatedPaid}/${order.amount} VNĐ (lần này ${payload.transferAmount}). Nội dung: ${payload.content || '(không có)'}`,
        },
      });

      this.logger.warn(
        `[SePay Webhook] Partial payment for order ${orderCode}: ${accumulatedPaid} / ${order.amount}`,
      );
      return { success: true, message: 'Partial payment recorded' };
    }
  }

  /**
   * Gửi email chứa License Key cho khách. Dùng chung cho webhook SePay và
   * luồng admin duyệt thủ công để nội dung email luôn giống nhau.
   */
  private async sendLicenseEmail(
    order: {
      buyerName: string;
      buyerEmail: string;
      orderCode: string;
      packageName: string;
      targetApp: string;
      durationDays: number;
    },
    keyString: string,
    paidAmount: number,
  ) {
    const appLabel = order.targetApp === 'ALL' ? 'Toàn bộ Super App' : `Ứng dụng ${order.targetApp}`;
    const emailContent = `
Xin chào ${order.buyerName},

MVD Academy xin trân trọng cảm ơn bạn đã đăng ký gói dịch vụ ${order.packageName}!
Hệ thống đã nhận được thanh toán thành công cho đơn hàng: ${order.orderCode}.

--------------------------------------------------
THÔNG TIN BẢN QUYỀN CỦA BẠN:
- Mã Bản Quyền (License Key): ${keyString}
- Gói sử dụng: ${order.packageName} (${appLabel})
- Thời hạn: ${order.durationDays} ngày
- Số tiền thanh toán: ${paidAmount.toLocaleString('vi-VN')} VNĐ
--------------------------------------------------

GÓI BẢN QUYỀN ĐÃ ĐƯỢC TỰ ĐỘNG KÍCH HOẠT VÀO TÀI KHOẢN CỦA BẠN!
Bạn chỉ cần mở lại ứng dụng Photo Picker Pro hoặc tiếp tục làm việc, toàn bộ tính năng và quyền lợi gói đã sẵn sàng.

Nếu cần chuyển key sang thiết bị hoặc tài khoản khác, bạn có thể sử dụng Mã License Key phía trên để kích hoạt.

Nếu cần hỗ trợ kỹ thuật, xin liên hệ qua hotline hoặc Zalo hỗ trợ của MVD Academy.
Chúc bạn có những trải nghiệm làm việc năng suất và tuyệt vời!
      `.trim();

    await this.emailService
      .sendEmail(
        order.buyerEmail,
        `[MVD ACADEMY] KÍCH HOẠT BẢN QUYỀN THÀNH CÔNG - ĐƠN HÀNG ${order.orderCode}`,
        emailContent,
      )
      .catch((err) => {
        this.logger.error(`[Payment] Failed to send license email to ${order.buyerEmail}:`, err);
      });
  }

  // 7. Admin: Get all orders
  async getAllOrders() {
    return this.prisma.order.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // 8. Admin: Manually approve and fulfill an order
  async manualApproveOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.status === 'PAID' && order.generatedKey) {
      return { success: true, message: 'Đơn hàng này đã được kích hoạt trước đó.', key: order.generatedKey };
    }

    const keyString = this.licenseService.generateKeyString();

    const createdKey = await this.prisma.licenseKey.create({
      data: {
        key: keyString,
        targetApp: order.targetApp,
        durationDays: order.durationDays,
        status: 'UNUSED',
        orderId: order.id,
        note: `Admin duyệt thủ công cho đơn ${order.orderCode}`,
      },
    });

    // CLAIM ATOMIC: nếu webhook SePay vừa xử lý xong đơn này (hoặc admin bấm duyệt 2 lần)
    // thì không được sinh thêm key thứ hai.
    const claim = await this.prisma.order.updateMany({
      where: { id: order.id, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        generatedKey: keyString,
        paidAt: new Date(),
        paymentNote: 'Duyệt thủ công bởi Admin',
      },
    });

    if (claim.count === 0) {
      await this.prisma.licenseKey
        .delete({ where: { id: createdKey.id } })
        .catch(() => undefined);
      const current = await this.prisma.order.findUnique({ where: { id: order.id } });
      return {
        success: true,
        message: 'Đơn hàng này đã được kích hoạt trước đó.',
        key: current?.generatedKey || '',
      };
    }

    // Kích hoạt luôn vào tài khoản khách (giống luồng webhook) để admin không phải
    // gửi key thủ công nữa.
    if (order.userId) {
      try {
        await this.licenseService.activateKey(order.userId, keyString);
        this.logger.log(`[Manual Approve] Auto-activated key ${keyString} for user ${order.userId}`);
      } catch (actErr) {
        this.logger.warn(`[Manual Approve] Auto-activation notice (khách vẫn nhập key thủ công được):`, actErr);
      }
    }

    // Gửi email chứa key cho khách
    await this.sendLicenseEmail(order, keyString, order.paidAmount || order.amount);

    // Emit realtime event
    this.syncGateway.emitToUser(order.userId, 'paymentSuccess', {
      orderCode: order.orderCode,
      key: keyString,
      packageName: order.packageName,
      targetApp: order.targetApp,
      durationDays: order.durationDays,
    });

    return {
      success: true,
      message: 'Đã duyệt đơn hàng và sinh mã bản quyền thành công!',
      key: keyString,
    };
  }
}
