import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  FUEL_LEVEL,
  FUEL_TYPE,
  HANDOVER_PHOTO_SLOT,
  HANDOVER_STATUS,
  HANDOVER_SUSPICIOUS_KM_PER_DAY_SETTING,
  HANDOVER_TYPE,
  MAINTENANCE_STATUS,
  MEMBERSHIP_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  ODOMETER_SOURCE,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  fuelLevelDropQuarters,
  handoverEnergyKind,
  handoverOdometerSuspicion,
} from '@xeprime/types';
import { ValidationPipe } from '@nestjs/common';
import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../src/common/decorators';
import { ConfirmHandoverDto } from '../src/modules/bookings/handovers/dto/handover.dto';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { BookingHandoversController } from '../src/modules/bookings/handovers/booking-handovers.controller';
import { HandoversService } from '../src/modules/bookings/handovers/handovers.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Wave 7 — Bàn giao xe & đồng bộ KM, chạy trên PostgreSQL THẬT (R2 giả lập trong bộ nhớ).
 *
 * Điều được khoá: bản nháp KHÔNG có hệ quả nghiệp vụ; xác nhận là MỘT transaction (KM + trạng
 * thái đơn + lịch + cảnh báo bảo dưỡng); KM trả không được nhỏ hơn KM giao; thiếu KM trả sinh
 * task mà KHÔNG làm hỏng số KM; gửi lại/bấm trùng không nhân bản bất cứ thứ gì; hai người
 * không cùng xác nhận được; ảnh bằng chứng không rò cho vai trò thiếu quyền; và các bất biến
 * do DB giữ thật sự từ chối dữ liệu sai.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

/** R2 giả: nhớ object đã presign để HEAD + magic bytes trả lời đúng như bucket thật. */
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
    // JPEG magic bytes — `completeFor` đối chiếu nội dung thật với MIME đã khai.
    return objects.has(key) ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]) : null;
  },
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/signed-get', expiresIn: 120 };
  },
};

const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const notifications = new NotificationService(asService);
const vehicles = new VehiclesService(
  asService,
  audit,
  new ListingsService(asService),
  new BillingService(asService, audit),
  new CatalogService(asService, audit),
  new PricingService(asService, audit),
);
const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const odometer = new OdometerService(asService, audit);
const maintenance = new MaintenanceService(asService, occupancy, odometer, files, audit);
const bookings = new BookingsService(asService, occupancy, audit, notifications);
const handovers = new HandoversService(
  asService,
  bookings,
  odometer,
  maintenance,
  files,
  audit,
);

/** Chủ gian hàng (mở được ảnh) vs nhân viên vận hành (làm bàn giao, không mở kho ảnh). */
const FULL_SCOPE = { canViewFiles: true };
const STAFF_SCOPE = { canViewFiles: false };

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;

