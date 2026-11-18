import { Prisma, createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  FEE_POLICY_STATUS,
  MEMBERSHIP_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  SYSTEM_FINANCE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { FinanceOverviewService } from '../src/modules/finance/finance-overview.service';
import { BookingPaymentWriter } from '../src/modules/payments/booking-payment.writer';
import { PaymentsService } from '../src/modules/payments/payments.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
} from './helpers/service-factory';
import { customerAccountFor } from './helpers/customer-account';

/**
 * S2 — Ghi nhận thanh toán (writer duy nhất của paid_amount), chạy trên PostgreSQL THẬT. Kiểm
 * chứng tính đúng của TIỀN: cộng dồn nguyên tử, ĐỒNG THỜI không lost-update, void trừ lại + huỷ
 * phiếu, overpay không âm công nợ.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const bookings = makeBookingsService(asService, {
  occupancy: new OccupancyService(asService),
  audit: audit,
  notifications: makeNotificationService(asService),
  customers: makeCustomersService(asService, audit),
});
const receipts = new ReceiptsService(asService, audit);
const payments = new PaymentsService(
  asService,
  audit,
  bookings,
  receipts,
  new BookingPaymentWriter(audit, receipts),
);
const overview = new FinanceOverviewService(asService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let seq = 0;

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
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ shop',
      email: `own-${ownerId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Pay',
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
      code: `XE-${vehicleId.slice(-6)}`,
      name: 'Vios',
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.receipt.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
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

/** Tạo đơn total = base; khung giờ lệch nhau để không đụng exclusion constraint giữa các test. */
async function makeBooking(base: string) {
  seq += 1;
  const start = new Date(Date.UTC(2027, 0, 1 + seq * 2, 3));
  const end = new Date(Date.UTC(2027, 0, 1 + seq * 2 + 1, 3));
  return bookings.create(tenantId, ownerId, {
    vehicleId,
    customerName: 'Khách A',
    pickupAt: start.toISOString(),
    returnAt: end.toISOString(),
    baseAmount: base,
  });
}

/**
 * Gắn vào đơn một khoản giữ chỗ ĐÃ TRẢ (đơn qua chợ) — đủ để `ownerShareHeldOnline` coi `D` đang
 * nằm ở XePrime. Trả về hàm dọn dẹp: khách, yêu cầu, chính sách phí chỉ sống trong test gọi nó.
 */
async function attachPaidHold(bookingId: string, pickupAt: Date): Promise<() => Promise<void>> {
  const run = newId().slice(-8);
  const customerId = await customerAccountFor(
    asService,
    `0914${run.slice(-6).replace(/\D/g, '2')}`,
    'Khách chợ',
  );
  const feePolicyId = newId();
  const requestId = newId();
  const holdId = newId();
  await prisma.feePolicy.create({
    data: {
      id: feePolicyId,
      version: 800 + Math.floor(Math.random() * 90),
      status: FEE_POLICY_STATUS.ARCHIVED,
      name: `Policy pay ${run}`,
      serviceFeePercent: new Prisma.Decimal(0),
    },
  });
  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId,
      vehicleId,
      customerUserId: customerId,
      customerName: 'Khách chợ',
      customerPhone: '0914000222',
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      respondBy: pickupAt,
      decidedAt: pickupAt,
      pickupAt,
      returnAt: new Date(new Date(pickupAt).getTime() + 86_400_000),
    },
  });
  await prisma.bookingHold.create({
    data: {
      id: holdId,
      code: `XPH${holdId.slice(-8)}`,
      tenantId,
      bookingRequestId: requestId,
      bookingId,
      customerUserId: customerId,
      vehicleId,
      depositRequired: true,
      status: BOOKING_HOLD_STATUS.PAID,
      amount: new Prisma.Decimal(470_000),
      paidAmount: new Prisma.Decimal(470_000),
      paidAt: pickupAt,
      freeCancelUntil: pickupAt,
      depositAmount: new Prisma.Decimal(420_000),
      serviceFeeAmount: new Prisma.Decimal(50_000),
      feePolicyId,
      allocationJson: [],
      priceSnapshotJson: {},
      scheduleJson: {},
      expiresAt: pickupAt,
    },
  });
  return async () => {
    await prisma.bookingHold.deleteMany({ where: { id: holdId } });
    await prisma.bookingRequest.deleteMany({ where: { id: requestId } });
    await prisma.feePolicy.deleteMany({ where: { id: feePolicyId } });
    await prisma.user.deleteMany({ where: { id: customerId } });
  };
}

