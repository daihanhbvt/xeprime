import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  HANDOVER_PHOTO_SLOT,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_PRIORITY,
  VEHICLE_ALERT_SEVERITY,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
  sortVehicleAlerts,
  type VehicleAlertKind,
} from '@xeprime/types';
import 'reflect-metadata';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { HandoversService } from '../src/modules/bookings/handovers/handovers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import {
  VehicleAlertsService,
  vehicleAlertScopeOf,
} from '../src/modules/vehicles/vehicle-alerts.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Wave 8 — Tổng hợp việc cần làm của xe + hàng đợi "Thiếu KM trả", trên PostgreSQL THẬT.
 *
 * Điều được khoá: MỘT phép tính cho cả thẻ xe lẫn Hồ sơ 360; thứ tự ưu tiên tất định; cảnh báo
 * KHÔNG rò dữ liệu nhạy cảm (số giấy tờ, tên file, số tiền); nghĩa vụ tài chính chỉ hiện với
 * vai trò có quyền tiền; hàng đợi thiếu KM liệt kê đúng việc còn tồn và biến mất sau khi xử lý;
 * và xe của tenant khác không lọt vào bất kỳ kết quả nào.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const objects = new Map<string, { size: number; contentType: string }>();
const fakeR2 = {
  privateEnabled: true,
  async presignPrivateUpload(input: { key: string; contentType: string; contentLength: number }) {
    objects.set(input.key, { size: input.contentLength, contentType: input.contentType });
    return { uploadUrl: 'https://r2.local/put', expiresIn: 300 };
  },
  async headPrivateObject(key: string) {
    const found = objects.get(key);
    return found ? { size: found.size, contentType: found.contentType } : null;
  },
  async readPrivateObjectPrefix(key: string) {
    return objects.has(key) ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]) : null;
  },
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/signed-get', expiresIn: 120 };
  },
};

const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const notifications = new NotificationService(asService);
const vehicles = makeVehiclesService(asService);
const createVehicleWithBranch = vehicleCreator(vehicles, asService);
const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const odometer = new OdometerService(asService, audit);
const maintenance = new MaintenanceService(asService, occupancy, odometer, files, audit);
const bookings = new BookingsService(
  asService,
  occupancy,
  audit,
  notifications,
  new DriversService(asService, audit),
  new CustomersService(asService, audit),
);
const handovers = new HandoversService(asService, bookings, odometer, maintenance, files, audit);
const alerts = new VehicleAlertsService(asService);

/**
 * Scope dựng từ CHÍNH `vehicleAlertScopeOf` + hằng số `PERMISSION` — test đi qua đúng đường
 * mà controller đi, nên một permission bị quên ở helper là test đỏ chứ không phải lỗ âm thầm.
 */
const scopeOf = (...permissions: string[]) => vehicleAlertScopeOf(permissions);

/** Chủ gian hàng: thấy mọi miền. */
const FINANCE_SCOPE = scopeOf(
  PERMISSION.FINANCE_VIEW,
  PERMISSION.VEHICLE_DOCUMENT_VIEW,
  PERMISSION.VEHICLE_MAINTENANCE_VIEW,
  PERMISSION.HANDOVER_VIEW,
  PERMISSION.BOOKING_VIEW,
);
/** Vai trò vận hành: mọi miền vận hành, KHÔNG có quyền tiền. */
const OPERATIONS_SCOPE = scopeOf(
  PERMISSION.VEHICLE_DOCUMENT_VIEW,
  PERMISSION.VEHICLE_MAINTENANCE_VIEW,
  PERMISSION.HANDOVER_VIEW,
  PERMISSION.BOOKING_VIEW,
);
/** Custom role chỉ có `vehicles.view` — không kèm miền nào khác. */
const VEHICLE_ONLY_SCOPE = scopeOf();
const FULL_HANDOVER_SCOPE = { canViewFiles: true };

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;