const BASE = new Date('2026-10-05T02:00:00.000Z');
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
    data: { id: ownerId, displayName: 'Trần Văn C', email: `own-${ownerId}@xeprime.test` },
  });
  for (const [id, name] of [
    [tenantId, 'Shop Bàn Giao'],
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

let vehicleSeq = 0;

async function createVehicle(fuelType: string = FUEL_TYPE.GASOLINE) {
  vehicleSeq += 1;
  return vehicles.create(tenantId, ownerId, {
    code: `HV-${Date.now().toString(36)}-${vehicleSeq}`,
    name: 'Toyota Vios 2024',
    vehicleType: VEHICLE_TYPE.CAR,
    plateNumber: '51A-123.45',
    fuelType,
  });
}

/** Đơn đã xác nhận, sẵn sàng giao xe. */
async function createBooking(vehicleId: string, dayOffset = 0, rentalDays = 5) {
  const booking = await bookings.create(tenantId, ownerId, {
    vehicleId,
    customerName: 'Nguyễn Văn B',
    pickupAt: days(dayOffset).toISOString(),
    returnAt: days(dayOffset + rentalDays).toISOString(),
    baseAmount: '2000000',
  });
  await bookings.transition(tenantId, booking.id, ownerId, {
    status: BOOKING_STATUS.CONFIRMED,
  });
  return booking;
}

/** Đặt KM ban đầu của xe qua đúng đường nghiệp vụ (chỉnh tay có lý do). */
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

/** Tải một ảnh vào đúng góc chụp, đi trọn flow presign → PUT (giả) → xác minh → gắn. */
async function uploadPhoto(bookingId: string, type: string, slot: string) {
  const ticket = await handovers.presignPhoto(tenantId, bookingId, type as never, ownerId, {
    fileName: 'photo.jpg',
    contentType: 'image/jpeg',
    fileSize: 2048,
    slot,
  });
  await handovers.attachPhoto(
    tenantId,
    bookingId,
    type as never,
    ownerId,
    ticket.fileId,
    slot as never,
    FULL_SCOPE,
  );
  return ticket.fileId;
}

/** Ảnh tối thiểu để xác nhận (trước + sau). */
async function uploadRequiredPhotos(bookingId: string, type: string) {
  await uploadPhoto(bookingId, type, HANDOVER_PHOTO_SLOT.FRONT);
  await uploadPhoto(bookingId, type, HANDOVER_PHOTO_SLOT.REAR);
}

/** Giao xe hoàn chỉnh: nháp → ảnh → xác nhận. Trả về ngữ cảnh sau khi xác nhận. */
async function completePickup(bookingId: string, odometerKm: number) {
  const draft = await handovers.saveDraft(
    tenantId,
    bookingId,
    HANDOVER_TYPE.PICKUP,
    ownerId,
    { odometerKm, fuelLevel: FUEL_LEVEL.FULL },
    FULL_SCOPE,
  );
  await uploadRequiredPhotos(bookingId, HANDOVER_TYPE.PICKUP);
  const latest = await handovers.context(tenantId, bookingId, FULL_SCOPE);
  return handovers.confirm(
    tenantId,
    bookingId,
    HANDOVER_TYPE.PICKUP,
    ownerId,
    { expectedRowVersion: latest.pickup?.rowVersion ?? draft.rowVersion },
    FULL_SCOPE,
  );
}

// ── Hàm thuần (không cần DB) ────────────────────────────────────────────────

describe('Luật đối soát bàn giao (hàm thuần)', () => {
  it('loại năng lượng suy từ nhiên liệu xe — chỉ thuần điện mới ghi % pin', () => {
    expect(handoverEnergyKind(FUEL_TYPE.ELECTRIC)).toBe('battery');
    expect(handoverEnergyKind(FUEL_TYPE.HYBRID)).toBe('fuel');
    expect(handoverEnergyKind(FUEL_TYPE.GASOLINE)).toBe('fuel');
    expect(handoverEnergyKind(null)).toBe('fuel');
  });

  it('hao hụt nhiên liệu tính bằng nấc; thiếu một đầu thì KHÔNG suy diễn', () => {
    expect(fuelLevelDropQuarters(FUEL_LEVEL.FULL, FUEL_LEVEL.THREE_QUARTER)).toBe(1);
    expect(fuelLevelDropQuarters(FUEL_LEVEL.FULL, FUEL_LEVEL.EMPTY)).toBe(4);
    expect(fuelLevelDropQuarters(FUEL_LEVEL.HALF, FUEL_LEVEL.FULL)).toBe(-2);
    expect(fuelLevelDropQuarters(null, FUEL_LEVEL.FULL)).toBeNull();
  });

  it('chưa cấu hình ngưỡng thì KHÔNG kết luận gì — không có ngưỡng ngầm', () => {
    expect(
      handoverOdometerSuspicion({ deltaKm: 5, rentalDays: 5, thresholdKmPerDay: null }),
    ).toBeNull();
    const flagged = handoverOdometerSuspicion({
      deltaKm: 5,
      rentalDays: 5,
      thresholdKmPerDay: 20,
    });
    expect(flagged).toMatchObject({ suspicious: true, expectedMinKm: 100 });
    expect(
      handoverOdometerSuspicion({ deltaKm: 660, rentalDays: 5, thresholdKmPerDay: 20 })?.suspicious,
    ).toBe(false);
  });
});

// ── Bản nháp ────────────────────────────────────────────────────────────────

describe('Bản nháp bàn giao', () => {
  maybe('lưu rồi mở lại giữ nguyên dữ liệu và KHÔNG đụng KM của xe', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 45_230);
    const booking = await createBooking(vehicle.id);

    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 45_230, fuelLevel: FUEL_LEVEL.FULL, conditionNote: 'Xe sạch sẽ' },
      FULL_SCOPE,
    );
    expect(draft.status).toBe(HANDOVER_STATUS.DRAFT);

    // Mở lại (đúng nghĩa "resume"): dữ liệu còn nguyên.
    const resumed = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(resumed.pickup).toMatchObject({
      odometerKm: 45_230,
      fuelLevel: FUEL_LEVEL.FULL,
      conditionNote: 'Xe sạch sẽ',
      status: HANDOVER_STATUS.DRAFT,
    });

    // Bản nháp KHÔNG có hiệu lực: KM xe và trạng thái đơn giữ nguyên.
    const profile = await maintenance.getProfile(tenantId, vehicle.id);
    expect(profile.currentOdometerKm).toBe(45_230);
    expect(profile.currentOdometerSource).toBe(ODOMETER_SOURCE.MANUAL_CORRECTION);
    expect(resumed.bookingStatus).toBe(BOOKING_STATUS.CONFIRMED);
  });

  maybe('sửa bản nháp phải nộp rowVersion đang thấy — lệch là 409, không ghi đè', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 10_000 },
      FULL_SCOPE,
    );

    await expect(
      handovers.saveDraft(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { odometerKm: 99_999, expectedRowVersion: draft.rowVersion + 5 },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });

    const after = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(after.pickup?.odometerKm).toBe(10_000);
  });

  maybe('xe điện từ chối mức nhiên liệu; xe xăng từ chối % pin', async () => {
    const ev = await createVehicle(FUEL_TYPE.ELECTRIC);
    const evBooking = await createBooking(ev.id);
    await expect(
      handovers.saveDraft(
        tenantId,
        evBooking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { fuelLevel: FUEL_LEVEL.FULL },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const saved = await handovers.saveDraft(
      tenantId,
      evBooking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { batteryPercent: 82 },
      FULL_SCOPE,
    );
    expect(saved.batteryPercent).toBe(82);
    expect(saved.energyKind).toBe('battery');
  });

  maybe('đơn không ở trạng thái mở được bước này → HANDOVER_NOT_ELIGIBLE', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    // Chưa giao xe thì không mở được biên bản NHẬN TRẢ.
    await expect(
      handovers.saveDraft(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { odometerKm: 1 },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.HANDOVER_NOT_ELIGIBLE } });
  });
});

