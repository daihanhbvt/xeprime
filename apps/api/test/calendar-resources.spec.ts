import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, OCCUPANCY_SOURCE_TYPE, TENANT_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import 'reflect-metadata';
import { AuditService } from '../src/modules/audit/audit.service';
import { CalendarController } from '../src/modules/calendar/calendar.controller';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContext } from '../src/common/types/request-context';

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
const audit = new AuditService(asService);
const pricing = new PricingService(asService, audit);
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
    data: { id: ownerId, displayName: 'Chủ lịch', email: `cal-${ownerId}@xeprime.test` },
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