const BASE = new Date('2026-11-02T02:00:00.000Z');
const days = (n: number) => new Date(BASE.getTime() + n * 86_400_000);

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
    [tenantId, 'Shop Wave 8'],
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
      await prisma.booking.deleteMany({ where: { tenantId: id } });
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.notification.deleteMany({ where: { tenantId: id } });
      await prisma.tenantProfile.deleteMany({ where: { tenantId: id } });
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

let seq = 0;

/** Xe đủ điều kiện lên sàn (có biển số + giá + ảnh) — để không dính cảnh báo "thiếu thông tin". */
async function createVehicle(over: Record<string, unknown> = {}) {
  seq += 1;
  return createVehicleWithBranch(tenantId, ownerId, {
    code: `W8-${Date.now().toString(36)}-${seq}`,
    name: 'Toyota Vios 2024',
    vehicleType: VEHICLE_TYPE.CAR,
    plateNumber: '51A-123.45',
    weekdayPrice: '850000',
    mainImageUrl: 'https://cdn.test/main.jpg',
    ...over,
  });
}

async function setKm(vehicleId: string, km: number) {
  const profile = await maintenance.getProfile(tenantId, vehicleId);
  await odometer.correct(
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

async function alertKinds(vehicleId: string, scope = OPERATIONS_SCOPE): Promise<string[]> {
  const row = await alerts.forVehicle(tenantId, vehicleId, scope);
  return row.alerts.map((alert) => alert.kind);
}

/**
 * Gắn một phiên bản file THẬT cho giấy tờ.
 *
 * Cần vì luật trình bày chuẩn coi giấy tờ chưa có file là `missing` — muốn khẳng định
 * "đã hết hạn" thì phải có file thật, không thể giả định (Wave 8.1 §4).
 */
async function attachActiveVersion(vehicleId: string, documentId: string) {
  const fileId = newId();
  const versionId = newId();
  await prisma.vehiclePrivateFile.create({
    data: {
      id: fileId,
      tenantId,
      vehicleId,
      purpose: 'vehicle_document',
      objectKey: `tenants/${tenantId}/vehicles/${vehicleId}/documents/${fileId}.jpg`,
      originalName: 'giay-to.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      status: 'ready',
    },
  });
  await prisma.vehicleDocumentVersion.create({
    data: { id: versionId, tenantId, vehicleId, documentId, privateFileId: fileId, version: 1 },
  });
  await prisma.vehicleDocument.update({
    where: { id: documentId },
    data: { activeVersionId: versionId },
  });
}

/** Bàn giao trả xe đã xác nhận nhưng KHÔNG có KM — sinh đúng việc "Thiếu KM trả". */
async function makeMissingReturnKm(vehicleId: string, dayOffset: number) {
  const booking = await bookings.create(tenantId, ownerId, {
    vehicleId,
    customerName: 'Nguyễn Văn B',
    pickupAt: days(dayOffset).toISOString(),
    returnAt: days(dayOffset + 3).toISOString(),
    baseAmount: '1000000',
  });
  await bookings.transition(tenantId, booking.id, ownerId, { status: BOOKING_STATUS.CONFIRMED });

  // KM giao phải ≥ KM hiện tại của xe (luật không-tụt-số của Wave 6) — lấy từ chính hồ sơ.
  const profile = await maintenance.getProfile(tenantId, vehicleId);
  const pickupKm = (profile.currentOdometerKm ?? 0) + 10;

  for (const type of [HANDOVER_TYPE.PICKUP, HANDOVER_TYPE.RETURN] as const) {
    const km = type === HANDOVER_TYPE.PICKUP ? pickupKm : null;
    await handovers.saveDraft(
      tenantId,
      booking.id,
      type,
      ownerId,
      km === null ? {} : { odometerKm: km },
      FULL_HANDOVER_SCOPE,
    );
    for (const slot of [HANDOVER_PHOTO_SLOT.FRONT, HANDOVER_PHOTO_SLOT.REAR]) {
      const ticket = await handovers.presignPhoto(tenantId, booking.id, type, ownerId, {
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 2048,
        slot,
      });
      await handovers.attachPhoto(
        tenantId,
        booking.id,
        type,
        ownerId,
        ticket.fileId,
        slot,
        FULL_HANDOVER_SCOPE,
      );
    }
    const ctx = await handovers.context(tenantId, booking.id, FULL_HANDOVER_SCOPE);
    const current = type === HANDOVER_TYPE.PICKUP ? ctx.pickup : ctx.return;
    await handovers.confirm(
      tenantId,
      booking.id,
      type,
      ownerId,
      {
        expectedRowVersion: current?.rowVersion ?? 1,
        ...(type === HANDOVER_TYPE.RETURN ? { allowMissingOdometer: true } : {}),
      },
      FULL_HANDOVER_SCOPE,
    );
  }
  return { ...booking, pickupKm };
}

// ── Bảng ưu tiên (hàm thuần) ────────────────────────────────────────────────

describe('Thứ tự ưu tiên việc cần làm', () => {
  it('sắp xếp tất định: vấn đề chặn vận hành/pháp lý đứng trước thông tin', () => {
    const shuffled = [
      { kind: VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS },
      { kind: VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING },
      { kind: VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER },
      { kind: VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE },
      { kind: VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED },
    ];
    expect(sortVehicleAlerts(shuffled).map((a) => a.kind)).toEqual([
      VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER,
      VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED,
      VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE,
      VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING,
      VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS,
    ]);
    // Sắp lại lần nữa cho cùng kết quả — không phụ thuộc thứ tự đầu vào.
    expect(sortVehicleAlerts(sortVehicleAlerts(shuffled))).toEqual(sortVehicleAlerts(shuffled));
  });

  it('mọi loại việc đều có mức ưu tiên riêng — không hai loại cùng số', () => {
    const values = Object.values(VEHICLE_ALERT_PRIORITY);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ── Tổng hợp ────────────────────────────────────────────────────────────────

describe('Tổng hợp việc cần làm của xe', () => {
  maybe('xe chưa có KM: cảnh báo thiếu KM, KHÔNG dựng số 0 giả', async () => {
    const vehicle = await createVehicle();
    const row = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);

    expect(row.currentOdometerKm).toBeNull();
    expect(row.alerts.map((a) => a.kind)).toContain(VEHICLE_ALERT_KIND.MISSING_ODOMETER);
    expect(JSON.stringify(row)).not.toContain('"currentOdometerKm":0');
  });

  maybe('quá hạn bảo dưỡng: cảnh báo nghiêm trọng kèm số KM vượt, dẫn đúng tab', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 50_300);
    const profile = await maintenance.getProfile(tenantId, vehicle.id);
    await maintenance.saveProfile(tenantId, vehicle.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 45_000, // mốc 50.000
      expectedRowVersion: profile.rowVersion,
    });

    const row = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);
    const overdue = row.alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE);
    expect(overdue).toMatchObject({ severity: VEHICLE_ALERT_SEVERITY.CRITICAL });
    expect(overdue?.detail).toContain('300');
    expect(overdue?.href).toBe(`/manage/vehicles/${vehicle.id}/edit?tab=maintenance`);
    expect(row.currentOdometerKm).toBe(50_300);
  });

  maybe('giấy tờ hết hạn: chỉ ĐẾM, không lộ số giấy tờ/chủ xe/số khung', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 10_000);
    const documentId = newId();
    await prisma.vehicleDocument.create({
      data: {
        id: documentId,
        tenantId,
        vehicleId: vehicle.id,
        type: VEHICLE_DOCUMENT_TYPE.INSPECTION,
        documentNumber: 'SIEU-BI-MAT-001',
        holderName: 'Nguyễn Văn A',
        chassisNumber: 'CHASSIS-XYZ',
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    // Có file thật thì mới là "đã hết hạn" theo luật chuẩn (Wave 8.1 §4).
    await attachActiveVersion(vehicle.id, documentId);

    const row = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);
    const expired = row.alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
    expect(expired).toMatchObject({ count: 1, severity: VEHICLE_ALERT_SEVERITY.CRITICAL });

    const json = JSON.stringify(row);
    expect(json).not.toContain('SIEU-BI-MAT-001');
    expect(json).not.toContain('Nguyễn Văn A');
    expect(json).not.toContain('CHASSIS-XYZ');
  });

  maybe('thiếu thông tin lên sàn: nêu ĐÚNG trường còn thiếu, dẫn tab thông tin', async () => {
    const vehicle = await createVehicle({ plateNumber: null, mainImageUrl: null });
    const row = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);
    const missing = row.alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO);

    expect(missing?.detail).toContain('biển số');
    expect(missing?.detail).toContain('ảnh đại diện');
    expect(missing?.count).toBe(2);
    expect(missing?.href).toBe(`/manage/vehicles/${vehicle.id}/edit?tab=information`);
  });

  maybe('nghĩa vụ tài chính CHỈ hiện với quyền tiền, và không kèm số tiền', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 1_000);
    const today = new Date();
    await prisma.vehicleSourceDetail.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: vehicle.id,
        sourceType: VEHICLE_SOURCE_TYPE.FINANCED,
        paymentDay: today.getUTCDate(),
        monthlyPrincipal: '14500000',
        bankName: 'TPBank - Chi nhánh HCM',
      },
    });

    const withFinance = await alerts.forVehicle(tenantId, vehicle.id, FINANCE_SCOPE);
    const obligation = withFinance.alerts.find(
      (a) => a.kind === VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE,
    );
    expect(obligation).toBeTruthy();
    // Cảnh báo là cảnh báo, không phải bảng tài chính.
    const json = JSON.stringify(withFinance);
    expect(json).not.toContain('14500000');
    expect(json).not.toContain('TPBank');

    // Vai trò vận hành: việc này KHÔNG tồn tại với họ.
    expect(await alertKinds(vehicle.id)).not.toContain(VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE);
  });

  maybe('lô nhiều xe: mỗi xe đúng cảnh báo của nó, xe tenant khác KHÔNG lọt vào', async () => {
    const mine = await createVehicle();
    await setKm(mine.id, 5_000);
    const foreign = await createVehicleWithBranch(otherTenantId, ownerId, {
      code: `W8-FOREIGN-${Date.now().toString(36)}`,
      name: 'Xe shop khác',
      vehicleType: VEHICLE_TYPE.CAR,
    });

    const rows = await alerts.forVehicles(tenantId, [mine.id, foreign.id], OPERATIONS_SCOPE);
    expect(rows.map((row) => row.vehicleId)).toEqual([mine.id]);
  });

  maybe('Hồ sơ 360 và lưới danh sách nhận CÙNG một kết quả', async () => {
    const vehicle = await createVehicle({ plateNumber: null });
    await setKm(vehicle.id, 7_000);

    const [batch] = await alerts.forVehicles(tenantId, [vehicle.id], OPERATIONS_SCOPE);
    const single = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);
    expect(single).toEqual(batch);
  });
});

