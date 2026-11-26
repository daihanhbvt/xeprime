import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_SOURCE,
  BOOKING_SOURCE_AUDIT_ACTION,
  BOOKING_SOURCE_FILTER_DIRECT,
  MEMBERSHIP_STATUS,
  PAYMENT_METHOD,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { createValidationPipe } from '../src/bootstrap';
import { AuditService } from '../src/modules/audit/audit.service';
import { CreateBookingDto, UpdateBookingSourceDto } from '../src/modules/bookings/dto/booking.dto';
import { FinanceOverviewService } from '../src/modules/finance/finance-overview.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { relaxBookingLimits } from './helpers/booking-limits';
import {
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
} from './helpers/service-factory';

/**
 * NGUỒN ĐƠN (ADR 0110) — PostgreSQL THẬT.
 *
 *  1. DTO: không nhận `xeprime`; nguồn nhận nhãn bắt buộc có nhãn; nhãn được gọn khoảng trắng.
 *  2. Đơn tự lập mang nguồn chủ xe chọn; vắng nguồn ⇒ `other`; nhãn chỉ giữ ở nguồn nhận nhãn.
 *  3. DB: yêu cầu trỏ vào đơn ⇒ đơn tự thành `xeprime`; ghi `xeprime` cho đơn không có yêu cầu, hay
 *     gỡ `xeprime` khỏi đơn có yêu cầu, bị từ chối.
 *  4. Đổi nguồn: có audit; đơn qua sàn ⇒ 409 `BOOKING_SOURCE_LOCKED`.
 *  5. Danh sách lọc theo nguồn / `direct` / nhãn; gợi ý nhãn đã dùng.
 *  6. Doanh thu theo nguồn: tổng = qua sàn + tự khai thác + không gắn đơn; số chuyến theo nguồn.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const bookings = makeBookingsService(asService, {
  audit,
  notifications: makeNotificationService(asService),
  customers: makeCustomersService(asService, audit),
});

const finance = new FinanceOverviewService(asService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

let day = 0;
function nextWindow(): { pickupAt: string; returnAt: string } {
  day += 3;
  const pickup = new Date(Date.UTC(2030, 2, 1 + day, 2));
  return {
    pickupAt: pickup.toISOString(),
    returnAt: new Date(pickup.getTime() + 2 * 86_400_000).toISOString(),
  };
}

let phone = 0;
function baseDto(extra: Partial<CreateBookingDto> = {}): CreateBookingDto {
  phone += 1;
  return {
    vehicleId,
    customerName: 'Khách nguồn đơn',
    customerPhone: `0956${String(300000 + phone).slice(-6)}`,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    ...nextWindow(),
    baseAmount: '1000000',
    ...extra,
  };
}

/** Gắn một yêu cầu đã thành đơn vào `bookingId` — cách một đơn qua sàn ra đời. */
async function linkRequest(bookingId: string): Promise<string> {
  const id = newId();
  const window = nextWindow();
  await prisma.bookingRequest.create({
    data: {
      id,
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      customerName: 'Khách qua sàn',
      customerPhone: '0909000333',
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      pickupAt: new Date(window.pickupAt),
      returnAt: new Date(window.returnAt),
      respondBy: new Date(),
      decidedAt: new Date(),
      decidedBy: ownerId,
      bookingId,
    },
  });
  return id;
}

