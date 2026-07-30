import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  console.log("USERS:", users.length);
  console.log(users);
}
main().then(() => prisma.$disconnect());
