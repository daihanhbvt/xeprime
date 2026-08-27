import type { PrismaClient } from '@xeprime/prisma';
import { MEMBERSHIP_STATUS, OUTBOX_STATUS } from '@xeprime/types';
import { firestoreWriter, type OutboxWriter } from '../lib/firestore';

const BATCH = 50;
export const MAX_ATTEMPTS = 8;

/**
 * Đẩy các tin trong outbox sang Firestore (ADR 0009 §3). Idempotent: doc id = messageId nên
 * đẩy lại chỉ ghi đè, không nhân đôi. Lỗi thì tăng attempts + lùi nextAttemptAt (backoff),
 * quá ngưỡng thì đánh `failed` để soi tay. Trả số tin đẩy thành công.
 * `writer` chèn được để test bằng fake, mặc định là Firestore thật.
 */
export async function pumpOutbox(
  prisma: PrismaClient,
  writer: OutboxWriter = firestoreWriter,
): Promise<number> {
  const pending = await prisma.messageOutbox.findMany({
    where: { status: OUTBOX_STATUS.PENDING, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
    select: { id: true, messageId: true, attempts: true },
  });

  let done = 0;
  for (const row of pending) {
    try {
      await pushMessage(prisma, writer, row.messageId);
      await prisma.messageOutbox.update({
        where: { id: row.id },
        data: { status: OUTBOX_STATUS.DONE, lastError: null },
      });
      await prisma.message.update({
        where: { id: row.messageId },
        data: { firebaseMessageId: row.messageId },
      });
      done++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await prisma.messageOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          status: failed ? OUTBOX_STATUS.FAILED : OUTBOX_STATUS.PENDING,
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
          lastError: String((err as Error)?.message ?? err).slice(0, 500),
        },
      });
    }
  }
  return done;
}

async function pushMessage(
  prisma: PrismaClient,
  writer: OutboxWriter,
  messageId: string,
): Promise<void> {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      senderUserId: true,
      senderType: true,
      messageType: true,
      text: true,
      sentAt: true,
      attachments: { select: { fileUrl: true, fileType: true, fileName: true } },
      conversation: {
        select: {
          id: true,
          tenantId: true,
          customerUserId: true,
          status: true,
          lastMessageText: true,
          lastMessageAt: true,
          lastSenderType: true,
        },
      },
    },
  });
  // Message bị xoá trước khi đẩy → coi như xong (không có gì để chiếu).
  if (!msg) return;

  const conv = msg.conversation;
  const members = await prisma.tenantMembership.findMany({
    where: { tenantId: conv.tenantId, status: MEMBERSHIP_STATUS.ACTIVE },
    select: { userId: true },
  });
  const memberUids = [
    ...new Set([
      ...(conv.customerUserId ? [conv.customerUserId] : []),
      ...members.map((m) => m.userId),
    ]),
  ];

  await writer.upsertConversation(conv.id, {
    tenantId: conv.tenantId,
    memberUids,
    status: conv.status,
    lastMessageText: conv.lastMessageText,
    lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.getTime() : null,
    lastSenderType: conv.lastSenderType,
    updatedAt: Date.now(),
  });

  await writer.writeMessage(conv.id, msg.id, {
    senderUserId: msg.senderUserId,
    senderType: msg.senderType,
    messageType: msg.messageType,
    text: msg.text,
    attachments: msg.attachments.map((a) => ({ url: a.fileUrl, type: a.fileType, name: a.fileName })),
    sentAt: msg.sentAt.getTime(),
  });
}

/** Backoff mũ, trần 60s. */
function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts);
}
