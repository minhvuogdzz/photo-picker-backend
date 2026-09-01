import { PrismaClient } from '@prisma/client';

export async function migrateUsernames(prisma: PrismaClient): Promise<{ updatedCount: number }> {
  const allUsers = await prisma.user.findMany();
  const users = allUsers.filter((u) => !u.username || u.username.trim() === '');

  if (users.length === 0) {
    return { updatedCount: 0 };
  }

  console.log(`[UsernameMigration] Found ${users.length} users needing username migration.`);

  // Get all existing usernames to prevent collisions
  const existingUsersWithUsername = await prisma.user.findMany({
    where: {
      username: { not: null },
    },
    select: { id: true, username: true },
  });

  const takenUsernames = new Set<string>(
    existingUsersWithUsername
      .map((u) => u.username?.toLowerCase())
      .filter((u): u is string => Boolean(u))
  );

  let updatedCount = 0;

  for (const user of users) {
    let base = user.email.includes('@')
      ? user.email.split('@')[0].toLowerCase().trim()
      : user.email.toLowerCase().trim();

    // Sanitize: allow lowercase alphanumeric, underscores, dots, hyphens
    base = base.replace(/[^a-z0-9_.-]/g, '');
    if (!base) {
      base = `user_${user.id.slice(-4)}`;
    }

    let candidate = base;
    let suffix = 1;

    while (takenUsernames.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix++;
    }

    takenUsernames.add(candidate);

    await prisma.user.update({
      where: { id: user.id },
      data: { username: candidate },
    });

    console.log(`[UsernameMigration] Migrated user ${user.email} -> username: "${candidate}"`);
    updatedCount++;
  }

  console.log(`[UsernameMigration] Successfully migrated ${updatedCount} users.`);
  return { updatedCount };
}
