import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  OCCUPANCY_SOURCE_TYPE,
  TENANT_STATUS,
  VEHICLE_BLOCK_REASON,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleBlocksService } from '../src/modules/calendar/vehicle-blocks.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Khoá xe (Wave lịch) trên PostgreSQL THẬT.
 *
 * Điều được khoá: block + occupancy sống/chết CÙNG transaction (ADR 0006 — tạo trùng lịch thì
 * cả block rollback, không có "block ma"); sửa giờ đồng bộ occupancy; optimistic concurrency
 * 409 khi rowVersion lệch; gỡ khoá nhả chỗ; tenant khác nhìn vào là 404, không phải dữ liệu.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const blocks = new VehicleBlocksService(asService, occupancy, audit);

let dbAvailable = false;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;
let ownerId: string;

const BASE = new Date('2026-10-05T00:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3600_000);

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
  vehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Block owner', email: `blk-${ownerId}@xeprime.test` },
  });
  for (const [id, code] of [
    [tenantId, 'BLK1'],
    [otherTenantId, 'BLK2'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `TEST-${id.slice(-8)}`,
        slug: `test-${id.toLowerCase().slice(-8)}-${code.toLowerCase()}`,
        name: `Tenant ${code}`,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
  }
  await prisma.vehicle.create({
    data: { id: vehicleId, tenantId, code: 'VB1', name: 'Xe khoá', vehicleType: VEHICLE_TYPE.CAR },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.vehicleBlock.deleteMany({ where: { tenantId } });
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

function createDto(startHour = 0, endHour = 24) {
  return {
    vehicleId,
    startAt: hours(startHour),
    endAt: hours(endHour),
    reason: VEHICLE_BLOCK_REASON.REPAIR,
    note: 'thay má phanh',
  };
}

describe('VehicleBlocksService — khoá xe + occupancy cùng transaction', () => {
  maybe('tạo block ghi luôn occupancy nguồn blocked_range', async () => {
    const block = await blocks.create(tenantId, ownerId, createDto());

    expect(block.reason).toBe(VEHICLE_BLOCK_REASON.REPAIR);
    expect(block.vehicleName).toBe('Xe khoá');

    const occ = await prisma.vehicleOccupancy.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
          sourceId: block.id,
        },
      },
    });
    expect(occ).not.toBeNull();
    expect(occ!.vehicleId).toBe(vehicleId);

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: 'vehicle.block.create', targetId: block.id },
    });
    expect(auditRow).not.toBeNull();
  });

  maybe('khoảng thời gian âm bị từ chối ngay từ validate', async () => {
    await expect(
      blocks.create(tenantId, ownerId, { ...createDto(), startAt: hours(24), endAt: hours(0) }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe(
    'trùng đơn thuê đang giữ lịch → constraint từ chối và block ROLLBACK trọn gói',
    async () => {
      // Đơn thuê giữ [0h, 48h) — nguồn khác nhưng cùng bảng occupancy (ADR 0006).
      await prisma.vehicleOccupancy.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
          sourceId: newId(),
          startAt: hours(0),
          endAt: hours(48),
        },
      });

      await expect(blocks.create(tenantId, ownerId, createDto(24, 72))).rejects.toBeDefined();

      // Không có "block ma": bảng nghiệp vụ cũng phải trống.
      expect(await prisma.vehicleBlock.count({ where: { tenantId } })).toBe(0);
    },
  );

  maybe('sửa giờ đồng bộ occupancy; rowVersion lệch → 409 không ghi đè', async () => {
    const block = await blocks.create(tenantId, ownerId, createDto());

    const updated = await blocks.update(tenantId, block.id, ownerId, {
      startAt: hours(48),
      endAt: hours(96),
      reason: VEHICLE_BLOCK_REASON.INTERNAL_USE,
      expectedRowVersion: block.rowVersion,
    });
    expect(updated.rowVersion).toBe(block.rowVersion + 1);
    expect(updated.reason).toBe(VEHICLE_BLOCK_REASON.INTERNAL_USE);

    const occ = await prisma.vehicleOccupancy.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
          sourceId: block.id,
        },
      },
    });
    expect(occ!.startAt.getTime()).toBe(hours(48).getTime());
    expect(occ!.endAt.getTime()).toBe(hours(96).getTime());

    // Người thứ hai còn cầm bản cũ → 409, dữ liệu giữ nguyên quyết định mới nhất.
    await expect(
      blocks.update(tenantId, block.id, ownerId, {
        startAt: hours(0),
        endAt: hours(24),
        reason: VEHICLE_BLOCK_REASON.REPAIR,
        expectedRowVersion: block.rowVersion,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
  });

  maybe('gỡ khoá xoá block VÀ nhả chỗ trên lịch', async () => {
    const block = await blocks.create(tenantId, ownerId, createDto());
    await blocks.remove(tenantId, block.id, ownerId);

    expect(await prisma.vehicleBlock.count({ where: { id: block.id } })).toBe(0);
    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE, sourceId: block.id },
      }),
    ).toBe(0);

    // Nhả xong là đặt lại được ngay đúng khoảng đó.
    await expect(blocks.create(tenantId, ownerId, createDto())).resolves.toBeDefined();
  });

  maybe('tenant khác không thấy, không sửa, không xoá được — 404 mọi đường', async () => {
    const block = await blocks.create(tenantId, ownerId, createDto());

    await expect(blocks.getOne(otherTenantId, block.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(
      blocks.update(otherTenantId, block.id, ownerId, {
        startAt: hours(0),
        endAt: hours(24),
        reason: VEHICLE_BLOCK_REASON.OTHER,
        expectedRowVersion: 1,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
    await expect(blocks.remove(otherTenantId, block.id, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });

    // Xe của tenant khác cũng không khoá được qua vehicleId đoán mò.
    await expect(blocks.create(otherTenantId, ownerId, createDto())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