// ── Ma trận quyền theo miền (Wave 8.1) ──────────────────────────────────────

describe('Custom role chỉ có vehicles.view', () => {
  /** Một chiếc xe "đủ mọi loại việc" để chứng minh vai trò này không suy ra được gì. */
  async function loadedVehicle() {
    const vehicle = await createVehicle({ plateNumber: null });
    await setKm(vehicle.id, 51_000);
    const profile = await maintenance.getProfile(tenantId, vehicle.id);
    await maintenance.saveProfile(tenantId, vehicle.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 45_000, // mốc 50.000 → đã quá hạn
      expectedRowVersion: profile.rowVersion,
    });
    const documentId = newId();
    await prisma.vehicleDocument.create({
      data: {
        id: documentId,
        tenantId,
        vehicleId: vehicle.id,
        type: VEHICLE_DOCUMENT_TYPE.INSPECTION,
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await attachActiveVersion(vehicle.id, documentId);
    await prisma.vehicleSourceDetail.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: vehicle.id,
        sourceType: VEHICLE_SOURCE_TYPE.FINANCED,
        paymentDay: new Date().getUTCDate(),
      },
    });
    const booking = await makeMissingReturnKm(vehicle.id, 100);
    return { vehicle, booking };
  }

  maybe('KHÔNG suy ra được giấy tờ, bảo dưỡng, KM, bàn giao, đơn hay tài chính', async () => {
    const { vehicle, booking } = await loadedVehicle();
    const row = await alerts.forVehicle(tenantId, vehicle.id, VEHICLE_ONLY_SCOPE);
    const kinds = row.alerts.map((a) => a.kind);

    // Không loại việc nào thuộc miền khác lọt ra.
    for (const forbidden of [
      VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED,
      VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING,
      VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE,
      VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON,
      VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS,
      VEHICLE_ALERT_KIND.MISSING_ODOMETER,
      VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER,
      VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE,
    ]) {
      expect(kinds).not.toContain(forbidden);
    }

    // KM là dữ liệu bảo dưỡng — phải là null, không phải số thật.
    expect(row.currentOdometerKm).toBeNull();
    expect(row.currentOdometerSource).toBeNull();
    expect(row.currentOdometerAt).toBeNull();

    // Không id đơn nào rò qua URL, và không có link tới hàng đợi họ không vào được.
    const json = JSON.stringify(row);
    expect(json).not.toContain(booking.id);
    expect(json).not.toContain('missing_return_km');

    // Việc thuộc chính miền xe thì VẪN thấy — đây là quyền họ có.
    expect(kinds).toContain(VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO);
  });

  maybe('mỗi quyền chỉ mở ĐÚNG miền của nó', async () => {
    const { vehicle, booking } = await loadedVehicle();
    const kindsFor = async (...permissions: string[]) =>
      (await alerts.forVehicle(tenantId, vehicle.id, scopeOf(...permissions))).alerts.map(
        (a) => a.kind,
      );

    // Giấy tờ: mở đúng cảnh báo giấy tờ, không kéo theo bảo dưỡng/bàn giao.
    const docs = await kindsFor(PERMISSION.VEHICLE_DOCUMENT_VIEW);
    expect(docs).toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
    expect(docs).not.toContain(VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE);
    expect(docs).not.toContain(VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER);

    // Bảo dưỡng: mở KM + mốc bảo dưỡng, không mở giấy tờ.
    const maintenanceOnly = await alerts.forVehicle(
      tenantId,
      vehicle.id,
      scopeOf(PERMISSION.VEHICLE_MAINTENANCE_VIEW),
    );
    expect(maintenanceOnly.alerts.map((a) => a.kind)).toContain(
      VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE,
    );
    expect(maintenanceOnly.alerts.map((a) => a.kind)).not.toContain(
      VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED,
    );
    // KM thật hiện ra (giao xe ở bước dựng dữ liệu đã đẩy số lên) — điều quan trọng là nó
    // KHÔNG còn null như với vai trò chỉ có `vehicles.view`.
    expect(maintenanceOnly.currentOdometerKm).toBeGreaterThanOrEqual(51_000);

    // Bàn giao: mở việc thiếu KM, nhưng KHÔNG được dẫn link mang bookingId.
    const handoverOnly = await alerts.forVehicle(
      tenantId,
      vehicle.id,
      scopeOf(PERMISSION.HANDOVER_VIEW),
    );
    const missing = handoverOnly.alerts.find(
      (a) => a.kind === VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER,
    );
    expect(missing).toBeTruthy();
    expect(missing?.href).toBeNull();
    expect(JSON.stringify(handoverOnly)).not.toContain(booking.id);

    // Tài chính: chỉ mở nghĩa vụ thanh toán.
    const finance = await kindsFor(PERMISSION.FINANCE_VIEW);
    expect(finance).toContain(VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE);
    expect(finance).not.toContain(VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE);
  });

  maybe('link tới đơn CHỈ xuất hiện khi có bookings.view', async () => {
    const { vehicle, booking } = await loadedVehicle();

    // handovers.view + bookings.view → link thẳng đơn.
    const withBookings = await alerts.forVehicle(
      tenantId,
      vehicle.id,
      scopeOf(PERMISSION.HANDOVER_VIEW, PERMISSION.BOOKING_VIEW),
    );
    expect(
      withBookings.alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER)?.href,
    ).toBe(`/manage/bookings?booking=${booking.id}`);

    // handovers.view + maintenance.view (không có bookings.view) → về hàng đợi chung.
    const withQueue = await alerts.forVehicle(
      tenantId,
      vehicle.id,
      scopeOf(PERMISSION.HANDOVER_VIEW, PERMISSION.VEHICLE_MAINTENANCE_VIEW),
    );
    const queueAlert = withQueue.alerts.find(
      (a) => a.kind === VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER,
    );
    expect(queueAlert?.href).toBe('/manage/maintenance?filter=missing_return_km');
    expect(JSON.stringify(withQueue)).not.toContain(booking.id);
  });
});

