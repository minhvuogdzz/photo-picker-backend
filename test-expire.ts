import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testExpiration() {
  try {
    const user = await prisma.user.findFirst({
      where: { role: 'USER' },
      include: { subscription: true }
    });

    if (!user || !user.subscription) {
      console.log('No user with subscription found.');
      return;
    }

    console.log(`Setting subscription for user ${user.email} to expire in 5 seconds...`);
    
    const expiresAt = new Date(Date.now() + 5000); // 5 seconds from now

    await prisma.subscription.update({
      where: { id: user.subscription.id },
      data: {
        status: 'ACTIVE',
        expiresAt: expiresAt
      }
    });

    console.log(`Updated. Open the Photo Picker Pro app as ${user.email} right now!`);
    console.log(`In ~5 seconds the cron job will detect the expiration and lock the account.`);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testExpiration();
