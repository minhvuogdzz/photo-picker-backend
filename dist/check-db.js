"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const users = await prisma.user.findMany();
    console.log("USERS:", users.length);
    console.log(users);
}
main().then(() => prisma.$disconnect());
//# sourceMappingURL=check-db.js.map