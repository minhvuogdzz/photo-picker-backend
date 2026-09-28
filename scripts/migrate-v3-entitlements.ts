import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runMigration() {
  console.log('🚀 Starting V3 Entitlements & Reset Migration on MongoDB...');

  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const tenYearsFromNow = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);

  // QUAN TRỌNG: loại trừ tài khoản ADMIN khỏi lần reset này. Nếu admin cũng bị hạ
  // xuống trial 3 ngày thì sau 3 ngày không còn ai vào được trang quản trị để cấp
  // key hay duyệt đơn — tự khoá chính mình ra ngoài hệ thống.
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  });
  const adminIds = admins.map((a) => ({ $oid: a.id }));
  console.log(
    `🛡️  Giữ nguyên/ưu tiên ${admins.length} tài khoản admin: ${admins.map((a) => a.email).join(', ') || '(không có)'}`,
  );

  // 1. Update all existing Subscriptions (TRỪ admin):
  // - status: TRIAL
  // - plan: STARTER
  // - expiresAt: 3 days from now
  // - entitlements: [{ app: "ALL", expiresAt: 3 days from now, isTrial: true }]
  // - remove/unset isPremium
  const subUpdateResult: any = await prisma.$runCommandRaw({
    update: 'Subscription',
    updates: [
      {
        q: adminIds.length > 0 ? { userId: { $nin: adminIds } } : {},
        u: {
          $set: {
            status: 'TRIAL',
            plan: 'STARTER',
            expiresAt: { $date: threeDaysFromNow.toISOString() },
            entitlements: [
              {
                app: 'ALL',
                expiresAt: { $date: threeDaysFromNow.toISOString() },
                isTrial: true,
              },
            ],
            updatedAt: { $date: new Date().toISOString() },
          },
          $unset: {
            isPremium: '',
          },
        },
        multi: true,
      },
    ],
  });

  console.log('✅ Subscription collection migration result:', subUpdateResult);

  // 1b. Cấp cho admin quyền ALL dài hạn để không bao giờ bị chặn khỏi trang quản trị.
  if (adminIds.length > 0) {
    const adminUpdateResult: any = await prisma.$runCommandRaw({
      update: 'Subscription',
      updates: [
        {
          q: { userId: { $in: adminIds } },
          u: {
            $set: {
              status: 'ACTIVE',
              plan: 'STUDIO',
              expiresAt: { $date: tenYearsFromNow.toISOString() },
              entitlements: [
                {
                  app: 'ALL',
                  expiresAt: { $date: tenYearsFromNow.toISOString() },
                  isTrial: false,
                },
              ],
              updatedAt: { $date: new Date().toISOString() },
            },
            $unset: {
              isPremium: '',
            },
          },
          multi: true,
        },
      ],
    });
    console.log('✅ Admin subscription result:', adminUpdateResult);
  }

  // 2. Update LicenseKey collection:
  // Add targetApp: 'ALL' to any license keys
  const keyUpdateResult: any = await prisma.$runCommandRaw({
    update: 'LicenseKey',
    updates: [
      {
        q: { targetApp: { $exists: false } },
        u: {
          $set: {
            targetApp: 'ALL',
          },
        },
        multi: true,
      },
    ],
  });

  console.log('✅ LicenseKey collection migration result:', keyUpdateResult);

  // 3. Verify updated subscriptions
  const verifyResult: any = await prisma.$runCommandRaw({
    find: 'Subscription',
    filter: {},
  });

  const subs = verifyResult.cursor?.firstBatch || [];
  console.log(`\n🎉 Verification: Total ${subs.length} subscriptions updated successfully to 3-day Trial (ALL):`);
  for (const s of subs) {
    console.log(`- Sub ${s._id.$oid || s._id}: status=${s.status}, plan=${s.plan}, expiresAt=${s.expiresAt?.$date || s.expiresAt}, entitlements=${JSON.stringify(s.entitlements)}`);
  }
}

runMigration()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
