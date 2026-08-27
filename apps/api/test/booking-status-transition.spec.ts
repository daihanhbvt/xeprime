import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_NO_SHOW_GRACE_MINUTES,
  BOOKING_STATUS,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  type BookingStatus,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { TransitionBookingDto } from '../src/modules/bookings/dto/booking.dto';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Quyết định trạng thái của gian hàng trên một đơn: xác nhận · hủy · ghi nhận khách không đến.
 *
 * Ba thứ được khoá ở đây, trên PostgreSQL THẬT vì cả ba đụng tới ràng buộc DB:
 *
 *  1. **Máy trạng thái là của server** (ADR 0005). `active → cancelled` không có trong bảng
 *     chuyển trạng thái, nên nó phải 409 *và không được để lại dấu vết nào* — một đơn đang thuê
 *     bị huỷ nửa vời là xe biến mất khỏi lịch trong khi khách vẫn đang cầm chìa khoá.
 *  2. **Rời tập chiếm lịch thì nhả lịch NGAY, trong cùng transaction** (ADR 0006). Không nhả là
 *     một chỗ xe chết cứng mà không đơn nào giải thích được.
 *  3. **Lý do đi vào audit cạnh status.** Sáu tháng sau, dòng audit là thứ duy nhất trả lời được
 *     "vì sao đơn này bị huỷ".
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const occupancy = new OccupancyService(asService);
const bookings = new BookingsService(
  asService,
  occupancy,
  audit,
  new NotificationService(asService),
  new DriversService(asService, audit),
  new CustomersService(asService, audit),
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

const BASE = new Date('2027-05-03T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

let slot = 0;

/**
 * Một đơn ĐANG GIỮ CHỖ: booking + occupancy, đúng như đường ghi thật tạo ra.
 *
 * `startAt` mặc định nằm ở TƯƠNG LAI (mọi khung giờ rời nhau, không đơn nào đụng đơn nào). Ca
 * ghi nhận khách không đến cần một chuyến ĐÃ QUÁ giờ hẹn nên tự truyền mốc quá khứ vào — đó là
 * điều kiện của luật, không phải một tiện ích của test.
 */
async function seedBooking(
  status: BookingStatus,
  startAtOverride?: Date,
): Promise<{ id: string; startAt: Date }> {
  slot += 1;
  const id = newId();
  const startAt = startAtOverride ?? hours(slot * 100);
  const endAt = new Date(startAt.getTime() + 24 * 3_600_000);
  /*
   * Chuyến QUÁ KHỨ được đặt lên một chiếc xe RIÊNG.
   *
   * Các mốc quá khứ đều xoay quanh "bây giờ" nên chúng chồng lên nhau, và `EXCLUDE USING gist`
   * (ADR 0006) từ chối chiếc thứ hai — đúng như nó phải làm. Đó là ràng buộc thật đang hoạt
   * động, không phải chuyện để né bằng cách nới khoảng thời gian cho vừa test.
   */
  const bookingVehicleId = startAtOverride ? await seedVehicle() : vehicleId;

  await prisma.$transaction(async (tx) => {
    await tx.booking.create({
      data: {
        id,
        tenantId,
        vehicleId: bookingVehicleId,
        code: `DH-TR-${slot}`,
        customerName: 'Khách Test',
        status,
        pickupAt: startAt,
        returnAt: endAt,
        baseAmount: new Prisma.Decimal('1000000'),
        totalAmount: new Prisma.Decimal('1000000'),
      },
    });
    await occupancy.reserve(tx, {
      tenantId,
      vehicleId: bookingVehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
      sourceId: id,
      startAt,
      endAt,
    });
  });

  return { id, startAt };
}

/** Một chiếc xe mới toanh của cùng gian hàng — lịch của nó chắc chắn còn trống. */
async function seedVehicle(): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `V-TR-${id.slice(-6)}`,
      name: `Xe test ${id.slice(-4)}`,
      vehicleType: VEHICLE_TYPE.CAR,
      weekdayPrice: new Prisma.Decimal('500000'),
    },
  });
  return id;
}

const countOccupancy = (bookingId: string) =>
  prisma.vehicleOccupancy.count({
    where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING, sourceId: bookingId },
  });