// ── Xác nhận giao xe ────────────────────────────────────────────────────────

describe('Xác nhận giao xe', () => {
  maybe('thiếu ảnh bắt buộc thì không xác nhận được, và nói rõ thiếu góc nào', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 45_230 },
      FULL_SCOPE,
    );
    await uploadPhoto(booking.id, HANDOVER_TYPE.PICKUP, HANDOVER_PHOTO_SLOT.FRONT);

    await expect(
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { expectedRowVersion: draft.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VALIDATION_FAILED,
        details: { missingSlots: [HANDOVER_PHOTO_SLOT.REAR] },
      },
    });
  });

  maybe('xác nhận: đơn sang Đang thuê, KM ghi nguồn booking_pickup, biên bản chỉ đọc', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 45_000);
    const booking = await createBooking(vehicle.id);

    const after = await completePickup(booking.id, 45_230);
    expect(after.bookingStatus).toBe(BOOKING_STATUS.ACTIVE);
    expect(after.pickup?.status).toBe(HANDOVER_STATUS.CONFIRMED);
    expect(after.pickup?.confirmedByName).toBe('Trần Văn C');
    expect(after.pickupOdometerKm).toBe(45_230);

    const profile = await maintenance.getProfile(tenantId, vehicle.id);
    expect(profile.currentOdometerKm).toBe(45_230);
    expect(profile.currentOdometerSource).toBe(ODOMETER_SOURCE.BOOKING_PICKUP);

    const history = await odometer.history(tenantId, vehicle.id, 1, 10);
    expect(history.data[0]).toMatchObject({
      odometerKm: 45_230,
      previousKm: 45_000,
      source: ODOMETER_SOURCE.BOOKING_PICKUP,
      sourceRefId: booking.id,
    });

    // Đã xác nhận là chỉ đọc — sửa tiếp phải đi đường điều chỉnh có lý do.
    await expect(
      handovers.saveDraft(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { odometerKm: 1, expectedRowVersion: after.pickup?.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION } });
  });

  maybe('bấm hai lần / gửi lại: không sinh thêm biên bản, KM hay bản ghi lịch sử nào', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 20_000);
    const booking = await createBooking(vehicle.id);
    const first = await completePickup(booking.id, 20_500);

    // Gửi lại y hệt (retry mạng) — trả nguyên trạng, không chạy lại hệ quả.
    const again = await handovers.confirm(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { expectedRowVersion: first.pickup?.rowVersion ?? 1 },
      FULL_SCOPE,
    );
    expect(again.pickup?.id).toBe(first.pickup?.id);

    const readings = await prisma.vehicleOdometerReading.count({
      where: { vehicleId: vehicle.id, source: ODOMETER_SOURCE.BOOKING_PICKUP },
    });
    expect(readings).toBe(1);
    const rows = await prisma.vehicleHandover.count({
      where: { bookingId: booking.id, type: HANDOVER_TYPE.PICKUP },
    });
    expect(rows).toBe(1);
  });

  maybe('hai người cùng xác nhận: một người thắng, người kia KHÔNG tạo hệ quả thứ hai', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 30_000);
    const booking = await createBooking(vehicle.id);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 30_100 },
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.PICKUP);
    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    const version = ctx.pickup?.rowVersion ?? 1;

    // Hai request cùng nộp CÙNG một rowVersion — đúng tình huống double-click ở quầy.
    const results = await Promise.allSettled([
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { expectedRowVersion: version },
        FULL_SCOPE,
      ),
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { expectedRowVersion: version },
        FULL_SCOPE,
      ),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

    const readings = await prisma.vehicleOdometerReading.count({
      where: { vehicleId: vehicle.id, source: ODOMETER_SOURCE.BOOKING_PICKUP },
    });
    expect(readings).toBe(1);
    const booked = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(booked.status).toBe(BOOKING_STATUS.ACTIVE);
  });

  maybe('rowVersion cũ (người khác vừa sửa nháp) → 409, không xác nhận nhầm bản cũ', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 1_000 },
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.PICKUP);
    // Người B sửa số sau khi người A đã mở form.
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 1_500, expectedRowVersion: draft.rowVersion },
      FULL_SCOPE,
    );

    await expect(
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { expectedRowVersion: draft.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
  });
});

// ── Xác nhận trả xe ─────────────────────────────────────────────────────────

