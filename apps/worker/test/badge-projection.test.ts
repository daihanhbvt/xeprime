import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backfillBadgeSignals,
  createPrismaClient,
  markBadgesDirty,
  newId,
} from '@xeprime/prisma';
import {
  MEMBERSHIP_STATUS,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  type UserBadgeDoc,
} from '@xeprime/types';
import { projectBadges } from '../src/jobs/badge-projection';
import type { BadgeWriter } from '../src/lib/firestore';

/**
 * Chiếu huy hiệu chạy trên PostgreSQL THẬT + fake writer (không cần Firestore/Java).
 *
 * Ba thứ được khoá ở đây, và cả ba đều là chỗ một bản viết lại dễ làm sai:
 *  1. phép đếm — nhất là luật "hội thoại mà chính chủ shop là KHÁCH không thuộc hộp thư gian hàng";
 *  2. tín hiệu đến TRONG LÚC đang chiếu không bị xoá oan (mất tín hiệu = badge đứng im vĩnh viễn);
 *  3. tắt Firestore thì tín hiệu được GIỮ, và giữ ở mức một dòng/người — bật lại là drain hết;
 *  4. đánh dấu ĐỒNG THỜI không nuốt mất lượt nào (số hiệu phải đếm đủ).
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/worker test
 */
const prisma = createPrismaClient();

let dbAvailable = false;
let customerId = '';
let ownerId = '';
let tenantId = '';
let vehicleId = '';
/**
 * Gian hàng THỨ HAI — không phải để cho đủ số.
 *
 * `conversations` có unique `(customer_user_id, tenant_id)`: một khách chỉ có đúng một thread với
 * một gian hàng. Muốn kiểm chứng "cộng chưa đọc của MỌI hội thoại" thì bắt buộc phải có hai gian
 * hàng — và đó cũng chính là hình dạng thật của badge phía khách.
 */
let tenant2Id = '';
let vehicle2Id = '';

interface Recorded {
  uid: string;
  doc: UserBadgeDoc;
}

function recordingWriter(): { writer: BadgeWriter; calls: Recorded[] } {
  const calls: Recorded[] = [];
  return {
    calls,
    writer: {
      async writeUserBadges(uid, doc) {
        calls.push({ uid, doc });
      },
    },
  };
}

async function seedConversation(opts: {
  customerUserId: string | null;
  unreadCustomer?: number;
  unreadTenant?: number;
  second?: boolean;
}): Promise<void> {
  await prisma.conversation.create({
    data: {
      id: newId(),
      tenantId: opts.second ? tenant2Id : tenantId,
      customerUserId: opts.customerUserId,
      vehicleId: opts.second ? vehicle2Id : vehicleId,
      unreadCustomerCount: opts.unreadCustomer ?? 0,
      unreadTenantCount: opts.unreadTenant ?? 0,
    },
  });
}

/**
 * `type` mặc định là một loại CÓ hiện ở chuông. Tin nhắn chat thì không
 * (`BELL_HIDDEN_NOTIFICATION_TYPES`) — biểu tượng chat đã mang số đó rồi — nên dùng nó làm dữ
 * liệu mẫu cho phép đếm chuông sẽ cho ra một bài test luôn ra 0 mà nhìn như đang kiểm thật.
 */
async function seedNotification(
  userId: string,
  read: boolean,
  type: string = NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED,
): Promise<void> {
  await prisma.notification.create({
    data: {
      id: newId(),
      userId,
      type,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      title: 'Có việc cần xử lý',
      readAt: read ? new Date() : null,
    },
  });
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
  tenant2Id = newId();
  vehicle2Id = newId();

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
      name: 'Shop badge',
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

  await prisma.tenant.create({
    data: {
      id: tenant2Id,
      code: `TEST-${tenant2Id.slice(-8)}`,
      slug: `test-${tenant2Id.toLowerCase().slice(-8)}`,
      name: 'Shop badge 2',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicle2Id,
      tenantId: tenant2Id,
      code: 'V2',
      name: 'Xe 2',
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });
});

beforeEach(async () => {
  if (!dbAvailable) return;
  // Mỗi test dựng lại bối cảnh của chính nó — hàng đợi là bảng dùng chung, rác của test trước
  // sẽ lọt vào lô của test sau.
  await prisma.userBadgeSignal.deleteMany({ where: { userId: { in: [customerId, ownerId] } } });
  await prisma.conversation.deleteMany({ where: { tenantId: { in: [tenantId, tenant2Id] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [customerId, ownerId] } } });
});

