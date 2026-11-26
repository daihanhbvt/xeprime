import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  PERMISSION,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  addCalendarMonthsVn,
  vnDateKey,
  vnDayStart,
} from '@xeprime/types';
import 'reflect-metadata';
import { CalendarController } from '../src/modules/calendar/calendar.controller';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContext } from '../src/common/types/request-context';
import { makePricingService } from './helpers/service-factory';

/**
 * Lịch xe (Wave lịch, vòng 2) trên PostgreSQL THẬT.
 *
 * Điều được khoá: sắp xếp hàng xe — `next_booking` (mặc định) đưa xe có lịch đang chạy/sắp
 * tới gần nhất lên đầu, xe trống lịch xuống cuối theo tên; `price_asc/desc` đẩy xe chưa có giá
 * xuống cuối. Và báo giá NỘI BỘ `/calendar/quote`: xe KHÔNG public vẫn báo được (khác public
 * quote), áp giá riêng theo ngày, tenant khác 404.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const pricing = makePricingService(asService);
const controller = new CalendarController(asService, new OccupancyService(asService), pricing);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
/** [xe lịch xa, xe lịch gần, xe trống lịch] — tên đặt để thứ tự theo tên KHÁC thứ tự theo lịch. */
let farId: string;
let soonId: string;
let idleId: string;

