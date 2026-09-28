import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const targetCode = process.argv[2]?.trim().toUpperCase();

  let order;
  if (targetCode) {
    order = await prisma.order.findUnique({
      where: { orderCode: targetCode },
    });
  } else {
    // Lấy đơn hàng PENDING mới nhất
    order = await prisma.order.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!order) {
    console.error('❌ Không tìm thấy đơn hàng PENDING nào để giả lập thanh toán.');
    console.log('👉 Bạn hãy tạo 1 đơn hàng trên app hoặc truyền mã đơn: npx ts-node scripts/simulate-sepay.ts MVDXXXXXX');
    process.exit(1);
  }

  console.log(`🚀 Bắt đầu giả lập SePay gửi Webhook cho đơn: ${order.orderCode}`);
  console.log(`📦 Gói: ${order.packageName} | Ứng dụng: ${order.targetApp} | Số tiền: ${order.amount} VNĐ`);
  console.log(`👤 Người mua: ${order.buyerName} (${order.buyerEmail})`);

  // Lấy API key đã cấu hình nếu có
  const apiKeyConfig = await prisma.systemConfig.findUnique({
    where: { key: 'sepay_webhook_api_key' },
  });
  const apiKey = apiKeyConfig?.value?.trim() || process.env.SEPAY_WEBHOOK_API_KEY?.trim() || '';

  const mockPayload = {
    id: Math.floor(10000000 + Math.random() * 90000000),
    gateway: 'MBBank',
    transactionDate: new Date().toISOString(),
    accountNumber: '0987654321',
    code: null,
    content: `Chuyen khoan thanh toan ${order.orderCode} MVD ACADEMY`,
    transferType: 'in',
    transferAmount: order.amount,
    accumulated: 10000000,
    subAccount: null,
    referenceCode: `FT${Date.now()}`,
    description: `Giao dich SePay test cho don ${order.orderCode}`,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Apikey ${apiKey}`;
  }

  try {
    const res = await axios.post('http://localhost:3000/payment/sepay-webhook', mockPayload, {
      headers,
    });
    console.log('✅ Gửi Webhook thành công:', res.data);

    // Kiểm tra lại trạng thái đơn hàng sau khi webhook xử lý
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });

    console.log('🎉 Trạng thái đơn hàng sau thanh toán:', updatedOrder?.status);
    console.log('🔑 Mã License Key đã tạo:', updatedOrder?.generatedKey);
  } catch (err: any) {
    console.error('❌ Lỗi khi gửi Webhook:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