describe('Payments — thu tiền đơn (S2)', () => {
  maybe('ghi thu → paidAmount tăng, debt giảm, auto-tạo phiếu thu đã duyệt', async () => {
    const b = await makeBooking('1000000');
    expect(String(b.debtAmount)).toBe('1000000');

    const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '400000',
      method: PAYMENT_METHOD.CASH,
    });
    // Gọi service trực tiếp → tiền là Decimal (ResponseInterceptor chỉ stringify ở HTTP).
    expect(String(after.paidAmount)).toBe('400000');
    expect(String(after.debtAmount)).toBe('600000');

    const receipts = await prisma.receipt.findMany({ where: { bookingId: b.id } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.type).toBe('income');
    expect(receipts[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
  });

  maybe('2 lần thu ĐỒNG THỜI → paidAmount = tổng (không lost-update)', async () => {
    const b = await makeBooking('1000000');
    await Promise.all([
      payments.recordForBooking(tenantId, ownerId, b.id, {
        amount: '300000',
        method: PAYMENT_METHOD.CASH,
      }),
      payments.recordForBooking(tenantId, ownerId, b.id, {
        amount: '250000',
        method: PAYMENT_METHOD.BANK_TRANSFER,
      }),
    ]);
    const fresh = await prisma.booking.findUniqueOrThrow({
      where: { id: b.id },
      select: { paidAmount: true },
    });
    expect(fresh.paidAmount.toString()).toBe('550000');
  });

  maybe('void → paidAmount trừ lại + phiếu thu liên kết bị huỷ; void lần 2 → 409', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '500000',
      method: PAYMENT_METHOD.CASH,
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });

    const voided = await payments.voidPayment(tenantId, ownerId, payment.id);
    expect(voided.status).toBe(PAYMENT_STATUS.REFUNDED);

    const fresh = await prisma.booking.findUniqueOrThrow({
      where: { id: b.id },
      select: { paidAmount: true },
    });
    expect(fresh.paidAmount.toString()).toBe('0');
    const receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: payment.receiptId! } });
    expect(receipt.status).toBe(RECEIPT_STATUS.CANCELLED);

    await expect(payments.voidPayment(tenantId, ownerId, payment.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('thu quá số còn phải thu → 409 PAYMENT_EXCEEDS_DUE, không ghi gì', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '400000',
      method: PAYMENT_METHOD.CASH,
    });
    // Còn 600k: thu 600.001 là vượt; đúng 600k thì được.
    await expect(
      payments.recordForBooking(tenantId, ownerId, b.id, {
        amount: '600001',
        method: PAYMENT_METHOD.CASH,
      }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PAYMENT_EXCEEDS_DUE, details: { counterDueAmount: '600000' } },
    });
    expect(await prisma.receipt.count({ where: { bookingId: b.id } })).toBe(1);
    const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '600000',
      method: PAYMENT_METHOD.CASH,
    });
    expect(String(after.paidAmount)).toBe('1000000');
    expect(String(after.debtAmount)).toBe('0');
  });

  maybe('đơn qua chợ: trần tiền thuê trừ phần D khách đã trả trước qua XePrime', async () => {
    const b = await makeBooking('1400000');
    // Đơn qua chợ: hold đã trả + snapshot giữ `D` = 420k (phần tiền thuê của chủ xe trong khoản online).
    await prisma.booking.update({
      where: { id: b.id },
      data: { priceSnapshot: { fees: { depositAmount: '420000', lines: [] } } },
    });
    const cleanup = await attachPaidHold(b.id, b.pickupAt as unknown as Date);
    try {
      await expect(
        payments.recordForBooking(tenantId, ownerId, b.id, {
          amount: '1400000',
          method: PAYMENT_METHOD.CASH,
        }),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.PAYMENT_EXCEEDS_DUE, details: { counterDueAmount: '980000' } },
      });
      const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
        amount: '980000',
        method: PAYMENT_METHOD.CASH,
      });
      expect(String(after.counterDueAmount)).toBe('0');
    } finally {
      await cleanup();
    }
  });

  maybe('lịch sử thu tiền của đơn', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '100000',
      method: PAYMENT_METHOD.CASH,
    });
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '200000',
      method: PAYMENT_METHOD.QR,
    });
    const history = await payments.listForBooking(tenantId, b.id);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.amount).sort()).toEqual(['100000', '200000']);
  });

  maybe('công nợ: đơn trả đủ KHÔNG nằm trong danh sách; đơn còn nợ CÓ', async () => {
    const paid = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, paid.id, {
      amount: '1000000',
      method: PAYMENT_METHOD.CASH,
    });
    const owing = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, owing.id, {
      amount: '300000',
      method: PAYMENT_METHOD.CASH,
    });

    const res = await overview.debts(tenantId, { limit: 100 }, null);
    const ids = res.data.map((d) => d.bookingId);
    expect(ids).toContain(owing.id);
    expect(ids).not.toContain(paid.id);
    const owingRow = res.data.find((d) => d.bookingId === owing.id)!;
    expect(owingRow.debtAmount).toBe('700000');
  });

  maybe('công nợ: ô tìm kiếm chạm mã đơn, tên khách, SĐT, tên xe và biển số', async () => {
    const target = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, target.id, {
      amount: '100000',
      method: PAYMENT_METHOD.CASH,
    });

    // Mã đơn là chuỗi người thu nợ hay cầm nhất — tìm phải ra ĐÚNG một đơn, không phải cả trang.
    const byCode = await overview.debts(tenantId, { q: target.code, limit: 100 }, null);
    expect(byCode.data.map((d) => d.bookingId)).toEqual([target.id]);

    // Tên xe nằm ở bảng khác: nếu câu đếm quên join `vehicles` thì `total` sẽ to hơn số dòng.
    const byVehicle = await overview.debts(tenantId, { q: 'Vios', limit: 100 }, null);
    expect(byVehicle.data.length).toBeGreaterThan(0);
    expect(byVehicle.meta.total).toBe(byVehicle.data.length);

    // Không khớp gì → rỗng THẬT, cả dòng lẫn tổng.
    const none = await overview.debts(tenantId, { q: 'khong-ton-tai-xyz', limit: 100 }, null);
    expect(none.data).toHaveLength(0);
    expect(none.meta.total).toBe(0);
  });

  maybe('công nợ: tìm kiếm KHÔNG vượt ra khỏi gian hàng của mình', async () => {
    const mine = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, mine.id, {
      amount: '1000',
      method: PAYMENT_METHOD.CASH,
    });

    // `tenantId` khác → cùng từ khoá nhưng không được thấy đơn của shop bên kia.
    const theirs = await overview.debts(newId(), { q: mine.code, limit: 100 }, null);
    expect(theirs.data).toHaveLength(0);
  });

  maybe('công nợ: đơn ĐÃ HOÀN THÀNH mà qua hạn vẫn là nợ quá hạn; chip khớp danh sách', async () => {
    const done = await makeBooking('800000');
    await payments.recordForBooking(tenantId, ownerId, done.id, {
      amount: '300000',
      method: PAYMENT_METHOD.CASH,
    });
    // Chuyến đã trả xe từ tuần trước mà còn nợ 500k — khoản phải đòi rõ nhất.
    await prisma.booking.update({
      where: { id: done.id },
      data: {
        status: BOOKING_STATUS.COMPLETED,
        pickupAt: new Date(Date.now() - 9 * 86_400_000),
        returnAt: new Date(Date.now() - 7 * 86_400_000),
      },
    });

    const overdue = await overview.debts(tenantId, { filter: 'overdue', limit: 100 }, null);
    expect(overdue.data.map((d) => d.bookingId)).toContain(done.id);

    // Số trên chip/thẻ là số của TỪNG nhóm dưới cùng phạm vi — và mở nhóm ra phải đúng bấy nhiêu dòng.
    const summary = await overview.debtSummary(tenantId, {}, null);
    const all = await overview.debts(tenantId, { limit: 100 }, null);
    const upcoming = await overview.debts(tenantId, { filter: 'upcoming', limit: 100 }, null);
    const unpaid = await overview.debts(tenantId, { filter: 'unpaid', limit: 100 }, null);
    expect(summary.totalCount).toBe(all.meta.total);
    expect(summary.overdueCount).toBe(overdue.meta.total);
    expect(summary.upcomingCount).toBe(upcoming.meta.total);
    expect(summary.unpaidCount).toBe(unpaid.meta.total);
    expect(summary.overdueCount + summary.withinTermCount).toBe(summary.totalCount);

    // Tổng tiền của thẻ = tổng cột "Còn nợ" (Decimal, không qua float).
    const sumOf = (rows: { debtAmount: string }[]) =>
      rows.reduce((acc, r) => acc.plus(r.debtAmount), new Prisma.Decimal(0)).toString();
    expect(summary.totalAmount).toBe(sumOf(all.data));
    expect(summary.overdueAmount).toBe(sumOf(overdue.data));
  });

  maybe('công nợ: lọc trạng thái đơn và sắp xếp nợ nhiều nhất', async () => {
    const small = await makeBooking('200000');
    const big = await makeBooking('9000000');

    const byStatus = await overview.debts(
      tenantId,
      { status: BOOKING_STATUS.COMPLETED, limit: 100 },
      null,
    );
    expect(byStatus.data.every((d) => d.status === BOOKING_STATUS.COMPLETED)).toBe(true);
    expect(byStatus.data.map((d) => d.bookingId)).not.toContain(small.id);

    const byDebt = await overview.debts(tenantId, { sort: 'debt', limit: 100 }, null);
    const order = byDebt.data.map((d) => d.bookingId);
    expect(order.indexOf(big.id)).toBeLessThan(order.indexOf(small.id));
    const amounts = byDebt.data.map((d) => new Prisma.Decimal(d.debtAmount));
    for (let i = 1; i < amounts.length; i += 1) {
      expect(amounts[i - 1]!.greaterThanOrEqualTo(amounts[i]!)).toBe(true);
    }
    expect(byDebt.data.find((d) => d.bookingId === big.id)?.plateNumber).not.toBeUndefined();
  });

  maybe('công nợ: tổng hợp KHÔNG vượt ra khỏi gian hàng của mình', async () => {
    const theirs = await overview.debtSummary(newId(), {}, null);
    expect(theirs).toMatchObject({ totalAmount: '0', totalCount: 0, customerCount: 0 });
  });

  maybe('dashboard summary: cân đối = tổng thu − tổng chi', async () => {
    const s = await overview.summary(tenantId, {}, null);
    expect(Number(s.balance)).toBe(Number(s.totalIncome) - Number(s.totalExpense));
    expect(Number(s.totalDebt)).toBeGreaterThanOrEqual(0);
    expect(s.debtBookings).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Ranh giới CỌC ↔ TIỀN THUÊ (epic nối tiền).
 *
 * Trước epic này `payments.kind` có cột nhưng không đường ghi nào set `deposit`, nên
 * `depositReceived` của quyết toán vĩnh viễn bằng 0 và cả máy hoàn cọc chạy không tải. Nhóm test
 * này khoá đúng cái ranh giới đó, và khoá luôn hai chiều: ghi và huỷ.
 */
describe('Payments — cọc không phải doanh thu', () => {
  maybe('thu cọc KHÔNG cộng vào paidAmount và KHÔNG làm giảm công nợ', async () => {
    const b = await makeBooking('1000000');
    const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '500000',
      method: PAYMENT_METHOD.CASH,
      kind: PAYMENT_KIND.DEPOSIT,
    });
    // Cọc là tài sản giữ hộ: khách vẫn nợ trọn tiền thuê.
    expect(String(after.paidAmount)).toBe('0');
    expect(String(after.debtAmount)).toBe('1000000');
  });

  maybe('thu cọc vẫn LÊN SỔ: phiếu thu đã duyệt, nguồn deposit, danh mục "Tiền cọc"', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '500000',
      method: PAYMENT_METHOD.BANK_TRANSFER,
      kind: PAYMENT_KIND.DEPOSIT,
    });
    const receipt = await prisma.receipt.findFirstOrThrow({
      where: { tenantId, bookingId: b.id, source: RECEIPT_SOURCE.DEPOSIT },
      select: {
        status: true,
        amount: true,
        sourceRefId: true,
        category: { select: { systemKey: true } },
      },
    });
    expect(receipt.status).toBe(RECEIPT_STATUS.APPROVED);
    expect(receipt.amount.toString()).toBe('500000');
    expect(receipt.category?.systemKey).toBe(SYSTEM_FINANCE_CATEGORY.DEPOSIT);
    // `sourceRefId` phải trỏ về đúng giao dịch — đó là đường lần ngược từ sổ về nghiệp vụ.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: b.id, kind: PAYMENT_KIND.DEPOSIT },
      select: { id: true },
    });
    expect(receipt.sourceRefId).toBe(payment.id);
  });

  maybe('thu tiền thuê vẫn giữ nguyên hành vi cũ + gắn danh mục "Thanh toán đơn"', async () => {
    const b = await makeBooking('1000000');
    const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '400000',
      method: PAYMENT_METHOD.CASH,
    });
    expect(String(after.paidAmount)).toBe('400000');
    expect(String(after.debtAmount)).toBe('600000');
    const receipt = await prisma.receipt.findFirstOrThrow({
      where: { tenantId, bookingId: b.id, source: RECEIPT_SOURCE.PAYMENT },
      select: { category: { select: { systemKey: true } } },
    });
    expect(receipt.category?.systemKey).toBe(SYSTEM_FINANCE_CATEGORY.BOOKING_PAYMENT);
  });

  maybe('huỷ giao dịch CỌC không trừ paidAmount — nếu trừ, công nợ phình từ hư không', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '300000',
      method: PAYMENT_METHOD.CASH,
    });
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '500000',
      method: PAYMENT_METHOD.CASH,
      kind: PAYMENT_KIND.DEPOSIT,
    });
    const deposit = await prisma.payment.findFirstOrThrow({
      where: { bookingId: b.id, kind: PAYMENT_KIND.DEPOSIT },
      select: { id: true },
    });

    await payments.voidPayment(tenantId, ownerId, deposit.id);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: b.id },
      select: { paidAmount: true },
    });
    // Chỉ 300k tiền thuê từng được cộng vào, nên sau khi huỷ cọc nó phải còn nguyên 300k.
    expect(booking.paidAmount.toString()).toBe('300000');
  });

  maybe('phiếu tự động KHÔNG huỷ trực tiếp được — phải đảo ở nghiệp vụ gốc', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '100000',
      method: PAYMENT_METHOD.CASH,
    });
    const receipt = await prisma.receipt.findFirstOrThrow({
      where: { tenantId, bookingId: b.id, source: RECEIPT_SOURCE.PAYMENT },
      select: { id: true },
    });
    const receipts = new ReceiptsService(asService, audit);
    await expect(receipts.cancel(tenantId, ownerId, receipt.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.RECEIPT_SOURCE_LOCKED },
    });
  });
});