describe('Xác nhận trả xe', () => {
  maybe('KM trả nhỏ hơn KM giao bị từ chối, kèm CHÍNH mốc phải vượt', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 45_000);
    const booking = await createBooking(vehicle.id);
    await completePickup(booking.id, 45_230);

    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      { odometerKm: 45_100 },
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.RETURN);
    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);

    await expect(
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { expectedRowVersion: ctx.return?.rowVersion ?? draft.rowVersion },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.HANDOVER_ODOMETER_BELOW_PICKUP,
        details: { pickupKm: 45_230 },
      },
    });

    // Đơn vẫn đang thuê, KM vẫn là số lúc giao — không hệ quả nào lọt ra.
    const booked = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(booked.status).toBe(BOOKING_STATUS.ACTIVE);
    const profile = await maintenance.getProfile(tenantId, vehicle.id);
    expect(profile.currentOdometerKm).toBe(45_230);
  });

  maybe(
    'trả xe xác nhận: đơn hoàn thành, KM xe cập nhật, lịch được nhả, mốc bảo dưỡng tính lại',
    async () => {
      const vehicle = await createVehicle();
      await setKm(vehicle.id, 45_000);
      // Cấu hình chu kỳ để mốc bảo dưỡng có nghĩa (45.000 + 5.000 = 50.000).
      const profile0 = await maintenance.getProfile(tenantId, vehicle.id);
      await maintenance.saveProfile(tenantId, vehicle.id, ownerId, {
        oilChangeIntervalKm: 5_000,
        lastServiceKm: 45_000,
        expectedRowVersion: profile0.rowVersion,
      });
      const booking = await createBooking(vehicle.id);
      await completePickup(booking.id, 45_230);

      await handovers.saveDraft(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { odometerKm: 45_890, fuelLevel: FUEL_LEVEL.THREE_QUARTER, damageNote: 'Xước nhẹ cản sau' },
        FULL_SCOPE,
      );
      await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.RETURN);
      const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);
      const after = await handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { expectedRowVersion: ctx.return?.rowVersion ?? 1 },
        FULL_SCOPE,
      );

      expect(after.bookingStatus).toBe(BOOKING_STATUS.COMPLETED);
      expect(after.return?.status).toBe(HANDOVER_STATUS.CONFIRMED);
      expect(after.return?.odometerMissing).toBe(false);

      const profile = await maintenance.getProfile(tenantId, vehicle.id);
      expect(profile.currentOdometerKm).toBe(45_890);
      expect(profile.currentOdometerSource).toBe(ODOMETER_SOURCE.BOOKING_RETURN);
      expect(profile.remainingKm).toBe(4_110); // 50.000 − 45.890, đúng số ở màn thiết kế

      // Xe trống ngay khi trả xong — lịch không giữ tới hết khung giờ đã đặt (ADR 0006).
      const occupancies = await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING, sourceId: booking.id },
      });
      expect(occupancies).toBe(0);
    },
  );

  maybe('trả xe vượt mốc bảo dưỡng → mở đúng MỘT việc cần làm, trả nhiều lần không nhân bản', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 49_000);
    const profile0 = await maintenance.getProfile(tenantId, vehicle.id);
    await maintenance.saveProfile(tenantId, vehicle.id, ownerId, {
      oilChangeIntervalKm: 5_000,
      lastServiceKm: 45_000, // mốc tiếp theo 50.000
      expectedRowVersion: profile0.rowVersion,
    });

    for (const [index, km] of [50_100, 50_500].entries()) {
      const booking = await createBooking(vehicle.id, 10 + index * 6, 5);
      await completePickup(booking.id, km - 100);
      await handovers.saveDraft(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { odometerKm: km },
        FULL_SCOPE,
      );
      await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.RETURN);
      const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);
      await handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { expectedRowVersion: ctx.return?.rowVersion ?? 1 },
        FULL_SCOPE,
      );
    }

    const open = await prisma.vehicleMaintenanceRecord.findMany({
      where: { vehicleId: vehicle.id, status: MAINTENANCE_STATUS.SCHEDULED },
    });
    expect(open).toHaveLength(1);
    // Việc-cần-xếp-lịch, CHƯA phải lịch: không mốc thời gian → không khoá xe của khách.
    expect(open[0]?.plannedStartAt).toBeNull();
    const held = await prisma.vehicleOccupancy.count({
      where: { sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE, sourceId: open[0]?.id },
    });
    expect(held).toBe(0);
  });

  maybe('thiếu KM trả: biên bản vẫn đóng, sinh task, KM có thẩm quyền KHÔNG bị đụng', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 60_000);
    const booking = await createBooking(vehicle.id);
    await completePickup(booking.id, 60_200);

    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      { conditionNote: 'Khách trả gấp, chưa kịp đọc Odo' },
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.RETURN);
    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);

    // Không cắm cờ chấp nhận thì bị chặn — thiếu KM không bao giờ là mặc định im lặng.
    await expect(
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { expectedRowVersion: ctx.return?.rowVersion ?? 1 },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const after = await handovers.confirm(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      { expectedRowVersion: ctx.return?.rowVersion ?? 1, allowMissingOdometer: true },
      FULL_SCOPE,
    );
    expect(after.bookingStatus).toBe(BOOKING_STATUS.COMPLETED);
    expect(after.return).toMatchObject({
      status: HANDOVER_STATUS.CONFIRMED,
      odometerKm: null,
      odometerMissing: true,
    });

    // KM xe vẫn là số lúc giao — KHÔNG có số nào bịa ra thay khách.
    const profile = await maintenance.getProfile(tenantId, vehicle.id);
    expect(profile.currentOdometerKm).toBe(60_200);
    const returnReadings = await prisma.vehicleOdometerReading.count({
      where: { vehicleId: vehicle.id, source: ODOMETER_SOURCE.BOOKING_RETURN },
    });
    expect(returnReadings).toBe(0);

    // Bổ sung sau: KM chảy vào hồ sơ xe, cờ thiếu được gỡ.
    const resolved = await handovers.resolveOdometer(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      {
        odometerKm: 60_800,
        reasonCode: 'handover_error',
        reason: 'Nhân viên đọc bổ sung từ ảnh đồng hồ',
        expectedRowVersion: after.return?.rowVersion ?? 1,
      },
      { canDecrease: false },
      FULL_SCOPE,
    );
    expect(resolved.return).toMatchObject({ odometerKm: 60_800, odometerMissing: false });
    const updated = await maintenance.getProfile(tenantId, vehicle.id);
    expect(updated.currentOdometerKm).toBe(60_800);
  });

  maybe('KM bất thường: chưa cấu hình ngưỡng thì không chặn; cấu hình rồi thì cần xác nhận', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 70_000);
    const booking = await createBooking(vehicle.id);
    await completePickup(booking.id, 70_000);

    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      { odometerKm: 70_005 },
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.RETURN);

    // Gian hàng bật cảnh báo: 20 km/ngày × 5 ngày = 100 km, đi 5 km là bất thường.
    await prisma.tenantProfile.upsert({
      where: { tenantId },
      update: { settings: { [HANDOVER_SUSPICIOUS_KM_PER_DAY_SETTING]: 20 } },
      create: { tenantId, settings: { [HANDOVER_SUSPICIOUS_KM_PER_DAY_SETTING]: 20 } },
    });

    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(ctx.suspiciousKmPerDay).toBe(20);
    const version = ctx.return?.rowVersion ?? 1;

    await expect(
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { expectedRowVersion: version },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.HANDOVER_ODOMETER_SUSPICIOUS,
        details: { expectedMinKm: 100, deltaKm: 5 },
      },
    });

    const after = await handovers.confirm(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      { expectedRowVersion: version, acknowledgeSuspicious: true },
      FULL_SCOPE,
    );
    expect(after.return?.suspiciousAcknowledged).toBe(true);
    expect(after.bookingStatus).toBe(BOOKING_STATUS.COMPLETED);

    // Trả lại trạng thái "chưa cấu hình" để các test khác không bị ảnh hưởng.
    await prisma.tenantProfile.update({ where: { tenantId }, data: { settings: {} } });
    const clean = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(clean.suspiciousKmPerDay).toBeNull();
  });
});

