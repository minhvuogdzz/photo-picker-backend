import { PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123456', 10);
  
  // Seed a test user
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      password: hashedPassword,
      name: 'Test User',
      subscription: {
        create: {
          status: SubscriptionStatus.ACTIVE,
          plan: SubscriptionPlan.STARTER,
          expiresAt: new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days
        },
      },
    },
  });

  console.log({ user });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
