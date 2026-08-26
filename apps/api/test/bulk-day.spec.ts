import { createPrismaClient, newId } from '@xeprime/prisma';
import { BULK_PRICE_MODE } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  OCCUPANCY_SOURCE_TYPE,
  TENANT_STATUS,
  VEHICLE_BLOCK_REASON,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import { AuditService } from '../src/modules/audit/audit.service';
import { BulkDayService } from '../src/modules/calendar/bulk-day.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Khoá / đặt giá cả đội xe cho một khoảng ngày — trên PostgreSQL THẬT.
 *
 * Điều được khoá ở đây KHÔNG mock được, vì nó là hành vi của `EXCLUDE USING gist` (ADR 0006):
 *
 *  - xe đang có đơn thì ngày đó KHÔNG khoá được, và phần còn lại của đội xe vẫn phải khoá xong;
 *  - xe rảnh 2/3 ngày thì được khoá đúng 2 ngày, không bị bỏ trắng cả ba;
 *  - gỡ lô phải nhả CHỖ trên `vehicle_occupancies`, không chỉ xoá dòng `vehicle_blocks`;
 *  - lịch khoá đặt TAY không bao giờ bị lô hàng loạt cuốn theo.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const bulk = new BulkDayService(asService, occupancy, audit);

let dbAvailable = false;
let tenantId: string;
let ownerId: string;
let freeVehicleId: string;
let busyVehicleId: string;
let pricelessVehicleId: string;

/** 31/08–02/09/2026 (Thứ Hai → Thứ Tư) — đúng cụm Quốc khánh của ảnh chụp màn hình. */
const FROM = '2026-08-31';
const TO = '2026-09-02';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const dayStart = (key: string) =>
  new Date(new Date(`${key}T00:00:00.000Z`).getTime() - VN_OFFSET_MS);

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
  freeVehicleId = newId();
  busyVehicleId = newId();
  pricelessVehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Bulk owner', email: `bulk-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-bulk-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Tenant bulk',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });

  await prisma.vehicle.createMany({
    data: [
      {
        id: freeVehicleId,
        tenantId,
        code: 'BD1',
        name: 'Xe rảnh',
        vehicleType: VEHICLE_TYPE.CAR,
        weekdayPrice: '520000',
        weekendPrice: '600000',
      },
      {
        id: busyVehicleId,
        tenantId,
        code: 'BD2',
        name: 'Xe có khách',
        vehicleType: VEHICLE_TYPE.CAR,
        weekdayPrice: '1500000',
      },
      {
        id: pricelessVehicleId,
        tenantId,
        code: 'BD3',
        name: 'Xe chưa có giá',
        vehicleType: VEHICLE_TYPE.CAR,
      },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.vehicleBlock.deleteMany({ where: { tenantId } });
  await prisma.vehicleDailyPrice.deleteMany({ where: { tenantId } });
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Đơn thuê chiếm chỗ xe `busyVehicleId` đúng NGÀY GIỮA (01/09). */
async function occupyMiddleDay(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await occupancy.reserve(tx, {
      tenantId,
      vehicleId: busyVehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
      sourceId: newId(),
      startAt: new Date(dayStart('2026-09-01').getTime() + 2 * 3600_000),
      endAt: new Date(dayStart('2026-09-01').getTime() + 8 * 3600_000),
    });
  });
}

const allVehicles = () => [freeVehicleId, busyVehicleId, pricelessVehicleId];

describe('preview', () => {
  maybe('nói ra xe nào bận ngày nào, và giá niêm yết của từng xe', async () => {
    await occupyMiddleDay();

    const preview = await bulk.preview(tenantId, { from: FROM, to: TO });

    expect(preview.dayCount).toBe(3);
    const busy = preview.vehicles.find((v) => v.vehicleId === busyVehicleId);
    expect(busy?.busyDates).toEqual(['2026-09-01']);

    const free = preview.vehicles.find((v) => v.vehicleId === freeVehicleId);
    expect(free?.busyDates).toEqual([]);
    expect(free?.weekdayPrice).toBe('520000');
    expect(free?.weekendPrice).toBe('600000');
  });

  maybe('chưa có lô nào thì công tắc TẮT', async () => {
    const preview = await bulk.preview(tenantId, { from: FROM, to: TO });
    expect(preview.activeBlockBatchId).toBeNull();
  });

  maybe('khoảng quá dài → 400 VALIDATION_FAILED', async () => {
    await expect(bulk.preview(tenantId, { from: '2026-01-01', to: '2026-12-31' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });
});

describe('khoá hàng loạt', () => {
  maybe('xe bận một ngày vẫn được khoá HAI ngày còn lại', async () => {
    await occupyMiddleDay();

    const result = await bulk.blockAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
      vehicleIds: allVehicles(),
    });

    // 3 xe × 3 ngày = 9, trừ đúng 1 ngày bận.
    expect(result.blockedDays).toBe(8);
    expect(result.fullyBlockedVehicles).toBe(2);
    expect(result.partiallyBlockedVehicles).toBe(1);
    expect(result.skippedVehicles).toBe(0);

    const blocked = await prisma.vehicleBlock.findMany({
      where: { tenantId, vehicleId: busyVehicleId },
      select: { startAt: true },
      orderBy: { startAt: 'asc' },
    });
    expect(blocked).toHaveLength(2);
  });

  maybe('mọi dòng của một lượt mang CHUNG một batchId', async () => {
    const result = await bulk.blockAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
      vehicleIds: [freeVehicleId],
    });

    const rows = await prisma.vehicleBlock.findMany({
      where: { tenantId },
      select: { bulkBatchId: true },
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.bulkBatchId))).toEqual(new Set([result.batchId]));
  });

  maybe('khoá xong thì công tắc BẬT — preview trả về đúng batchId', async () => {
    const result = await bulk.blockAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
      vehicleIds: [freeVehicleId],
    });

    const preview = await bulk.preview(tenantId, { from: FROM, to: TO });
    expect(preview.activeBlockBatchId).toBe(result.batchId);
  });

  maybe('khoá hàng loạt GIỮ CHỖ thật — xe đó không đặt thêm được nữa', async () => {
    await bulk.blockAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
      vehicleIds: [freeVehicleId],
    });

    const occupancies = await prisma.vehicleOccupancy.count({
      where: { tenantId, vehicleId: freeVehicleId },
    });
    expect(occupancies).toBe(3);
  });
});