// ── Luật trạng thái giấy tờ chuẩn (Wave 8.1 §4) ─────────────────────────────

describe('Cảnh báo giấy tờ dùng luật trình bày chuẩn', () => {
  /** Tạo giấy tờ có/không phiên bản đang dùng rồi đọc đếm cảnh báo. */
  async function documentCounts(input: {
    expiresAt: string;
    hasActiveVersion: boolean;
    warningDays?: number | null;
  }) {
    const vehicle = await createVehicle();
    const documentId = newId();
    await prisma.vehicleDocument.create({
      data: {
        id: documentId,
        tenantId,
        vehicleId: vehicle.id,
        type: VEHICLE_DOCUMENT_TYPE.INSPECTION,
        expiresAt: new Date(`${input.expiresAt}T00:00:00.000Z`),
      },
    });
    if (input.hasActiveVersion) await attachActiveVersion(vehicle.id, documentId);
    await prisma.tenantProfile.upsert({
      where: { tenantId },
      update: { settings: { documentExpiryWarningDays: input.warningDays ?? null } },
      create: { tenantId, settings: { documentExpiryWarningDays: input.warningDays ?? null } },
    });

    const row = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);
    return row.alerts.map((a) => a.kind);
  }

  const isoDaysFromNow = (n: number) =>
    new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  maybe('có hạn nhưng CHƯA có file: là "thiếu giấy tờ", KHÔNG phải "đã hết hạn"', async () => {
    const kinds = await documentCounts({
      expiresAt: isoDaysFromNow(-30),
      hasActiveVersion: false,
    });
    expect(kinds).not.toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
    expect(kinds).not.toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);
  });

  maybe('file hợp lệ, còn hạn xa: không cảnh báo gì', async () => {
    const kinds = await documentCounts({
      expiresAt: isoDaysFromNow(200),
      hasActiveVersion: true,
      warningDays: 30,
    });
    expect(kinds).not.toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
    expect(kinds).not.toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);
  });

  maybe('file hợp lệ, sắp hết hạn theo ngưỡng gian hàng cấu hình', async () => {
    const kinds = await documentCounts({
      expiresAt: isoDaysFromNow(10),
      hasActiveVersion: true,
      warningDays: 30,
    });
    expect(kinds).toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);
    expect(kinds).not.toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  });

  maybe('chưa cấu hình ngưỡng: KHÔNG tự suy ra "sắp hết hạn"', async () => {
    const kinds = await documentCounts({
      expiresAt: isoDaysFromNow(10),
      hasActiveVersion: true,
      warningDays: null,
    });
    expect(kinds).not.toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);
  });

  maybe('file hợp lệ, đã quá hạn: đếm là hết hạn', async () => {
    const kinds = await documentCounts({
      expiresAt: isoDaysFromNow(-5),
      hasActiveVersion: true,
      warningDays: 30,
    });
    expect(kinds).toContain(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  });
});