/**
 * MỘT con số phải-thu cho một đơn (`common/booking-money.ts`).
 *
 * Tình huống thật đã gặp: đơn thu 720k tiền thuê qua nút "Thu tiền", rồi 200k quá giờ ghi bằng
 * phiếu tay ở sổ. Trước đây màn đơn nói "đã thu 720k" còn sổ nói 920k, và phụ phí CHƯA thu thì
 * `/manage/debts` báo 0 — gian hàng mất tiền không có gì báo.
 */
describe('Booking money — phụ phí và phiếu tay vào cùng một con số', () => {
  maybe('phiếu thu TAY gắn đơn được tính là đã thu của đơn', async () => {
    const b = await makeBooking('720000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '720000',
      method: PAYMENT_METHOD.CASH,
    });

    const receipts = new ReceiptsService(asService, audit);
    await receipts.create(
      tenantId,
      ownerId,
      {
        type: RECEIPT_TYPE.INCOME,
        amount: '200000',
        paymentMethod: PAYMENT_METHOD.CASH,
        bookingId: b.id,
      },
      null,
    );

    // Phiếu CHƯA duyệt thì chưa phải tiền thật.
    let after = await bookings.getOne(tenantId, b.id);
    expect(String(after.collectedAmount)).toBe('720000');

    const pending = await prisma.receipt.findFirstOrThrow({
      where: { tenantId, bookingId: b.id, source: RECEIPT_SOURCE.MANUAL },
      select: { id: true },
    });
    await receipts.approve(tenantId, ownerId, pending.id);

    after = await bookings.getOne(tenantId, b.id);
    expect(String(after.otherCollected)).toBe('200000');
    expect(String(after.collectedAmount)).toBe('920000');
    // `paidAmount` vẫn CHỈ là tiền qua PaymentsService — writer duy nhất không đổi.
    expect(String(after.paidAmount)).toBe('720000');
  });

  maybe('phụ phí chưa thu → đơn CÒN NỢ và lọt vào danh sách công nợ', async () => {
    const b = await makeBooking('500000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '500000',
      method: PAYMENT_METHOD.CASH,
    });
    let after = await bookings.getOne(tenantId, b.id);
    expect(String(after.debtAmount)).toBe('0');

    await prisma.bookingSurcharge.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: b.id,
        category: 'overtime',
        amount: '150000',
        reason: 'Trả trễ 3 tiếng',
        createdBy: ownerId,
      },
    });

    after = await bookings.getOne(tenantId, b.id);
    expect(String(after.surchargeTotal)).toBe('150000');
    expect(String(after.amountDue)).toBe('650000');
    expect(String(after.debtAmount)).toBe('150000');

    const debts = await overview.debts(tenantId, { limit: 100 }, null);
    const row = debts.data.find((d) => d.bookingId === b.id);
    expect(row?.debtAmount).toBe('150000');
    expect(row?.surchargeTotal).toBe('150000');
  });

  maybe('cọc ĐÃ THU gánh phụ phí — không đòi khách lần thứ hai', async () => {
    const b = await makeBooking('400000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '400000',
      method: PAYMENT_METHOD.CASH,
    });
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '2000000',
      method: PAYMENT_METHOD.CASH,
      kind: PAYMENT_KIND.DEPOSIT,
    });
    await prisma.bookingSurcharge.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: b.id,
        category: 'cleaning',
        amount: '300000',
        reason: 'Vệ sinh nội thất',
        createdBy: ownerId,
      },
    });

    const after = await bookings.getOne(tenantId, b.id);
    // Phụ phí 300k nằm trong tầm cọc 2tr ⇒ quyết toán đã trừ vào tiền hoàn, nên KHÔNG thành nợ.
    // Cộng thẳng phụ phí vào công nợ mà quên chỗ này là bắt khách trả hai lần.
    expect(String(after.amountDue)).toBe('700000');
    expect(String(after.collectedAmount)).toBe('700000');
    expect(String(after.debtAmount)).toBe('0');
  });
});