describe('gỡ lô', () => {
  maybe('gỡ đúng lô đó và NHẢ chỗ trên vehicle_occupancies', async () => {
    const result = await bulk.blockAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
      vehicleIds: [freeVehicleId],
    });

    const released = await bulk.releaseBatch(tenantId, ownerId, result.batchId);

    expect(released.released).toBe(3);
    expect(await prisma.vehicleBlock.count({ where: { tenantId } })).toBe(0);
    // Chỗ phải được nhả — không thì lịch bận vĩnh viễn mà không còn gì để bấm vào.
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(0);
  });

  maybe('lịch khoá đặt TAY không bị lô cuốn theo', async () => {
    const manualId = newId();
    await prisma.$transaction(async (tx) => {
      await tx.vehicleBlock.create({
        data: {
          id: manualId,
          tenantId,
          vehicleId: pricelessVehicleId,
          startAt: dayStart('2026-08-31'),
          endAt: new Date(dayStart('2026-08-31').getTime() + 86_400_000),
          reason: VEHICLE_BLOCK_REASON.REPAIR,
          createdBy: ownerId,
        },
      });
      await occupancy.reserve(tx, {
        tenantId,
        vehicleId: pricelessVehicleId,
        sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
        sourceId: manualId,
        startAt: dayStart('2026-08-31'),
        endAt: new Date(dayStart('2026-08-31').getTime() + 86_400_000),
      });
    });

    const result = await bulk.blockAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
      vehicleIds: [freeVehicleId],
    });
    await bulk.releaseBatch(tenantId, ownerId, result.batchId);

    const survivor = await prisma.vehicleBlock.findUnique({ where: { id: manualId } });
    expect(survivor).not.toBeNull();
    expect(survivor?.reason).toBe(VEHICLE_BLOCK_REASON.REPAIR);
  });

  maybe('gỡ một lô không tồn tại là no-op, không phải lỗi', async () => {
    expect(await bulk.releaseBatch(tenantId, ownerId, newId())).toEqual({ released: 0 });
  });
});

