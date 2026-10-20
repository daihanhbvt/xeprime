import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  SENDER_TYPE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { runRetention, type RetentionOptions } from '../src/jobs/retention';
import type { RetentionDeleter } from '../src/lib/firestore';

/**
 * Retention chạy trên PostgreSQL THẬT + fake deleter (không cần Firestore). Điều phải khoá:
 *
 *  - xoá ĐÚNG những tin cũ nhất vượt ngưỡng, theo id document đã ghi — không truy vấn Firestore;
 *  - chỉ thành ứng viên khi vượt `keep + slack`, và dọn xong thì lượt sau không đụng lại;
 *  - tin chưa từng lên Firestore (`firebase_message_id` NULL) không được tính vào ngưỡng;
 *  - Firestore lỗi ⇒ Postgres KHÔNG được đánh dấu đã dọn; một hội thoại lỗi không chặn các
 *    hội thoại khác.
 *
 * Job quét CẢ database, nên test dùng `TEST_DATABASE_URL` (CI trỏ nó và `DATABASE_URL` vào cùng
 * một DB dùng một lần): chạy trên DB dev thì fake deleter sẽ xoá dấu của hội thoại thật trong khi
 * document của chúng còn nguyên trên Firestore dev.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/worker test
 */
const prisma = createPrismaClient(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const KEEP = 5;
const SLACK = 2;

let dbAvailable = false;
/** Mỗi hội thoại một khách: hội thoại là duy nhất theo cặp (khách, gian hàng). */
const customerIds: string[] = [];
const customerOf = new Map<string, string>();
let ownerId = '';
let tenantId = '';
let vehicleId = '';

/** `maxConversations` rộng: DB test dùng chung có thể có nhiều ứng viên tràn hơn hội thoại của test. */
function options(deleter: RetentionDeleter): RetentionOptions {
  return { deleter, keep: KEEP, slack: SLACK, maxConversations: 10_000 };
}

function recordingDeleter(failFor?: string): {
  deleter: RetentionDeleter;
  calls: Map<string, string[]>;
} {
  const calls = new Map<string, string[]>();
  return {
    calls,
    deleter: {
      async deleteMessages(convId, ids) {
        if (convId === failFor) throw new Error('firestore down');
        calls.set(convId, [...(calls.get(convId) ?? []), ...ids]);
      },
    },
  };
}

async function seedConversation(): Promise<string> {
  const id = newId();
  const customerId = newId();
  await prisma.user.create({
    data: {
      id: customerId,
      realm: ACCOUNT_REALM.CUSTOMER,
      displayName: 'Khách',
      email: `cus-${customerId}@xeprime.test`,
    },
  });
  customerIds.push(customerId);
  customerOf.set(id, customerId);
  await prisma.conversation.create({
    data: { id, tenantId, customerUserId: customerId, vehicleId },
  });
  return id;
}

/**
 * `count` tin cách nhau một giây, cũ → mới. `docIds` = id document trên Firestore (mặc định
 * trùng id tin); `null` = tin chưa từng lên Firestore. Trả id tin theo đúng thứ tự thời gian.
 */
async function seedMessages(
  conversationId: string,
  count: number,
  opts: { startAt: Date; docId?: ((id: string) => string) | null },
): Promise<string[]> {
  const ids = Array.from({ length: count }, () => newId());
  const docId = opts.docId === undefined ? (id: string) => id : opts.docId;
  await prisma.message.createMany({
    data: ids.map((id, i) => ({
      id,
      conversationId,
      senderUserId: customerOf.get(conversationId) ?? null,
      senderType: SENDER_TYPE.CUSTOMER,
      text: `tin ${i}`,
      sentAt: new Date(opts.startAt.getTime() + i * 1000),
      firebaseMessageId: docId ? docId(id) : null,
    })),
  });
  return ids;
}

async function projectedIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, firebaseMessageId: { not: null } },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const T0 = new Date('2026-01-01T00:00:00Z');