// ── KM giao xe là bắt buộc (Wave 7.1) ───────────────────────────────────────

describe('KM lúc giao xe là bắt buộc', () => {
  maybe('giao xe thiếu KM: từ chối, và allowMissingOdometer KHÔNG mở được cửa sau', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { conditionNote: 'Chưa kịp đọc Odo' },
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.PICKUP);
    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    const version = ctx.pickup?.rowVersion ?? 1;

    for (const dto of [
      { expectedRowVersion: version },
      // Cùng cờ mà chiều trả chấp nhận — ở chiều giao thì vô hiệu.
      { expectedRowVersion: version, allowMissingOdometer: true },
    ]) {
      await expect(
        handovers.confirm(tenantId, booking.id, HANDOVER_TYPE.PICKUP, ownerId, dto, FULL_SCOPE),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.VALIDATION_FAILED,
          // FE dựa vào cờ này để biết KHÔNG có lối "đóng biên bản, bổ sung sau".
          details: { allowMissingSupported: false },
        },
      });
    }

    // Không hệ quả nào lọt ra: đơn chưa sang đang thuê, biên bản vẫn là nháp.
    const booked = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(booked.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(booked.actualPickupAt).toBeNull();
    const after = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(after.pickup?.status).toBe(HANDOVER_STATUS.DRAFT);
  });

  maybe('chiều TRẢ vẫn được đóng thiếu KM khi có xác nhận tường minh', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 80_000);
    const booking = await createBooking(vehicle.id);
    await completePickup(booking.id, 80_100);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      {},
      FULL_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.RETURN);
    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);

    // Chiều trả: server nói rõ CÓ lối đi tiếp.
    await expect(
      handovers.confirm(
        tenantId,
        booking.id,
        HANDOVER_TYPE.RETURN,
        ownerId,
        { expectedRowVersion: ctx.return?.rowVersion ?? 1 },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { details: { allowMissingSupported: true } } });

    const after = await handovers.confirm(
      tenantId,
      booking.id,
      HANDOVER_TYPE.RETURN,
      ownerId,
      { expectedRowVersion: ctx.return?.rowVersion ?? 1, allowMissingOdometer: true },
      FULL_SCOPE,
    );
    expect(after.return?.odometerMissing).toBe(true);
  });
});

// ── Thời điểm xác nhận do server sinh (Wave 7.1) ────────────────────────────

