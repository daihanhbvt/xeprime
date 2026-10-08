import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  FEE_POLICY_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  PLATFORM_TRIP_QUEUE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { vnDateKey } from '../src/common/day-range';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformBookingsService } from '../src/modules/platform-admin/platform-bookings.service';
import { PlatformTripsService } from '../src/modules/platform-admin/platform-trips.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeNotificationService } from './helpers/service-factory';

/**
 * Vận hành chuyến (Platform Admin) — bốn hàng đợi theo chặng của ADR 0044, chạy trên PostgreSQL
 * THẬT. Kiểm chứng: số đếm + số KHẨN đúng ngưỡng nhắc của worker; thứ tự GẤP lên đầu; nhắc tay
 * chủ xe tạo đúng một thông báo cho thành viên gian hàng + một dòng audit, và bị gác cooldown.
 *
 * Mọi phép đếm khoanh theo `tenantId` của spec: các spec khác chạy song song trên cùng DB và
 * cũng tạo đơn/yêu cầu của riêng chúng.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const trips = new PlatformTripsService(asService, audit, makeNotificationService(asService));
const bookings = new PlatformBookingsService(asService, audit);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let dbAvailable = false;
let adminId: string;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let policyId: string;
let tag: string;

let pendingSoon: string;
let pendingLater: string;
let awaitingSoon: string;
let awaitingLater: string;
let pickupOverdue: string;
let pickupSoonBooking: string;
let pickupFar: string;
let activeOverdue: string;
let activeOk: string;

/** Mốc "bây giờ" cố định cho cả bộ — các mốc dữ liệu tính tương đối từ đây. */
const NOW = new Date();

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  adminId = newId();
  ownerId = newId();
  tenantId = newId();
  vehicleId = newId();
  policyId = newId();
  tag = tenantId.slice(-6);

  await prisma.user.createMany({
    data: [
      { id: adminId, realm: ACCOUNT_REALM.PLATFORM, displayName: 'Admin', email: `pt-a-${adminId}@xeprime.test` },
      {
        id: ownerId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: 'Chủ xe',
        email: `pt-o-${ownerId}@xeprime.test`,
        phone: `0988${ownerId.slice(-6).replace(/\D/g, '1').padEnd(6, '1')}`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `TripShop-${tag}`,
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
      joinedAt: NOW,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE-${vehicleId.slice(-6)}`,
      name: `Vios-${tag}`,
      plateNumber: `51A-${vehicleId.slice(-5)}`,
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });
  await prisma.feePolicy.create({
    data: {
      id: policyId,
      version: 800 + Math.floor(Math.random() * 90),
      status: FEE_POLICY_STATUS.ARCHIVED, // không đụng bản `active` toàn sàn của spec khác
      name: `Policy trips ${tag}`,
      serviceFeePercent: new Prisma.Decimal(10),
      holdMinAmount: new Prisma.Decimal(20_000),
      holdPaymentWindowMinutes: 120,
      freeCancelHours: 4,
    },
  });

  let requestSeq = 0;
  const mkRequest = async (
    id: string,
    status: string,
    respondByMs: number,
    extra: { decidedAt?: Date; holdExpiresInMs?: number } = {},
  ) => {
    await prisma.bookingRequest.create({
      data: {
        id,
        tenantId,
        vehicleId,
        status,
        customerName: `Khach-${tag}-${id.slice(-4)}`,
        // Unique (xe, SĐT, nhận, trả): mỗi yêu cầu một SĐT khách riêng.
        customerPhone: `09123456${String(requestSeq++).padStart(2, '0')}`,
        pickupAt: new Date(NOW.getTime() + 2 * DAY),
        returnAt: new Date(NOW.getTime() + 3 * DAY),
        respondBy: new Date(NOW.getTime() + respondByMs),
        decidedAt: extra.decidedAt,
        decidedBy: extra.decidedAt ? ownerId : null,
      },
    });
    if (extra.holdExpiresInMs !== undefined) {
      await prisma.bookingHold.create({
        data: {
          id: newId(),
          code: `XPH${id.slice(-8).toUpperCase()}`,
          tenantId,
          bookingRequestId: id,
          vehicleId,
          amount: new Prisma.Decimal('500000'),
          depositAmount: new Prisma.Decimal('500000'),
          feePolicyId: policyId,
          allocationJson: [] as unknown as Prisma.InputJsonValue,
          priceSnapshotJson: {} as unknown as Prisma.InputJsonValue,
          scheduleJson: {} as unknown as Prisma.InputJsonValue,
          freeCancelUntil: new Date(NOW.getTime() + 4 * HOUR),
          expiresAt: new Date(NOW.getTime() + extra.holdExpiresInMs),
        },
      });
    }
  };

  pendingSoon = newId();
  pendingLater = newId();
  awaitingSoon = newId();
  awaitingLater = newId();
  // Chờ duyệt: một yêu cầu còn 5′ (đã qua mốc nhắc cuối của worker ⇒ KHẨN), một yêu cầu còn 50′.
  await mkRequest(pendingLater, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, 50 * MINUTE);
  await mkRequest(pendingSoon, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, 5 * MINUTE);
  // Chờ giữ chỗ: hạn giữ chỗ 10′ (KHẨN) và 90′.
  await mkRequest(awaitingLater, BOOKING_REQUEST_STATUS.AWAITING_HOLD, -10 * MINUTE, {
    decidedAt: NOW,
    holdExpiresInMs: 90 * MINUTE,
  });
  await mkRequest(awaitingSoon, BOOKING_REQUEST_STATUS.AWAITING_HOLD, -10 * MINUTE, {
    decidedAt: NOW,
    holdExpiresInMs: 10 * MINUTE,
  });

  const mkBooking = (id: string, status: string, pickupMs: number, returnMs: number) =>
    prisma.booking.create({
      data: {
        id,
        tenantId,
        vehicleId,
        code: `TR-${id.slice(-6)}`,
        customerName: `Khach-${tag}`,
        customerPhone: '0912345678',
        status,
        pickupAt: new Date(NOW.getTime() + pickupMs),
        returnAt: new Date(NOW.getTime() + returnMs),
        totalAmount: '1000000',
      },
    });

  pickupOverdue = newId();
  pickupSoonBooking = newId();
  pickupFar = newId();
  activeOverdue = newId();
  activeOk = newId();
  await mkBooking(pickupSoonBooking, BOOKING_STATUS.RESERVED, 3 * HOUR, DAY + 3 * HOUR);
  await mkBooking(pickupOverdue, BOOKING_STATUS.RESERVED, -1 * HOUR, DAY);
  await mkBooking(pickupFar, BOOKING_STATUS.RESERVED, 3 * DAY, 4 * DAY);
  await mkBooking(activeOk, BOOKING_STATUS.ACTIVE, -1 * DAY, DAY);
  await mkBooking(activeOverdue, BOOKING_STATUS.ACTIVE, -2 * DAY, -2 * HOUR);
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.bookingHold.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.feePolicy.deleteMany({ where: { id: policyId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const ids = (res: { data: { id: string }[] }) => res.data.map((row) => row.id);

describe('Vận hành chuyến — tóm tắt', () => {
  maybe('bốn hàng đợi: số dòng + số khẩn đúng ngưỡng nhắc của worker; lịch hôm nay theo giờ VN', async () => {
    const summary = await trips.summary({ tenantId }, NOW);

    expect(summary.queues[PLATFORM_TRIP_QUEUE.PENDING_APPROVAL]).toEqual({ count: 2, urgentCount: 1 });
    expect(summary.queues[PLATFORM_TRIP_QUEUE.AWAITING_HOLD]).toEqual({ count: 2, urgentCount: 1 });
    // Sắp giao: trong 24h tới KỂ CẢ quá giờ; xe 3 ngày nữa không tính. Khẩn = quá giờ giao.
    expect(summary.queues[PLATFORM_TRIP_QUEUE.PICKUP_SOON]).toEqual({ count: 2, urgentCount: 1 });
    expect(summary.queues[PLATFORM_TRIP_QUEUE.ACTIVE]).toEqual({ count: 2, urgentCount: 1 });

    // "Hôm nay" tính theo NGÀY LỊCH Việt Nam của từng mốc — spec chạy lúc nào cũng phải đúng.
    const today = vnDateKey(NOW);
    const bookingsOfSpec = await prisma.booking.findMany({
      where: { tenantId, status: { in: [BOOKING_STATUS.RESERVED, BOOKING_STATUS.ACTIVE] } },
      select: { pickupAt: true, returnAt: true },
    });
    expect(summary.today).toEqual({
      pickups: bookingsOfSpec.filter((b) => vnDateKey(b.pickupAt) === today).length,
      returns: bookingsOfSpec.filter((b) => vnDateKey(b.returnAt) === today).length,
    });
  });
});

describe('Vận hành chuyến — hàng đợi yêu cầu', () => {
  maybe('chờ duyệt: hạn gần nhất lên đầu; có SĐT chủ xe, SĐT khách đã che, chưa nhắc tay', async () => {
    const res = await trips.requests({ queue: PLATFORM_TRIP_QUEUE.PENDING_APPROVAL, tenantId });
    expect(ids(res)).toEqual([pendingSoon, pendingLater]);

    const row = res.data[0]!;
    expect(row.customerPhoneMasked).not.toMatch(/^09123456dd$/);
    expect(row.customerPhoneMasked).toMatch(/\*/);
    expect(row.ownerPhone).toMatch(/^0988/);
    expect(row.tenantName).toBe(`TripShop-${tag}`);
    expect(row.vehiclePlateNumber).toBe(`51A-${vehicleId.slice(-5)}`);
    expect(row.holdExpiresAt).toBeNull();
    expect(row.lastPlatformRemindAt).toBeNull();
  });

  maybe('chờ giữ chỗ: xếp theo hạn giữ chỗ, mang hạn + số tiền của hold', async () => {
    const res = await trips.requests({ queue: PLATFORM_TRIP_QUEUE.AWAITING_HOLD, tenantId });
    expect(ids(res)).toEqual([awaitingSoon, awaitingLater]);
    expect(res.data[0]!.holdExpiresAt).toBe(new Date(NOW.getTime() + 10 * MINUTE).toISOString());
    expect(String(res.data[0]!.holdAmount)).toBe('500000');
    expect(res.data[0]!.decidedAt).not.toBeNull();
  });

  maybe('tìm theo biển số / tên gian hàng', async () => {
    const byPlate = await trips.requests({
      queue: PLATFORM_TRIP_QUEUE.PENDING_APPROVAL,
      tenantId,
      q: vehicleId.slice(-5),
    });
    expect(ids(byPlate)).toHaveLength(2);

    const none = await trips.requests({
      queue: PLATFORM_TRIP_QUEUE.PENDING_APPROVAL,
      tenantId,
      q: 'khong-co-gi-ca',
    });
    expect(none.data).toEqual([]);
  });
});

describe('Vận hành chuyến — hàng đợi đơn', () => {
  maybe('sắp giao: quá giờ lên đầu, xe 3 ngày nữa chưa vào hàng đợi', async () => {
    const res = await bookings.listQueue({ queue: PLATFORM_TRIP_QUEUE.PICKUP_SOON, tenantId }, NOW);
    expect(ids(res)).toEqual([pickupOverdue, pickupSoonBooking]);
    expect(ids(res)).not.toContain(pickupFar);
  });

  maybe('đang thuê: quá giờ trả lên đầu', async () => {
    const res = await bookings.listQueue({ queue: PLATFORM_TRIP_QUEUE.ACTIVE, tenantId }, NOW);
    expect(ids(res)).toEqual([activeOverdue, activeOk]);
  });
});

describe('Vận hành chuyến — nhắc tay chủ xe', () => {
  maybe('nhắc: một thông báo cho thành viên gian hàng + một dòng audit; danh sách kể "đã nhắc lúc"', async () => {
    const res = await trips.remind(pendingSoon, adminId, NOW);
    expect(res.requestId).toBe(pendingSoon);

    const notes = await prisma.notification.findMany({
      where: { tenantId, targetId: pendingSoon, type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.userId).toBe(ownerId);
    expect(notes[0]!.title).toMatch(/XePrime nhắc/);

    const log = await prisma.auditLog.findFirst({
      where: { targetId: pendingSoon, action: 'booking_request.platform_remind' },
    });
    expect(log?.actorUserId).toBe(adminId);
    expect(log?.actorScope).toBe('platform');

    const list = await trips.requests({ queue: PLATFORM_TRIP_QUEUE.PENDING_APPROVAL, tenantId });
    const row = list.data.find((r) => r.id === pendingSoon)!;
    expect(row.lastPlatformRemindAt).not.toBeNull();
    expect(list.data.find((r) => r.id === pendingLater)!.lastPlatformRemindAt).toBeNull();
  });

  maybe('nhắc lại ngay → 429 TRIP_REMIND_TOO_SOON, không thêm thông báo', async () => {
    await expect(trips.remind(pendingSoon, adminId, new Date(NOW.getTime() + MINUTE))).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.TRIP_REMIND_TOO_SOON },
    });
    const notes = await prisma.notification.count({ where: { tenantId, targetId: pendingSoon } });
    expect(notes).toBe(1);
  });

  maybe('yêu cầu không còn chờ duyệt → 409; id lạ → 404', async () => {
    await expect(trips.remind(awaitingSoon, adminId, NOW)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
    await expect(trips.remind(newId(), adminId, NOW)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
