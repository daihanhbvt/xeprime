import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  MEMBERSHIP_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PUSH_DELIVERY_STATUS,
  PUSH_PLATFORM,
  PUSH_PROVIDER,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { NOTIFICATION_AUDIENCE } from '@xeprime/domain';
import {
  NATIVE_REVOKE_REASON,
  NativeSessionService,
} from '../src/modules/auth/native-session.service';
import type { FirebaseAppService } from '../src/modules/firebase/firebase-app.service';
import { PushDeviceService } from '../src/modules/notification/push-device.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeNotificationService } from './helpers/service-factory';

/**
 * Thiết bị đẩy + hàng đợi đẩy, trên PostgreSQL THẬT. Không có FCM ở đây: API chỉ ĐĂNG KÝ thiết
 * bị và XẾP HÀNG; việc gửi là của worker (`apps/worker/test/push-dispatch.test.ts`).
 *
 * Điều được khoá ở đây là ba thứ mà một lỗi âm thầm sẽ biến thành rò rỉ dữ liệu:
 *  1. `userId`/`sessionId` đến từ PHIÊN, không từ body;
 *  2. một token chỉ thuộc về MỘT người — gán lại máy phải cắt hẳn người cũ;
 *  3. thu hồi phiên thì máy của phiên đó ngừng rung.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const pushOn = makeNotificationService(asService, { pushEnabled: true });
const pushOff = makeNotificationService(asService, { pushEnabled: false });
const devices = new PushDeviceService(asService, {
  pushEnabled: true,
} as FirebaseAppService);
// `revokeSession` chỉ dùng prisma; ConfigService chỉ được đọc ở đường ký/xoay token.
const sessions = new NativeSessionService(
  { getOrThrow: () => 'không-dùng-trong-spec-này' } as unknown as ConfigService,
  asService,
);

let dbAvailable = false;
let ownerId = '';
let staffId = '';
let customerId = '';
let tenantId = '';
let sessionId = '';

const tokenOf = (label: string) => `fcm-${label}-${newId()}`;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  staffId = newId();
  customerId = newId();
  tenantId = newId();
  sessionId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: staffId, displayName: 'Nhân viên', email: `stf-${staffId}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop push',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.createMany({
    data: [
      {
        id: newId(),
        tenantId,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId,
        userId: staffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    ],
  });
  await prisma.nativeAuthSession.create({
    data: {
      id: sessionId,
      userId: ownerId,
      expiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, staffId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('PushDeviceService — đăng ký thiết bị', () => {
  maybe('đăng ký lại cùng token KHÔNG tạo bản ghi thứ hai, chỉ chạm lastSeenAt', async () => {
    const token = tokenOf('idem');
    const first = await devices.register(ownerId, sessionId, {
      token,
      platform: PUSH_PLATFORM.ANDROID,
      appVersion: '0.1.0',
      deviceName: 'Pixel 8',
    });
    // Một mili giây trôi qua là đủ để `lastSeenAt` khác nhau; không cần ngủ.
    const second = await devices.register(ownerId, sessionId, {
      token,
      platform: PUSH_PLATFORM.ANDROID,
    });

    expect(second.id).toBe(first.id);
    expect(
      await prisma.pushDevice.count({ where: { provider: PUSH_PROVIDER.FCM, providerToken: token } }),
    ).toBe(1);
    expect(new Date(second.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.lastSeenAt).getTime(),
    );
  });

  maybe('response KHÔNG chứa token', async () => {
    const token = tokenOf('secret');
    const result = await devices.register(ownerId, sessionId, {
      token,
      platform: PUSH_PLATFORM.ANDROID,
    });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  maybe('FCM xoay token: máy cũ đăng ký token mới → hai hàng, cả hai thuộc đúng người', async () => {
    const oldToken = tokenOf('rotate-old');
    const newToken = tokenOf('rotate-new');
    await devices.register(ownerId, sessionId, { token: oldToken, platform: PUSH_PLATFORM.IOS });
    await devices.register(ownerId, sessionId, { token: newToken, platform: PUSH_PLATFORM.IOS });

    const rows = await prisma.pushDevice.findMany({
      where: { providerToken: { in: [oldToken, newToken] } },
      select: { userId: true, enabled: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === ownerId && r.enabled)).toBe(true);
  });

  /**
   * Bất biến quan trọng nhất của bảng này. FCM cấp token cho một BẢN CÀI, nên máy đó đăng nhập
   * tài khoản khác sẽ mang lại đúng token cũ. Nếu gán lại chủ không nguyên tử (hai hàng cùng
   * token), người dùng TRƯỚC tiếp tục nhận thông báo trên máy của người SAU.
   */
  maybe('cùng một máy đổi tài khoản: token chuyển hẳn sang chủ mới, không còn hàng của chủ cũ', async () => {
    const token = tokenOf('reassign');
    await devices.register(ownerId, sessionId, { token, platform: PUSH_PLATFORM.ANDROID });
    await devices.register(customerId, newId(), { token, platform: PUSH_PLATFORM.ANDROID });

    const rows = await prisma.pushDevice.findMany({ where: { providerToken: token } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(customerId);

    // Chủ cũ phát một thông báo: không có delivery nào tới máy đó nữa.
    await pushOn.emitToUser(ownerId, {
      type: NOTIFICATION_TYPE.BOOKING_CREATED,
      title: 'Không được tới máy cũ',
    });
    const leaked = await prisma.pushDelivery.count({ where: { pushDeviceId: rows[0]!.id } });
    expect(leaked).toBe(0);
  });

  maybe('phiên WEB vẫn đăng ký được, chỉ là không gắn phiên native', async () => {
    // `sessionId` của web là ULID ký trong JWT, không có hàng nào ở `native_auth_sessions` —
    // nhét nó vào FK sẽ nổ ngay tại request.
    const device = await devices.register(customerId, newId(), {
      token: tokenOf('web-session'),
      platform: PUSH_PLATFORM.ANDROID,
    });
    const row = await prisma.pushDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(row.nativeAuthSessionId).toBeNull();
  });

  maybe('huỷ đăng ký chỉ tắt thiết bị CỦA MÌNH', async () => {
    const mine = tokenOf('mine');
    const other = tokenOf('other');
    await devices.register(ownerId, sessionId, { token: mine, platform: PUSH_PLATFORM.ANDROID });
    await devices.register(customerId, newId(), { token: other, platform: PUSH_PLATFORM.ANDROID });

    // Token của người khác: không khớp dòng nào, và cũng không lộ ra là nó có tồn tại.
    expect(await devices.disableByToken(ownerId, other)).toBe(0);
    expect(
      (await prisma.pushDevice.findFirstOrThrow({ where: { providerToken: other } })).enabled,
    ).toBe(true);

    expect(await devices.disableByToken(ownerId, mine)).toBe(1);
    const disabled = await prisma.pushDevice.findFirstOrThrow({ where: { providerToken: mine } });
    expect(disabled.enabled).toBe(false);
    expect(disabled.disabledAt).not.toBeNull();
  });

  maybe('đăng nhập lại BẬT LẠI thiết bị đã tắt', async () => {
    const token = tokenOf('revive');
    await devices.register(ownerId, sessionId, { token, platform: PUSH_PLATFORM.ANDROID });
    await devices.disableByToken(ownerId, token);

    await devices.register(ownerId, sessionId, { token, platform: PUSH_PLATFORM.ANDROID });
    const row = await prisma.pushDevice.findFirstOrThrow({ where: { providerToken: token } });
    expect(row.enabled).toBe(true);
    expect(row.disabledAt).toBeNull();
  });
});