describe('Thời điểm xác nhận', () => {
  it('DTO KHÔNG còn nhận confirmedAt từ client — pipe toàn cục từ chối thẳng', async () => {
    // Cùng cấu hình pipe với `bootstrap.ts`: whitelist + forbidNonWhitelisted.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });
    const meta = { type: 'body' as const, metatype: ConfirmHandoverDto, data: '' };

    await expect(
      pipe.transform(
        { expectedRowVersion: 1, confirmedAt: '2020-01-01T00:00:00.000Z' },
        meta,
      ),
    ).rejects.toBeDefined();

    // Payload hợp lệ vẫn qua — chỉ trường lùi ngày bị chặn.
    await expect(pipe.transform({ expectedRowVersion: 1 }, meta)).resolves.toBeDefined();
  });

  maybe('mốc xác nhận do server sinh và DÙNG CHUNG cho biên bản lẫn giờ nhận thực tế', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 90_000);
    const booking = await createBooking(vehicle.id);

    const before = Date.now();
    const after = await completePickup(booking.id, 90_200);
    const now = Date.now();

    const confirmedAt = after.pickup?.confirmedAt;
    expect(confirmedAt).toBeTruthy();
    const stamp = new Date(confirmedAt!).getTime();
    // Mốc nằm trong đúng cửa sổ chạy test → server sinh, không phải giá trị client gửi lên.
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(now);

    // Một mốc duy nhất: biên bản và `actual_pickup_at` của đơn không được lệch nhau.
    const booked = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(booked.actualPickupAt?.toISOString()).toBe(confirmedAt);

    // Audit kể đúng cái giờ đó.
    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'booking.handover.pickup.confirm', targetId: after.pickup!.id },
    });
    expect((log?.afterJson as { confirmedAt?: string } | null)?.confirmedAt).toBe(confirmedAt);
  });
});

// ── Sẵn sàng xác nhận & huỷ biên bản (Wave 7.1) ─────────────────────────────

describe('Trạng thái sẵn sàng và huỷ biên bản', () => {
  maybe('đánh dấu sẵn sàng: vẫn sửa được, và người có quyền xác nhận chốt được', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 12_000);
    const booking = await createBooking(vehicle.id);
    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 12_050, markReady: true },
      FULL_SCOPE,
    );
    expect(draft.status).toBe(HANDOVER_STATUS.READY);

    // Mở lại vẫn là `ready` và vẫn sửa được (người quản lý chỉnh nốt trước khi ai đó chốt).
    const resumed = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(resumed.pickup?.status).toBe(HANDOVER_STATUS.READY);
    const edited = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 12_060, expectedRowVersion: resumed.pickup?.rowVersion },
      FULL_SCOPE,
    );
    expect(edited.odometerKm).toBe(12_060);
    expect(edited.status).toBe(HANDOVER_STATUS.READY);

    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.PICKUP);
    const ready = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    const confirmed = await handovers.confirm(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { expectedRowVersion: ready.pickup?.rowVersion ?? 1 },
      FULL_SCOPE,
    );
    expect(confirmed.pickup?.status).toBe(HANDOVER_STATUS.CONFIRMED);
  });

  maybe('huỷ nháp rồi lập lại được từ đầu khi đơn còn hợp lệ', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    const draft = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 5_000 },
      FULL_SCOPE,
    );
    const fileId = await uploadPhoto(booking.id, HANDOVER_TYPE.PICKUP, HANDOVER_PHOTO_SLOT.FRONT);

    const afterCancel = await handovers.cancel(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { expectedRowVersion: draft.rowVersion + 1 }, // +1 vì lần gắn ảnh đã có, lấy bản mới nhất
      FULL_SCOPE,
    ).catch(async () => {
      const latest = await handovers.context(tenantId, booking.id, FULL_SCOPE);
      return handovers.cancel(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { expectedRowVersion: latest.pickup?.rowVersion ?? 1 },
        FULL_SCOPE,
      );
    });
    expect(afterCancel.pickup).toBeNull();
    expect(afterCancel.canStartPickup).toBe(true);

    // Ảnh của bản bị bỏ không mở lại được nữa.
    await expect(
      handovers.downloadPhoto(tenantId, booking.id, HANDOVER_TYPE.PICKUP, fileId),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });

    // Lập lại từ đầu: partial unique không chặn vì bản cũ đã `canceled`.
    const fresh = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 5_100 },
      FULL_SCOPE,
    );
    expect(fresh.status).toBe(HANDOVER_STATUS.DRAFT);
    expect(fresh.odometerKm).toBe(5_100);
    expect(fresh.id).not.toBe(draft.id);
  });

  maybe('biên bản đã xác nhận KHÔNG huỷ được — nó là bằng chứng, không phải nháp', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 15_000);
    const booking = await createBooking(vehicle.id);
    const after = await completePickup(booking.id, 15_100);

    await expect(
      handovers.cancel(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { expectedRowVersion: after.pickup?.rowVersion ?? 1 },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION } });
  });
});

// ── Bằng chứng riêng tư ─────────────────────────────────────────────────────