beforeAll(async () => {
  relaxBookingLimits();
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
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ nguồn đơn',
      email: `source-${ownerId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop nguồn đơn',
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
      code: `V-SRC-${vehicleId.slice(-6)}`,
      name: 'Vios nguồn đơn',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('700000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.receipt.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
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

const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });

describe('DTO', () => {
  const pipe = createValidationPipe();
  const createMeta = { type: 'body' as const, metatype: CreateBookingDto };
  const updateMeta = { type: 'body' as const, metatype: UpdateBookingSourceDto };
  const base = {
    vehicleId: newId(),
    customerName: 'A',
    pickupAt: '2030-01-01T00:00:00.000Z',
    returnAt: '2030-01-02T00:00:00.000Z',
  };

  it('không nhận `xeprime` - nguồn đó do server gắn', async () => {
    await expect(
      pipe.transform({ ...base, source: BOOKING_SOURCE.XEPRIME }, createMeta),
    ).rejects.toThrow();
    await expect(pipe.transform({ source: BOOKING_SOURCE.XEPRIME }, updateMeta)).rejects.toThrow();
  });

  it('nguồn nhận nhãn bắt buộc có nhãn; nhãn được gọn khoảng trắng', async () => {
    await expect(
      pipe.transform({ ...base, source: BOOKING_SOURCE.OTHER_PLATFORM }, createMeta),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ ...base, source: BOOKING_SOURCE.OTHER, sourceLabel: '   ' }, createMeta),
    ).rejects.toThrow();
    await expect(pipe.transform({ source: BOOKING_SOURCE.OTHER }, updateMeta)).rejects.toThrow();
    const ok = (await pipe.transform(
      { ...base, source: BOOKING_SOURCE.OTHER_PLATFORM, sourceLabel: '  Nền tảng A ' },
      createMeta,
    )) as CreateBookingDto;
    expect(ok.sourceLabel).toBe('Nền tảng A');
  });

  it('vắng nguồn vẫn hợp lệ (app chưa cập nhật); nguồn không nhãn không đòi nhãn', async () => {
    await expect(pipe.transform({ ...base }, createMeta)).resolves.toBeDefined();
    await expect(
      pipe.transform({ ...base, source: BOOKING_SOURCE.WALK_IN }, createMeta),
    ).resolves.toBeDefined();
  });
});

describe('Đơn tự lập mang nguồn', () => {
  maybe('lưu nguồn chủ xe chọn; vắng nguồn ⇒ other; nhãn chỉ giữ ở nguồn nhận nhãn', async () => {
    const referral = await bookings.create(
      tenantId,
      ownerId,
      baseDto({ source: BOOKING_SOURCE.REFERRAL }),
    );
    expect(referral.source).toBe(BOOKING_SOURCE.REFERRAL);
    expect(referral.sourceLabel).toBeNull();

    const legacy = await bookings.create(tenantId, ownerId, baseDto());
    expect(legacy.source).toBe(BOOKING_SOURCE.OTHER);
    expect(legacy.sourceLabel).toBeNull();

    const platform = await bookings.create(
      tenantId,
      ownerId,
      baseDto({ source: BOOKING_SOURCE.OTHER_PLATFORM, sourceLabel: 'Nền tảng A' }),
    );
    expect(platform.sourceLabel).toBe('Nền tảng A');

    // Nhãn gửi kèm một nguồn KHÔNG nhận nhãn bị bỏ - không có nhãn mồ côi trong cột.
    const walkIn = await bookings.create(
      tenantId,
      ownerId,
      baseDto({ source: BOOKING_SOURCE.WALK_IN, sourceLabel: 'thừa' }),
    );
    expect(walkIn.sourceLabel).toBeNull();
  });
});

describe('DB giữ luật xeprime ⇔ có yêu cầu', () => {
  maybe('yêu cầu trỏ vào đơn ⇒ đơn tự thành xeprime, nhãn bị xoá', async () => {
    const booking = await bookings.create(
      tenantId,
      ownerId,
      baseDto({ source: BOOKING_SOURCE.OTHER, sourceLabel: 'Sẽ bị xoá' }),
    );
    await linkRequest(booking.id);
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { source: true, sourceLabel: true },
    });
    expect(row).toEqual({ source: BOOKING_SOURCE.XEPRIME, sourceLabel: null });
  });

  maybe('ghi xeprime cho đơn KHÔNG có yêu cầu bị từ chối', async () => {
    const booking = await bookings.create(tenantId, ownerId, baseDto());
    await expect(
      prisma.booking.update({
        where: { id: booking.id },
        data: { source: BOOKING_SOURCE.XEPRIME },
      }),
    ).rejects.toThrow();
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { source: true },
    });
    expect(row.source).toBe(BOOKING_SOURCE.OTHER);
  });

  maybe('gỡ xeprime khỏi đơn CÓ yêu cầu bị từ chối', async () => {
    const booking = await bookings.create(tenantId, ownerId, baseDto());
    await linkRequest(booking.id);
    await expect(
      prisma.booking.update({
        where: { id: booking.id },
        data: { source: BOOKING_SOURCE.WALK_IN },
      }),
    ).rejects.toThrow();
  });
});

describe('Đổi nguồn', () => {
  maybe(
    'đổi được nguồn của đơn tự lập, có audit; gửi lại y nguyên không ghi audit lần hai',
    async () => {
      const booking = await bookings.create(tenantId, ownerId, baseDto());
      const updated = await bookings.updateSource(tenantId, booking.id, ownerId, {
        source: BOOKING_SOURCE.OTHER_PLATFORM,
        sourceLabel: 'Nền tảng B',
      });
      expect(updated.source).toBe(BOOKING_SOURCE.OTHER_PLATFORM);
      expect(updated.sourceLabel).toBe('Nền tảng B');

      await bookings.updateSource(tenantId, booking.id, ownerId, {
        source: BOOKING_SOURCE.OTHER_PLATFORM,
        sourceLabel: 'Nền tảng B',
      });
      const logs = await prisma.auditLog.count({
        where: { tenantId, targetId: booking.id, action: BOOKING_SOURCE_AUDIT_ACTION },
      });
      expect(logs).toBe(1);
    },
  );

  maybe('đơn qua sàn ⇒ 409 BOOKING_SOURCE_LOCKED', async () => {
    const booking = await bookings.create(tenantId, ownerId, baseDto());
    await linkRequest(booking.id);
    await expect(
      bookings.updateSource(tenantId, booking.id, ownerId, { source: BOOKING_SOURCE.WALK_IN }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_SOURCE_LOCKED));
  });

  maybe('đơn của gian hàng khác ⇒ 404', async () => {
    await expect(
      bookings.updateSource(tenantId, newId(), ownerId, { source: BOOKING_SOURCE.WALK_IN }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.NOT_FOUND));
  });
});

describe('Danh sách + gợi ý nhãn', () => {
  maybe('lọc theo một nguồn, theo `direct`, theo nhãn', async () => {
    const all = await bookings.list(tenantId, { limit: 100 }, null);
    const xeprime = await bookings.list(
      tenantId,
      { limit: 100, source: BOOKING_SOURCE.XEPRIME },
      null,
    );
    const direct = await bookings.list(
      tenantId,
      { limit: 100, source: BOOKING_SOURCE_FILTER_DIRECT },
      null,
    );
    expect(xeprime.data.length).toBeGreaterThan(0);
    expect(xeprime.data.every((b) => b.source === BOOKING_SOURCE.XEPRIME)).toBe(true);
    expect(direct.data.every((b) => b.source !== BOOKING_SOURCE.XEPRIME)).toBe(true);
    expect(xeprime.data.length + direct.data.length).toBe(all.data.length);

    const labelled = await bookings.list(tenantId, { limit: 100, sourceLabel: 'Nền tảng A' }, null);
    expect(labelled.data).toHaveLength(1);
    expect(labelled.data[0]?.sourceLabel).toBe('Nền tảng A');
  });

  maybe('gợi ý trả các nhãn đã dùng, không trùng, không có null', async () => {
    const { labels } = await bookings.sourceLabels(tenantId);
    expect(labels).toEqual(expect.arrayContaining(['Nền tảng A', 'Nền tảng B']));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain('Sẽ bị xoá');
  });
});

describe('Doanh thu theo nguồn đơn', () => {
  maybe(
    'tổng = qua sàn + tự khai thác + không gắn đơn; mỗi nguồn có số chuyến của nó',
    async () => {
      const direct = await bookings.create(
        tenantId,
        ownerId,
        baseDto({ source: BOOKING_SOURCE.SOCIAL }),
      );
      const marketplace = await bookings.create(tenantId, ownerId, baseDto());
      await linkRequest(marketplace.id);

      const occurredAt = new Date();
      await prisma.receipt.createMany({
        data: [
          { receiptNo: 'PT-SRC-1', bookingId: direct.id, amount: '700000' },
          { receiptNo: 'PT-SRC-2', bookingId: marketplace.id, amount: '500000' },
          { receiptNo: 'PT-SRC-3', bookingId: null, amount: '300000' },
        ].map((r) => ({
          id: newId(),
          tenantId,
          type: RECEIPT_TYPE.INCOME,
          paymentMethod: PAYMENT_METHOD.CASH,
          status: RECEIPT_STATUS.APPROVED,
          occurredAt,
          // Phiếu nhập tay phải gắn xe hoặc chi nhánh (CHECK `receipts_manual_needs_branch_or_vehicle`).
          vehicleId,
          ...r,
        })),
      });

      const result = await finance.bySource(tenantId, {}, null);
      expect(result.total).toBe('1500000');
      expect(result.marketplaceAmount).toBe('500000');
      expect(result.directAmount).toBe('700000');
      expect(result.unlinkedAmount).toBe('300000');

      // Sàn đứng đầu, khoản không gắn đơn đứng cuối.
      expect(result.items[0]?.source).toBe(BOOKING_SOURCE.XEPRIME);
      expect(result.items.at(-1)?.source).toBeNull();

      const social = result.items.find((i) => i.source === BOOKING_SOURCE.SOCIAL);
      expect(social).toMatchObject({ amount: '700000', trips: 1, bookedAmount: '1000000' });

      // Nguồn có chuyến nhưng chưa có tiền lên sổ vẫn có dòng - nhãn tự nhập là một dòng riêng.
      const labelled = result.items.find((i) => i.sourceLabel === 'Nền tảng A');
      expect(labelled).toMatchObject({
        source: BOOKING_SOURCE.OTHER_PLATFORM,
        amount: '0',
        trips: 1,
      });

      const sum = result.items.reduce((acc, i) => acc + Number(i.amount), 0);
      expect(sum).toBe(Number(result.total));

      // Biểu đồ theo kỳ tách CÙNG ba phần đó trong từng cột - cộng lại bằng doanh thu của cột.
      const todayVn = new Date(occurredAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
      const series = await finance.series(
        tenantId,
        { from: todayVn, to: todayVn, granularity: 'day' },
        null,
      );
      expect(series.buckets).toHaveLength(1);
      expect(series.buckets[0]).toMatchObject({
        revenue: '1500000',
        marketplaceRevenue: '500000',
        directRevenue: '700000',
        unlinkedRevenue: '300000',
      });

      // Thu hẹp về một xe vẫn tách đúng (hồ sơ xe đọc chuỗi này với `vehicleId`).
      const scoped = await finance.series(
        tenantId,
        { from: todayVn, to: todayVn, granularity: 'day', vehicleId },
        null,
      );
      expect(scoped.buckets[0]?.marketplaceRevenue).toBe('500000');
    },
  );
});
