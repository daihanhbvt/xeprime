import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PUSH_DELIVERY_STATUS,
  PUSH_ERROR_CODE,
  PUSH_PLATFORM,
  PUSH_PRIORITY,
} from '@xeprime/types';
import { MAX_ATTEMPTS, dispatchPushDeliveries } from '../src/jobs/push-dispatch';
import type { PushMessage, PushSender } from '../src/lib/fcm';

/**
 * Job đẩy thông báo trên PostgreSQL THẬT + sender giả (không gọi FCM). Kiểm chứng state machine
 * (`pending → sent` / `retry` / `failed`), token chết làm TẮT thiết bị, delivery hết hạn không
 * được gửi muộn, và hai worker chạy song song không gửi trùng một dòng.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/worker test
 */
const prisma = createPrismaClient();

let dbAvailable = false;
let userId = '';
let deviceId = '';

/** Sender ghi lại mọi lần gửi; `fail` để mô phỏng lỗi có `code` như firebase-admin ném ra. */
function fakeSender(fail?: { code: string }): { sender: PushSender; sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  const sender: PushSender = {
    async send(message) {
      sent.push(message);
      if (fail) throw Object.assign(new Error('fcm lỗi'), fail);
      return { messageId: `projects/x/messages/${message.token.slice(-4)}` };
    },
  };
  return { sender, sent };
}

async function seedDelivery(options: {
  device?: string;
  expiresAt?: Date;
  type?: string;
  targetType?: string;
  url?: string | null;
}): Promise<{ notificationId: string; deliveryId: string; targetId: string }> {
  const notificationId = newId();
  // ULID thật, không phải 'BK1': `target_id` là CHAR(26) nên Postgres ĐỆM khoảng trắng vào một
  // chuỗi ngắn, và chuỗi có khoảng trắng thì không còn là một id hợp lệ để ghép vào đường dẫn.
  const targetId = newId();
  const url = options.url === undefined ? '/manage/bookings/BK1' : options.url;
  await prisma.notification.create({
    data: {
      id: notificationId,
      userId,
      type: options.type ?? NOTIFICATION_TYPE.BOOKING_CREATED,
      title: 'Đơn thuê mới',
      body: 'Xe test',
      targetType: options.targetType ?? NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId,
      ...(url ? { dataJson: { url } } : {}),
    },
  });
  const deliveryId = newId();
  await prisma.pushDelivery.create({
    data: {
      id: deliveryId,
      notificationId,
      pushDeviceId: options.device ?? deviceId,
      ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
    },
  });
  return { notificationId, deliveryId, targetId };
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

  userId = newId();
  deviceId = newId();
  await prisma.user.create({
    data: { id: userId, displayName: 'Người nhận', email: `push-${userId}@xeprime.test` },
  });
  await prisma.pushDevice.create({
    data: {
      id: deviceId,
      userId,
      providerToken: `tok-${deviceId}`,
      platform: PUSH_PLATFORM.ANDROID,
    },
  });
});

after(async () => {
  if (dbAvailable) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  test(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

maybe('gửi thành công → sent + providerMessageId, và payload mang đúng url/kênh/ưu tiên', async () => {
  const { deliveryId, notificationId } = await seedDelivery({});
  const { sender, sent } = fakeSender();

  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.data.url, '/manage/bookings/BK1');
  assert.equal(sent[0]?.data.notificationId, notificationId);
  // Token đi trong payload nhưng KHÔNG được nằm trong data — data đi qua log của OS.
  assert.equal(Object.values(sent[0]?.data ?? {}).includes(sent[0]!.token), false);

  const row = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  assert.equal(row.status, PUSH_DELIVERY_STATUS.SENT);
  assert.ok(row.sentAt);
  assert.ok(row.providerMessageId);
  assert.equal(row.attempts, 1);
});

maybe('tin nhắn chat: ưu tiên cao, kênh riêng, gộp theo hội thoại', async () => {
  const { targetId } = await seedDelivery({
    type: NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED,
    targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION,
    url: '/chat/CV1',
  });
  const { sender, sent } = fakeSender();

  await dispatchPushDeliveries(prisma, sender);

  assert.equal(sent[0]?.priority, PUSH_PRIORITY.HIGH);
  assert.equal(sent[0]?.androidChannelId, 'xeprime-messages');
  assert.equal(sent[0]?.collapseKey, `conversation:${targetId}`);
});

maybe('lỗi tạm thời → retry, có backoff, KHÔNG tắt thiết bị', async () => {
  const { deliveryId } = await seedDelivery({});
  const { sender } = fakeSender({ code: 'messaging/server-unavailable' });

  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.retried, 1);
  const row = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  assert.equal(row.status, PUSH_DELIVERY_STATUS.RETRY);
  assert.equal(row.lastErrorCode, PUSH_ERROR_CODE.PROVIDER_UNAVAILABLE);
  assert.ok(row.nextAttemptAt.getTime() > Date.now());

  const device = await prisma.pushDevice.findUniqueOrThrow({ where: { id: deviceId } });
  assert.equal(device.enabled, true);
});

maybe('quá MAX_ATTEMPTS → failed, không thử lại vô hạn', async () => {
  const { deliveryId } = await seedDelivery({});
  await prisma.pushDelivery.update({
    where: { id: deliveryId },
    // Lần chạy tới sẽ cộng thành đúng MAX_ATTEMPTS — lần thử cuối cùng được phép.
    data: { attempts: MAX_ATTEMPTS - 1 },
  });
  const { sender } = fakeSender({ code: 'messaging/server-unavailable' });

  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.failed, 1);
  const row = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  assert.equal(row.status, PUSH_DELIVERY_STATUS.FAILED);
  assert.equal(row.lastErrorCode, PUSH_ERROR_CODE.MAX_ATTEMPTS);
});