describe('đặt giá hàng loạt', () => {
  maybe('theo % tính trên giá niêm yết của TỪNG xe', async () => {
    const result = await bulk.priceAll(tenantId, ownerId, {
      from: FROM,
      to: FROM,
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
      vehicleIds: allVehicles(),
    });

    // Xe chưa có giá gốc bị bỏ qua, không bị đặt 0đ.
    expect(result.updatedVehicles).toBe(2);
    expect(result.skippedVehicles).toBe(1);

    const rows = await prisma.vehicleDailyPrice.findMany({
      where: { tenantId, date: new Date(`${FROM}T00:00:00.000Z`) },
      select: { vehicleId: true, dailyPrice: true },
    });
    const byVehicle = new Map(rows.map((r) => [r.vehicleId, r.dailyPrice?.toFixed(0)]));
    // 520.000 × 1,3 = 676.000 → làm tròn bội 10k = 680.000.
    expect(byVehicle.get(freeVehicleId)).toBe('680000');
    expect(byVehicle.get(busyVehicleId)).toBe('1950000');
    expect(byVehicle.has(pricelessVehicleId)).toBe(false);
  });

  maybe('chạy lại cùng lệnh KHÔNG cộng dồn và không nhân dòng', async () => {
    const input = {
      from: FROM,
      to: FROM,
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
      vehicleIds: [freeVehicleId],
    };
    await bulk.priceAll(tenantId, ownerId, input);
    await bulk.priceAll(tenantId, ownerId, input);

    const rows = await prisma.vehicleDailyPrice.findMany({
      where: { tenantId, vehicleId: freeVehicleId },
      select: { dailyPrice: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dailyPrice?.toFixed(0)).toBe('680000');
  });

  maybe('ngày CUỐI TUẦN lấy giá cuối tuần làm gốc', async () => {
    // 29/08/2026 là Thứ Bảy: 600.000 × 1,3 = 780.000.
    await bulk.priceAll(tenantId, ownerId, {
      from: '2026-08-29',
      to: '2026-08-29',
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
      vehicleIds: [freeVehicleId],
    });

    const row = await prisma.vehicleDailyPrice.findFirst({
      where: { tenantId, vehicleId: freeVehicleId },
      select: { dailyPrice: true },
    });
    expect(row?.dailyPrice?.toFixed(0)).toBe('780000');
  });

  maybe('đồng giá đặt cùng một số cho mọi xe, kể cả xe chưa có giá gốc', async () => {
    const result = await bulk.priceAll(tenantId, ownerId, {
      from: FROM,
      to: FROM,
      mode: BULK_PRICE_MODE.FIXED,
      fixedPrice: '900000',
      vehicleIds: allVehicles(),
    });

    expect(result.updatedVehicles).toBe(3);
    const rows = await prisma.vehicleDailyPrice.findMany({
      where: { tenantId },
      select: { dailyPrice: true },
    });
    expect(rows.every((r) => r.dailyPrice?.toFixed(0) === '900000')).toBe(true);
  });

  maybe('thiếu percent ở chế độ % → 400', async () => {
    await expect(
      bulk.priceAll(tenantId, ownerId, {
        from: FROM,
        to: FROM,
        mode: BULK_PRICE_MODE.PERCENT,
        vehicleIds: [freeVehicleId],
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('đặt giá KHÔNG đụng lịch trống của xe', async () => {
    await bulk.priceAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
      vehicleIds: [freeVehicleId],
    });

    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(0);
  });

  maybe('khôi phục giá mặc định xoá bản ghi đè trong khoảng', async () => {
    await bulk.priceAll(tenantId, ownerId, {
      from: FROM,
      to: TO,
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
      vehicleIds: [freeVehicleId],
    });

    const restored = await bulk.restorePrices(tenantId, ownerId, {
      from: FROM,
      to: TO,
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 0,
      vehicleIds: [freeVehicleId],
    });

    expect(restored.updatedDays).toBe(3);
    expect(await prisma.vehicleDailyPrice.count({ where: { tenantId } })).toBe(0);
  });
});

describe('ranh giới gian hàng', () => {
  maybe('id xe của gian hàng khác bị loại, không ghi gì cho nó', async () => {
    await expect(
      bulk.blockAll(tenantId, ownerId, {
        from: FROM,
        to: FROM,
        reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
        vehicleIds: [newId()],
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });
});
