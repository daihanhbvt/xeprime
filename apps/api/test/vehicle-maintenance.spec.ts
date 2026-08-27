import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_STATUS,
  MAINTENANCE_TYPE,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  SYSTEM_FINANCE_CATEGORY,
  MEMBERSHIP_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  ODOMETER_SOURCE,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  vehicleMaintenanceSchedule,
} from '@xeprime/types';
import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../src/common/decorators';
import { AuditService } from '../src/modules/audit/audit.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { MaintenanceBoardController } from '../src/modules/vehicles/maintenance/maintenance-board.controller';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import { VehicleMaintenanceController } from '../src/modules/vehicles/maintenance/vehicle-maintenance.controller';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Wave 6 — Bảo dưỡng & KM trên PostgreSQL THẬT (R2 fake trong bộ nhớ).
 *
 * Điều được khoá: công thức mốc bảo dưỡng và trạng thái `Chưa đủ dữ liệu`; luật KM
 * (không tụt số, chỉnh tay bắt buộc lý do, giảm cần quyền cao + xác nhận, lịch sử chỉ-thêm);
 * hoàn tất bảo dưỡng là MỘT transaction (nhả lịch + ghi KM + chỉ thay nhớt mới dời mốc);
 * lịch bảo dưỡng CHẶN THẬT việc đặt xe qua `vehicle_occupancies` (ADR 0006) và hủy thì nhả;
 * chi phí/chứng từ không rò cho vai trò thiếu quyền.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const fakeR2 = {
  privateEnabled: true,
  async presignPrivateUpload() {
    return { uploadUrl: 'https://r2.local/put', expiresIn: 300 };
  },
  async headPrivateObject() {
    return null;
  },
  async readPrivateObjectPrefix() {
    return null;
  },
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/signed-get', expiresIn: 120 };
  },
};

const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const vehicles = makeVehiclesService(asService);
const createVehicleWithBranch = vehicleCreator(vehicles, asService);
const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const odometer = new OdometerService(asService, audit);
const maintenance = new MaintenanceService(asService, occupancy, odometer, files, audit, new ReceiptsService(asService, audit));

/** Vai trò đủ quyền (chủ gian hàng) vs vai trò vận hành (không tiền, không file). */
const FULL_SCOPE = { canViewCost: true, canViewFiles: true };
const STAFF_SCOPE = { canViewCost: false, canViewFiles: false };

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;

