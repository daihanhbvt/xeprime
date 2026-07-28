import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  MEMBERSHIP_STATUS,
  OUTBOX_STATUS,
  SENDER_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { MAX_ATTEMPTS, pumpOutbox } from '../src/jobs/outbox-pump';
import type { ConversationDoc, MessageDoc, OutboxWriter } from '../src/lib/firestore';

/**
 * Outbox pump chạy trên PostgreSQL THẬT + fake writer (không cần Firestore/Java). Kiểm chứng
 * state machine: success → done + idempotent (doc id = messageId), lỗi → pending + attempts +
 * backoff, quá ngưỡng → failed. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/worker test
 */
const prisma = createPrismaClient();

let dbAvailable = false;
let customerId = '';
let ownerId = '';
let tenantId = '';
let vehicleId = '';
let conversationId = '';

interface WriterCalls {
  conversations: { id: string; doc: ConversationDoc }[];
  messages: { convId: string; msgId: string; doc: MessageDoc }[];
}

function recordingWriter(): { writer: OutboxWriter; calls: WriterCalls } {
  const calls: WriterCalls = { conversations: [], messages: [] };
  const writer: OutboxWriter = {
    async upsertConversation(id, doc) {
      calls.conversations.push({ id, doc });
    },
    async writeMessage(convId, msgId, doc) {
      calls.messages.push({ convId, msgId, doc });
    },
  };
  return { writer, calls };
}

const throwingWriter: OutboxWriter = {
  async upsertConversation() {
    throw new Error('firestore down');
  },
  async writeMessage() {
    throw new Error('firestore down');
  },
};

/** Tạo một Message + MessageOutbox(pending) mới, trả messageId. */
async function seedMessageWithOutbox(): Promise<string> {
  const messageId = newId();
  await prisma.message.create({
    data: {
      id: messageId,
      conversationId,
      senderUserId: customerId,
      senderType: SENDER_TYPE.CUSTOMER,
      text: 'xin chào',
    },
  });
  await prisma.messageOutbox.create({ data: { id: newId(), messageId } });
  return messageId;
}

before(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  customerId = newId();
  ownerId = newId();
  tenantId = newId();
  vehicleId = newId();
  conversationId = newId();

  await prisma.user.createMany({
    data: [
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop pump',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.vehicle.create({
    data: { id: vehicleId, tenantId, code: 'V1', name: 'Xe', vehicleType: VEHICLE_TYPE.CAR },
  });
  await prisma.conversation.create({
    data: { id: conversationId, tenantId, customerUserId: customerId, vehicleId },
  });
});

after(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, ownerId] } } });
  }
  await prisma.$disconnect();
});

test('đẩy thành công → outbox done, message có firebaseMessageId, writer nhận đúng doc', async () => {
  if (!dbAvailable) return;
  const messageId = await seedMessageWithOutbox();
  const { writer, calls } = recordingWriter();

  const done = await pumpOutbox(prisma, writer);
  assert.equal(done >= 1, true);

  const outbox = await prisma.messageOutbox.findUniqueOrThrow({ where: { messageId } });
  assert.equal(outbox.status, OUTBOX_STATUS.DONE);

  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  assert.equal(message.firebaseMessageId, messageId);

  const wrote = calls.messages.find((m) => m.msgId === messageId);
  assert.ok(wrote, 'writer phải nhận message');
  assert.equal(wrote?.convId, conversationId);

  // memberUids gồm cả khách lẫn chủ shop (mirror cho Security Rules).
  const conv = calls.conversations.find((c) => c.id === conversationId);
  assert.ok(conv);
  assert.ok(conv?.doc.memberUids.includes(customerId));
  assert.ok(conv?.doc.memberUids.includes(ownerId));
});

test('idempotent: đẩy lại cùng message → doc id vẫn = messageId (ghi đè, không nhân đôi)', async () => {
  if (!dbAvailable) return;
  const messageId = await seedMessageWithOutbox();

  await pumpOutbox(prisma, recordingWriter().writer);
  // Ép đẩy lại lần nữa.
  await prisma.messageOutbox.update({
    where: { messageId },
    data: { status: OUTBOX_STATUS.PENDING },
  });
  const { writer, calls } = recordingWriter();
  await pumpOutbox(prisma, writer);

  const wrote = calls.messages.filter((m) => m.msgId === messageId);
  assert.equal(wrote.length, 1, 'chỉ ghi một doc với id = messageId');
});

test('lỗi writer → outbox pending, attempts+1, nextAttemptAt lùi, lastError set', async () => {
  if (!dbAvailable) return;
  const messageId = await seedMessageWithOutbox();
  const beforeRun = Date.now();

  await pumpOutbox(prisma, throwingWriter);

  const outbox = await prisma.messageOutbox.findUniqueOrThrow({ where: { messageId } });
  assert.equal(outbox.status, OUTBOX_STATUS.PENDING);
  assert.equal(outbox.attempts, 1);
  assert.ok(outbox.nextAttemptAt.getTime() > beforeRun, 'nextAttemptAt phải lùi về tương lai');
  assert.ok(outbox.lastError && outbox.lastError.length > 0);
});

test('quá MAX_ATTEMPTS → failed', async () => {
  if (!dbAvailable) return;
  const messageId = await seedMessageWithOutbox();
  // Đặt attempts sát ngưỡng để một lần lỗi nữa là failed. nextAttemptAt về quá khứ để được quét.
  await prisma.messageOutbox.update({
    where: { messageId },
    data: { attempts: MAX_ATTEMPTS - 1, nextAttemptAt: new Date(Date.now() - 1_000) },
  });

  await pumpOutbox(prisma, throwingWriter);

  const outbox = await prisma.messageOutbox.findUniqueOrThrow({ where: { messageId } });
  assert.equal(outbox.attempts, MAX_ATTEMPTS);
  assert.equal(outbox.status, OUTBOX_STATUS.FAILED);
});
