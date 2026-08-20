import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  OCCUPANCY_SOURCE_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  vnDayStart,
} from '@xeprime/types';
import type { AuthService } from '../src/modules/auth/auth.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * `GET /public/booking-requests/busy-days` — lịch bận mà hộp chọn thời gian thuê dùng để KHOÁ
 * ngày trên lịch, trên PostgreSQL THẬT.
 *
 * Bốn thứ phải đúng, vì sai cái nào cũng dẫn tới "khách chọn được rồi mới bị từ chối":
 *   1. Ranh giới ngày theo Asia/Ho_Chi_Minh, không theo UTC — lệch 7 tiếng là lệch một ô lịch.
 *   2. `fullyBusy` chỉ đúng khi phủ TRỌN 24h; bận vài giờ phải trả về `periods` để FE tô riêng.
 *   3. Buffer chuẩn bị được tính (đọc `period`, không đọc `start_at`/`end_at`) — nếu không,
 *      lịch nói rảnh còn constraint từ chối.
 *   4. Cửa sổ bị kẹp ở server, và xe không public thì không tra được lịch.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const occupancy = new OccupancyService(asService);
const customers = new CustomersService(asService, audit);
const pricing = new PricingService(asService, audit, new ListingsService(asService));
const bookings = new BookingsService(
  asService,
  occupancy,
  audit,
  notifications,
  new DriversService(asService, audit),
  customers,
);