const HOUR = 3600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const tenant = () => ({ tenantId }) as TenantContext;

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
  tenantId = newId();
  otherTenantId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ lịch',
      email: `cal-${ownerId}@xeprime.test`,
    },
  });
  for (const id of [tenantId, otherTenantId]) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: 'Shop lịch',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
  }

  farId = newId();
  soonId = newId();
  idleId = newId();
  // Tên cố ý NGƯỢC với thứ tự lịch: A=lịch xa, B=lịch gần, C=trống — để phân biệt hai kiểu sort.
  await prisma.vehicle.createMany({
    data: [
      {
        id: farId,
        tenantId,
        code: 'CAL-A',
        name: 'A Xe lịch xa',
        vehicleType: VEHICLE_TYPE.CAR,
        weekdayPrice: '500000',
      },
      {
        id: soonId,
        tenantId,
        code: 'CAL-B',
        name: 'B Xe lịch gần',
        vehicleType: VEHICLE_TYPE.CAR,
        weekdayPrice: '900000',
      },
      {
        id: idleId,
        tenantId,
        code: 'CAL-C',
        name: 'C Xe trống lịch',
        vehicleType: VEHICLE_TYPE.CAR,
      },
    ],
  });
  await prisma.vehicleOccupancy.createMany({
    data: [
      {
        id: newId(),
        tenantId,
        vehicleId: farId,
        sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
        sourceId: newId(),
        startAt: inHours(72),
        endAt: inHours(96),
      },
      {
        id: newId(),
        tenantId,
        vehicleId: soonId,
        sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
        sourceId: newId(),
        startAt: inHours(2),
        endAt: inHours(26),
      },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const rangeQuery = (over: Record<string, unknown> = {}) =>
  ({ startAt: inHours(0), endAt: inHours(7 * 24), ...over }) as never;

describe('GET /calendar/resources — sắp xếp hàng xe', () => {
  maybe('mặc định next_booking: lịch gần nhất trước, xe trống lịch cuối', async () => {
    const rows = await controller.resources(tenant(), rangeQuery());
    expect(rows.map((r) => r.id)).toEqual([soonId, farId, idleId]);
  });

  maybe('name: theo tên, mặc kệ lịch', async () => {
    const rows = await controller.resources(tenant(), rangeQuery({ sort: 'name' }));
    expect(rows.map((r) => r.id)).toEqual([farId, soonId, idleId]);
  });

  maybe('price_asc/desc: xe chưa cấu hình giá luôn xuống cuối', async () => {
    const asc = await controller.resources(tenant(), rangeQuery({ sort: 'price_asc' }));
    expect(asc.map((r) => r.id)).toEqual([farId, soonId, idleId]);

    const desc = await controller.resources(tenant(), rangeQuery({ sort: 'price_desc' }));
    expect(desc.map((r) => r.id)).toEqual([soonId, farId, idleId]);
  });
});

describe('GET /calendar/quote — báo giá nội bộ', () => {
  maybe('xe KHÔNG public vẫn báo giá được, áp cả giá riêng theo ngày', async () => {
    // 20–22/10 giá thường 500k; 21/10 giá riêng 800k → 500 + 800 + 500 = 1.8tr.
    await pricing.saveDailyPrices(tenantId, farId, ownerId, {
      dates: ['2026-10-21'],
      dailyPrice: '800000',
    });

    const quote = await controller.quote(tenant(), {
      vehicleId: farId,
      pickupAt: new Date('2026-10-20T01:00:00.000Z'),
      returnAt: new Date('2026-10-23T01:00:00.000Z'),
    } as never);
    expect(quote.totalAmount).toBe('1800000');

    await prisma.vehicleDailyPrice.deleteMany({ where: { vehicleId: farId } });
  });

  maybe('xe chưa cấu hình giá → 400 VALIDATION_FAILED (FE rơi về nhập tiền tay)', async () => {
    await expect(
      controller.quote(tenant(), {
        vehicleId: idleId,
        pickupAt: inHours(24),
        returnAt: inHours(48),
      } as never),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('tenant khác nhìn vào là 404', async () => {
    await expect(
      controller.quote(
        { tenantId: otherTenantId } as TenantContext,
        {
          vehicleId: farId,
          pickupAt: inHours(24),
          returnAt: inHours(48),
        } as never,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });
});

/**
 * Lịch vẽ thêm yêu cầu CHỜ DUYỆT (thiết kế lại 25/11/2026) — lớp hiển thị, không phải lịch bận.
 * Điều được khoá: cờ tắt thì tập event y như cũ (app native); cờ bật mà thiếu quyền xem yêu cầu
 * thì không lộ tên khách; yêu cầu dài hạn chưa chốt lịch vẽ từ ngày nguyện vọng + số tháng gói.
 */
describe('GET /calendar/events — yêu cầu chờ duyệt', () => {
  const withRequests = () =>
    ({ tenantId, permissions: [PERMISSION.BOOKING_REQUEST_VIEW] }) as unknown as TenantContext;
  let shortId: string;
  let longId: string;

  beforeAll(async () => {
    if (!dbAvailable) return;
    shortId = newId();
    longId = newId();
    await prisma.bookingRequest.createMany({
      data: [
        {
          id: shortId,
          tenantId,
          vehicleId: idleId,
          customerName: 'Khách hỏi ngắn',
          customerPhone: '0933000101',
          serviceType: SERVICE_TYPE.SELF_DRIVE,
          status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
          pickupAt: inHours(30),
          returnAt: inHours(54),
          respondBy: inHours(4),
        },
        {
          id: longId,
          tenantId,
          vehicleId: idleId,
          customerName: 'Khách hỏi dài hạn',
          customerPhone: '0933000102',
          serviceType: SERVICE_TYPE.LONG_TERM,
          status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
          longTermPackageMonths: 3,
          pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
          requestedPickupDate: new Date(`${vnDateKey(inHours(48))}T00:00:00.000Z`),
          respondBy: inHours(4),
        },
      ],
    });
  });

  maybe('cờ tắt: không có yêu cầu nào, mọi event đều chiếm lịch', async () => {
    const events = await controller.events(withRequests(), rangeQuery());
    expect(events.some((e) => e.sourceId === shortId || e.sourceId === longId)).toBe(false);
    expect(events.every((e) => e.occupying)).toBe(true);
  });

  maybe('cờ bật + quyền xem yêu cầu: có cả hai, không chiếm lịch, kèm dịch vụ', async () => {
    const events = await controller.events(
      withRequests(),
      rangeQuery({ includePendingRequests: true }),
    );
    const short = events.find((e) => e.sourceId === shortId);
    expect(short).toMatchObject({
      type: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      occupying: false,
      customerName: 'Khách hỏi ngắn',
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      amount: null,
      code: null,
    });

    const long = events.find((e) => e.sourceId === longId);
    const wishStart = vnDayStart(vnDateKey(inHours(48)));
    expect(long?.startAt).toBe(wishStart.toISOString());
    expect(long?.endAt).toBe(addCalendarMonthsVn(wishStart, 3).toISOString());
  });

  maybe('cờ bật nhưng KHÔNG có quyền xem yêu cầu: không lộ yêu cầu nào', async () => {
    const events = await controller.events(tenant(), rangeQuery({ includePendingRequests: true }));
    expect(events.some((e) => !e.occupying)).toBe(false);
  });

  maybe('đơn thuê mang mã, dịch vụ và tiền thuê', async () => {
    const bookingId = newId();
    await prisma.booking.create({
      data: {
        id: bookingId,
        tenantId,
        vehicleId: idleId,
        code: `DH${bookingId.slice(-6)}`,
        customerName: 'Khách có đơn',
        status: BOOKING_STATUS.RESERVED,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        pickupAt: inHours(100),
        returnAt: inHours(120),
        baseAmount: '1500000',
        totalAmount: '1500000',
      },
    });
    await prisma.vehicleOccupancy.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: idleId,
        sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
        sourceId: bookingId,
        startAt: inHours(100),
        endAt: inHours(120),
      },
    });

    const events = await controller.events(tenant(), rangeQuery());
    expect(events.find((e) => e.sourceId === bookingId)).toMatchObject({
      occupying: true,
      code: `DH${bookingId.slice(-6)}`,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      amount: '1500000',
      status: BOOKING_STATUS.RESERVED,
    });
  });
});
