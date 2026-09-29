import * as nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ougvn.it2@gmail.com',
    pass: 'syqs njfa jyhb ufas',
  },
});

interface CustomerOrder {
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  packageName: string;
  targetApp: string;
  durationDays: number;
  paidAmount: number;
  keyString: string;
}

const orders: CustomerOrder[] = [
  {
    orderCode: 'MVD289873DB',
    buyerName: 'Vương',
    buyerEmail: 'dminhv204@gmail.com',
    packageName: 'Gói Super App 12 Tháng',
    targetApp: 'ALL',
    durationDays: 365,
    paidAmount: 499000,
    keyString: 'MVD-CB13-4D4F-7EA0',
  },
  {
    orderCode: 'MVDFCCC1C12',
    buyerName: 'Hoàng Hân',
    buyerEmail: 'hoanghan030820@gmail.com',
    packageName: 'Gói Super App 12 Tháng',
    targetApp: 'ALL',
    durationDays: 365,
    paidAmount: 499000,
    keyString: 'MVD-7304-C16B-537A',
  },
];

function buildHtml(order: CustomerOrder) {
  const appLabel = order.targetApp === 'ALL' ? 'Toàn bộ Super App' : `Ứng dụng ${order.targetApp}`;
  const supportZalo = '0869528304';
  const companyUrl = 'https://mvdptsacademy.mvdtech.workers.dev/';
  const cleanWebUrl = 'mvdptsacademy.mvdtech.workers.dev';
  const subject = `[MVD TECH & DESIGN STUDIO] KÍCH HOẠT BẢN QUYỀN THÀNH CÔNG - ĐƠN HÀNG #${order.orderCode}`;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <div style="max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 25px rgba(0, 0, 0, 0.07); border: 1px solid #e2e8f0;">
    
    <!-- Top Gradient Accent -->
    <div style="height: 6px; background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #10b981 100%);"></div>

    <!-- Header Brand Banner -->
    <div style="padding: 32px 36px 20px 36px; text-align: center; border-bottom: 1px solid #f1f5f9; background: #fafafa;">
      <div style="display: inline-block; padding: 8px 20px; background: #0f172a; border-radius: 10px; margin-bottom: 14px; border: 1px solid #1e293b;">
        <span style="font-size: 14px; font-weight: 800; letter-spacing: 1.5px; color: #ffffff;">MVD TECH & DESIGN</span>
        <span style="font-size: 13px; font-weight: 700; color: #38bdf8; margin-left: 4px;">STUDIO</span>
      </div>
      <h1 style="margin: 0 0 6px 0; font-size: 21px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">XÁC NHẬN BẢN QUYỀN CHÍNH THỨC</h1>
      <p style="margin: 0; font-size: 13px; color: #64748b;">Hệ thống ứng dụng tự động hoá studio & sáng tạo nội dung</p>
    </div>

    <!-- Main Body -->
    <div style="padding: 28px 36px;">
      
      <!-- Greeting -->
      <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #1e293b;">
        Xin chào <strong>${order.buyerName}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
        MVD Tech & Design Studio trân trọng cảm ơn bạn đã đăng ký <strong>${order.packageName}</strong>. Đơn hàng <strong>#${order.orderCode}</strong> đã được hệ thống ghi nhận thanh toán thành công.
      </p>

      <!-- Success Notification Pill -->
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 15px; margin-right: 6px;">🎉</span>
        <strong style="font-size: 13px; color: #065f46;">
          Gói bản quyền đã được kích hoạt tự động vào tài khoản của bạn!
        </strong>
      </div>

      <!-- License Key Box (Big Tech Style) -->
      <div style="background: #0f172a; border-radius: 12px; padding: 22px 20px; text-align: center; margin-bottom: 26px; border: 1px solid #1e293b; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
        <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.8px; color: #94a3b8; text-transform: uppercase; margin-bottom: 10px;">
          MÃ LICENSE KEY DỰ PHÒNG CỦA BẠN
        </div>
        <div style="font-family: 'JetBrains Mono', Consolas, Monaco, monospace; font-size: 20px; font-weight: 700; color: #38bdf8; letter-spacing: 2px; padding: 10px 18px; background: rgba(56, 189, 248, 0.08); border: 1px dashed rgba(56, 189, 248, 0.4); border-radius: 8px; display: inline-block; margin-bottom: 8px;">
          ${order.keyString}
        </div>
        <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
          Khóa kích hoạt dự phòng khi chuyển thiết bị hoặc kích hoạt cho máy mới
        </p>
      </div>

      <!-- Order Receipt Details Table -->
      <div style="background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 26px;">
        <div style="padding: 12px 18px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
          Chi Tiết Đơn Hàng & Quyền Lợi
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 11px 18px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Gói đăng ký</td>
            <td style="padding: 11px 18px; text-align: right; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${order.packageName}</td>
          </tr>
          <tr>
            <td style="padding: 11px 18px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Phạm vi mở khóa</td>
            <td style="padding: 11px 18px; text-align: right; font-weight: 600; color: #2563eb; border-bottom: 1px solid #f1f5f9;">${appLabel}</td>
          </tr>
          <tr>
            <td style="padding: 11px 18px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Mã đơn hàng</td>
            <td style="padding: 11px 18px; text-align: right; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">#${order.orderCode}</td>
          </tr>
          <tr>
            <td style="padding: 11px 18px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Thời hạn bản quyền</td>
            <td style="padding: 11px 18px; text-align: right; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">+${order.durationDays} ngày</td>
          </tr>
          <tr>
            <td style="padding: 13px 18px; font-weight: 600; color: #0f172a;">Số tiền thanh toán</td>
            <td style="padding: 13px 18px; text-align: right; font-size: 15px; font-weight: 800; color: #059669;">${order.paidAmount.toLocaleString('vi-VN')} VNĐ</td>
          </tr>
        </table>
      </div>

      <!-- Action Buttons -->
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="https://zalo.me/${supportZalo}" target="_blank" style="display: inline-block; background: #0068ff; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 12px 24px; border-radius: 8px; margin: 4px; box-shadow: 0 2px 6px rgba(0, 104, 255, 0.25);">
          💬 Nhắn Zalo Hỗ Trợ 24/7
        </a>
        <a href="${companyUrl}" target="_blank" style="display: inline-block; background: #ffffff; color: #334155; text-decoration: none; font-size: 13px; font-weight: 600; padding: 12px 20px; border-radius: 8px; margin: 4px; border: 1px solid #cbd5e1;">
          🌐 Khám Phá Trang Chủ
        </a>
      </div>

      <!-- Quick Tips -->
      <div style="padding: 14px 18px; background: #fffbeb; border-radius: 10px; border: 1px solid #fde68a; font-size: 12px; color: #92400e; line-height: 1.6;">
        <strong>💡 Hướng dẫn bắt đầu:</strong><br>
        • Bạn chỉ cần mở lại ứng dụng trên máy tính, tài khoản đã được cấp quyền làm việc ngay.<br>
        • Nếu cài đặt máy tính mới, vào mục <em>Quyền Lợi &gt; Kích Hoạt Mã Key</em> và dán mã ở trên.
      </div>
    </div>

    <!-- Modern Dark Footer -->
    <div style="padding: 24px 36px; background: #0f172a; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6;">
      <div style="font-weight: 700; color: #ffffff; font-size: 13px; margin-bottom: 6px;">
        MVD TECH & DESIGN STUDIO
      </div>
      <p style="margin: 0 0 10px 0;">
        Zalo / Hotline: <strong style="color: #38bdf8;">${supportZalo}</strong> &nbsp;|&nbsp; Website: <a href="${companyUrl}" style="color: #38bdf8; text-decoration: none;">${cleanWebUrl}</a>
      </p>
      <div style="height: 1px; background: #1e293b; margin: 12px 0;"></div>
      <p style="margin: 0; font-size: 11px; color: #64748b;">
        © 2026 MVD Tech & Design Studio. Toàn bộ quyền được bảo lưu.<br>
        Email này được tạo tự động từ hệ thống quản lý giấy phép bản quyền MVD Tech & Design Studio.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

async function main() {
  console.log('Bắt đầu gửi bù email cho các đơn hàng chưa nhận được mail...\n');

  for (const order of orders) {
    const subject = `[MVD TECH & DESIGN STUDIO] KÍCH HOẠT BẢN QUYỀN THÀNH CÔNG - ĐƠN HÀNG #${order.orderCode}`;
    const html = buildHtml(order);

    try {
      console.log(`Đang gửi mail tới: ${order.buyerName} <${order.buyerEmail}> (Đơn: #${order.orderCode}, Key: ${order.keyString})...`);
      const info = await transporter.sendMail({
        from: '"MVD Tech & Design Studio" <ougvn.it2@gmail.com>',
        to: order.buyerEmail,
        subject,
        html,
      });
      console.log(`✅ Gửi thành công tới ${order.buyerEmail}! MessageID: ${info.messageId}\n`);
    } catch (err) {
      console.error(`❌ Gửi thất bại tới ${order.buyerEmail}:`, err);
    }
  }

  console.log('Hoàn tất gửi bù email!');
}

main().catch(console.error);
