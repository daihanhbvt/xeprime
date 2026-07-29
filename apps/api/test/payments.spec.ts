import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RECEIPT_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
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