const BASE = new Date('2026-10-05T02:00:00.000Z');
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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  for (const [id, name] of [
    [tenantId, 'Shop Bảo Dưỡng'],
    [otherTenantId, 'Shop Khác'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [tenantId, otherTenantId]) {
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function createVehicle(code: string) {
  return createVehicleWithBranch(tenantId, ownerId, {
    code,
    name: 'Toyota Vios',
    vehicleType: VEHICLE_TYPE.CAR,
    plateNumber: '51A-123.45',
  });
}

/** Đặt KM ban đầu qua đúng đường nghiệp vụ (chỉnh tay có lý do). */
async function setKm(vehicleId: string, km: number) {
  const profile = await maintenance.getProfile(tenantId, vehicleId);
  return odometer.correct(
    tenantId,
    vehicleId,
    ownerId,
    {
      odometerKm: km,
      reasonCode: 'data_migration',
      reason: 'Nhập số ban đầu',
      expectedRowVersion: profile.rowVersion > 0 ? profile.rowVersion : undefined,
    },
    { canDecrease: false },
  );
}

// ── Công thức (hàm thuần, không cần DB) ─────────────────────────────────────

describe('Công thức mốc bảo dưỡng (§9)', () => {
  it('đủ dữ liệu: mốc tiếp theo = lần gần nhất + chu kỳ; còn lại = mốc − hiện tại', () => {
    const result = vehicleMaintenanceSchedule({
      currentKm: 45_230,
      lastServiceKm: 40_000,
      intervalKm: 5_000,
      dueSoonKm: 500,
    });
    expect(result.nextMaintenanceKm).toBe(45_000);
    expect(result.remainingKm).toBe(-230); // đã vượt mốc
    expect(result.usedKm).toBe(5_230);
    expect(result.usedPercent).toBe(104.6);
    expect(result.status).toBe(MAINTENANCE_DUE_STATUS.OVERDUE);
  });

  it('thiếu bất kỳ thành phần nào → UNKNOWN và các số là null (KHÔNG 0km giả)', () => {
    for (const input of [
      { currentKm: 45_000, lastServiceKm: 40_000, intervalKm: null },
      { currentKm: 45_000, lastServiceKm: null, intervalKm: 5_000 },
      { currentKm: null, lastServiceKm: 40_000, intervalKm: 5_000 },
    ]) {
      const result = vehicleMaintenanceSchedule(input);
      expect(result.status).toBe(MAINTENANCE_DUE_STATUS.UNKNOWN);
      expect(result.remainingKm).toBeNull();
      expect(result.usedKm).toBeNull();
    }
  });

  it('ngưỡng sắp đến hạn đến từ cấu hình; không có ngưỡng thì không tự suy DUE_SOON', () => {
    const base = { currentKm: 44_800, lastServiceKm: 40_000, intervalKm: 5_000 };
    expect(vehicleMaintenanceSchedule({ ...base, dueSoonKm: 500 }).status).toBe(
      MAINTENANCE_DUE_STATUS.DUE_SOON,
    );
    expect(vehicleMaintenanceSchedule({ ...base, dueSoonKm: null }).status).toBe(
      MAINTENANCE_DUE_STATUS.OK,
    );
  });
});

// ── Odometer ────────────────────────────────────────────────────────────────

describe('KM có thẩm quyền (§9.1)', () => {
  maybe('xe mới: KM là null, KHÔNG phải 0 — trạng thái Chưa đủ dữ liệu', async () => {
    const v = await createVehicle('KM-EMPTY');
    const profile = await maintenance.getProfile(tenantId, v.id);
    expect(profile.currentOdometerKm).toBeNull();
    expect(profile.nextMaintenanceKm).toBeNull();
    expect(profile.dueStatus).toBe(MAINTENANCE_DUE_STATUS.UNKNOWN);
    // Ngưỡng hiệu lực luôn được trả về để UI không phải đoán con số.
    expect(profile.dueSoonKm).toBeGreaterThan(0);
  });

  maybe('chỉnh tay ghi lịch sử chỉ-thêm kèm previousKm + lý do + audit', async () => {
    const v = await createVehicle('KM-HIST');
    await setKm(v.id, 40_000);
    const after = await maintenance.getProfile(tenantId, v.id);
    await odometer.correct(
      tenantId,
      v.id,
      ownerId,
      {
        odometerKm: 45_230,
        reasonCode: 'handover_error',
        reason: 'Sai số từ bàn giao đơn T2408-001',
        expectedRowVersion: after.rowVersion,
      },
      { canDecrease: false },
    );

    const history = await odometer.history(tenantId, v.id, 1, 20);
    expect(history.meta.total).toBe(2);
    expect(history.data[0]!.odometerKm).toBe(45_230);
    expect(history.data[0]!.previousKm).toBe(40_000);
    expect(history.data[0]!.source).toBe(ODOMETER_SOURCE.MANUAL_CORRECTION);
    expect(history.data[0]!.reason).toContain('Sai số từ bàn giao');
    expect(history.data[0]!.isDecrease).toBe(false);

    const logs = await prisma.auditLog.count({
      where: { tenantId, targetId: v.id, action: 'vehicle.odometer.record' },
    });
    expect(logs).toBeGreaterThanOrEqual(2);
  });

  maybe('chỉnh tay KHÔNG lý do bị chặn (app), và DB cũng chặn nếu lách qua service', async () => {
    const v = await createVehicle('KM-REASON');
    await setKm(v.id, 10_000);
    const profile = await maintenance.getProfile(tenantId, v.id);
    await expect(
      odometer.correct(
        tenantId,
        v.id,
        ownerId,
        {
          odometerKm: 12_000,
          reasonCode: 'other',
          reason: '   ',
          expectedRowVersion: profile.rowVersion,
        },
        { canDecrease: false },
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    // Ghi thẳng DB không lý do → CHECK constraint từ chối.
    await expect(
      prisma.vehicleOdometerReading.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: v.id,
          odometerKm: 12_000,
          source: ODOMETER_SOURCE.MANUAL_CORRECTION,
        },
      }),
    ).rejects.toBeDefined();
  });

  maybe('thiếu quyền giảm: KM thấp hơn bị từ chối bằng mã riêng, số cũ giữ nguyên', async () => {
    const v = await createVehicle('KM-DEC-NO');
    await setKm(v.id, 45_230);
    const profile = await maintenance.getProfile(tenantId, v.id);

    await expect(
      odometer.correct(
        tenantId,
        v.id,
        ownerId,
        {
          odometerKm: 44_500,
          reasonCode: 'handover_error',
          reason: 'Nhập nhầm chỉ số lùi ngày',
          confirmDecrease: true,
          expectedRowVersion: profile.rowVersion,
        },
        { canDecrease: false },
      ),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN, details: { currentKm: 45_230 } },
    });

    expect((await maintenance.getProfile(tenantId, v.id)).currentOdometerKm).toBe(45_230);
  });

  maybe('có quyền giảm nhưng CHƯA xác nhận: vẫn chặn (chống bấm nhầm)', async () => {
    const v = await createVehicle('KM-DEC-CONFIRM');
    await setKm(v.id, 45_230);
    const profile = await maintenance.getProfile(tenantId, v.id);
    await expect(
      odometer.correct(
        tenantId,
        v.id,
        ownerId,
        {
          odometerKm: 44_500,
          reasonCode: 'device_error',
          reason: 'Thay cụm đồng hồ',
          expectedRowVersion: profile.rowVersion,
        },
        { canDecrease: true },
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN,
        details: { requiresConfirmation: true },
      },
    });
  });

  maybe('đủ quyền + xác nhận + lý do: giảm được, đánh dấu isDecrease và audit riêng', async () => {
    const v = await createVehicle('KM-DEC-OK');
    await setKm(v.id, 45_230);
    const profile = await maintenance.getProfile(tenantId, v.id);
    await odometer.correct(
      tenantId,
      v.id,
      ownerId,
      {
        odometerKm: 44_500,
        reasonCode: 'device_error',
        reason: 'Thay cụm đồng hồ mới, số về 44.500',
        confirmDecrease: true,
        expectedRowVersion: profile.rowVersion,
      },
      { canDecrease: true },
    );

    expect((await maintenance.getProfile(tenantId, v.id)).currentOdometerKm).toBe(44_500);
    const history = await odometer.history(tenantId, v.id, 1, 5);
    expect(history.data[0]!.isDecrease).toBe(true);
    // Lịch sử là CHỈ-THÊM: số cũ vẫn còn nguyên trong lịch sử, không bị viết đè.
    expect(history.data.some((row) => row.odometerKm === 45_230)).toBe(true);
    const decreaseLogs = await prisma.auditLog.count({
      where: { tenantId, targetId: v.id, action: 'vehicle.odometer.decrease' },
    });
    expect(decreaseLogs).toBe(1);
  });

  maybe('sửa KM đồng thời: người nộp rowVersion cũ nhận 409, không ghi đè âm thầm', async () => {
    const v = await createVehicle('KM-CONFLICT');
    await setKm(v.id, 10_000);
    const stale = await maintenance.getProfile(tenantId, v.id);

    await odometer.correct(
      tenantId,
      v.id,
      ownerId,
      {
        odometerKm: 11_000,
        reasonCode: 'other',
        reason: 'Người A cập nhật',
        expectedRowVersion: stale.rowVersion,
      },
      { canDecrease: false },
    );

    await expect(
      odometer.correct(
        tenantId,
        v.id,
        ownerId,
        {
          odometerKm: 12_000,
          reasonCode: 'other',
          reason: 'Người B dùng bản cũ',
          expectedRowVersion: stale.rowVersion,
        },
        { canDecrease: false },
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
    expect((await maintenance.getProfile(tenantId, v.id)).currentOdometerKm).toBe(11_000);
  });

  maybe('KM âm / vượt trần bị DB chặn kể cả khi lách qua service', async () => {
    const v = await createVehicle('KM-BOUNDS');
    for (const km of [-1, 3_000_000]) {
      await expect(
        prisma.vehicleOdometerReading.create({
          data: {
            id: newId(),
            tenantId,
            vehicleId: v.id,
            odometerKm: km,
            source: ODOMETER_SOURCE.IMPORT,
          },
        }),
      ).rejects.toBeDefined();
    }
  });

  maybe('tenant khác không đọc/sửa được KM của xe này (404 chống IDOR)', async () => {
    const v = await createVehicle('KM-ISO');
    await setKm(v.id, 10_000);
    await expect(odometer.history(otherTenantId, v.id, 1, 10)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(
      odometer.correct(
        otherTenantId,
        v.id,
        ownerId,
        { odometerKm: 99_000, reasonCode: 'other', reason: 'thử vượt tenant' },
        { canDecrease: true },
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });
});

// ── Cấu hình + phiếu bảo dưỡng ──────────────────────────────────────────────

describe('Cấu hình & phiếu bảo dưỡng', () => {
  maybe('cấu hình chu kỳ → tính đúng mốc tiếp theo và KM còn lại', async () => {
    const v = await createVehicle('MT-CONFIG');
    await setKm(v.id, 45_230);
    const before = await maintenance.getProfile(tenantId, v.id);

    const saved = await maintenance.saveProfile(tenantId, v.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 40_000,
      expectedRowVersion: before.rowVersion,
    });
    expect(saved.nextMaintenanceKm).toBe(45_000);
    expect(saved.remainingKm).toBe(-230);
    expect(saved.dueStatus).toBe(MAINTENANCE_DUE_STATUS.OVERDUE);
  });

  maybe('lưu cấu hình đồng thời: rowVersion cũ → 409', async () => {
    const v = await createVehicle('MT-CONF-CONFLICT');
    await setKm(v.id, 1_000);
    const stale = await maintenance.getProfile(tenantId, v.id);
    await maintenance.saveProfile(tenantId, v.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      expectedRowVersion: stale.rowVersion,
    });
    await expect(
      maintenance.saveProfile(tenantId, v.id, ownerId, {
        oilChangeIntervalKm: 8_000,
        expectedRowVersion: stale.rowVersion,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
  });

  maybe('hoàn tất THAY NHỚT: nhả lịch + đẩy KM + dời mốc thay nhớt (một transaction)', async () => {
    const v = await createVehicle('MT-OIL');
    await setKm(v.id, 44_000);
    const profile = await maintenance.getProfile(tenantId, v.id);
    await maintenance.saveProfile(tenantId, v.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 40_000,
      expectedRowVersion: profile.rowVersion,
    });

    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      {
        type: MAINTENANCE_TYPE.OIL_CHANGE,
        title: 'Thay dầu động cơ & Lọc dầu',
        plannedStartAt: hours(0).toISOString(),
        plannedEndAt: hours(4).toISOString(),
      },
      FULL_SCOPE,
    );
    // Lịch đã đặt → có chỗ thật trên `vehicle_occupancies`.
    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE, sourceId: record.id },
      }),
    ).toBe(1);

    const completed = await maintenance.completeRecord(
      tenantId,
      v.id,
      ownerId,
      record.id,
      { odometerKm: 45_100, cost: '950000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );
    expect(completed.status).toBe(MAINTENANCE_STATUS.COMPLETED);

    // Nhả lịch ngay khi xong việc — xe nhận đơn lại được.
    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE, sourceId: record.id },
      }),
    ).toBe(0);

    const after = await maintenance.getProfile(tenantId, v.id);
    expect(after.currentOdometerKm).toBe(45_100);
    expect(after.lastServiceKm).toBe(45_100); // mốc thay nhớt đã dời
    expect(after.nextMaintenanceKm).toBe(50_100);
    expect(after.dueStatus).toBe(MAINTENANCE_DUE_STATUS.OK);
  });

  maybe('hoàn tất SỬA CHỮA: cập nhật KM nhưng KHÔNG âm thầm dời mốc thay nhớt', async () => {
    const v = await createVehicle('MT-REPAIR');
    await setKm(v.id, 44_000);
    const profile = await maintenance.getProfile(tenantId, v.id);
    await maintenance.saveProfile(tenantId, v.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 40_000,
      expectedRowVersion: profile.rowVersion,
    });

    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      { type: MAINTENANCE_TYPE.REPAIR, title: 'Thay má phanh trước' },
      FULL_SCOPE,
    );
    await maintenance.completeRecord(
      tenantId,
      v.id,
      ownerId,
      record.id,
      { odometerKm: 44_500, expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );

    const after = await maintenance.getProfile(tenantId, v.id);
    expect(after.currentOdometerKm).toBe(44_500);
    expect(after.lastServiceKm).toBe(40_000); // KHÔNG đổi
    expect(after.nextMaintenanceKm).toBe(45_000);
  });

  maybe('hoàn tất với KM thấp hơn hiện tại bị chặn — không tụt số có thẩm quyền', async () => {
    const v = await createVehicle('MT-KM-LOW');
    await setKm(v.id, 50_000);
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      { type: MAINTENANCE_TYPE.PERIODIC_SERVICE },
      FULL_SCOPE,
    );
    await expect(
      maintenance.completeRecord(
        tenantId,
        v.id,
        ownerId,
        record.id,
        { odometerKm: 30_000, expectedRowVersion: record.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN } });

    // Rollback trọn gói: phiếu vẫn chưa hoàn tất, KM vẫn nguyên.
    const records = await maintenance.listForVehicle(tenantId, v.id, FULL_SCOPE);
    expect(records[0]!.status).toBe(MAINTENANCE_STATUS.SCHEDULED);
    expect((await maintenance.getProfile(tenantId, v.id)).currentOdometerKm).toBe(50_000);
  });

  maybe('trạng thái kết thúc không sửa/hoàn tất lại được', async () => {
    const v = await createVehicle('MT-CLOSED');
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      { type: MAINTENANCE_TYPE.TIRE },
      FULL_SCOPE,
    );
    const canceled = await maintenance.cancelRecord(
      tenantId,
      v.id,
      ownerId,
      record.id,
      record.rowVersion,
      FULL_SCOPE,
    );
    expect(canceled.status).toBe(MAINTENANCE_STATUS.CANCELED);

    await expect(
      maintenance.completeRecord(
        tenantId,
        v.id,
        ownerId,
        record.id,
        { expectedRowVersion: canceled.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION } });
    await expect(
      maintenance.updateRecord(
        tenantId,
        v.id,
        ownerId,
        record.id,
        { type: MAINTENANCE_TYPE.TIRE, expectedRowVersion: canceled.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION } });
  });

  maybe('mốc thời gian phải đủ cặp và đúng thứ tự', async () => {
    const v = await createVehicle('MT-DATES');
    await expect(
      maintenance.createRecord(
        tenantId,
        v.id,
        ownerId,
        {
          type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
          plannedStartAt: hours(10).toISOString(),
          plannedEndAt: hours(2).toISOString(),
        },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    await expect(
      maintenance.createRecord(
        tenantId,
        v.id,
        ownerId,
        { type: MAINTENANCE_TYPE.PERIODIC_SERVICE, plannedStartAt: hours(2).toISOString() },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('phiếu của xe khác không truy cập chéo được qua path xe này (404)', async () => {
    const a = await createVehicle('MT-CROSS-A');
    const b = await createVehicle('MT-CROSS-B');
    const record = await maintenance.createRecord(
      tenantId,
      b.id,
      ownerId,
      { type: MAINTENANCE_TYPE.BATTERY },
      FULL_SCOPE,
    );
    await expect(
      maintenance.completeRecord(
        tenantId,
        a.id,
        ownerId,
        record.id,
        { expectedRowVersion: record.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });
});

// ── Lịch & availability ─────────────────────────────────────────────────────

describe('Lịch bảo dưỡng CHẶN THẬT availability (ADR 0006 · §9.2)', () => {
  maybe('đặt xe trùng khoảng bảo dưỡng bị DB chặn — không chỉ đổi nhãn trạng thái', async () => {
    const v = await createVehicle('SCH-BLOCK');
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      {
        type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
        plannedStartAt: hours(0).toISOString(),
        plannedEndAt: hours(24).toISOString(),
      },
      FULL_SCOPE,
    );
    expect(record.status).toBe(MAINTENANCE_STATUS.SCHEDULED);

    // Một đơn thuê chồng lên khoảng bảo dưỡng: exclusion constraint từ chối.
    await expect(
      prisma.vehicleOccupancy.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: v.id,
          sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
          sourceId: newId(),
          startAt: hours(12),
          endAt: hours(36),
        },
      }),
    ).rejects.toBeDefined();
  });

  maybe('lịch bảo dưỡng đè lên đơn thuê: 409 kèm KHOẢNG bị trùng, không ghi đè', async () => {
    const v = await createVehicle('SCH-CONFLICT');
    await prisma.vehicleOccupancy.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: v.id,
        sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
        sourceId: newId(),
        startAt: hours(0),
        endAt: hours(24),
      },
    });

    await expect(
      maintenance.createRecord(
        tenantId,
        v.id,
        ownerId,
        {
          type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
          plannedStartAt: hours(12).toISOString(),
          plannedEndAt: hours(36).toISOString(),
        },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT,
        details: { conflicts: [expect.objectContaining({ sourceType: 'booking' })] },
      },
    });

    // Không để lại phiếu mồ côi khi giữ chỗ thất bại.
    expect(await maintenance.listForVehicle(tenantId, v.id, FULL_SCOPE)).toHaveLength(0);
  });

  maybe('hủy lịch NHẢ chỗ — khoảng đó đặt xe lại được ngay', async () => {
    const v = await createVehicle('SCH-CANCEL');
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      {
        type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
        plannedStartAt: hours(0).toISOString(),
        plannedEndAt: hours(24).toISOString(),
      },
      FULL_SCOPE,
    );
    await maintenance.cancelRecord(tenantId, v.id, ownerId, record.id, record.rowVersion, FULL_SCOPE);

    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE, sourceId: record.id },
      }),
    ).toBe(0);
    await expect(
      prisma.vehicleOccupancy.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: v.id,
          sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
          sourceId: newId(),
          startAt: hours(0),
          endAt: hours(24),
        },
      }),
    ).resolves.toBeDefined();
  });

  maybe('dời lịch sang khoảng trống: chỗ giữ đi theo, không nhân đôi', async () => {
    const v = await createVehicle('SCH-MOVE');
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      {
        type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
        plannedStartAt: hours(0).toISOString(),
        plannedEndAt: hours(4).toISOString(),
      },
      FULL_SCOPE,
    );
    await maintenance.updateRecord(
      tenantId,
      v.id,
      ownerId,
      record.id,
      {
        type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
        plannedStartAt: hours(48).toISOString(),
        plannedEndAt: hours(52).toISOString(),
        expectedRowVersion: record.rowVersion,
      },
      FULL_SCOPE,
    );

    const rows = await prisma.vehicleOccupancy.findMany({
      where: { sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE, sourceId: record.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startAt.toISOString()).toBe(hours(48).toISOString());
  });
});

