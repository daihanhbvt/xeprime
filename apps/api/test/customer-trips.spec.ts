import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_STAGE,
  DEPOSIT_STATUS,
  MEMBERSHIP_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  REFUND_METHOD,
  SURCHARGE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Wave 11 — chuyến của KHÁCH, trên PostgreSQL THẬT.
 *
 * Điều được khoá ở đây:
 *  - khách không với tới được chuyến của khách khác, và câu trả lời không tiết lộ chuyến đó có
 *    tồn tại hay không;
 *  - chặng hiển thị suy từ trạng thái vận hành thật, không phải một cột mới;
 *  - tiền không đếm trùng: cọc đã thu KHÔNG bị cộng vào "đã trả tiền thuê", phát sinh chỉ vào
 *    tổng đúng một lần;
 *  - hoàn cọc với khách là CHỈ ĐỌC, và khớp từng đồng với số chủ xe đã ghi.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const pricing = new PricingService(asService, audit);
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);
const occupancy = new OccupancyService(asService);
const bookings = new BookingsService(
  asService,
  occupancy,
  audit,
  notifications,
  new DriversService(asService, audit),
  new CustomersService(asService, audit),
);
const trips = new CustomerTripsService(asService, settlement);

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let strangerId: string;
let tenantId: string;
let vehicleId: string;