maybe('token đã gỡ app → TẮT thiết bị, và mọi tin sau đó không được gửi', async () => {
  const deadDeviceId = newId();
  await prisma.pushDevice.create({
    data: {
      id: deadDeviceId,
      userId,
      providerToken: `dead-${deadDeviceId}`,
      platform: PUSH_PLATFORM.ANDROID,
    },
  });
  await seedDelivery({ device: deadDeviceId });
  const { sender } = fakeSender({ code: 'messaging/registration-token-not-registered' });

  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.devicesDisabled, 1);
  assert.equal(result.failed, 1);
  const device = await prisma.pushDevice.findUniqueOrThrow({ where: { id: deadDeviceId } });
  assert.equal(device.enabled, false);
  assert.ok(device.disabledAt);

  // Tin xếp hàng SAU khi thiết bị tắt: job phải tôn trọng trạng thái hiện tại, không phải
  // trạng thái lúc xếp hàng.
  const { deliveryId: laterId } = await seedDelivery({ device: deadDeviceId });
  const later = fakeSender();
  await dispatchPushDeliveries(prisma, later.sender);
  assert.equal(later.sent.length, 0);
  const laterRow = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: laterId } });
  assert.equal(laterRow.status, PUSH_DELIVERY_STATUS.FAILED);
});

maybe('delivery đã hết hạn KHÔNG được gửi muộn', async () => {
  const { deliveryId } = await seedDelivery({ expiresAt: new Date(Date.now() - 60_000) });
  const { sender, sent } = fakeSender();

  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.expired, 1);
  assert.equal(sent.length, 0);
  const row = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  assert.equal(row.status, PUSH_DELIVERY_STATUS.FAILED);
  assert.equal(row.lastErrorCode, PUSH_ERROR_CODE.EXPIRED);
});

/**
 * Bất biến quan trọng nhất của job: hai tiến trình chạy CÙNG LÚC (rolling deploy) không được
 * gửi cùng một dòng. Nó nằm ở `UPDATE … FOR UPDATE SKIP LOCKED`, không ở advisory lock — nên
 * test phải chạy song song thật, gọi tuần tự chỉ chứng minh state machine.
 */
maybe('hai worker song song: mỗi delivery được gửi ĐÚNG một lần', async () => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) ids.push((await seedDelivery({})).deliveryId);

  const a = fakeSender();
  const b = fakeSender();
  await Promise.all([
    dispatchPushDeliveries(prisma, a.sender),
    dispatchPushDeliveries(prisma, b.sender),
  ]);

  const tokensSent = [...a.sent, ...b.sent].length;
  assert.equal(tokensSent, 5);

  const rows = await prisma.pushDelivery.findMany({ where: { id: { in: ids } } });
  for (const row of rows) {
    assert.equal(row.status, PUSH_DELIVERY_STATUS.SENT);
    assert.equal(row.attempts, 1);
  }
});

/**
 * Worker bị SIGTERM giữa lô (mỗi lần deploy) bỏ lại dòng mắc kẹt ở `processing`. Không có ai
 * trả chúng về hàng đợi thì đó là mấy chục thông báo chết lặng — không log, không cảnh báo.
 */
maybe('dòng mắc kẹt ở processing được THU HỒI và gửi lại', async () => {
  const { deliveryId } = await seedDelivery({});
  // Mô phỏng một tiến trình đã chết: đã chiếm dòng (attempts đã cộng) rồi biến mất.
  await prisma.$executeRaw`
    UPDATE push_deliveries
       SET status = ${PUSH_DELIVERY_STATUS.PROCESSING},
           attempts = 1,
           updated_at = now() - interval '10 minutes'
     WHERE id = ${deliveryId}
  `;

  const { sender, sent } = fakeSender();
  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.reclaimed, 1);
  assert.equal(sent.length, 1);
  const row = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  assert.equal(row.status, PUSH_DELIVERY_STATUS.SENT);
  // Lần chiếm thứ hai cộng tiếp — thu hồi KHÔNG reset bộ đếm, nên `MAX_ATTEMPTS` vẫn chặn được
  // một dòng bị thu hồi đi thu hồi lại mãi.
  assert.equal(row.attempts, 2);
});

maybe('dòng processing CÒN MỚI không bị cướp khỏi tiến trình đang gửi', async () => {
  const { deliveryId } = await seedDelivery({});
  await prisma.pushDelivery.update({
    where: { id: deliveryId },
    data: { status: PUSH_DELIVERY_STATUS.PROCESSING, attempts: 1 },
  });

  const { sender, sent } = fakeSender();
  const result = await dispatchPushDeliveries(prisma, sender);

  assert.equal(result.reclaimed, 0);
  assert.equal(sent.length, 0);
  const row = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  assert.equal(row.status, PUSH_DELIVERY_STATUS.PROCESSING);

  // Dọn để không lẫn sang case sau.
  await prisma.pushDelivery.delete({ where: { id: deliveryId } });
});

maybe('unique (notification, device) chặn xếp hàng trùng ở tầng DB', async () => {
  const { notificationId } = await seedDelivery({});
  await assert.rejects(
    prisma.pushDelivery.create({
      data: { id: newId(), notificationId, pushDeviceId: deviceId },
    }),
    (error: { code?: string }) => error.code === 'P2002',
  );
});