describe('Thu hồi phiên native → tắt thiết bị', () => {
  maybe('logout tắt mọi thiết bị của ĐÚNG phiên đó, không đụng phiên khác', async () => {
    const otherSessionId = newId();
    await prisma.nativeAuthSession.create({
      data: {
        id: otherSessionId,
        userId: ownerId,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const revokedToken = tokenOf('revoked');
    const keptToken = tokenOf('kept');
    await devices.register(ownerId, sessionId, {
      token: revokedToken,
      platform: PUSH_PLATFORM.ANDROID,
    });
    await devices.register(ownerId, otherSessionId, {
      token: keptToken,
      platform: PUSH_PLATFORM.IOS,
    });

    await sessions.revokeSession(sessionId, NATIVE_REVOKE_REASON.LOGOUT);

    expect(
      (await prisma.pushDevice.findFirstOrThrow({ where: { providerToken: revokedToken } })).enabled,
    ).toBe(false);
    expect(
      (await prisma.pushDevice.findFirstOrThrow({ where: { providerToken: keptToken } })).enabled,
    ).toBe(true);
  });
});

describe('NotificationService — hàng đợi đẩy', () => {
  maybe('PUSH_ENABLED=false: có thông báo in-app, KHÔNG có delivery nào', async () => {
    await devices.register(customerId, newId(), {
      token: tokenOf('flag-off'),
      platform: PUSH_PLATFORM.ANDROID,
    });
    const before = await prisma.pushDelivery.count({
      where: { device: { userId: customerId } },
    });

    await pushOff.emitToUser(customerId, {
      type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
      title: 'Chuyến đã bắt đầu',
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: newId(),
    });

    expect(
      await prisma.notification.count({
        where: { userId: customerId, type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED },
      }),
    ).toBeGreaterThan(0);
    expect(await prisma.pushDelivery.count({ where: { device: { userId: customerId } } })).toBe(
      before,
    );
  });

  maybe('người không có thiết bị nào vẫn nhận thông báo in-app', async () => {
    const loner = newId();
    await prisma.user.create({
      data: { id: loner, displayName: 'Không máy', email: `lon-${loner}@xeprime.test` },
    });
    try {
      await pushOn.emitToUser(loner, {
        type: NOTIFICATION_TYPE.REVIEW_RECEIVED,
        title: 'Đánh giá mới',
      });
      expect(await prisma.notification.count({ where: { userId: loner } })).toBe(1);
      expect(await prisma.pushDelivery.count({ where: { device: { userId: loner } } })).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: loner } });
    }
  });

  maybe('một người ba máy → ba delivery cho MỘT thông báo', async () => {
    const multi = newId();
    await prisma.user.create({
      data: { id: multi, displayName: 'Ba máy', email: `mul-${multi}@xeprime.test` },
    });
    try {
      for (const label of ['a', 'b', 'c']) {
        await devices.register(multi, newId(), {
          token: tokenOf(`multi-${label}`),
          platform: PUSH_PLATFORM.ANDROID,
        });
      }
      // Một máy đã tắt: nó KHÔNG được xếp hàng.
      const offToken = tokenOf('multi-off');
      await devices.register(multi, newId(), {
        token: offToken,
        platform: PUSH_PLATFORM.ANDROID,
      });
      await devices.disableByToken(multi, offToken);

      await pushOn.emitToUser(multi, {
        type: NOTIFICATION_TYPE.BOOKING_CREATED,
        title: 'Đơn thuê mới',
      });

      const notification = await prisma.notification.findFirstOrThrow({ where: { userId: multi } });
      const deliveries = await prisma.pushDelivery.findMany({
        where: { notificationId: notification.id },
      });
      expect(deliveries).toHaveLength(3);
      expect(deliveries.every((d) => d.status === PUSH_DELIVERY_STATUS.PENDING)).toBe(true);
    } finally {
      await prisma.user.delete({ where: { id: multi } });
    }
  });

  maybe('đích được đóng băng theo BỀ MẶT của người nhận', async () => {
    const bookingId = newId();
    await pushOn.emitToUser(customerId, {
      type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
      title: 'Chuyến đã kết thúc',
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: bookingId,
    });
    await pushOn.emitToTenantMembers(tenantId, {
      type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
      title: 'Đơn đã kết thúc',
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: bookingId,
    });

    const forCustomer = await prisma.notification.findFirstOrThrow({
      where: { userId: customerId, targetId: bookingId },
    });
    const forShop = await prisma.notification.findFirstOrThrow({
      where: { userId: staffId, targetId: bookingId },
    });
    expect((forCustomer.dataJson as { url: string }).url).toBe(`/trips/${bookingId}`);
    expect((forShop.dataJson as { url: string }).url).toBe(`/manage/bookings/${bookingId}`);
  });

  maybe('audience khai tường minh thắng mặc định của phương thức', async () => {
    const vehicleId = newId();
    await pushOn.emitToUser(ownerId, {
      type: NOTIFICATION_TYPE.VEHICLE_APPROVED,
      title: 'Xe đã được duyệt',
      targetType: NOTIFICATION_TARGET_TYPE.VEHICLE,
      targetId: vehicleId,
      audience: NOTIFICATION_AUDIENCE.MANAGE,
    });
    const row = await prisma.notification.findFirstOrThrow({
      where: { userId: ownerId, targetId: vehicleId },
    });
    expect((row.dataJson as { url: string }).url).toBe(`/manage/vehicles/${vehicleId}`);
  });

  maybe('emitToTenantMembers giữ nguyên excludeUserId, và loại được nhiều người', async () => {
    const marker = newId();
    await pushOn.emitToTenantMembers(
      tenantId,
      {
        type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED,
        title: 'Yêu cầu mới',
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: marker,
      },
      undefined,
      { excludeUserId: ownerId },
    );
    const recipients = await prisma.notification.findMany({
      where: { targetId: marker },
      select: { userId: true },
    });
    expect(recipients.map((r) => r.userId)).toEqual([staffId]);

    const marker2 = newId();
    await pushOn.emitToTenantMembers(
      tenantId,
      {
        type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED,
        title: 'Yêu cầu mới',
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: marker2,
      },
      undefined,
      { excludeUserIds: [ownerId, staffId] },
    );
    expect(await prisma.notification.count({ where: { targetId: marker2 } })).toBe(0);
  });

  maybe('nghiệp vụ thử lại không rung máy hai lần — unique (notification, device)', async () => {
    const dupUser = newId();
    await prisma.user.create({
      data: { id: dupUser, displayName: 'Trùng', email: `dup-${dupUser}@xeprime.test` },
    });
    try {
      const device = await devices.register(dupUser, newId(), {
        token: tokenOf('dup'),
        platform: PUSH_PLATFORM.ANDROID,
      });
      await pushOn.emitToUser(dupUser, {
        type: NOTIFICATION_TYPE.BOOKING_CREATED,
        title: 'Đơn thuê mới',
      });
      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: dupUser },
      });

      await expect(
        prisma.pushDelivery.create({
          data: { id: newId(), notificationId: notification.id, pushDeviceId: device.id },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.user.delete({ where: { id: dupUser } });
    }
  });
});