// ── Quyền & riêng tư ────────────────────────────────────────────────────────

describe('Quyền & riêng tư (§10)', () => {
  maybe('vai trò không có quyền tiền: chi phí VẮNG MẶT khỏi response', async () => {
    const v = await createVehicle('PERM-COST');
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      { type: MAINTENANCE_TYPE.OIL_CHANGE, cost: '950000', receiptCode: 'CT-40092' },
      FULL_SCOPE,
    );
    expect(record.cost).toBe('950000');

    const staffView = await maintenance.listForVehicle(tenantId, v.id, STAFF_SCOPE);
    const staffRecord = staffView.find((row) => row.id === record.id)!;
    // Vắng mặt (undefined) ≠ null: FE phân biệt được "bị ẩn" với "chưa nhập".
    expect('cost' in staffRecord).toBe(false);
    expect('receiptCode' in staffRecord).toBe(false);
    expect('attachments' in staffRecord).toBe(false);
    expect(JSON.stringify(staffRecord)).not.toContain('950000');
    expect(JSON.stringify(staffRecord)).not.toContain('CT-40092');
    // Vẫn thấy được việc cần làm.
    expect(staffRecord.status).toBe(MAINTENANCE_STATUS.SCHEDULED);
  });

  maybe('tenant khác không thấy phiếu của gian hàng này', async () => {
    const v = await createVehicle('PERM-ISO');
    await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      { type: MAINTENANCE_TYPE.REPAIR },
      FULL_SCOPE,
    );
    await expect(
      maintenance.listForVehicle(otherTenantId, v.id, FULL_SCOPE),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
    const board = await maintenance.board(otherTenantId, {}, FULL_SCOPE);
    expect(board.data.some((row) => row.vehicleId === v.id)).toBe(false);
  });

  it('quyền từng endpoint đúng mức, không mức nào bao hàm mức khác', () => {
    const permissionsOf = (method: keyof VehicleMaintenanceController): string[] =>
      (Reflect.getMetadata(
        PERMISSIONS_KEY,
        VehicleMaintenanceController.prototype[method] as unknown as object,
      ) as string[]) ?? [];

    expect(permissionsOf('getProfile')).toEqual([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    expect(permissionsOf('records')).toEqual([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    expect(permissionsOf('odometerHistory')).toEqual([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    // Chỉnh KM là quyền RIÊNG, không suy ra từ quyền quản lý bảo dưỡng.
    expect(permissionsOf('correctOdometer')).toEqual([PERMISSION.VEHICLE_ODOMETER_CORRECT]);
    // Mở chứng từ là quyền RIÊNG, người quản lý phiếu không đương nhiên đọc được file.
    expect(permissionsOf('download')).toEqual([PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW]);
    for (const method of [
      'saveProfile',
      'createRecord',
      'updateRecord',
      'startRecord',
      'completeRecord',
      'cancelRecord',
      'presignAttachment',
      'attach',
    ] as const) {
      expect(permissionsOf(method)).toEqual([PERMISSION.VEHICLE_MAINTENANCE_MANAGE]);
    }

    const boardPermissions = (method: keyof MaintenanceBoardController): string[] =>
      (Reflect.getMetadata(
        PERMISSIONS_KEY,
        MaintenanceBoardController.prototype[method] as unknown as object,
      ) as string[]) ?? [];
    expect(boardPermissions('list')).toEqual([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    expect(boardPermissions('summary')).toEqual([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
  });

  it('vai trò mặc định: staff/viewer KHÔNG có quyền tiền và quyền giảm KM', async () => {
    const { DEFAULT_TENANT_ROLE_PERMISSIONS, TENANT_ROLE: ROLE } = await import('@xeprime/types');
    const staff = DEFAULT_TENANT_ROLE_PERMISSIONS[ROLE.SHOP_STAFF];
    const viewer = DEFAULT_TENANT_ROLE_PERMISSIONS[ROLE.SHOP_VIEWER];
    const manager = DEFAULT_TENANT_ROLE_PERMISSIONS[ROLE.SHOP_MANAGER];

    // Staff làm được việc bảo dưỡng/KM được giao…
    expect(staff).toContain(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
    expect(staff).toContain(PERMISSION.VEHICLE_ODOMETER_CORRECT);
    // …nhưng không đương nhiên thấy tiền, mở chứng từ, hay hạ KM.
    expect(staff).not.toContain(PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW);
    expect(staff).not.toContain(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW);
    expect(staff).not.toContain(PERMISSION.VEHICLE_ODOMETER_DECREASE);

    expect(viewer).toContain(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
    expect(viewer).not.toContain(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
    expect(viewer).not.toContain(PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW);

    // Giảm KM là quyền cấp riêng — kể cả quản lý cũng không có mặc định.
    expect(manager).not.toContain(PERMISSION.VEHICLE_ODOMETER_DECREASE);
  });
});

// ── Trung tâm bảo dưỡng ─────────────────────────────────────────────────────

describe('Trung tâm bảo dưỡng toàn đội xe (§9.2)', () => {
  maybe('phân nhóm việc: quá hạn / sắp đến hạn / thiếu KM — lọc chạy ở database', async () => {
    const overdue = await createVehicle('BOARD-OVERDUE');
    await setKm(overdue.id, 45_230);
    let profile = await maintenance.getProfile(tenantId, overdue.id);
    await maintenance.saveProfile(tenantId, overdue.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 40_000,
      expectedRowVersion: profile.rowVersion,
    });

    const dueSoon = await createVehicle('BOARD-DUESOON');
    await setKm(dueSoon.id, 14_800);
    profile = await maintenance.getProfile(tenantId, dueSoon.id);
    await maintenance.saveProfile(tenantId, dueSoon.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 10_000,
      expectedRowVersion: profile.rowVersion,
    });

    const missing = await createVehicle('BOARD-MISSING');

    const overdueRows = await maintenance.board(tenantId, { filter: 'overdue' }, FULL_SCOPE);
    expect(overdueRows.data.some((row) => row.vehicleId === overdue.id)).toBe(true);
    expect(overdueRows.data.every((row) => row.dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE)).toBe(
      true,
    );

    const dueSoonRows = await maintenance.board(tenantId, { filter: 'due_soon' }, FULL_SCOPE);
    expect(dueSoonRows.data.some((row) => row.vehicleId === dueSoon.id)).toBe(true);

    const missingRows = await maintenance.board(
      tenantId,
      { filter: 'missing_odometer' },
      FULL_SCOPE,
    );
    expect(missingRows.data.some((row) => row.vehicleId === missing.id)).toBe(true);
    expect(missingRows.data.every((row) => row.currentOdometerKm === null)).toBe(true);

    const summary = await maintenance.boardSummary(tenantId);
    expect(summary.overdue).toBeGreaterThanOrEqual(1);
    expect(summary.dueSoon).toBeGreaterThanOrEqual(1);
    expect(summary.missingOdometer).toBeGreaterThanOrEqual(1);
  });

  maybe('tìm theo tên/mã/biển số + phân trang server-side', async () => {
    const v = await createVehicle('BOARD-SEARCH');
    const byCode = await maintenance.board(tenantId, { q: 'BOARD-SEARCH' }, FULL_SCOPE);
    expect(byCode.data).toHaveLength(1);
    expect(byCode.data[0]!.vehicleId).toBe(v.id);
    expect(byCode.meta.total).toBe(1);

    const page = await maintenance.board(tenantId, { page: 1, limit: 2 }, FULL_SCOPE);
    expect(page.data.length).toBeLessThanOrEqual(2);
    expect(page.meta.limit).toBe(2);
    expect(page.meta.hasNext).toBe(page.meta.total > 2);
  });

  maybe('phiếu đang chạy hiện ở dòng của xe; chi phí ẩn khi thiếu quyền tiền', async () => {
    const v = await createVehicle('BOARD-ACTIVE');
    const record = await maintenance.createRecord(
      tenantId,
      v.id,
      ownerId,
      {
        type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
        cost: '1200000',
        plannedStartAt: hours(72).toISOString(),
        plannedEndAt: hours(80).toISOString(),
      },
      FULL_SCOPE,
    );
    await maintenance.startRecord(tenantId, v.id, ownerId, record.id, record.rowVersion, FULL_SCOPE);

    const rows = await maintenance.board(tenantId, { filter: 'in_progress' }, STAFF_SCOPE);
    const row = rows.data.find((item) => item.vehicleId === v.id)!;
    expect(row.activeRecord?.status).toBe(MAINTENANCE_STATUS.IN_PROGRESS);
    expect(JSON.stringify(row)).not.toContain('1200000');
  });
});

/**
 * Chi phí bảo dưỡng LÊN SỔ (epic nối tiền).
 *
 * Trước đây `cost` dừng lại ở hồ sơ xe, nên chi phí đội xe nằm ngoài sổ và "lãi thực theo xe"
 * không tính được. Khoá cả ba chuyển tiếp, và khoá luôn ranh giới danh mục sửa-chữa ↔ bảo-dưỡng.
 */
describe('Bảo dưỡng → phiếu chi trong sổ', () => {
  const costReceipts = (vehicleId: string) =>
    prisma.receipt.findMany({
      where: { tenantId, vehicleId, source: RECEIPT_SOURCE.MAINTENANCE },
      select: { id: true, type: true, status: true, amount: true, receiptNo: true,
                category: { select: { systemKey: true } } },
    });

  maybe('hoàn tất có chi phí → một phiếu chi, danh mục "Bảo dưỡng/Thay nhớt"', async () => {
    const v = await createVehicle('MT-LEDGER-1');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.OIL_CHANGE, title: 'Thay nhớt định kỳ' },
      FULL_SCOPE,
    );
    const done = await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { cost: '950000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );

    const rows = await costReceipts(v.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe(RECEIPT_TYPE.EXPENSE);
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
    expect(rows[0]!.amount.toString()).toBe('950000');
    expect(rows[0]!.category?.systemKey).toBe(SYSTEM_FINANCE_CATEGORY.MAINTENANCE);
    // Ô chứng từ trống được điền bằng chính số phiếu vừa sinh.
    expect(done.receiptCode).toBe(rows[0]!.receiptNo);
  });

  maybe('sửa chữa đi vào danh mục RIÊNG — không gộp với bảo dưỡng định kỳ', async () => {
    const v = await createVehicle('MT-LEDGER-2');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.REPAIR, title: 'Thay má phanh' },
      FULL_SCOPE,
    );
    await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { cost: '1200000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );

    const rows = await costReceipts(v.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category?.systemKey).toBe(SYSTEM_FINANCE_CATEGORY.REPAIR);
  });

  maybe('hoàn tất KHÔNG có chi phí thì không sinh phiếu nào', async () => {
    const v = await createVehicle('MT-LEDGER-3');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.TIRE, title: 'Đảo lốp' },
      FULL_SCOPE,
    );
    await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );
    expect(await costReceipts(v.id)).toHaveLength(0);
  });

  maybe('correctCost: phiếu đổi số TẠI CHỖ, không đẻ phiếu thứ hai', async () => {
    const v = await createVehicle('MT-LEDGER-4');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.PERIODIC_SERVICE, title: 'Bảo dưỡng 10.000km' },
      FULL_SCOPE,
    );
    const done = await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { cost: '800000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );

    const corrected = await maintenance.correctCost(
      tenantId, v.id, ownerId, record.id,
      { cost: '1500000', correctionReason: 'Gõ nhầm số 0', expectedRowVersion: done.rowVersion },
      FULL_SCOPE,
    );

    const rows = await costReceipts(v.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount.toString()).toBe('1500000');
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);

    // Sửa TIỀN phải để lại dấu vết kèm giá trị cũ — không thì đây là một đường xoá lịch sử.
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'vehicle.maintenance.cost_correct', targetId: record.id },
    });
    expect(log.beforeJson).toMatchObject({ cost: '800000' });
    expect(log.afterJson).toMatchObject({ cost: '1500000', reason: 'Gõ nhầm số 0' });
    expect(corrected.cost).toBe('1500000');
  });

  maybe('correctCost xoá chi phí → phiếu chi bị HUỶ, sổ không giữ khoản đã rút lại', async () => {
    const v = await createVehicle('MT-LEDGER-5');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.BATTERY, title: 'Thay ắc quy' },
      FULL_SCOPE,
    );
    const done = await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { cost: '600000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );

    await maintenance.correctCost(
      tenantId, v.id, ownerId, record.id,
      { cost: null, correctionReason: 'Bên bảo hành lo, shop không trả đồng nào',
        expectedRowVersion: done.rowVersion },
      FULL_SCOPE,
    );

    const rows = await costReceipts(v.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.CANCELLED);
  });

  maybe('correctCost từ chối phiếu CHƯA hoàn tất — phiếu đang mở thì sửa như thường', async () => {
    const v = await createVehicle('MT-LEDGER-6');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.OTHER, customTypeName: 'Dán phim', title: 'Dán phim cách nhiệt' },
      FULL_SCOPE,
    );
    await expect(
      maintenance.correctCost(
        tenantId, v.id, ownerId, record.id,
        { cost: '100000', correctionReason: 'x', expectedRowVersion: record.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

/** Cùng vòng như hoàn cọc: xoá chi phí rồi nhập lại phải sống, không đụng unique index. */
describe('Bảo dưỡng → xoá chi phí rồi nhập lại', () => {
  maybe('phiếu chi sống lại, vẫn đúng MỘT dòng', async () => {
    const v = await createVehicle('MT-REVIVE');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.OIL_CHANGE, title: 'Thay nhớt' },
      FULL_SCOPE,
    );
    const done = await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { cost: '700000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );
    const cleared = await maintenance.correctCost(
      tenantId, v.id, ownerId, record.id,
      { cost: null, correctionReason: 'Chưa thanh toán', expectedRowVersion: done.rowVersion },
      FULL_SCOPE,
    );
    await maintenance.correctCost(
      tenantId, v.id, ownerId, record.id,
      { cost: '850000', correctionReason: 'Đã trả tiền', expectedRowVersion: cleared.rowVersion },
      FULL_SCOPE,
    );

    const rows = await prisma.receipt.findMany({
      where: { tenantId, vehicleId: v.id, source: RECEIPT_SOURCE.MAINTENANCE },
      select: { amount: true, status: true, cancelledAt: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount.toString()).toBe('850000');
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
    expect(rows[0]!.cancelledAt).toBeNull();
  });

  maybe('correctCost chỉ đổi mã chứng từ KHÔNG được xoá chi phí', async () => {
    const v = await createVehicle('MT-PATCH');
    const record = await maintenance.createRecord(
      tenantId, v.id, ownerId,
      { type: MAINTENANCE_TYPE.TIRE, title: 'Thay lốp' },
      FULL_SCOPE,
    );
    const done = await maintenance.completeRecord(
      tenantId, v.id, ownerId, record.id,
      { cost: '2000000', expectedRowVersion: record.rowVersion },
      FULL_SCOPE,
    );

    const patched = await maintenance.correctCost(
      tenantId, v.id, ownerId, record.id,
      { receiptCode: 'HD-9911', correctionReason: 'Bổ sung số hoá đơn',
        expectedRowVersion: done.rowVersion },
      FULL_SCOPE,
    );

    expect(patched.cost).toBe('2000000');
    expect(patched.receiptCode).toBe('HD-9911');
    const rows = await prisma.receipt.findMany({
      where: { tenantId, vehicleId: v.id, source: RECEIPT_SOURCE.MAINTENANCE },
      select: { amount: true, status: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
  });
});