after(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, tenant2Id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, ownerId] } } });
  }
  await prisma.$disconnect();
});

test('đếm đúng cả ba con số và xoá tín hiệu sau khi chiếu', async () => {
  if (!dbAvailable) return;

  await seedConversation({ customerUserId: customerId, unreadCustomer: 3, unreadTenant: 2 });
  await seedConversation({ customerUserId: customerId, unreadCustomer: 1, second: true });
  await seedNotification(customerId, false);
  await seedNotification(customerId, false);
  await seedNotification(customerId, true);
  // Tin nhắn chat KHÔNG vào chuông — bản ghi vẫn tồn tại (thông báo đẩy cần nó) nhưng không đếm.
  await seedNotification(customerId, false, NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED);

  await markBadgesDirty(prisma, [customerId]);
  const { writer, calls } = recordingWriter();
  const result = await projectBadges(prisma, writer);

  assert.equal(result.failed, 0);
  const wrote = calls.find((c) => c.uid === customerId);
  assert.ok(wrote, 'phải chiếu cho khách');
  assert.equal(wrote?.doc.chatCustomer, 4, 'cộng chưa đọc qua MỌI gian hàng, không chỉ một');
  assert.equal(wrote?.doc.chatShop, 0, 'khách không thuộc gian hàng nào');
  assert.equal(
    wrote?.doc.notificationsUnread,
    2,
    'chỉ đếm thông báo CHƯA đọc, và KHÔNG đếm loại bị ẩn khỏi chuông (tin nhắn chat)',
  );

  const left = await prisma.userBadgeSignal.findUnique({ where: { userId: customerId } });
  assert.equal(left, null, 'chiếu xong thì tín hiệu phải biến mất');
});

test('hộp thư gian hàng KHÔNG tính hội thoại mà chính chủ shop là khách', async () => {
  if (!dbAvailable) return;

  // Khách thật nhắn vào shop: đếm.
  await seedConversation({ customerUserId: customerId, unreadTenant: 5 });
  // Chủ shop đi thuê xe của chính gian hàng mình: việc riêng, không thuộc hộp thư công việc.
  await seedConversation({ customerUserId: ownerId, unreadTenant: 7, unreadCustomer: 9 });

  await markBadgesDirty(prisma, [ownerId]);
  const { writer, calls } = recordingWriter();
  await projectBadges(prisma, writer);

  const wrote = calls.find((c) => c.uid === ownerId);
  assert.equal(wrote?.doc.chatShop, 5, 'loại đúng hội thoại mà chủ shop đứng vai khách');
  assert.equal(wrote?.doc.chatCustomer, 9, 'nhưng vai khách của họ vẫn được đếm bình thường');
});

test('tín hiệu tới TRONG LÚC chiếu thì không bị xoá — lượt sau vẫn chiếu lại', async () => {
  if (!dbAvailable) return;

  await seedConversation({ customerUserId: customerId, unreadCustomer: 1 });
  await markBadgesDirty(prisma, [customerId]);

  // Writer mô phỏng "có tin mới tới ngay khi worker đang ghi": đẩy dirty_at lên mốc mới hơn.
  const racingWriter: BadgeWriter = {
    async writeUserBadges() {
      await markBadgesDirty(prisma, [customerId]);
    },
  };
  await projectBadges(prisma, racingWriter);

  const left = await prisma.userBadgeSignal.findUnique({ where: { userId: customerId } });
  assert.ok(left, 'tín hiệu mới hơn phải ở lại hàng đợi, không bị lượt chiếu cũ nuốt mất');
});

/**
 * Bản trước DỌN tín hiệu khi `FIRESTORE_ENABLED=false`, và cái giá là một document Firestore cũ
 * nằm lại: bật lại cờ thì nó thắng lượt đọc REST đầu tiên của client. Giờ worker đơn giản KHÔNG
 * đăng ký vòng lặp khi Firestore tắt (xem `main.ts`), nên tín hiệu tích lại — nhưng tích ở mức
 * MỘT DÒNG/NGƯỜI, không theo số sự kiện. Đó là điều test này khoá.
 */
