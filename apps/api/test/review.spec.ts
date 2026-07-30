import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  REVIEW_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { NotificationService } from '../src/modules/notification/notification.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { ReviewService } from '../src/modules/review/review.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 5 — review + notification chạy trên PostgreSQL THẬT (không mock): kiểm chứng các bất
 * biến DB (unique booking_id, CHECK rating 1..5), việc recompute rating gian hàng, và fan-out
 * thông báo per-user. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const notifications = new NotificationService(asService);
const listings = new ListingsService(asService);
const reviews = new ReviewService(asService, notifications, listings);

let dbAvailable = false;
let ownerId: string;
let staffId: string;
let customerId: string;
let tenantId: string;
let vehicleId: string;
let bookingCompleted1: string;
let bookingCompleted2: string;
let bookingReserved: string;

const BASE = new Date('2026-09-01T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3600_000);

async function seedBooking(status: string): Promise<string> {
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId,
      code: `DH${id.slice(-6).toUpperCase()}`,
      customerName: 'Khách Test',
      status,
      pickupAt: hours(0),
      returnAt: hours(24),
    },
  });
  // Yêu cầu gốc gắn khách — chứng minh quyền sở hữu để đánh giá.
  await prisma.bookingRequest.create({
    data: {
      id: newId(),
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      customerName: 'Khách Test',
      customerPhone: '0900000000',
      customerUserId: customerId,
      bookingId: id,
      pickupAt: hours(0),
      returnAt: hours(24),
    },
  });
  return id;
}

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
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `owner-${ownerId}@xeprime.test` },
      { id: staffId, displayName: 'Nhân viên', email: `staff-${staffId}@xeprime.test` },
      { id: customerId, displayName: 'Nguyễn Văn An', email: `cus-${customerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop test',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.createMany({
    data: [
      { id: newId(), tenantId, userId: ownerId, roleKey: TENANT_ROLE.SHOP_OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
      { id: newId(), tenantId, userId: staffId, roleKey: TENANT_ROLE.SHOP_STAFF, status: MEMBERSHIP_STATUS.ACTIVE },
    ],
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: 'V1',
      name: 'Xe demo',
      vehicleType: VEHICLE_TYPE.CAR,
      // approved + sync để xe có listing — kiểm luôn rating denormalize trên snapshot.
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    },
  });
  await listings.syncFromVehicle(vehicleId);

  bookingCompleted1 = await seedBooking(BOOKING_STATUS.COMPLETED);
  bookingCompleted2 = await seedBooking(BOOKING_STATUS.COMPLETED);
  bookingReserved = await seedBooking(BOOKING_STATUS.RESERVED);
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

describe('ReviewService — tạo đánh giá + recompute rating', () => {
  maybe('đánh giá đơn đã hoàn thành → tạo review, cập nhật rating, báo cả shop', async () => {
    const { id } = await reviews.createForBooking(customerId, {
      bookingId: bookingCompleted1,
      rating: 5,
      comment: 'Xe sạch, chủ nhiệt tình',
    });

    const review = await prisma.review.findUniqueOrThrow({ where: { id } });
    expect(review.rating).toBe(5);
    expect(review.status).toBe(REVIEW_STATUS.PUBLISHED);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(Number(tenant.ratingAvg)).toBe(5);
    expect(tenant.ratingCount).toBe(1);

    // Rating denormalize trên public_listings (nuôi sort "Gợi ý") cập nhật trong CÙNG tx
    // qua ListingsService.refreshRating (ADR 0008).
    const listing = await prisma.publicListing.findUniqueOrThrow({
      where: { vehicleId },
      select: { ratingAvg: true, ratingCount: true },
    });
    expect(Number(listing.ratingAvg)).toBe(5);
    expect(listing.ratingCount).toBe(1);

    // Fan-out per-user: cả owner lẫn staff đều nhận một dòng REVIEW_RECEIVED.
    const notifs = await prisma.notification.count({
      where: { tenantId, type: NOTIFICATION_TYPE.REVIEW_RECEIVED },
    });
    expect(notifs).toBe(2);
  });

  maybe('đánh giá lần hai cùng đơn → bị chặn (đã đánh giá)', async () => {
    await expect(
      reviews.createForBooking(customerId, { bookingId: bookingCompleted1, rating: 4 }),
    ).rejects.toThrow(/đã đánh giá/);
  });

  maybe('đơn CHƯA hoàn thành không đánh giá được', async () => {
    await expect(
      reviews.createForBooking(customerId, { bookingId: bookingReserved, rating: 5 }),
    ).rejects.toThrow(/hoàn thành/);
  });

  maybe('review thứ hai → rating trung bình gian hàng tính lại đúng', async () => {
    await reviews.createForBooking(customerId, { bookingId: bookingCompleted2, rating: 3 });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(Number(tenant.ratingAvg)).toBe(4); // (5 + 3) / 2
    expect(tenant.ratingCount).toBe(2);
  });

  maybe('list công khai chỉ trả published + điểm trung bình đúng', async () => {
    const res = await reviews.listForVehicle(vehicleId, {});
    expect(res.summary.ratingCount).toBe(2);
    expect(res.summary.ratingAvg).toBe(4);
    expect(res.data.length).toBe(2);
    // Tên khách bị rút gọn khi hiển thị công khai.
    expect(res.data[0]?.customerName).toBe('Nguyễn Văn A.');
  });

  maybe('my-trips: trả các chuyến của khách + trạng thái đánh giá', async () => {
    const res = await reviews.myTrips(customerId, {});
    expect(res.meta.total).toBe(3);
    const reserved = res.data.find((t) => t.bookingId === bookingReserved);
    const reviewed = res.data.find((t) => t.bookingId === bookingCompleted1);
    expect(reserved?.canReview).toBe(false); // chưa hoàn thành
    expect(reviewed?.canReview).toBe(false); // đã đánh giá
    expect(reviewed?.review?.rating).toBe(5);
  });
});

describe('Bất biến DB của reviews', () => {
  maybe('unique booking_id: không tạo được review thứ hai cho cùng đơn', async () => {
    await expect(
      prisma.review.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          bookingId: bookingCompleted1,
          customerId,
          rating: 4,
          status: REVIEW_STATUS.PUBLISHED,
        },
      }),
    ).rejects.toBeDefined();
  });

  maybe('CHECK rating 1..5: rating = 6 bị DB từ chối', async () => {
    await expect(
      prisma.review.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          customerId,
          rating: 6,
          status: REVIEW_STATUS.PUBLISHED,
        },
      }),
    ).rejects.toBeDefined();
  });
});

describe('NotificationService', () => {
  maybe('unread-count + mark-all-read của owner hoạt động đúng', async () => {
    const before = await notifications.unreadCount(ownerId);
    expect(before.count).toBeGreaterThan(0);

    const res = await notifications.markAllRead(ownerId);
    expect(res.updated).toBe(before.count);

    const after = await notifications.unreadCount(ownerId);
    expect(after.count).toBe(0);
  });

  maybe('mark-read một thông báo lạ của người khác → NotFound', async () => {
    const staffNotif = await prisma.notification.findFirst({ where: { userId: staffId } });
    if (!staffNotif) return;
    // owner cố đọc thông báo của staff → không thấy (owner-check theo userId).
    await expect(notifications.markRead(ownerId, staffNotif.id)).rejects.toThrow();
  });
});