const lastTransitionAudit = (bookingId: string) =>
  prisma.auditLog.findFirst({
    where: { targetType: 'booking', targetId: bookingId, action: 'booking.transition' },
    orderBy: { createdAt: 'desc' },
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
  vehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `owner-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop chuyển trạng thái',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: 'V-TR',
      name: 'Mazda 3 2024',
      vehicleType: VEHICLE_TYPE.CAR,
      weekdayPrice: new Prisma.Decimal('500000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicleHandover.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('DTO — lý do bắt buộc đúng chỗ', () => {
  const errorsFor = (payload: Record<string, unknown>) =>
    validate(plainToInstance(TransitionBookingDto, payload));

  it('xác nhận đơn KHÔNG cần lý do', async () => {
    expect(await errorsFor({ status: BOOKING_STATUS.CONFIRMED })).toHaveLength(0);
  });

  it.each([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW])(
    '%s thiếu lý do → từ chối ngay ở biên',
    async (status) => {
      const errors = await errorsFor({ status });
      expect(errors.map((e) => e.property)).toContain('reason');
    },
  );

  it.each([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW])(
    '%s với lý do toàn khoảng trắng vẫn là thiếu lý do',
    async (status) => {
      const errors = await errorsFor({ status, reason: '    ' });
      expect(errors.map((e) => e.property)).toContain('reason');
    },
  );

  it('lý do được trim trước khi vào service', async () => {
    const dto = plainToInstance(TransitionBookingDto, {
      status: BOOKING_STATUS.CANCELLED,
      reason: '  Khách báo hủy  ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Khách báo hủy');
  });

  /** Trần 500 ký tự phải có hiệu lực cả ở bước KHÔNG bắt buộc — xem ghi chú ở DTO. */
  it('lý do quá dài bị từ chối kể cả khi không bắt buộc', async () => {
    const errors = await errorsFor({ status: BOOKING_STATUS.CONFIRMED, reason: 'x'.repeat(501) });
    expect(errors.map((e) => e.property)).toContain('reason');
  });
});

describe('Xác nhận đơn', () => {
  maybe('reserved → confirmed, và xe vẫn giữ chỗ', async () => {
    const { id } = await seedBooking(BOOKING_STATUS.RESERVED);

    const updated = await bookings.transition(tenantId, id, ownerId, {
      status: BOOKING_STATUS.CONFIRMED,
    });

    expect(updated.status).toBe(BOOKING_STATUS.CONFIRMED);
    // `confirmed` vẫn nằm trong tập chiếm lịch (ADR 0006) — nhả ở đây là mở cửa cho đơn trùng.
    expect(await countOccupancy(id)).toBe(1);
  });
});

describe('Hủy đơn', () => {
  maybe('reserved → cancelled: nhả lịch và ghi audit kèm lý do', async () => {
    const { id } = await seedBooking(BOOKING_STATUS.RESERVED);

    const updated = await bookings.transition(tenantId, id, ownerId, {
      status: BOOKING_STATUS.CANCELLED,
      reason: 'Khách báo hủy qua điện thoại',
    });

    expect(updated.status).toBe(BOOKING_STATUS.CANCELLED);
    expect(await countOccupancy(id)).toBe(0);

    const log = await lastTransitionAudit(id);
    expect(log?.afterJson).toEqual({
      status: BOOKING_STATUS.CANCELLED,
      reason: 'Khách báo hủy qua điện thoại',
    });
    expect(log?.beforeJson).toEqual({ status: BOOKING_STATUS.RESERVED });
  });

  maybe('confirmed → cancelled cũng nhả lịch, và khung giờ đó đặt lại được ngay', async () => {
    const { id, startAt } = await seedBooking(BOOKING_STATUS.CONFIRMED);

    await bookings.transition(tenantId, id, ownerId, {
      status: BOOKING_STATUS.CANCELLED,
      reason: 'Xe hỏng đột xuất',
    });

    expect(await countOccupancy(id)).toBe(0);

    // Bằng chứng lịch thật sự trống: giữ lại đúng khung vừa nhả, constraint không chặn.
    const otherId = newId();
    await prisma.$transaction((tx) =>
      occupancy.reserve(tx, {
        tenantId,
        vehicleId,
        sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
        sourceId: otherId,
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
      }),
    );
    expect(await countOccupancy(otherId)).toBe(1);
  });

  /**
   * Xe đang ở ngoài đường. Đường duy nhất còn lại là hoàn tất chuyến bằng biên bản nhận xe —
   * huỷ ở đây sẽ nhả lịch một chiếc xe đang có người cầm chìa khoá.
   */
  maybe('active → cancelled: 409, trạng thái và lịch KHÔNG nhúc nhích', async () => {
    const { id } = await seedBooking(BOOKING_STATUS.ACTIVE);

    await expect(
      bookings.transition(tenantId, id, ownerId, {
        status: BOOKING_STATUS.CANCELLED,
        reason: 'Đổi ý',
      }),
    ).rejects.toMatchObject({ status: 409 });

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    expect(after.status).toBe(BOOKING_STATUS.ACTIVE);
    expect(await countOccupancy(id)).toBe(1);
  });
});

/**
 * Ghi nhận khách không đến — ba điều kiện phải cùng đúng, và mỗi ca dưới đây phá đúng một cái.
 *
 * Ân hạn `BOOKING_NO_SHOW_GRACE_MINUTES` không phải một con số làm cho đẹp: thiếu nó, một cú
 * tắc đường mười phút thành một vết đen vĩnh viễn trong sổ khách của gian hàng.
 */
describe('Ghi nhận khách không đến', () => {
  /** Giờ hẹn đã trôi qua đúng `minutes` phút — mốc để test đứng hai bên ranh giới ân hạn. */
  const pickedUpAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  maybe('quá ân hạn, chưa giao xe → thành công, nhả lịch, audit ghi cả lý do', async () => {
    const { id } = await seedBooking(
      BOOKING_STATUS.CONFIRMED,
      pickedUpAgo(BOOKING_NO_SHOW_GRACE_MINUTES + 30),
    );

    const updated = await bookings.transition(tenantId, id, ownerId, {
      status: BOOKING_STATUS.NO_SHOW,
      reason: 'Quá hẹn 3 tiếng, không liên lạc được',
    });

    expect(updated.status).toBe(BOOKING_STATUS.NO_SHOW);
    expect(await countOccupancy(id)).toBe(0);
    expect((await lastTransitionAudit(id))?.afterJson).toEqual({
      status: BOOKING_STATUS.NO_SHOW,
      reason: 'Quá hẹn 3 tiếng, không liên lạc được',
    });
  });

  maybe('reserved cũng ghi nhận được — không chỉ đơn đã xác nhận', async () => {
    const { id } = await seedBooking(
      BOOKING_STATUS.RESERVED,
      pickedUpAgo(BOOKING_NO_SHOW_GRACE_MINUTES + 5),
    );

    await expect(
      bookings.transition(tenantId, id, ownerId, {
        status: BOOKING_STATUS.NO_SHOW,
        reason: 'Khách không tới',
      }),
    ).resolves.toMatchObject({ status: BOOKING_STATUS.NO_SHOW });
  });

  maybe('CHƯA qua ân hạn → 409, đơn và lịch không nhúc nhích', async () => {
    const { id } = await seedBooking(
      BOOKING_STATUS.CONFIRMED,
      // Ngay sau giờ hẹn, còn trong ân hạn — khách có thể đang trên đường.
      pickedUpAgo(BOOKING_NO_SHOW_GRACE_MINUTES - 10),
    );

    await expect(
      bookings.transition(tenantId, id, ownerId, {
        status: BOOKING_STATUS.NO_SHOW,
        reason: 'Sốt ruột',
      }),
    ).rejects.toMatchObject({ status: 409 });

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    expect(after.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(await countOccupancy(id)).toBe(1);
  });

  maybe('chuyến chưa tới giờ hẹn → 409 (mốc tương lai càng phải bị chặn)', async () => {
    const { id } = await seedBooking(BOOKING_STATUS.CONFIRMED);

    await expect(
      bookings.transition(tenantId, id, ownerId, {
        status: BOOKING_STATUS.NO_SHOW,
        reason: 'Bấm nhầm',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  /**
   * Có biên bản GIAO XE đã xác nhận nghĩa là khách đã cầm chìa khoá. Trong đời sống bình thường
   * lần xác nhận đó đã đẩy đơn sang `active` và máy trạng thái tự chặn; ở đây dựng đúng cái
   * trạng thái LỆCH (biên bản có, đơn chưa theo) để chứng minh cửa thứ hai thật sự tồn tại.
   */
  maybe('đã có biên bản giao xe → 409 dù đơn vẫn còn confirmed', async () => {
    const { id } = await seedBooking(
      BOOKING_STATUS.CONFIRMED,
      pickedUpAgo(BOOKING_NO_SHOW_GRACE_MINUTES + 60),
    );
    const booked = await prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { vehicleId: true },
    });
    await prisma.vehicleHandover.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: id,
        vehicleId: booked.vehicleId,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.CONFIRMED,
        // CHECK `vh_missing_km_consistent`: biên bản đã xác nhận phải khai rõ có KM hay không.
        odometerKm: 12_000,
        odometerMissing: false,
        confirmedAt: new Date(),
        confirmedBy: ownerId,
      },
    });

    await expect(
      bookings.transition(tenantId, id, ownerId, {
        status: BOOKING_STATUS.NO_SHOW,
        reason: 'Khách không tới',
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(await countOccupancy(id)).toBe(1);
  });
});

describe('Trạng thái kết thúc là kết thúc', () => {
  const FINAL = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW];
  const EVERY = Object.values(BOOKING_STATUS);

  maybe('không có cạnh nào đi ra khỏi completed/cancelled/no_show', async () => {
    for (const from of FINAL) {
      const { id } = await seedBooking(from);
      for (const to of EVERY) {
        await expect(
          bookings.transition(tenantId, id, ownerId, { status: to, reason: 'Thử lách' }),
        ).rejects.toMatchObject({ status: 409 });
      }
      const after = await prisma.booking.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      expect(after.status).toBe(from);
    }
  });
});