before(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.create({
    data: {
      id: ownerId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Chủ shop',
      email: `own-${ownerId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop retention',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: { id: vehicleId, tenantId, code: 'V1', name: 'Xe', vehicleType: VEHICLE_TYPE.CAR },
  });
});

after(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [...customerIds, ownerId] } } });
  }
  await prisma.$disconnect();
});

test('chưa vượt keep + slack thì KHÔNG đụng; vượt thì xoá đúng các tin CŨ NHẤT', async () => {
  if (!dbAvailable) return;
  const conversationId = await seedConversation();
  await seedMessages(conversationId, KEEP + SLACK, { startAt: T0 });

  const quiet = recordingDeleter();
  await runRetention(prisma, options(quiet.deleter));
  assert.equal(quiet.calls.has(conversationId), false, 'trong biên độ thì chưa phải ứng viên');

  await seedMessages(conversationId, 1, { startAt: new Date('2026-01-02T00:00:00Z') });
  const before = await projectedIds(conversationId);
  const { deleter, calls } = recordingDeleter();
  await runRetention(prisma, options(deleter));

  const expected = before.slice(0, before.length - KEEP);
  assert.deepEqual([...(calls.get(conversationId) ?? [])].sort(), [...expected].sort());
  assert.deepEqual(await projectedIds(conversationId), before.slice(-KEEP), 'còn đúng KEEP tin mới nhất');

  // Lượt sau: hội thoại đã dọn rời tập ứng viên.
  const again = recordingDeleter();
  await runRetention(prisma, options(again.deleter));
  assert.equal(again.calls.has(conversationId), false);
});

test('tin chưa từng lên Firestore không được tính vào ngưỡng', async () => {
  if (!dbAvailable) return;
  const conversationId = await seedConversation();
  await seedMessages(conversationId, KEEP, { startAt: T0 });
  await seedMessages(conversationId, 10, { startAt: new Date('2026-01-03T00:00:00Z'), docId: null });

  const { deleter, calls } = recordingDeleter();
  await runRetention(prisma, options(deleter));

  assert.equal(calls.has(conversationId), false);
  assert.equal((await projectedIds(conversationId)).length, KEEP);
});

test('xoá theo id document ĐÃ GHI, không suy từ id Postgres', async () => {
  if (!dbAvailable) return;
  const conversationId = await seedConversation();
  const ids = await seedMessages(conversationId, KEEP + SLACK + 1, {
    startAt: T0,
    docId: (id) => `legacy-${id}`,
  });

  const { deleter, calls } = recordingDeleter();
  await runRetention(prisma, options(deleter));

  const expected = ids.slice(0, SLACK + 1).map((id) => `legacy-${id}`);
  assert.deepEqual([...(calls.get(conversationId) ?? [])].sort(), expected.sort());
});

test('Firestore lỗi ⇒ không đánh dấu đã dọn, và lượt chạy báo lỗi', async () => {
  if (!dbAvailable) return;
  const conversationId = await seedConversation();
  await seedMessages(conversationId, KEEP + SLACK + 3, { startAt: T0 });
  const before = await projectedIds(conversationId);

  const failing: RetentionDeleter = {
    async deleteMessages() {
      throw new Error('firestore down');
    },
  };
  await assert.rejects(() => runRetention(prisma, options(failing)), /firestore down/);

  assert.deepEqual(
    await projectedIds(conversationId),
    before,
    'mọi tin vẫn phải được coi là còn trên Firestore',
  );
});

test('một hội thoại lỗi KHÔNG chặn hội thoại khác, và lượt chạy vẫn hoàn tất', async () => {
  if (!dbAvailable) return;
  const broken = await seedConversation();
  const healthy = await seedConversation();
  await seedMessages(broken, KEEP + SLACK + 4, { startAt: T0 });
  await seedMessages(healthy, KEEP + SLACK + 1, { startAt: T0 });

  const { deleter, calls } = recordingDeleter(broken);
  const trimmed = await runRetention(prisma, options(deleter));

  assert.ok(trimmed >= SLACK + 1);
  assert.equal(calls.get(healthy)?.length, SLACK + 1);
  assert.equal((await projectedIds(broken)).length, KEEP + SLACK + 4, 'hội thoại lỗi giữ nguyên dấu');
  assert.equal((await projectedIds(healthy)).length, KEEP);
});
