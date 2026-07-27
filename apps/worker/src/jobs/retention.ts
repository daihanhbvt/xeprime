import type { PrismaClient } from '@xeprime/prisma';
import { CHAT_FIRESTORE_KEEP } from '../lib/env';
import { trimMessages } from '../lib/firestore';

/**
 * Trim Firestore về `CHAT_FIRESTORE_KEEP` tin gần nhất mỗi hội thoại (ADR 0009 §2). Postgres là
 * source of truth nên xoá bớt projection an toàn. Đếm số tin ở Postgres để chỉ đụng hội thoại
 * thật sự vượt ngưỡng. Trả tổng số tin đã trim.
 */
export async function runRetention(prisma: PrismaClient): Promise<number> {
  const convs = await prisma.conversation.findMany({
    where: { messages: { some: {} } },
    select: { id: true, _count: { select: { messages: true } } },
    take: 500,
  });

  let trimmed = 0;
  for (const c of convs) {
    if (c._count.messages <= CHAT_FIRESTORE_KEEP) continue;
    trimmed += await trimMessages(c.id, CHAT_FIRESTORE_KEEP);
  }
  return trimmed;
}