const requests = new BookingRequestsService(
  asService,
  bookings,
  audit,
  notifications,
  {} as unknown as PhoneVerificationService,
  {} as unknown as AuthService,
  occupancy,
  pricing,
  customers,
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let draftVehicleId: string;

/** Mốc tuyệt đối của `HH:mm` giờ Việt Nam trong một ngày lịch Việt Nam. */
const vnAt = (dateKey: string, hours: number, minutes = 0) =>
  new Date(vnDayStart(dateKey).getTime() + (hours * 60 + minutes) * 60_000);

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
  vehicleId = newId();
  draftVehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Busy days owner', email: `busy-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `BUSY-${tenantId.slice(-8)}`,
      slug: `busy-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Tenant lịch bận',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: 'BUSY-1',
      name: 'Xe công khai',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: draftVehicleId,
      tenantId,
      code: 'BUSY-2',
      name: 'Xe chưa duyệt',
      vehicleType: VEHICLE_TYPE.CAR,
    },
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
  if (dbAvailable) await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
});

async function reserve(startAt: Date, endAt: Date, bufferMinutes = 0) {
  await prisma.vehicleOccupancy.create({
    data: {
      id: newId(),
      tenantId,
      vehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
      sourceId: newId(),
      startAt,
      endAt,
      bufferMinutes,
    },
  });
}

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('lịch bận công khai của một xe', () => {
  maybe('xe rảnh trả về danh sách RỖNG, không phải một dòng false mỗi ngày', async () => {
    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-01', '2026-09-30');
    expect(res.days).toEqual([]);
    expect(res).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  maybe('bận trọn nhiều ngày: ngày giữa fullyBusy, hai đầu chỉ bận một phần', async () => {
    // 10/09 08:00 → 12/09 18:00 giờ VN: ngày 11 phủ kín, ngày 10 và 12 chỉ bận một phần.
    await reserve(vnAt('2026-09-10', 8), vnAt('2026-09-12', 18));

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-01', '2026-09-30');
    expect(res.days.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);

    const [first, middle, last] = res.days;
    expect(middle).toMatchObject({ date: '2026-09-11', fullyBusy: true, periods: [] });

    expect(first!.fullyBusy).toBe(false);
    expect(first!.periods).toEqual([
      { startAt: vnAt('2026-09-10', 8).toISOString(), endAt: vnAt('2026-09-11', 0).toISOString() },
    ]);

    expect(last!.fullyBusy).toBe(false);
    expect(last!.periods).toEqual([
      { startAt: vnAt('2026-09-12', 0).toISOString(), endAt: vnAt('2026-09-12', 18).toISOString() },
    ]);
  });

  maybe('ranh giới ngày theo giờ VN, không theo UTC', async () => {
    // 00:30 → 02:00 giờ VN ngày 15/09 = 17:30 → 19:00 UTC ngày 14/09. Lấy ngày theo UTC sẽ
    // tô nhầm sang ô 14/09.
    await reserve(vnAt('2026-09-15', 0, 30), vnAt('2026-09-15', 2));

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-01', '2026-09-30');
    expect(res.days.map((d) => d.date)).toEqual(['2026-09-15']);
  });

  maybe('kết thúc ĐÚNG nửa đêm không chạm sang ngày hôm sau (nửa mở)', async () => {
    await reserve(vnAt('2026-09-20', 10), vnAt('2026-09-21', 0));

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-01', '2026-09-30');
    expect(res.days.map((d) => d.date)).toEqual(['2026-09-20']);
  });

  maybe('nhiều quãng rời trong cùng một ngày được gom và sắp tăng dần', async () => {
    await reserve(vnAt('2026-09-18', 14), vnAt('2026-09-18', 17));
    await reserve(vnAt('2026-09-18', 8), vnAt('2026-09-18', 11));

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-18', '2026-09-18');
    expect(res.days).toHaveLength(1);
    expect(res.days[0]!.fullyBusy).toBe(false);
    expect(res.days[0]!.periods.map((p) => p.startAt)).toEqual([
      vnAt('2026-09-18', 8).toISOString(),
      vnAt('2026-09-18', 14).toISOString(),
    ]);
  });

  maybe('hai quãng ghép lại phủ kín 24h thì ngày đó là fullyBusy', async () => {
    await reserve(vnAt('2026-09-22', 0), vnAt('2026-09-22', 9));
    await reserve(vnAt('2026-09-22', 9), vnAt('2026-09-23', 0));

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-22', '2026-09-22');
    expect(res.days[0]).toMatchObject({ date: '2026-09-22', fullyBusy: true, periods: [] });
  });

  maybe('buffer chuẩn bị được tính vào giờ bận (đọc `period`, không đọc end_at)', async () => {
    // Trả 16:00 + buffer 90 phút → thực tế chiếm tới 17:30, đó là mốc constraint sẽ chặn.
    await reserve(vnAt('2026-09-25', 8), vnAt('2026-09-25', 16), 90);

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-25', '2026-09-25');
    expect(res.days[0]!.periods).toEqual([
      {
        startAt: vnAt('2026-09-25', 8).toISOString(),
        endAt: vnAt('2026-09-25', 17, 30).toISOString(),
      },
    ]);
  });

  maybe('quãng chồng lên biên cửa sổ bị cắt gọn về trong cửa sổ', async () => {
    await reserve(vnAt('2026-09-28', 20), vnAt('2026-10-03', 9));

    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-29', '2026-09-30');
    expect(res.days.map((d) => d.date)).toEqual(['2026-09-29', '2026-09-30']);
    for (const day of res.days) expect(day.fullyBusy).toBe(true);
  });

  maybe('cửa sổ quá trần bị kẹp ở SERVER và trả lại khoảng thực dùng', async () => {
    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-01', '2030-01-01');
    expect(res.from).toBe('2026-09-01');
    expect(res.to).toBe('2027-10-05'); // 2026-09-01 + 399 ngày
  });

  maybe('`to` trước `from` thu về đúng một ngày, không thành cửa sổ âm', async () => {
    const res = await requests.listPublicBusyDays(vehicleId, '2026-09-10', '2026-09-01');
    expect(res).toMatchObject({ from: '2026-09-10', to: '2026-09-10' });
  });

  maybe('xe chưa duyệt public thì không tra được lịch', async () => {
    await expect(
      requests.listPublicBusyDays(draftVehicleId, '2026-09-01', '2026-09-30'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
