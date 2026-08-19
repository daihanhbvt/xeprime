import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RECEIPT_SOURCE,
  RECEIPT_TYPE,
  RECEIPT_STATUS,
  SYSTEM_FINANCE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { FinanceOverviewService } from '../src/modules/finance/finance-overview.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * S2 — Ghi nhận thanh toán (writer duy nhất của paid_amount), chạy trên PostgreSQL THẬT. Kiểm
 * chứng tính đúng của TIỀN: cộng dồn nguyên tử, ĐỒNG THỜI không lost-update, void trừ lại + huỷ
 * phiếu, overpay không âm công nợ.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const bookings = new BookingsService(
  asService,
  new OccupancyService(asService),
  audit,
  new NotificationService(asService),
  new DriversService(asService, audit),
  new CustomersService(asService, audit),
);
const payments = new PaymentsService(asService, audit, bookings, new ReceiptsService(asService, audit));
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
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
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
    data: { id: vehicleId, tenantId, code: `XE-${vehicleId.slice(-6)}`, name: 'Vios', vehicleType: VEHICLE_TYPE.CAR },
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
      payments.recordForBooking(tenantId, ownerId, b.id, { amount: '300000', method: PAYMENT_METHOD.CASH }),
      payments.recordForBooking(tenantId, ownerId, b.id, { amount: '250000', method: PAYMENT_METHOD.BANK_TRANSFER }),
    ]);
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: b.id }, select: { paidAmount: true } });
    expect(fresh.paidAmount.toString()).toBe('550000');
  });

  maybe('void → paidAmount trừ lại + phiếu thu liên kết bị huỷ; void lần 2 → 409', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, { amount: '500000', method: PAYMENT_METHOD.CASH });
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });

    const voided = await payments.voidPayment(tenantId, ownerId, payment.id);
    expect(voided.status).toBe(PAYMENT_STATUS.REFUNDED);

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: b.id }, select: { paidAmount: true } });
    expect(fresh.paidAmount.toString()).toBe('0');
    const receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: payment.receiptId! } });
    expect(receipt.status).toBe(RECEIPT_STATUS.CANCELLED);

    await expect(payments.voidPayment(tenantId, ownerId, payment.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('thu quá tay → công nợ = 0, không âm', async () => {
    const b = await makeBooking('1000000');
    const after = await payments.recordForBooking(tenantId, ownerId, b.id, {
      amount: '1500000',
      method: PAYMENT_METHOD.CASH,
    });
    expect(String(after.paidAmount)).toBe('1500000');
    expect(String(after.debtAmount)).toBe('0');
  });

  maybe('lịch sử thu tiền của đơn', async () => {
    const b = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, b.id, { amount: '100000', method: PAYMENT_METHOD.CASH });
    await payments.recordForBooking(tenantId, ownerId, b.id, { amount: '200000', method: PAYMENT_METHOD.QR });
    const history = await payments.listForBooking(tenantId, b.id);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.amount).sort()).toEqual(['100000', '200000']);
  });

  maybe('công nợ: đơn trả đủ KHÔNG nằm trong danh sách; đơn còn nợ CÓ', async () => {
    const paid = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, paid.id, { amount: '1000000', method: PAYMENT_METHOD.CASH });
    const owing = await makeBooking('1000000');
    await payments.recordForBooking(tenantId, ownerId, owing.id, { amount: '300000', method: PAYMENT_METHOD.CASH });

    const res = await overview.debts(tenantId, { limit: 100 });
    const ids = res.data.map((d) => d.bookingId);
    expect(ids).toContain(owing.id);
    expect(ids).not.toContain(paid.id);
    const owingRow = res.data.find((d) => d.bookingId === owing.id)!;
    expect(owingRow.debtAmount).toBe('700000');
  });

  maybe('dashboard summary: cân đối = tổng thu − tổng chi', async () => {
    const s = await overview.summary(tenantId, {});
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
      select: { status: true, amount: true, sourceRefId: true, category: { select: { systemKey: true } } },
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
    await receipts.create(tenantId, ownerId, {
      type: RECEIPT_TYPE.INCOME,
      amount: '200000',
      paymentMethod: PAYMENT_METHOD.CASH,
      bookingId: b.id,
    });

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

    const debts = await overview.debts(tenantId, { limit: 100 });
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