/**
 * 09/11/2026 — đơn huỷ / khách không đến là chuyến KHÔNG diễn ra (đơn đang chạy không huỷ được,
 * ADR 0045 điều 1): không nhận tiền thuê hay cọc mới, không nằm trong công nợ. Hoàn lại phần đã
 * thu thì vẫn mở.
 */
describe('Payments — đơn huỷ / khách không đến', () => {
  async function closeBooking(id: string, status: string) {
    await prisma.booking.update({ where: { id }, data: { status } });
  }

  maybe('đơn HUỶ: từ chối thu tiền thuê, không sinh payment hay phiếu thu', async () => {
    const b = await makeBooking('1000000');
    await closeBooking(b.id, BOOKING_STATUS.CANCELLED);

    await expect(
      payments.recordForBooking(tenantId, ownerId, b.id, {
        amount: '400000',
        method: PAYMENT_METHOD.CASH,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.BOOKING_MONEY_CLOSED },
    });

    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(0);
    expect(await prisma.receipt.count({ where: { bookingId: b.id } })).toBe(0);
    const fresh = await prisma.booking.findUniqueOrThrow({
      where: { id: b.id },
      select: { paidAmount: true },
    });
    expect(fresh.paidAmount.toString()).toBe('0');
  });

  maybe('đơn KHÁCH KHÔNG ĐẾN: từ chối cả thu cọc', async () => {
    const b = await makeBooking('1000000');
    await closeBooking(b.id, BOOKING_STATUS.NO_SHOW);

    await expect(
      payments.recordForBooking(tenantId, ownerId, b.id, {
        amount: '2000000',
        method: PAYMENT_METHOD.CASH,
        kind: PAYMENT_KIND.DEPOSIT,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.BOOKING_MONEY_CLOSED } });
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(0);
  });

  maybe('đơn HOÀN TẤT vẫn thu nốt được — chỉ chuyến không diễn ra mới bị khoá', async () => {
    const b = await makeBooking('1000000');
    await closeBooking(b.id, BOOKING_STATUS.COMPLETED);
    const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '1000000',
      method: PAYMENT_METHOD.CASH,
    });
    expect(String(after.debtAmount)).toBe('0');
  });

  maybe('đã thu rồi mới huỷ: HOÀN (huỷ giao dịch) vẫn làm được', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '300000',
      method: PAYMENT_METHOD.CASH,
    });
    await closeBooking(b.id, BOOKING_STATUS.CANCELLED);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });

    const voided = await payments.voidPayment(tenantId, ownerId, payment.id);
    expect(voided.status).toBe(PAYMENT_STATUS.REFUNDED);
  });

  maybe('lượt huỷ đang chạy giữ dòng đơn: lượt thu song song chờ rồi bị từ chối', async () => {
    const b = await makeBooking('1000000');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    // Lượt huỷ: đổi trạng thái rồi GIỮ transaction mở cho tới khi lượt thu đã xếp hàng chờ khoá.
    const cancelling = prisma.$transaction(
      async (tx) => {
        await tx.booking.update({
          where: { id: b.id },
          data: { status: BOOKING_STATUS.CANCELLED },
        });
        locked();
        await gate;
      },
      { timeout: 15_000 },
    );
    await lockTaken;

    const recording = payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '400000',
      method: PAYMENT_METHOD.CASH,
    });
    const settled = recording.then(
      () => 'recorded',
      (err: unknown) => err,
    );
    // Cho lượt thu kịp chạm `FOR UPDATE` trước khi lượt huỷ commit.
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await cancelling;

    await expect(settled).resolves.toMatchObject({
      response: { code: API_ERROR_CODE.BOOKING_MONEY_CLOSED },
    });
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(0);
  });

  maybe('đơn KHÁCH KHÔNG ĐẾN rời công nợ: danh sách, tổng hợp và sổ khách', async () => {
    const owing = await makeBooking('1000000');
    const before = await overview.debtSummary(tenantId, {}, null);
    expect(
      (await overview.debts(tenantId, { limit: 100 }, null)).data.map((d) => d.bookingId),
    ).toContain(owing.id);

    await closeBooking(owing.id, BOOKING_STATUS.NO_SHOW);

    const ids = (await overview.debts(tenantId, { limit: 100 }, null)).data.map((d) => d.bookingId);
    expect(ids).not.toContain(owing.id);
    const after = await overview.debtSummary(tenantId, {}, null);
    expect(after.totalCount).toBe(before.totalCount - 1);
    expect(new Prisma.Decimal(before.totalAmount).minus(after.totalAmount).toString()).toBe(
      '1000000',
    );
  });
});
