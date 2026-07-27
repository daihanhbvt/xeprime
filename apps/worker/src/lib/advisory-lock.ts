import type { PrismaClient } from '@xeprime/prisma';

/**
 * Chạy `fn` chỉ khi giành được advisory lock; nếu instance khác đang giữ thì bỏ qua lượt này
 * (worker constraint #2: đúng một instance chạy một job tại một thời điểm khi rolling deploy).
 */
export async function withAdvisoryLock(
  prisma: PrismaClient,
  key: number,
  fn: () => Promise<void>,
): Promise<void> {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS locked`;
  if (!rows[0]?.locked) return;
  try {
    await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${key})`;
  }
}
