import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  await prisma.subscription.updateMany({
    data: {
      expiresAt: yesterday,
      status: 'ACTIVE' // Leave as ACTIVE so the backend calculates diff to 0 and updates it to EXPIRED
    }
  });
  console.log("Updated all subscriptions to expire yesterday.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
