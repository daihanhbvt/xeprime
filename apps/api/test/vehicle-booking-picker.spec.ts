import { BadRequestException } from '@nestjs/common';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  OCCUPANCY_SOURCE_TYPE,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleBookingPickerService } from '../src/modules/vehicles/vehicle-booking-picker.service';
import type { VehicleBookingPickerQueryDto } from '../src/modules/vehicles/dto/vehicle-booking-picker.dto';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Bước "Chọn xe" của hộp Tạo đơn thuê (`GET /vehicles/booking-picker`) trên PostgreSQL THẬT.
 *
 * Điều được khoá: xe TRỐNG trong khung giờ lên trước, xe bận xuống sau với `busy = true`; phân
 * trang cắt qua ranh giới hai nhóm không lặp/sót xe; khoảng chuẩn bị (buffer) cũng tính là bận;
 * lịch của gian hàng khác không làm xe mình bận; lọc loại xe; khung giờ ngược bị từ chối.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const picker = new VehicleBookingPickerService(asService, new OccupancyService(asService));

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
/** Tên đặt để thứ tự theo tên là A → E. B và D bận trong khung giờ thử. */
const ids: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'moto' | 'buffer', string> = {
  a: newId(),
  b: newId(),
  c: newId(),
  d: newId(),
  e: newId(),
  moto: newId(),
  buffer: newId(),
};

const HOUR = 3600_000;
/** Khung giờ thử: từ +48h tới +72h. */
const BASE = Date.now() + 48 * HOUR;
const at = (h: number) => new Date(BASE + h * HOUR);

const query = (over: Partial<VehicleBookingPickerQueryDto> = {}): VehicleBookingPickerQueryDto => ({
  pickupAt: at(0),
  returnAt: at(24),
  vehicleType: VEHICLE_TYPE.CAR,
  ...over,
});

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
      displayName: 'Chủ bộ chọn xe',
      email: `picker-${ownerId}@xeprime.test`,
    },
  });
  for (const id of [tenantId, otherTenantId]) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: 'Shop bộ chọn xe',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
  }

  const car = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    tenantId,
    code: `PK-${name[0]}${id.slice(-4)}`,
    name,
    vehicleType: VEHICLE_TYPE.CAR,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    ...extra,
  });
  await prisma.vehicle.createMany({
    data: [
      car(ids.a, 'A Xe trống', { deliveryEnabled: true, noCollateral: true }),
      car(ids.b, 'B Xe bận giữa khung'),
      car(ids.c, 'C Xe bận ngoài khung'),
      car(ids.d, 'D Xe bận chồng mép'),
      car(ids.e, 'E Xe gian khác bận'),
      car(ids.buffer, 'F Xe vướng thời gian chuẩn bị'),
      { ...car(ids.moto, 'G Xe máy bận'), vehicleType: VEHICLE_TYPE.MOTORBIKE },
    ],
  });

  const occ = (
    vehicleId: string,
    startH: number,
    endH: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id: newId(),
    tenantId,
    vehicleId,
    sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
    sourceId: newId(),
    startAt: at(startH),
    endAt: at(endH),
    ...extra,
  });
  await prisma.vehicleOccupancy.createMany({
    data: [
      occ(ids.b, 6, 12),
      // Hết trước khung giờ — không bận.
      occ(ids.c, -30, -6),
      // Chồng mép đầu khung giờ.
      occ(ids.d, -10, 1),
      // Kết thúc 1 giờ trước khung giờ nhưng còn 2 giờ chuẩn bị ⇒ `period` chồng vào khung.
      occ(ids.buffer, -5, -1, { bufferMinutes: 120 }),
      occ(ids.moto, 0, 24),
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

describe('GET /vehicles/booking-picker', () => {
  maybe('xe trống lên trước (theo tên), xe bận xuống sau kèm busy', async () => {
    const page = await picker.list(tenantId, query(), null);
    expect(page.data.map((v) => [v.id, v.busy])).toEqual([
      [ids.a, false],
      [ids.c, false],
      [ids.e, false],
      [ids.b, true],
      [ids.d, true],
      [ids.buffer, true],
    ]);
    expect(page.meta).toMatchObject({ total: 6, hasNext: false });
  });

  maybe('phân trang cắt qua ranh giới trống/bận không lặp, không sót', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await picker.list(tenantId, query({ page, limit: 2 }), null);
      seen.push(...res.data.map((v) => v.id));
      expect(res.meta.hasNext).toBe(page < 3);
    }
    expect(seen).toEqual([ids.a, ids.c, ids.e, ids.b, ids.d, ids.buffer]);
  });

  maybe('dữ liệu cho thẻ: giao tận nơi, miễn thế chấp, chưa có đánh giá', async () => {
    const page = await picker.list(tenantId, query({ q: 'A Xe trống' }), null);
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      id: ids.a,
      deliveryEnabled: true,
      noCollateral: true,
      instantBookServiceTypes: [],
      ratingAvg: null,
      ratingCount: 0,
      busy: false,
    });
  });

  maybe('lọc loại xe: xe máy chỉ thấy xe máy', async () => {
    const page = await picker.list(tenantId, query({ vehicleType: VEHICLE_TYPE.MOTORBIKE }), null);
    expect(page.data.map((v) => [v.id, v.busy])).toEqual([[ids.moto, true]]);
  });

  maybe('phạm vi gian hàng: gian khác không thấy xe của mình', async () => {
    const page = await picker.list(otherTenantId, query(), null);
    expect(page.data).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  maybe('khung giờ ngược hoặc rỗng: 400', async () => {
    await expect(
      picker.list(tenantId, query({ pickupAt: at(24), returnAt: at(0) }), null),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      picker.list(tenantId, query({ pickupAt: at(0), returnAt: at(0) }), null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