const BASE = new Date('2026-10-05T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

interface SeedOptions {
  requestStatus?: string;
  bookingStatus?: string | null;
  customerUserId?: string;
  baseAmount?: string;
  discountAmount?: string;
  deliveryFee?: string;
  depositAmount?: string;
}

/**
 * Mỗi chuyến một khung giờ riêng: `booking_requests` có unique
 * `(vehicle_id, customer_phone, pickup_at, return_at)` để chặn khách bấm gửi hai lần cùng một
 * yêu cầu. Dùng chung một khung giờ cho mọi seed là tự đâm vào ràng buộc đó.
 */
let slot = 0;

/** Một "chuyến": yêu cầu thuê + (tuỳ chọn) đơn thuê đã tạo từ nó. */
async function seedTrip(
  opts: SeedOptions = {},
): Promise<{ requestId: string; bookingId?: string }> {
  const requestId = newId();
  const bookingStatus =
    opts.bookingStatus === undefined ? BOOKING_STATUS.RESERVED : opts.bookingStatus;
  const from = hours(slot * 48);
  const to = hours(slot * 48 + 24);
  slot += 1;

  let bookingId: string | undefined;
  if (bookingStatus) {
    bookingId = newId();
    const base = new Prisma.Decimal(opts.baseAmount ?? '1000000');
    const discount = new Prisma.Decimal(opts.discountAmount ?? '0');
    const delivery = new Prisma.Decimal(opts.deliveryFee ?? '0');
    await prisma.booking.create({
      data: {
        id: bookingId,
        tenantId,
        vehicleId,
        code: `DH${bookingId.slice(-6).toUpperCase()}`,
        customerName: 'Khách Test',
        status: bookingStatus,
        pickupAt: from,
        returnAt: to,
        baseAmount: base,
        discountAmount: discount,
        deliveryFee: delivery,
        totalAmount: base.minus(discount).plus(delivery),
        depositAmount: new Prisma.Decimal(opts.depositAmount ?? '0'),
      },
    });
  }

  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId,
      vehicleId,
      status:
        opts.requestStatus ??
        (bookingId
          ? BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING
          : BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL),
      customerName: 'Khách Test',
      customerPhone: '0900000000',
      customerUserId: opts.customerUserId ?? customerId,
      bookingId: bookingId ?? null,
      pickupAt: from,
      returnAt: to,
    },
  });

  return bookingId ? { requestId, bookingId } : { requestId };
}

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
  customerId = newId();
  strangerId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `owner-${ownerId}@xeprime.test` },
      { id: customerId, displayName: 'Khách A', email: `cus-${customerId}@xeprime.test` },
      { id: strangerId, displayName: 'Khách B', email: `other-${strangerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Gian hàng Minh Tuấn',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
      phone: '0909123456',
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
      code: 'V1',
      name: 'Toyota Camry 2024',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: '43A-123.45',
      seatCount: 5,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId, strangerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Quyền truy cập', () => {
  maybe('chuyến của khách khác → 404, không phải 403', async () => {
    const { requestId, bookingId } = await seedTrip({ customerUserId: strangerId });

    // 403 là câu xác nhận "id này có thật". Cả hai cách gọi tên chuyến đều phải im lặng như nhau.
    await expect(trips.detail(customerId, requestId)).rejects.toMatchObject({ status: 404 });
    await expect(trips.detail(customerId, bookingId!)).rejects.toMatchObject({ status: 404 });

    // Và chính chủ vẫn xem được — chứng minh 404 ở trên đến từ quyền sở hữu, không phải seed hỏng.
    await expect(trips.detail(strangerId, requestId)).resolves.toMatchObject({ id: requestId });
  });

  maybe('id không tồn tại trả về CÙNG một lỗi với id của người khác', async () => {
    await expect(trips.detail(customerId, newId())).rejects.toMatchObject({ status: 404 });
  });

  maybe('danh sách chỉ chứa chuyến của chính mình', async () => {
    await seedTrip({ customerUserId: strangerId });
    const res = await trips.list(customerId, {});
    const owners = await prisma.bookingRequest.findMany({
      where: { id: { in: res.data.map((row) => row.id) } },
      select: { customerUserId: true },
    });
    expect(owners.every((row) => row.customerUserId === customerId)).toBe(true);
  });
});

describe('Chiếu trạng thái sang chặng của khách', () => {
  maybe('yêu cầu chờ duyệt: chưa có đơn, chưa có tiền', async () => {
    const { requestId } = await seedTrip({ bookingStatus: null });
    const trip = await trips.detail(customerId, requestId);

    expect(trip.stage).toBe(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL);
    expect(trip.bookingId).toBeNull();
    // Chưa có đơn thì chưa có giá chốt — bịa một con số "dự kiến" là hứa hẹn thay chủ xe.
    expect(trip.totalAmount).toBeNull();
    expect(trip.finance).toBeNull();
  });

  maybe('`reserved` và `confirmed` cùng ra `Sẵn sàng`', async () => {
    const a = await seedTrip({ bookingStatus: BOOKING_STATUS.RESERVED });
    const b = await seedTrip({ bookingStatus: BOOKING_STATUS.CONFIRMED });
    expect((await trips.detail(customerId, a.requestId)).stage).toBe(CUSTOMER_TRIP_STAGE.READY);
    expect((await trips.detail(customerId, b.requestId)).stage).toBe(CUSTOMER_TRIP_STAGE.READY);
  });

  maybe('`active` → Đang thuê; `completed` → Hoàn thành', async () => {
    const a = await seedTrip({ bookingStatus: BOOKING_STATUS.ACTIVE });
    const b = await seedTrip({ bookingStatus: BOOKING_STATUS.COMPLETED });
    expect((await trips.detail(customerId, a.requestId)).stage).toBe(CUSTOMER_TRIP_STAGE.ACTIVE);
    expect((await trips.detail(customerId, b.requestId)).stage).toBe(CUSTOMER_TRIP_STAGE.COMPLETED);
  });

  maybe('bị từ chối và không-nhận-xe là hai kết cục khác nhau', async () => {
    const rejected = await seedTrip({
      bookingStatus: null,
      requestStatus: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
    });
    const noShow = await seedTrip({ bookingStatus: BOOKING_STATUS.NO_SHOW });
    expect((await trips.detail(customerId, rejected.requestId)).stage).toBe(
      CUSTOMER_TRIP_STAGE.REJECTED,
    );
    expect((await trips.detail(customerId, noShow.requestId)).stage).toBe(
      CUSTOMER_TRIP_STAGE.NO_SHOW,
    );
  });

  maybe('tra được chuyến bằng id ĐƠN — thông báo cũ trỏ vào id đó', async () => {
    const { requestId, bookingId } = await seedTrip({ bookingStatus: BOOKING_STATUS.ACTIVE });
    const viaBooking = await trips.detail(customerId, bookingId!);
    expect(viaBooking.id).toBe(requestId);
  });
});

describe('Lọc và đếm', () => {
  maybe('mỗi tab đếm đúng bằng chính vị từ lọc của nó', async () => {
    const res = await trips.list(customerId, { filter: CUSTOMER_TRIP_FILTER.ACTIVE });
    expect(res.data.every((row) => row.stage === CUSTOMER_TRIP_STAGE.ACTIVE)).toBe(true);
    expect(res.meta.total).toBe(res.counts.active);

    const all = await trips.list(customerId, {});
    expect(all.meta.total).toBe(all.counts.all);
    // Các tab con cộng lại đúng bằng tab Tất cả — không chuyến nào rơi ra ngoài mọi tab.
    const { pending, upcoming, active, completed, cancelled } = all.counts;
    expect(pending + upcoming + active + completed + cancelled).toBe(all.counts.all);
  });

  maybe('tab Đã hủy gom cả từ-chối lẫn không-nhận-xe', async () => {
    const res = await trips.list(customerId, { filter: CUSTOMER_TRIP_FILTER.CANCELLED });
    const stages = new Set(res.data.map((row) => row.stage));
    expect(stages.has(CUSTOMER_TRIP_STAGE.REJECTED)).toBe(true);
    expect(stages.has(CUSTOMER_TRIP_STAGE.NO_SHOW)).toBe(true);
  });
});

describe('Chiếu tiền — không đếm trùng', () => {
  maybe('tiền cọc ĐÃ THU không bị cộng vào "đã trả tiền thuê"', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      baseAmount: '3000000',
      depositAmount: '5000000',
    });

    // Hai lần thu vào CÙNG một bảng, khác `kind`. Đọc gộp là cộng khoản cọc hai lần.
    await prisma.payment.createMany({
      data: [
        {
          id: newId(),
          tenantId,
          bookingId: bookingId!,
          amount: new Prisma.Decimal('1000000'),
          method: PAYMENT_METHOD.CASH,
          kind: PAYMENT_KIND.RENTAL,
          status: PAYMENT_STATUS.SUCCEEDED,
        },
        {
          id: newId(),
          tenantId,
          bookingId: bookingId!,
          amount: new Prisma.Decimal('5000000'),
          method: PAYMENT_METHOD.CASH,
          kind: PAYMENT_KIND.DEPOSIT,
          status: PAYMENT_STATUS.SUCCEEDED,
        },
      ],
    });

    const trip = await trips.detail(customerId, requestId);
    expect(trip.finance?.rentalPaid).toBe('1000000.00');
    expect(trip.finance?.depositReceived).toBe('5000000.00');
    expect(trip.finance?.depositRequired).toBe('5000000.00');
  });

  maybe(
    'phát sinh vào tổng đúng MỘT lần; khấu trừ cọc là cách trả, không phải khoản thu thêm',
    async () => {
      const { requestId, bookingId } = await seedTrip({
        bookingStatus: BOOKING_STATUS.COMPLETED,
        baseAmount: '3150000',
        discountAmount: '378000',
        depositAmount: '5000000',
      });
      await prisma.payment.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: bookingId!,
          amount: new Prisma.Decimal('5000000'),
          method: PAYMENT_METHOD.CASH,
          kind: PAYMENT_KIND.DEPOSIT,
          status: PAYMENT_STATUS.SUCCEEDED,
        },
      });
      await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
        category: SURCHARGE_CATEGORY.OVERTIME,
        amount: '150000',
        reason: 'Trả trễ 1.5 giờ',
      });
      await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
        category: SURCHARGE_CATEGORY.CLEANING,
        amount: '100000',
        reason: 'Vệ sinh xe',
      });

      const finance = (await trips.detail(customerId, requestId)).finance!;

      expect(finance.rentalTotal).toBe('2772000.00'); // 3.150.000 − 378.000
      expect(finance.surchargeTotal).toBe('250000.00');
      expect(finance.finalTotal).toBe('3022000.00'); // cộng phát sinh đúng một lần
      expect(finance.depositDeducted).toBe('250000.00');
      expect(finance.expectedRefund).toBe('4750000.00');
      expect(finance.additionalDue).toBe('0.00');
      expect(finance.surcharges).toHaveLength(2);
    },
  );

  maybe('phát sinh vượt cọc: khấu trừ kẹp ở số cọc, phần dư ra `additionalDue`', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      depositAmount: '500000',
    });
    await prisma.payment.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: bookingId!,
        amount: new Prisma.Decimal('500000'),
        method: PAYMENT_METHOD.CASH,
        kind: PAYMENT_KIND.DEPOSIT,
        status: PAYMENT_STATUS.SUCCEEDED,
      },
    });
    await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
      category: SURCHARGE_CATEGORY.DAMAGE,
      amount: '900000',
      reason: 'Xước cản sau',
    });

    const finance = (await trips.detail(customerId, requestId)).finance!;
    expect(finance.depositDeducted).toBe('500000.00'); // không bao giờ vượt số đã thu
    expect(finance.additionalDue).toBe('400000.00');
    expect(finance.expectedRefund).toBe('0.00');
  });

  maybe('cọc cấu hình mà CHƯA thu: không sinh việc hoàn, không dựng số 0 mập mờ', async () => {
    const { requestId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      depositAmount: '5000000',
    });
    const finance = (await trips.detail(customerId, requestId)).finance!;

    expect(finance.depositRequired).toBe('5000000.00');
    expect(finance.depositReceived).toBe('0.00');
    expect(finance.depositStatus).toBe(DEPOSIT_STATUS.NOT_RECEIVED);
    expect(finance.refundAmount).toBeNull();
  });

  maybe('đơn không yêu cầu cọc → trạng thái `none`, không có gì để hoàn', async () => {
    const { requestId } = await seedTrip({ bookingStatus: BOOKING_STATUS.COMPLETED });
    const finance = (await trips.detail(customerId, requestId)).finance!;
    expect(finance.depositStatus).toBe(DEPOSIT_STATUS.NONE);
    expect(finance.expectedRefund).toBe('0.00');
  });

  maybe('phí giao nhận: lấy số MỚI NHẤT, khách không phải duyệt gì', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.RESERVED,
      baseAmount: '1000000',
      deliveryFee: '0',
    });
    let finance = (await trips.detail(customerId, requestId)).finance!;
    expect(finance.deliveryFee).toBe('0.00');

    // Chủ xe chốt lại phí sau khi thoả thuận ngoài ứng dụng (Wave 9) — không có bước khách đồng ý.
    await prisma.booking.update({
      where: { id: bookingId! },
      data: {
        deliveryFee: new Prisma.Decimal('120000'),
        totalAmount: new Prisma.Decimal('1120000'),
      },
    });

    finance = (await trips.detail(customerId, requestId)).finance!;
    expect(finance.deliveryFee).toBe('120000.00');
    expect(finance.finalTotal).toBe('1120000.00');
  });
});

describe('Hoàn cọc — khách chỉ đọc', () => {
  maybe('số khách thấy khớp từng đồng với bản ghi chủ xe lập', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      depositAmount: '2000000',
    });
    await prisma.payment.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: bookingId!,
        amount: new Prisma.Decimal('2000000'),
        method: PAYMENT_METHOD.CASH,
        kind: PAYMENT_KIND.DEPOSIT,
        status: PAYMENT_STATUS.SUCCEEDED,
      },
    });
    await settlement.recordRefund(tenantId, bookingId!, ownerId, {
      refundAmount: '1800000',
      refundMethod: REFUND_METHOD.BANK_TRANSFER,
      reference: 'REF-92837492',
    });

    const finance = (await trips.detail(customerId, requestId)).finance!;
    expect(finance.refundAmount).toBe('1800000.00');
    expect(finance.refundMethod).toBe(REFUND_METHOD.BANK_TRANSFER);
    expect(finance.refundReference).toBe('REF-92837492');
    expect(finance.refundedAt).not.toBeNull();
    expect(finance.depositStatus).toBe(DEPOSIT_STATUS.PARTIALLY_REFUNDED);
  });

  /**
   * Wave 11.1: phát sinh im lặng, hoàn cọc thì báo. Ranh giới là "khách có việc phải làm không":
   * hoàn cọc là tiền rời tay chủ xe và khách phải đi đối chiếu tài khoản; ghi phát sinh là thao
   * tác nội bộ lặp đi lặp lại mà khách không duyệt.
   */
  maybe('CHỈ hoàn cọc báo cho khách; ghi phát sinh thì không', async () => {
    const { bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      depositAmount: '1000000',
    });
    await prisma.payment.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: bookingId!,
        amount: new Prisma.Decimal('1000000'),
        method: PAYMENT_METHOD.CASH,
        kind: PAYMENT_KIND.DEPOSIT,
        status: PAYMENT_STATUS.SUCCEEDED,
      },
    });
    await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '80000',
      reason: 'Vệ sinh xe',
    });
    await settlement.recordRefund(tenantId, bookingId!, ownerId, {
      refundAmount: '920000',
      refundMethod: REFUND_METHOD.CASH,
    });

    const sent = await prisma.notification.findMany({
      where: { userId: customerId, targetId: bookingId! },
      select: { title: true, targetType: true },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toContain('hoàn cọc');
    // Trỏ vào `booking` để link click-through của khách phân giải được thành /trips/:id.
    expect(sent[0]?.targetType).toBe('booking');
  });

  maybe('đổi phí giao nhận: audit đủ, thông báo cho khách thì KHÔNG', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.RESERVED,
      baseAmount: '1000000',
    });

    await bookings.updateDeliveryFee(tenantId, bookingId!, ownerId, {
      deliveryFee: '150000',
      note: 'Khách nhờ giao tận sân bay',
    });

    const sent = await prisma.notification.count({
      where: { userId: customerId, targetId: bookingId! },
    });
    expect(sent).toBe(0);

    const trail = await prisma.auditLog.count({
      where: { tenantId, action: 'booking.delivery_fee_update', targetId: bookingId! },
    });
    expect(trail).toBe(1);

    // Và khách vẫn thấy con số MỚI ngay lần đọc kế tiếp — im lặng không đồng nghĩa với giấu.
    const finance = (await trips.detail(customerId, requestId)).finance!;
    expect(finance.deliveryFee).toBe('150000.00');
    expect(finance.finalTotal).toBe('1150000.00');
  });

  maybe('chuyến bắt đầu và kết thúc VẪN báo cho khách', async () => {
    const { bookingId } = await seedTrip({ bookingStatus: BOOKING_STATUS.CONFIRMED });

    await bookings.transition(tenantId, bookingId!, ownerId, { status: BOOKING_STATUS.ACTIVE });
    await bookings.transition(tenantId, bookingId!, ownerId, { status: BOOKING_STATUS.COMPLETED });

    const sent = await prisma.notification.findMany({
      where: { userId: customerId, targetId: bookingId! },
      orderBy: { createdAt: 'asc' },
      select: { title: true },
    });
    expect(sent.map((row) => row.title)).toEqual([
      'Hành trình của bạn đã bắt đầu',
      'Chuyến đi đã hoàn thành',
    ]);
  });
});

describe('Không lộ dữ liệu của chủ xe', () => {
  maybe('DTO khách không mang ghi chú nội bộ, tên nhân viên hay rowVersion', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      depositAmount: '1000000',
    });
    await prisma.booking.update({
      where: { id: bookingId! },
      data: { note: 'Khách quen, ưu tiên giữ xe' },
    });
    await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
      category: SURCHARGE_CATEGORY.OTHER,
      amount: '50000',
      reason: 'Phí khác',
    });

    const trip = await trips.detail(customerId, requestId);
    const serialized = JSON.stringify(trip);

    expect(serialized).not.toContain('Khách quen'); // ghi chú NỘI BỘ của shop
    expect(serialized).not.toContain('createdByName');
    expect(serialized).not.toContain('recordedByName');
    expect(serialized).not.toContain('rowVersion');
    expect(serialized).not.toContain('odometer');
    // Còn khoản phát sinh thì vẫn phải thấy — minh bạch là lý do khối này tồn tại.
    expect(trip.finance?.surcharges[0]?.reason).toBe('Phí khác');
  });

  /**
   * Wave 11.1 — SĐT gian hàng và biển số chỉ mở khi chuyến THẬT SỰ thành quan hệ.
   *
   * Điều kiện cũ là phủ định (`chặng !== chờ duyệt`), nên một yêu cầu bị từ chối / quá hạn /
   * khách tự huỷ đều tính là đã-gắn-kết: gửi rồi tự huỷ ngay là moi được số của mọi gian hàng.
   */
  maybe('yêu cầu chưa được nhận: KHÔNG lộ SĐT gian hàng dù ở chặng nào', async () => {
    const cases = [
      { label: 'chờ duyệt', requestStatus: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL },
      { label: 'bị từ chối', requestStatus: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST },
      { label: 'quá hạn phản hồi', requestStatus: BOOKING_REQUEST_STATUS.EXPIRED },
      { label: 'khách tự huỷ', requestStatus: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER },
    ];

    // Gom thành một bảng rồi so một lần: hỏng ở chặng nào thì diff chỉ thẳng ra chặng đó.
    const seen: Record<string, { phone: string | null; plate: string | null }> = {};
    for (const { label, requestStatus } of cases) {
      const { requestId } = await seedTrip({ bookingStatus: null, requestStatus });
      const trip = await trips.detail(customerId, requestId);
      seen[label] = { phone: trip.shop.phone, plate: trip.vehicle.plateNumber };
    }

    expect(seen).toEqual({
      'chờ duyệt': { phone: null, plate: null },
      'bị từ chối': { phone: null, plate: null },
      'quá hạn phản hồi': { phone: null, plate: null },
      'khách tự huỷ': { phone: null, plate: null },
    });
  });

  maybe('đã duyệt / đã lên đơn: mở SĐT và biển số ở mọi chặng sau đó', async () => {
    const approved = await seedTrip({
      bookingStatus: null,
      requestStatus: BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
    });
    expect((await trips.detail(customerId, approved.requestId)).shop.phone).toBe('0909123456');

    // Đơn đã tồn tại thì mọi kết cục về sau vẫn giữ quyền liên hệ — kể cả chuyến bị huỷ, khách
    // vẫn cần gọi được chủ xe để xử lý nốt.
    const statuses = [
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ACTIVE,
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.CANCELLED,
    ];
    const seen: Record<string, { phone: string | null; plate: string | null }> = {};
    for (const status of statuses) {
      const { requestId } = await seedTrip({ bookingStatus: status });
      const trip = await trips.detail(customerId, requestId);
      seen[status] = { phone: trip.shop.phone, plate: trip.vehicle.plateNumber };
    }

    const visible = { phone: '0909123456', plate: '43A-123.45' };
    expect(seen).toEqual(Object.fromEntries(statuses.map((status) => [status, visible])));
  });
});

/**
 * Wave 11.1 — `Tổng thanh toán` ở danh sách và ở chi tiết phải là MỘT số.
 *
 * Trước đó danh sách đọc thẳng `bookings.total_amount` (cố ý không gồm phát sinh — Wave 10) còn
 * chi tiết cộng thêm phát sinh, nên một chuyến có phụ phí hiện hai con số khác nhau ở hai màn.
 */
describe('Tổng tiền: danh sách khớp chi tiết', () => {
  maybe('chuyến hoàn thành có phát sinh: list total === detail finalTotal', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      baseAmount: '3150000',
      discountAmount: '378000',
    });
    await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
      category: SURCHARGE_CATEGORY.OVERTIME,
      amount: '150000',
      reason: 'Trả trễ',
    });
    await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '100000',
      reason: 'Vệ sinh xe',
    });

    const detail = await trips.detail(customerId, requestId);
    const list = await trips.list(customerId, { limit: 50 });
    const row = list.data.find((item) => item.id === requestId);

    expect(detail.finance?.finalTotal).toBe('3022000.00');
    expect(row?.totalAmount).toBe(detail.finance?.finalTotal);
  });

  maybe('khoản phát sinh đã GỠ không còn nằm trong tổng ở cả hai màn', async () => {
    const { requestId, bookingId } = await seedTrip({
      bookingStatus: BOOKING_STATUS.COMPLETED,
      baseAmount: '1000000',
    });
    const added = await settlement.addSurcharge(tenantId, bookingId!, ownerId, {
      category: SURCHARGE_CATEGORY.OTHER,
      amount: '500000',
      reason: 'Ghi nhầm',
    });
    await settlement.voidSurcharge(tenantId, bookingId!, added.surcharges[0]!.id, ownerId, {
      reason: 'Huỷ khoản ghi nhầm',
    });

    const detail = await trips.detail(customerId, requestId);
    const list = await trips.list(customerId, { limit: 50 });
    const row = list.data.find((item) => item.id === requestId);

    expect(detail.finance?.finalTotal).toBe('1000000.00');
    expect(row?.totalAmount).toBe('1000000.00');
  });

  maybe('yêu cầu chưa lên đơn vẫn trả null, không phải 0', async () => {
    const { requestId } = await seedTrip({ bookingStatus: null });
    const list = await trips.list(customerId, { limit: 50 });
    expect(list.data.find((item) => item.id === requestId)?.totalAmount).toBeNull();
  });
});

describe('Đánh giá', () => {
  maybe('chỉ chuyến đã hoàn thành và chưa đánh giá mới mở nút đánh giá', async () => {
    const active = await seedTrip({ bookingStatus: BOOKING_STATUS.ACTIVE });
    const done = await seedTrip({ bookingStatus: BOOKING_STATUS.COMPLETED });

    expect((await trips.detail(customerId, active.requestId)).canReview).toBe(false);
    expect((await trips.detail(customerId, done.requestId)).canReview).toBe(true);

    await prisma.review.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId,
        bookingId: done.bookingId!,
        customerId,
        rating: 5,
        comment: 'Xe cực kỳ mới',
      },
    });

    const after = await trips.detail(customerId, done.requestId);
    expect(after.canReview).toBe(false);
    expect(after.hasReview).toBe(true);
    expect(after.review?.rating).toBe(5);
  });
});
