import type { PrismaClient } from '@xeprime/prisma';
import { CHAT_FIRESTORE_KEEP } from '../lib/env';
import { firestoreRetentionDeleter, type RetentionDeleter } from '../lib/firestore';

/**
 * Biên độ trên `keep` trước khi một hội thoại thành ứng viên. Không có nó thì hội thoại nào vừa
 * dọn xong, chỉ cần một tin mới, là lại thành ứng viên ở nhịp sau — cả lượt chạy biến thành hàng
 * trăm lần xoá một document. Có biên độ thì mỗi lần dọn là một lô thật, và Firestore giữ tối đa
 * `keep + slack` tin mỗi hội thoại (listener của client chỉ đọc 30 tin mới nhất).
 */
const DEFAULT_SLACK = 20;

/**
 * Số hội thoại tối đa mỗi lượt. Ứng viên xếp theo độ TRÀN giảm dần, nên hội thoại tràn nhiều nhất
 * luôn được phục vụ trước và độ tràn của mọi hội thoại bị chặn trần — không có hội thoại nào bị
 * bỏ đói như bản cũ (`take: 500` không `orderBy`), kể cả khi luôn có hơn ngần này hội thoại sôi
 * động.
 */
const DEFAULT_MAX_CONVERSATIONS = 200;

/** Số tin xoá mỗi vòng trong MỘT hội thoại — giữ câu `IN (...)` và lô Firestore ở cỡ vừa phải. */
const CHUNK = 500;

/**
 * Lỗi liên tiếp bấy nhiêu hội thoại thì dừng lượt. Firestore sập thì mỗi lần commit đợi tới
 * timeout của nó; đi hết 200 ứng viên là giữ khoá retention hàng giờ để chứng minh một điều đã rõ
 * từ hội thoại thứ ba.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface RetentionOptions {
  deleter?: RetentionDeleter;
  keep?: number;
  slack?: number;
  maxConversations?: number;
}

/**
 * Trim Firestore về `keep` tin gần nhất mỗi hội thoại (ADR 0009 §2). Postgres là source of truth
 * nên xoá bớt projection an toàn. Trả tổng số tin đã trim.
 *
 * Postgres tự biết tin nào còn trên Firestore (`firebase_message_id IS NOT NULL` — xem
 * `schema.prisma`), nên lượt chạy không ĐỌC Firestore lần nào: tìm ứng viên, liệt kê tin thừa và
 * đánh dấu đã dọn đều chạy trên index một phần `messages_firestore_projection_idx`, và kích thước
 * index đó bám theo số hội thoại × (`keep` + `slack`), không theo tổng số tin đã từng gửi.
 *
 * Thứ tự trong một vòng: xoá Firestore TRƯỚC, đánh dấu Postgres SAU. Dừng giữa hai bước chỉ để lại
 * vài id được xoá thêm một lần ở lượt kế tiếp (no-op); làm ngược lại thì một lần dừng sẽ để lại
 * document mồ côi mà Postgres đã quên.
 */
export async function runRetention(
  prisma: PrismaClient,
  options: RetentionOptions = {},
): Promise<number> {
  const deleter = options.deleter ?? firestoreRetentionDeleter;
  const keep = options.keep ?? CHAT_FIRESTORE_KEEP;
  const slack = options.slack ?? DEFAULT_SLACK;
  const maxConversations = options.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const candidates = await prisma.$queryRaw<{ conversation_id: string }[]>`
    SELECT conversation_id
      FROM messages
     WHERE firebase_message_id IS NOT NULL
     GROUP BY conversation_id
    HAVING count(*) > ${keep + slack}
     ORDER BY count(*) DESC, conversation_id
     LIMIT ${maxConversations}
  `;

  let trimmed = 0;
  let consecutiveFailures = 0;
  for (const { conversation_id: conversationId } of candidates) {
    try {
      trimmed += await trimConversation(prisma, deleter, conversationId, keep);
      consecutiveFailures = 0;
    } catch (err) {
      // Một hội thoại lỗi không được chặn những hội thoại xếp sau nó…
      consecutiveFailures += 1;
      console.error(
        `retention: dọn hội thoại ${conversationId} lỗi — ${String((err as Error)?.message ?? err).slice(0, 200)}`,
      );
      // …nhưng lỗi liên tiếp (hoặc lỗi cả lượt) là Firestore đang hỏng ⇒ dừng, để health ghi
      // `lastError` thay vì đợi timeout của từng ứng viên còn lại.
      if (consecutiveFailures >= Math.min(MAX_CONSECUTIVE_FAILURES, candidates.length)) throw err;
    }
  }
  return trimmed;
}

async function trimConversation(
  prisma: PrismaClient,
  deleter: RetentionDeleter,
  conversationId: string,
  keep: number,
): Promise<number> {
  let total = 0;
  for (;;) {
    // Cùng thứ tự với listener của client (`sentAt desc`), `id` để phân xử hai tin cùng mili-giây.
    const stale = await prisma.message.findMany({
      where: { conversationId, firebaseMessageId: { not: null } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      skip: keep,
      take: CHUNK,
      select: { id: true, firebaseMessageId: true },
    });
    if (stale.length === 0) return total;

    // Xoá theo id document ĐÃ GHI, không suy từ id Postgres — cột này mang đúng id đó.
    await deleter.deleteMessages(
      conversationId,
      stale.flatMap((m) => (m.firebaseMessageId ? [m.firebaseMessageId] : [])),
    );
    await prisma.message.updateMany({
      where: { id: { in: stale.map((m) => m.id) } },
      data: { firebaseMessageId: null },
    });
    total += stale.length;
    if (stale.length < CHUNK) return total;
  }
}