describe('Ảnh hiện trạng riêng tư', () => {
  maybe('thiếu handovers.view_files: thấy góc đã chụp nhưng KHÔNG có định danh file', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 100 },
      FULL_SCOPE,
    );
    await uploadPhoto(booking.id, HANDOVER_TYPE.PICKUP, HANDOVER_PHOTO_SLOT.FRONT);

    const staffView = await handovers.context(tenantId, booking.id, STAFF_SCOPE);
    const photo = staffView.pickup?.photos[0];
    expect(photo?.slot).toBe(HANDOVER_PHOTO_SLOT.FRONT);
    expect(photo?.fileId).toBeUndefined();
    expect(photo?.name).toBeUndefined();
    expect(JSON.stringify(staffView)).not.toMatch(/photo\.jpg|objectKey|r2\.local/);

    const ownerView = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    expect(ownerView.pickup?.photos[0]?.fileId).toBeTruthy();
  });

  maybe('tải lại cùng góc là THAY ảnh; ảnh cũ bị vô hiệu hoá, không tải về được nữa', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 100 },
      FULL_SCOPE,
    );
    const firstFile = await uploadPhoto(booking.id, HANDOVER_TYPE.PICKUP, HANDOVER_PHOTO_SLOT.FRONT);
    await uploadPhoto(booking.id, HANDOVER_TYPE.PICKUP, HANDOVER_PHOTO_SLOT.FRONT);

    const ctx = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    const front = ctx.pickup?.photos.filter((p) => p.slot === HANDOVER_PHOTO_SLOT.FRONT) ?? [];
    expect(front).toHaveLength(1);
    expect(front[0]?.fileId).not.toBe(firstFile);

    await expect(
      handovers.downloadPhoto(tenantId, booking.id, HANDOVER_TYPE.PICKUP, firstFile),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('ảnh của đơn khác không mở được qua đơn này — 404, không phân biệt lý do', async () => {
    const vehicle = await createVehicle();
    const bookingA = await createBooking(vehicle.id, 40, 3);
    const bookingB = await createBooking(vehicle.id, 50, 3);
    for (const booking of [bookingA, bookingB]) {
      await handovers.saveDraft(
        tenantId,
        booking.id,
        HANDOVER_TYPE.PICKUP,
        ownerId,
        { odometerKm: 100 },
        FULL_SCOPE,
      );
    }
    const fileA = await uploadPhoto(bookingA.id, HANDOVER_TYPE.PICKUP, HANDOVER_PHOTO_SLOT.FRONT);

    await expect(
      handovers.downloadPhoto(tenantId, bookingB.id, HANDOVER_TYPE.PICKUP, fileA),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });

    // Đúng đơn thì phát signed URL ngắn hạn (không lưu ở đâu cả).
    const ticket = await handovers.downloadPhoto(
      tenantId,
      bookingA.id,
      HANDOVER_TYPE.PICKUP,
      fileA,
    );
    expect(ticket.downloadUrl).toContain('signed-get');
  });

  maybe('response của MUTATION cũng che định danh file, không chỉ endpoint đọc', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 18_000);
    const booking = await createBooking(vehicle.id);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 18_100 },
      STAFF_SCOPE,
    );

    // Gắn ảnh: chính response của thao tác này từng là chỗ dễ rò nhất.
    const ticket = await handovers.presignPhoto(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { fileName: 'photo.jpg', contentType: 'image/jpeg', fileSize: 2048, slot: HANDOVER_PHOTO_SLOT.FRONT },
    );
    const attached = await handovers.attachPhoto(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      ticket.fileId,
      HANDOVER_PHOTO_SLOT.FRONT,
      STAFF_SCOPE,
    );
    expect(attached.photos[0]?.slot).toBe(HANDOVER_PHOTO_SLOT.FRONT);
    expect(attached.photos[0]?.fileId).toBeUndefined();

    const saved = await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 18_150, expectedRowVersion: attached.rowVersion },
      STAFF_SCOPE,
    );
    const removed = await handovers.removePhoto(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      HANDOVER_PHOTO_SLOT.REAR,
      STAFF_SCOPE,
    );
    await uploadRequiredPhotos(booking.id, HANDOVER_TYPE.PICKUP);
    const latest = await handovers.context(tenantId, booking.id, FULL_SCOPE);
    const confirmed = await handovers.confirm(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { expectedRowVersion: latest.pickup?.rowVersion ?? 1 },
      STAFF_SCOPE,
    );

    for (const payload of [saved, removed, confirmed]) {
      const json = JSON.stringify(payload);
      expect(json).not.toContain(ticket.fileId);
      expect(json).not.toContain('photo.jpg');
    }
  });

  maybe('tenant khác không đọc được ngữ cảnh bàn giao của đơn này', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await expect(
      handovers.context(otherTenantId, booking.id, FULL_SCOPE),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });
});

// ── Quyền (khai báo trên controller) ────────────────────────────────────────

describe('Phân quyền bàn giao', () => {
  const permissionsOf = (method: keyof BookingHandoversController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, BookingHandoversController.prototype[method]) as string[];

  it('bốn mức tách bạch — xem, lập, XÁC NHẬN, mở ảnh không mức nào bao mức nào', () => {
    expect(permissionsOf('context')).toEqual([PERMISSION.HANDOVER_VIEW]);
    expect(permissionsOf('saveDraft')).toEqual([PERMISSION.HANDOVER_MANAGE]);
    expect(permissionsOf('confirm')).toEqual([PERMISSION.HANDOVER_CONFIRM]);
    expect(permissionsOf('downloadPhoto')).toEqual([PERMISSION.HANDOVER_FILE_VIEW]);
    // Sửa KM sau xác nhận là quyền KM, không phải quyền bàn giao.
    expect(permissionsOf('resolveOdometer')).toEqual([PERMISSION.VEHICLE_ODOMETER_CORRECT]);
  });

  it('vai trò vận hành làm được bàn giao nhưng KHÔNG mở được kho ảnh bằng chứng', async () => {
    const { DEFAULT_TENANT_ROLE_PERMISSIONS, TENANT_ROLE: ROLE } = await import('@xeprime/types');
    const staff = DEFAULT_TENANT_ROLE_PERMISSIONS[ROLE.SHOP_STAFF];
    expect(staff).toContain(PERMISSION.HANDOVER_MANAGE);
    expect(staff).toContain(PERMISSION.HANDOVER_CONFIRM);
    expect(staff).not.toContain(PERMISSION.HANDOVER_FILE_VIEW);

    const viewer = DEFAULT_TENANT_ROLE_PERMISSIONS[ROLE.SHOP_VIEWER];
    expect(viewer).toContain(PERMISSION.HANDOVER_VIEW);
    expect(viewer).not.toContain(PERMISSION.HANDOVER_MANAGE);
    expect(viewer).not.toContain(PERMISSION.HANDOVER_CONFIRM);
  });
});