test('tắt Firestore: tín hiệu tích lại theo NGƯỜI, không theo số sự kiện', async () => {
  if (!dbAvailable) return;

  // Mười sự kiện của hai người trong quãng Firestore tắt (không ai gọi projectBadges).
  for (let i = 0; i < 5; i++) {
    await markBadgesDirty(prisma, [customerId, ownerId]);
  }

  assert.equal(
    await prisma.userBadgeSignal.count({ where: { userId: { in: [customerId, ownerId] } } }),
    2,
    'hàng đợi bị chặn trần bởi khoá chính — không phình theo số sự kiện',
  );

  // Bật lại: một lượt chiếu là hết backlog.
  const { writer, calls } = recordingWriter();
  const result = await projectBadges(prisma, writer);
  assert.equal(result.projected, 2);
  assert.equal(calls.length, 2);
  assert.equal(
    await prisma.userBadgeSignal.count({ where: { userId: { in: [customerId, ownerId] } } }),
    0,
  );
});

/**
 * Backfill là thứ thay cho một bước deploy bằng tay: nó xếp hàng chiếu lại cho những người đang
 * CÓ gì đó để hiện, ở lần rollout đầu tiên và ở lần bật lại sau một quãng tắt Firestore.
 */
test('backfill xếp hàng đúng người đang có gì để hiện, và bỏ qua người không có', async () => {
  if (!dbAvailable) return;

  await seedConversation({ customerUserId: customerId, unreadCustomer: 2 });
  await prisma.userBadgeSignal.deleteMany({ where: { userId: { in: [customerId, ownerId] } } });

  const queued = await backfillBadgeSignals(prisma);

  assert.ok(queued >= 1);
  assert.ok(
    await prisma.userBadgeSignal.findUnique({ where: { userId: customerId } }),
    'khách đang có tin chưa đọc phải được xếp hàng',
  );
  assert.equal(
    await prisma.userBadgeSignal.findUnique({ where: { userId: ownerId } }),
    null,
    'chủ shop không có gì chưa đọc thì không cần document — vắng mặt cũng có nghĩa là 0',
  );
});

/**
 * Cửa sổ mà bản `updateMany` + `createMany(skipDuplicates)` cũ để lọt: hai transaction cùng tạo
 * tín hiệu ĐẦU TIÊN cho một người. Bên thua bị `skipDuplicates` nuốt trong im lặng và số hiệu
 * của nó không bao giờ được ghi nhận — tức là một sự kiện biến mất.
 */
test('nhiều lượt đánh dấu ĐỒNG THỜI: một dòng, và số hiệu đếm đủ mọi lượt', async () => {
  if (!dbAvailable) return;

  await prisma.userBadgeSignal.deleteMany({ where: { userId: customerId } });

  await Promise.all(Array.from({ length: 12 }, () => markBadgesDirty(prisma, [customerId])));

  const rows = await prisma.userBadgeSignal.findMany({ where: { userId: customerId } });
  assert.equal(rows.length, 1, 'khoá chính gộp mọi lượt thành đúng một dòng');
  assert.equal(
    rows[0]?.revision,
    12n,
    'mỗi lượt phải tăng số hiệu — không lượt nào bị nuốt trong im lặng',
  );
});

test('lỗi của một người không chặn những người còn lại trong lô', async () => {
  if (!dbAvailable) return;

  await markBadgesDirty(prisma, [customerId, ownerId]);
  const failing: BadgeWriter = {
    async writeUserBadges(uid) {
      if (uid === customerId) throw new Error('firestore down');
    },
  };

  const result = await projectBadges(prisma, failing);

  /*
   * Khẳng định theo ĐÚNG hai người của test, không theo tổng số của lô: hàng đợi là bảng dùng
   * chung và có thể còn tín hiệu của người khác (vd sau một lượt backfill). Một test đếm tổng sẽ
   * đỏ vì lý do không liên quan gì tới điều nó muốn kiểm.
   */
  assert.equal(result.failed, 1);
  assert.ok(result.projected >= 1, 'những người còn lại trong lô vẫn được chiếu');
  assert.ok(
    await prisma.userBadgeSignal.findUnique({ where: { userId: customerId } }),
    'người lỗi giữ nguyên tín hiệu để thử lại',
  );
  assert.equal(
    await prisma.userBadgeSignal.findUnique({ where: { userId: ownerId } }),
    null,
    'người còn lại vẫn được chiếu xong',
  );
});

test('đánh dấu nhiều lần chỉ sinh MỘT dòng hàng đợi', async () => {
  if (!dbAvailable) return;

  await markBadgesDirty(prisma, [customerId, customerId]);
  await markBadgesDirty(prisma, [customerId]);
  await markBadgesDirty(prisma, [null, undefined, '']);

  const rows = await prisma.userBadgeSignal.count({ where: { userId: customerId } });
  assert.equal(rows, 1, 'khoá chính gộp mọi sự kiện của một người thành một lượt chiếu');
});