// ── Hàng đợi "Thiếu KM trả" ─────────────────────────────────────────────────

describe('Hàng đợi Thiếu KM trả', () => {
  maybe('liệt kê việc còn tồn kèm xe/đơn/giờ xác nhận, cũ nhất trước', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 40_000);
    const first = await makeMissingReturnKm(vehicle.id, 1);
    const second = await makeMissingReturnKm(vehicle.id, 20);

    const queue = await handovers.missingOdometerQueue(tenantId, {});
    const codes = queue.data.map((row) => row.bookingCode);
    expect(codes).toContain(first.code);
    expect(codes).toContain(second.code);

    const item = queue.data.find((row) => row.bookingCode === first.code);
    expect(item).toMatchObject({ vehicleId: vehicle.id, vehicleName: 'Toyota Vios 2024' });
    expect(item?.confirmedAt).toBeTruthy();
    expect(item?.pickupOdometerKm).toBe(first.pickupKm);
    expect(item?.rowVersion).toBeGreaterThan(0);

    // Việc tồn đọng lâu nhất lên đầu.
    const confirmedTimes = queue.data.map((row) => new Date(row.confirmedAt).getTime());
    expect([...confirmedTimes].sort((a, b) => a - b)).toEqual(confirmedTimes);
  });

  maybe('xử lý xong thì việc rời hàng đợi, KM xe và cảnh báo cập nhật theo', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 60_000);
    const booking = await makeMissingReturnKm(vehicle.id, 40);

    expect(await alertKinds(vehicle.id)).toContain(VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER);
    const before = await handovers.missingOdometerQueue(tenantId, {});
    const item = before.data.find((row) => row.bookingId === booking.id);
    expect(item).toBeTruthy();

    await handovers.resolveOdometer(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      {
        odometerKm: 60_900,
        reasonCode: 'handover_error',
        reason: 'Đọc bổ sung từ ảnh đồng hồ',
        expectedRowVersion: item!.rowVersion,
      },
      { canDecrease: false },
      FULL_HANDOVER_SCOPE,
    );

    const after = await handovers.missingOdometerQueue(tenantId, {});
    expect(after.data.some((row) => row.bookingId === booking.id)).toBe(false);

    const row = await alerts.forVehicle(tenantId, vehicle.id, OPERATIONS_SCOPE);
    expect(row.alerts.map((a) => a.kind)).not.toContain(
      VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER,
    );
    expect(row.currentOdometerKm).toBe(60_900);
  });

  maybe('đếm ở dải nhóm việc khớp số dòng thật của hàng đợi', async () => {
    const summary = await maintenance.boardSummary(tenantId, { canViewHandovers: true });
    const queue = await handovers.missingOdometerQueue(tenantId, { limit: 100 });
    expect(summary.missingReturnKm).toBe(queue.meta.total);
  });

  maybe('tìm kiếm lọc theo mã đơn; phân trang trả đúng meta', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 70_000);
    const booking = await makeMissingReturnKm(vehicle.id, 60);

    const found = await handovers.missingOdometerQueue(tenantId, { q: booking.code });
    expect(found.data).toHaveLength(1);
    expect(found.data[0]?.bookingCode).toBe(booking.code);

    const paged = await handovers.missingOdometerQueue(tenantId, { limit: 1, page: 1 });
    expect(paged.data).toHaveLength(1);
    expect(paged.meta).toMatchObject({ page: 1, limit: 1 });
    expect(paged.meta.total).toBeGreaterThan(0);
  });

  maybe('hàng đợi của gian hàng khác rỗng — không rò việc xuyên tenant', async () => {
    const queue = await handovers.missingOdometerQueue(otherTenantId, {});
    expect(queue.data).toHaveLength(0);
    expect(queue.meta.total).toBe(0);
  });

  maybe('xe bị xoá mềm: việc rời CẢ hàng đợi lẫn số đếm, hai bên vẫn khớp', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 90_000);
    const booking = await makeMissingReturnKm(vehicle.id, 120);

    const before = await handovers.missingOdometerQueue(tenantId, { limit: 100 });
    const beforeSummary = await maintenance.boardSummary(tenantId, { canViewHandovers: true });
    expect(before.data.some((row) => row.bookingId === booking.id)).toBe(true);
    expect(beforeSummary.missingReturnKm).toBe(before.meta.total);

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { deletedAt: new Date() },
    });

    const after = await handovers.missingOdometerQueue(tenantId, { limit: 100 });
    const afterSummary = await maintenance.boardSummary(tenantId, { canViewHandovers: true });
    expect(after.data.some((row) => row.bookingId === booking.id)).toBe(false);
    expect(afterSummary.missingReturnKm).toBe(after.meta.total);
    expect(after.meta.total).toBe(before.meta.total - 1);
  });

  maybe('đơn bị xoá mềm: cùng luật, hàng đợi và số đếm cùng giảm', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 95_000);
    const booking = await makeMissingReturnKm(vehicle.id, 140);

    const before = await handovers.missingOdometerQueue(tenantId, { limit: 100 });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { deletedAt: new Date() },
    });

    const after = await handovers.missingOdometerQueue(tenantId, { limit: 100 });
    const afterSummary = await maintenance.boardSummary(tenantId, { canViewHandovers: true });
    expect(after.data.some((row) => row.bookingId === booking.id)).toBe(false);
    expect(after.meta.total).toBe(before.meta.total - 1);
    expect(afterSummary.missingReturnKm).toBe(after.meta.total);
  });

  maybe('thiếu handovers.view: số đếm là 0 và KHÔNG chạy truy vấn bàn giao', async () => {
    const permitted = await maintenance.boardSummary(tenantId, { canViewHandovers: true });
    expect(permitted.missingReturnKm).toBeGreaterThan(0);

    // Vai trò chỉ có bảo dưỡng: các nhóm việc bảo dưỡng vẫn đúng, riêng số bàn giao là 0.
    const restricted = await maintenance.boardSummary(tenantId, { canViewHandovers: false });
    expect(restricted.missingReturnKm).toBe(0);
    expect(restricted.total).toBe(permitted.total);
    expect(restricted.overdue).toBe(permitted.overdue);
  });
});