// ── Bất biến do DB giữ ──────────────────────────────────────────────────────

describe('Bất biến ở tầng database', () => {
  maybe('không tạo được biên bản thứ hai còn hiệu lực cho cùng một chiều', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await handovers.saveDraft(
      tenantId,
      booking.id,
      HANDOVER_TYPE.PICKUP,
      ownerId,
      { odometerKm: 1 },
      FULL_SCOPE,
    );

    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          type: HANDOVER_TYPE.PICKUP,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  maybe('biên bản không trỏ được sang xe khác với xe của đơn', async () => {
    const vehicle = await createVehicle();
    const otherVehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);

    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: otherVehicle.id,
          type: HANDOVER_TYPE.RETURN,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  maybe('không tồn tại bản ghi vừa "thiếu KM" vừa có số KM', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          type: HANDOVER_TYPE.PICKUP,
          odometerKm: 100,
          odometerMissing: true,
        },
      }),
    ).rejects.toThrow(/vh_missing_km_has_no_km/);
  });

  maybe('không tồn tại biên bản "đã xác nhận" mà không biết ai xác nhận', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          type: HANDOVER_TYPE.PICKUP,
          status: HANDOVER_STATUS.CONFIRMED,
        },
      }),
    ).rejects.toThrow(/vh_confirmed_has_actor/);
  });

  maybe('không tồn tại biên bản GIAO XE gắn cờ thiếu KM (task chỉ có ở chiều trả)', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          type: HANDOVER_TYPE.PICKUP,
          odometerMissing: true,
        },
      }),
    ).rejects.toThrow(/vh_missing_km_return_only/);
  });

  maybe('không tồn tại biên bản giao xe đã xác nhận mà thiếu KM', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          type: HANDOVER_TYPE.PICKUP,
          status: HANDOVER_STATUS.CONFIRMED,
          confirmedAt: new Date(),
          confirmedBy: ownerId,
        },
      }),
    ).rejects.toThrow(/vh_confirmed_pickup_has_km/);
  });

  maybe('biên bản không trỏ được sang lần đọc KM của xe khác', async () => {
    const vehicle = await createVehicle();
    const otherVehicle = await createVehicle();
    await setKm(vehicle.id, 25_000);
    await setKm(otherVehicle.id, 33_000);
    const booking = await createBooking(vehicle.id);
    const after = await completePickup(booking.id, 25_100);

    const foreignReading = await prisma.vehicleOdometerReading.findFirstOrThrow({
      where: { vehicleId: otherVehicle.id },
      select: { id: true },
    });

    await expect(
      prisma.vehicleHandover.update({
        where: { id: after.pickup!.id },
        data: { odometerReadingId: foreignReading.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    // Id không tồn tại cũng bị chặn — trước Wave 7.1 cột này là chuỗi tự do.
    await expect(
      prisma.vehicleHandover.update({
        where: { id: after.pickup!.id },
        data: { odometerReadingId: newId() },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    // Lần đọc đúng xe vẫn giữ nguyên liên kết.
    const kept = await prisma.vehicleHandover.findUniqueOrThrow({
      where: { id: after.pickup!.id },
      include: { odometerReading: true },
    });
    expect(kept.odometerReading?.vehicleId).toBe(vehicle.id);
    expect(kept.odometerReading?.odometerKm).toBe(25_100);
  });

  maybe('không xoá được lần đọc KM mà biên bản đang viện dẫn (lịch sử chỉ-thêm)', async () => {
    const vehicle = await createVehicle();
    await setKm(vehicle.id, 41_000);
    const booking = await createBooking(vehicle.id);
    const after = await completePickup(booking.id, 41_200);
    const readingId = (
      await prisma.vehicleHandover.findUniqueOrThrow({ where: { id: after.pickup!.id } })
    ).odometerReadingId!;

    await expect(
      prisma.vehicleOdometerReading.delete({ where: { id: readingId } }),
    ).rejects.toBeDefined();
  });

  maybe('không tồn tại bản ghi vừa khai mức xăng vừa khai % pin', async () => {
    const vehicle = await createVehicle();
    const booking = await createBooking(vehicle.id);
    await expect(
      prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          type: HANDOVER_TYPE.PICKUP,
          fuelLevel: FUEL_LEVEL.FULL,
          batteryPercent: 80,
        },
      }),
    ).rejects.toThrow(/vh_energy_exclusive/);
  });
});