// ── Riêng tư ────────────────────────────────────────────────────────────────

describe('Cảnh báo không rò dữ liệu nhạy cảm', () => {
  maybe('không tiêu đề/mô tả/URL nào mang định danh riêng tư hay số tiền', async () => {
    const vehicle = await createVehicle({ plateNumber: null });
    await makeMissingReturnKm(vehicle.id, 80);
    const row = await alerts.forVehicle(tenantId, vehicle.id, FINANCE_SCOPE);
    expect(row.alerts.length).toBeGreaterThan(0);

    for (const alert of row.alerts) {
      // URL luôn là đường dẫn nội bộ, không bao giờ là tài nguyên riêng tư/đã ký.
      if (alert.href) {
        expect(alert.href.startsWith('/manage/')).toBe(true);
        expect(alert.href).not.toMatch(/r2|signed|token|download/i);
      }
      // Không tên file, không khoá object, không chuỗi tiền dài.
      const text = `${alert.title} ${alert.detail ?? ''}`;
      expect(text).not.toMatch(/\.jpg|\.png|\.pdf|tenants\//i);
      expect(text).not.toMatch(/\d{7,}\s*(đ|VND)/i);
      // Mọi việc đều có mức nghiêm trọng bằng CHỮ, không chỉ dựa vào màu.
      expect(Object.values(VEHICLE_ALERT_SEVERITY)).toContain(alert.severity);
      expect(VEHICLE_ALERT_PRIORITY[alert.kind as VehicleAlertKind]).toBeGreaterThan(0);
    }
  });
});
