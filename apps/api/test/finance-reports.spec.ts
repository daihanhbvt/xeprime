import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RECEIPT_SOURCE,
  RECEIPT_SOURCE_GROUP,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  REFUND_METHOD,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { FinanceOverviewService } from '../src/modules/finance/finance-overview.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Báo cáo doanh thu `/manage/finance` — chạy trên PostgreSQL THẬT vì mọi phép tính ở đây là SQL
 * (`date_trunc`, `generate_series`, `FILTER`, window function) mà không mock nào kiểm được.
 *
 * Điều được kiểm là những chỗ dễ SAI MÀ VẪN CHẠY: cọc lọt vào doanh thu, bucket rơi sai ngày vì
 * gộp theo UTC, ngày rỗng biến mất khỏi biểu đồ, chi phí chung không gắn xe bốc hơi, và thẻ tổng
 * không khớp danh sách mà chính nó dẫn tới.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const overview = new FinanceOverviewService(asService);
const receiptsService = new ReceiptsService(asService, new AuditService(asService));

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleAId: string;
let vehicleBId: string;

/** Kỳ thử nằm hẳn trong tương lai để không đụng dữ liệu seed của database dev. */
const FROM = '2027-03-01';
const TO = '2027-03-31';

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
  vehicleAId = newId();
  vehicleBId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `rep-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Báo cáo',
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
  for (const [id, name] of [
    [vehicleAId, 'Vios'],
    [vehicleBId, 'Xpander'],
  ] as const) {
    await prisma.vehicle.create({
      data: {
        id,
        tenantId,
        code: `XE-${id.slice(-6)}`,
        name,
        plateNumber: `51A-${id.slice(-5)}`,
        vehicleType: VEHICLE_TYPE.CAR,
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.bookingDepositSettlement.deleteMany({ where: { tenantId } });
    await prisma.receipt.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
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

/** Xoá sạch tiền của tenant giữa các test — mỗi test tự dựng đúng dữ liệu nó cần. */
async function resetMoney() {
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.bookingDepositSettlement.deleteMany({ where: { tenantId } });
  await prisma.receipt.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
}

interface ReceiptSeed {
  type: string;
  amount: string;
  tenantCustomerId?: string;
  bookingId?: string;
  /** Mốc tiền di chuyển. Nhận `Date` để test múi giờ đặt được đúng 05:00 giờ VN. */
  occurredAt: Date;
  source?: string;
  vehicleId?: string;
  categoryId?: string | null;
  status?: string;
}

async function seedReceipt(seed: ReceiptSeed) {
  const source = seed.source ?? RECEIPT_SOURCE.MANUAL;
  return prisma.receipt.create({
    data: {
      id: newId(),
      tenantId,
      type: seed.type,
      amount: seed.amount,
      paymentMethod: PAYMENT_METHOD.CASH,
      status: seed.status ?? RECEIPT_STATUS.APPROVED,
      source,
      // CHECK ở DB: phiếu tự động BẮT BUỘC có nguồn gốc, phiếu tay thì cấm.
      sourceRefId: source === RECEIPT_SOURCE.MANUAL ? null : newId(),
      occurredAt: seed.occurredAt,
      vehicleId: seed.vehicleId ?? null,
      tenantCustomerId: seed.tenantCustomerId ?? null,
      bookingId: seed.bookingId ?? null,
      categoryId: seed.categoryId ?? null,
    },
  });
}

let bookingSeq = 0;

async function seedBooking(opts: {
  vehicleId: string;
  pickupAt: Date;
  total?: string;
  tenantCustomerId?: string;
}) {
  bookingSeq += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId: opts.vehicleId,
      code: `BK-${bookingSeq}-${id.slice(-6)}`,
      customerName: 'Khách A',
      status: BOOKING_STATUS.COMPLETED,
      pickupAt: opts.pickupAt,
      returnAt: new Date(opts.pickupAt.getTime() + 86_400_000),
      baseAmount: opts.total ?? '0',
      totalAmount: opts.total ?? '0',
      paidAmount: opts.total ?? '0',
      tenantCustomerId: opts.tenantCustomerId ?? null,
    },
  });
  return id;
}

let customerSeq = 0;

/**
 * Khách của gian hàng — chỉ đủ cột bắt buộc; test này không nói gì về sổ khách.
 *
 * `normalized_phone` có CHECK `^84[0-9]{8,12}$` ở DB: SĐT đã chuẩn hoá luôn mang mã quốc gia.
 * Dựng chuỗi tuỳ tiện ở đây sẽ đỏ ngay, và đó là điều đúng — ràng buộc đó có thật trong sản phẩm.
 */
async function seedCustomer(fullName: string) {
  customerSeq += 1;
  const id = newId();
  const suffix = String(customerSeq).padStart(9, '0');
  await prisma.tenantCustomer.create({
    data: {
      id,
      tenantId,
      fullName,
      phone: `0${suffix}`,
      normalizedPhone: `84${suffix}`,
    },
  });
  return id;
}

/** 00:00 giờ Việt Nam của một ngày lịch — UTC+7 cố định, không DST. */
const vnAt = (dateKey: string, hour: number) =>
  new Date(`${dateKey}T00:00:00.000Z`).getTime() - 7 * 3_600_000 + hour * 3_600_000;

describe('Báo cáo tài chính — /finance/summary', () => {
  maybe('cọc KHÔNG vào doanh thu nhưng CÓ vào dòng tiền quỹ', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '1000000',
      occurredAt: new Date(vnAt('2027-03-10', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '500000',
      source: RECEIPT_SOURCE.DEPOSIT,
      occurredAt: new Date(vnAt('2027-03-10', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.EXPENSE,
      amount: '200000',
      occurredAt: new Date(vnAt('2027-03-11', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.EXPENSE,
      amount: '500000',
      source: RECEIPT_SOURCE.DEPOSIT_REFUND,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const s = await overview.summary(tenantId, { from: FROM, to: TO });

    // Dòng tiền quỹ: mọi đồng có di chuyển thật.
    expect(s.totalIncome).toBe('1500000');
    expect(s.totalExpense).toBe('700000');
    expect(s.balance).toBe('800000');
    // Kết quả kinh doanh: cọc vào và cọc ra biến mất khỏi cả hai vế (ADR 0013 §3).
    expect(s.revenue).toBe('1000000');
    expect(s.cost).toBe('200000');
    expect(s.profit).toBe('800000');
    expect(s.profitMarginPercent).toBe(80);
  });

  maybe('phiếu CHƯA DUYỆT không được tính vào bất kỳ con số nào', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '900000',
      status: RECEIPT_STATUS.PENDING_APPROVAL,
      occurredAt: new Date(vnAt('2027-03-10', 9)),
    });

    const s = await overview.summary(tenantId, { from: FROM, to: TO });
    expect(s.totalIncome).toBe('0');
    expect(s.revenue).toBe('0');
  });

  maybe('chưa có doanh thu ⇒ biên lợi nhuận là null, KHÔNG phải 0', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.EXPENSE,
      amount: '300000',
      occurredAt: new Date(vnAt('2027-03-10', 9)),
    });

    const s = await overview.summary(tenantId, { from: FROM, to: TO });
    expect(s.revenue).toBe('0');
    expect(s.profit).toBe('-300000');
    expect(s.profitMarginPercent).toBeNull();
  });

  maybe('cọc đang giữ = đã thu − đã hoàn, kẹp sàn TỪNG ĐƠN', async () => {
    await resetMoney();
    const withDeposit = await seedBooking({
      vehicleId: vehicleAId,
      pickupAt: new Date(vnAt('2027-03-05', 8)),
    });
    const overRefunded = await seedBooking({
      vehicleId: vehicleBId,
      pickupAt: new Date(vnAt('2027-03-06', 8)),
    });

    // Đơn 1: cọc 3tr còn hiệu lực. Đơn 2: cọc 1tr đã bị HUỶ GIAO DỊCH sau khi ghi hoàn cọc —
    // bản ghi hoàn cọc giữ số 1tr đã chụp lúc đó, còn tiền sống thì không còn.
    for (const [bookingId, amount, status] of [
      [withDeposit, '3000000', PAYMENT_STATUS.SUCCEEDED],
      [overRefunded, '1000000', PAYMENT_STATUS.REFUNDED],
    ] as const) {
      await prisma.payment.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          amount,
          method: PAYMENT_METHOD.CASH,
          kind: PAYMENT_KIND.DEPOSIT,
          status,
        },
      });
    }
    // Đơn 1 hoàn một phần → còn giữ 1tr. Đơn 2 ra số ÂM nếu không kẹp sàn từng đơn, và số âm đó
    // sẽ ăn mất đúng 1tr của đơn 1 — thành "đang giữ 0đ" trong khi tay vẫn cầm tiền của khách.
    for (const [bookingId, snapshot, refund] of [
      [withDeposit, '3000000', '2000000'],
      [overRefunded, '1000000', '1000000'],
    ] as const) {
      await prisma.bookingDepositSettlement.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          depositReceived: snapshot,
          surchargeTotal: '0',
          refundAmount: refund,
          refundMethod: REFUND_METHOD.CASH,
          refundedAt: new Date(vnAt('2027-03-20', 9)),
        },
      });
    }

    const s = await overview.summary(tenantId, { from: FROM, to: TO });
    expect(s.depositHeld).toBe('1000000');
    expect(s.depositHeldBookings).toBe(1);
  });

  maybe('thẻ Doanh thu khớp TỪNG ĐỒNG với sổ mà nó dẫn tới (sourceGroup=business)', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '700000',
      occurredAt: new Date(vnAt('2027-03-14', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '250000',
      source: RECEIPT_SOURCE.DEPOSIT,
      occurredAt: new Date(vnAt('2027-03-14', 9)),
    });

    const card = await overview.summary(tenantId, { from: FROM, to: TO });
    const ledger = await receiptsService.summary(tenantId, {
      type: RECEIPT_TYPE.INCOME,
      sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
      from: FROM,
      to: TO,
    });

    expect(ledger.totalIncome).toBe(card.revenue);

    // Không có `sourceGroup`, sổ vẫn kể cả tiền cọc — đây chính là con số lệch mà bộ lọc mới sinh
    // ra để tránh, nên khẳng định nó tường minh thay vì để người sau tưởng hai vế luôn bằng nhau.
    const unfiltered = await receiptsService.summary(tenantId, {
      type: RECEIPT_TYPE.INCOME,
      from: FROM,
      to: TO,
    });
    expect(unfiltered.totalIncome).toBe('950000');
  });
});

describe('Báo cáo tài chính — /finance/series', () => {
  maybe('phiếu 05:00 giờ VN rơi vào ĐÚNG ngày đó, không phải hôm trước', async () => {
    await resetMoney();
    // 05:00 ngày 10/03 giờ VN = 22:00 ngày 09/03 UTC. Gộp theo UTC sẽ ném nó sang ngày 09.
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '111000',
      occurredAt: new Date(vnAt('2027-03-10', 5)),
    });

    const res = await overview.series(tenantId, {
      from: '2027-03-09',
      to: '2027-03-11',
      granularity: 'day',
    });

    const on9 = res.buckets.find((b) => b.bucket === '2027-03-09');
    const on10 = res.buckets.find((b) => b.bucket === '2027-03-10');
    expect(on9?.revenue).toBe('0');
    expect(on10?.revenue).toBe('111000');
  });

  maybe('ngày không có phiếu vẫn là một bucket giá trị 0 — biểu đồ không được nối qua', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '100000',
      occurredAt: new Date(vnAt('2027-03-09', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '300000',
      occurredAt: new Date(vnAt('2027-03-11', 9)),
    });

    const res = await overview.series(tenantId, {
      from: '2027-03-09',
      to: '2027-03-11',
      granularity: 'day',
    });

    expect(res.buckets.map((b) => b.bucket)).toEqual([
      '2027-03-09',
      '2027-03-10',
      '2027-03-11',
    ]);
    expect(res.buckets[1]!.revenue).toBe('0');
    expect(res.buckets[1]!.profit).toBe('0');
  });

  maybe('kỳ quá dài ⇒ server tự nâng bậc độ mịn và NÓI RA giá trị đã dùng', async () => {
    await resetMoney();
    const perDay = await overview.series(tenantId, {
      from: '2027-01-01',
      to: '2028-02-04',
      granularity: 'day',
    });
    expect(perDay.granularity).toBe('week');

    const perWeek = await overview.series(tenantId, {
      from: '2020-01-01',
      to: '2027-01-01',
      granularity: 'day',
    });
    expect(perWeek.granularity).toBe('month');
  });

  maybe('kỳ rộng tới mức không vẽ được ⇒ 400 có lý do, không âm thầm cắt dữ liệu', async () => {
    await expect(
      overview.series(tenantId, { from: '1990-01-01', to: '2030-01-01', granularity: 'day' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('dòng tiền quỹ của bucket gồm cọc, doanh thu thì không', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '400000',
      occurredAt: new Date(vnAt('2027-03-15', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '600000',
      source: RECEIPT_SOURCE.DEPOSIT,
      occurredAt: new Date(vnAt('2027-03-15', 9)),
    });

    const res = await overview.series(tenantId, {
      from: '2027-03-15',
      to: '2027-03-15',
      granularity: 'day',
    });
    expect(res.buckets).toHaveLength(1);
    expect(res.buckets[0]!.revenue).toBe('400000');
    expect(res.buckets[0]!.cashIn).toBe('1000000');
  });
});

describe('Báo cáo tài chính — /finance/by-category', () => {
  maybe('phiếu chưa gán danh mục thành một dòng riêng, tổng vẫn khớp thẻ', async () => {
    await resetMoney();
    const category = await prisma.financeCategory.create({
      data: {
        id: newId(),
        tenantId,
        type: RECEIPT_TYPE.INCOME,
        name: 'Phí quá giờ (fixture)',
      },
      select: { id: true },
    });

    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '750000',
      categoryId: category.id,
      occurredAt: new Date(vnAt('2027-03-18', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '250000',
      occurredAt: new Date(vnAt('2027-03-18', 9)),
    });

    const res = await overview.byCategory(tenantId, {
      from: FROM,
      to: TO,
      type: RECEIPT_TYPE.INCOME,
    });
    const summary = await overview.summary(tenantId, { from: FROM, to: TO });

    expect(res.total).toBe(summary.revenue);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({ categoryId: category.id, amount: '750000', count: 1 });
    expect(res.items[0]!.sharePercent).toBe(75);
    // Dòng chưa phân loại phải CÓ MẶT — lọc nó ra là làm tổng các dòng nhỏ hơn thẻ phía trên.
    expect(res.items[1]).toMatchObject({ categoryId: null, name: null, amount: '250000' });

    await prisma.financeCategory.deleteMany({ where: { id: category.id } });
  });

  maybe('tiền cọc không xuất hiện trong cơ cấu doanh thu', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '800000',
      source: RECEIPT_SOURCE.DEPOSIT,
      occurredAt: new Date(vnAt('2027-03-18', 9)),
    });

    const res = await overview.byCategory(tenantId, {
      from: FROM,
      to: TO,
      type: RECEIPT_TYPE.INCOME,
    });
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe('0');
  });
});

describe('Báo cáo tài chính — /finance/by-vehicle', () => {
  maybe('chi phí KHÔNG gắn xe không bốc hơi — nó là `unassignedCost`', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '2000000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-20', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.EXPENSE,
      amount: '500000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-21', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.EXPENSE,
      amount: '300000',
      occurredAt: new Date(vnAt('2027-03-22', 9)),
    });

    const res = await overview.byVehicle(tenantId, { from: FROM, to: TO });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      vehicleId: vehicleAId,
      revenue: '2000000',
      cost: '500000',
      profit: '1500000',
      profitMarginPercent: 75,
    });

    // `unassignedCost` là số của KỲ (không đổi theo trang) nên nó sống ở summary, không ở trang
    // dữ liệu. Khẳng định phép cộng khép kín: chi phí các dòng + chi phí chung = thẻ "Chi phí".
    const summary = await overview.summary(tenantId, { from: FROM, to: TO });
    expect(summary.unassignedCost).toBe('300000');
    expect(summary.cost).toBe('800000');
  });

  maybe('xe có chuyến nhưng chưa lên sổ vẫn hiện ra (đó là dấu hiệu cần ghi phiếu)', async () => {
    await resetMoney();
    await seedBooking({ vehicleId: vehicleBId, pickupAt: new Date(vnAt('2027-03-08', 8)) });
    await seedBooking({ vehicleId: vehicleBId, pickupAt: new Date(vnAt('2027-03-09', 8)) });

    const res = await overview.byVehicle(tenantId, { from: FROM, to: TO });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      vehicleId: vehicleBId,
      trips: 2,
      revenue: '0',
      profit: '0',
      profitMarginPercent: null,
    });
  });

  maybe('sắp xếp theo lợi nhuận giảm dần, phân trang có tổng đúng', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '100000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-20', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '900000',
      vehicleId: vehicleBId,
      occurredAt: new Date(vnAt('2027-03-20', 9)),
    });

    const page = await overview.byVehicle(tenantId, { from: FROM, to: TO, limit: 1 });
    expect(page.data.map((r) => r.vehicleId)).toEqual([vehicleBId]);
    expect(page.meta).toMatchObject({ total: 2, hasNext: true });
  });

  maybe('cọc gắn xe không thổi phồng doanh thu của xe đó', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '300000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-20', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '5000000',
      source: RECEIPT_SOURCE.DEPOSIT,
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-20', 9)),
    });

    const res = await overview.byVehicle(tenantId, { from: FROM, to: TO });
    expect(res.data[0]!.revenue).toBe('300000');
  });
});

describe('Báo cáo tài chính — thu hẹp về MỘT xe / MỘT khách', () => {
  /**
   * Điều đáng kiểm không phải "lọc có chạy không" mà là **hai bề mặt không được lệch nhau**:
   * con số ở hồ sơ một chiếc xe phải bằng đúng dòng của xe đó trong bảng tổng quan, vì cả hai
   * là cùng một câu truy vấn khác nhau đúng một mệnh đề `AND`.
   */
  maybe('doanh thu thu hẹp về một xe = đúng dòng của xe đó ở bảng tổng quan', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '4000000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.EXPENSE,
      amount: '600000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-13', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '9000000',
      vehicleId: vehicleBId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const scoped = await overview.summary(tenantId, {
      from: FROM,
      to: TO,
      vehicleId: vehicleAId,
    });
    const table = await overview.byVehicle(tenantId, { from: FROM, to: TO });
    const rowA = table.data.find((r) => r.vehicleId === vehicleAId);

    expect(scoped.revenue).toBe(rowA?.revenue);
    expect(scoped.cost).toBe(rowA?.cost);
    expect(scoped.profit).toBe(rowA?.profit);
    // Và nó KHÔNG kéo theo tiền của xe khác.
    expect(scoped.revenue).toBe('4000000');
  });

  maybe('cọc của xe khác không lọt vào doanh thu xe đang xem', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '1000000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '7000000',
      source: RECEIPT_SOURCE.DEPOSIT,
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const scoped = await overview.summary(tenantId, { from: FROM, to: TO, vehicleId: vehicleAId });
    expect(scoped.revenue).toBe('1000000');
    // Cọc vẫn nằm ở lớp dòng tiền quỹ của chính xe đó — nó có di chuyển thật.
    expect(scoped.totalIncome).toBe('8000000');
  });

  maybe('doanh thu một KHÁCH cộng trên tiền THẬT đã thu, không phải giá trị đơn', async () => {
    await resetMoney();
    const customerId = await seedCustomer('Khách Doanh Thu');
    const booking = await seedBooking({
      vehicleId: vehicleAId,
      pickupAt: new Date(vnAt('2027-03-10', 8)),
      total: '5000000',
      tenantCustomerId: customerId,
    });

    // Đơn 5tr nhưng mới thu 2tr — "doanh thu" phải nói 2tr, phần còn lại là công nợ.
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '2000000',
      tenantCustomerId: customerId,
      bookingId: booking,
      occurredAt: new Date(vnAt('2027-03-10', 10)),
    });

    const scoped = await overview.summary(tenantId, {
      from: FROM,
      to: TO,
      tenantCustomerId: customerId,
    });
    expect(scoped.revenue).toBe('2000000');
    expect(scoped.trips).toBe(1);
  });

  maybe('phiếu của khách khác không lọt vào; số chuyến cũng thu hẹp theo', async () => {
    await resetMoney();
    const a = await seedCustomer('Khách A');
    const b = await seedCustomer('Khách B');
    await seedBooking({
      vehicleId: vehicleAId,
      pickupAt: new Date(vnAt('2027-03-10', 8)),
      tenantCustomerId: a,
    });
    await seedBooking({
      vehicleId: vehicleBId,
      pickupAt: new Date(vnAt('2027-03-11', 8)),
      tenantCustomerId: b,
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '3000000',
      tenantCustomerId: a,
      occurredAt: new Date(vnAt('2027-03-10', 10)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '8000000',
      tenantCustomerId: b,
      occurredAt: new Date(vnAt('2027-03-11', 10)),
    });

    const scopedA = await overview.summary(tenantId, { from: FROM, to: TO, tenantCustomerId: a });
    expect(scopedA.revenue).toBe('3000000');
    expect(scopedA.trips).toBe(1);
  });

  maybe('biểu đồ và cơ cấu danh mục cũng thu hẹp, không chỉ mỗi thẻ tổng', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '2500000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-16', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '6000000',
      vehicleId: vehicleBId,
      occurredAt: new Date(vnAt('2027-03-16', 9)),
    });

    const series = await overview.series(tenantId, {
      from: '2027-03-16',
      to: '2027-03-16',
      granularity: 'day',
      vehicleId: vehicleAId,
    });
    expect(series.buckets[0]!.revenue).toBe('2500000');

    const byCategory = await overview.byCategory(tenantId, {
      from: FROM,
      to: TO,
      type: RECEIPT_TYPE.INCOME,
      vehicleId: vehicleAId,
    });
    expect(byCategory.total).toBe('2500000');
  });

  maybe('id của gian hàng khác chỉ cho tập rỗng, không rò dữ liệu', async () => {
    await resetMoney();
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '5000000',
      vehicleId: vehicleAId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const scoped = await overview.summary(tenantId, { from: FROM, to: TO, vehicleId: newId() });
    expect(scoped.revenue).toBe('0');
    expect(scoped.trips).toBe(0);
  });
});

describe('Báo cáo tài chính — /finance/by-customer', () => {
  maybe('cộng trên TIỀN THẬT đã thu, không phải giá trị đơn đã chốt', async () => {
    await resetMoney();
    const customerId = await seedCustomer('Khách Vip');
    const booking = await seedBooking({
      vehicleId: vehicleAId,
      pickupAt: new Date(vnAt('2027-03-10', 8)),
      total: '9000000',
      tenantCustomerId: customerId,
    });
    // Đơn 9tr nhưng mới thu 3,5tr — bảng phải nói 3,5tr, phần còn lại thuộc màn Công nợ.
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '3500000',
      tenantCustomerId: customerId,
      bookingId: booking,
      occurredAt: new Date(vnAt('2027-03-10', 10)),
    });

    const res = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      tenantCustomerId: customerId,
      fullName: 'Khách Vip',
      trips: 1,
      revenue: '3500000',
    });
  });

  maybe('phiếu không gắn khách nào KHÔNG bốc hơi — nó là `unassignedRevenue`', async () => {
    await resetMoney();
    const customerId = await seedCustomer('Khách A');
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '6000000',
      tenantCustomerId: customerId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    // Phiếu thu tay không liên kết đơn ⇒ không thuộc về khách nào.
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '900000',
      occurredAt: new Date(vnAt('2027-03-13', 9)),
    });

    const res = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    const summary = await overview.summary(tenantId, { from: FROM, to: TO });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.revenue).toBe('6000000');
    // Phép cộng khép kín: doanh thu các dòng + phần chưa gắn khách = đúng thẻ "Doanh thu".
    expect(summary.unassignedRevenue).toBe('900000');
    expect(summary.revenue).toBe('6900000');
  });

  maybe('cọc của khách không thổi phồng doanh thu của khách đó', async () => {
    await resetMoney();
    const customerId = await seedCustomer('Khách Cọc');
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '800000',
      tenantCustomerId: customerId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '5000000',
      source: RECEIPT_SOURCE.DEPOSIT,
      tenantCustomerId: customerId,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const res = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    expect(res.data[0]!.revenue).toBe('800000');
  });

  maybe('khách có chuyến mà chưa thu đồng nào vẫn hiện — đó là việc cần làm', async () => {
    await resetMoney();
    const customerId = await seedCustomer('Khách Chưa Thu');
    await seedBooking({
      vehicleId: vehicleAId,
      pickupAt: new Date(vnAt('2027-03-14', 8)),
      tenantCustomerId: customerId,
    });

    const res = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ trips: 1, revenue: '0' });
  });

  maybe('một dòng ở bảng = đúng con số khi thu hẹp về chính khách đó', async () => {
    await resetMoney();
    const a = await seedCustomer('Khách A');
    const b = await seedCustomer('Khách B');
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '2200000',
      tenantCustomerId: a,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '7700000',
      tenantCustomerId: b,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const table = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    const scoped = await overview.summary(tenantId, { from: FROM, to: TO, tenantCustomerId: a });

    expect(table.data.find((r) => r.tenantCustomerId === a)?.revenue).toBe(scoped.revenue);
    // Mặc định sắp theo doanh thu giảm dần.
    expect(table.data.map((r) => r.tenantCustomerId)).toEqual([b, a]);
  });

  maybe('sắp theo số chuyến + phân trang có tổng đúng', async () => {
    await resetMoney();
    const a = await seedCustomer('Khách Ít Tiền Nhiều Chuyến');
    const b = await seedCustomer('Khách Nhiều Tiền Một Chuyến');
    for (const day of ['2027-03-05', '2027-03-07', '2027-03-09']) {
      await seedBooking({
        vehicleId: vehicleAId,
        pickupAt: new Date(vnAt(day, 8)),
        tenantCustomerId: a,
      });
    }
    await seedBooking({
      vehicleId: vehicleBId,
      pickupAt: new Date(vnAt('2027-03-06', 8)),
      tenantCustomerId: b,
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '20000000',
      tenantCustomerId: b,
      occurredAt: new Date(vnAt('2027-03-06', 10)),
    });

    const page = await overview.byCustomer(tenantId, { from: FROM, to: TO, sort: 'trips', limit: 1 });
    expect(page.data.map((r) => r.tenantCustomerId)).toEqual([a]);
    expect(page.meta).toMatchObject({ total: 2, hasNext: true });
  });
});

describe('Báo cáo tài chính — tỷ trọng theo khách', () => {
  maybe('mẫu số là doanh thu CẢ KỲ, không phải tổng của trang', async () => {
    await resetMoney();
    const a = await seedCustomer('Khách A');
    const b = await seedCustomer('Khách B');
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '5000000',
      tenantCustomerId: a,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '3000000',
      tenantCustomerId: b,
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });
    // 2tr không gắn khách nào ⇒ tổng kỳ là 10tr, nên A là 50% chứ không phải 62,5%.
    await seedReceipt({
      type: RECEIPT_TYPE.INCOME,
      amount: '2000000',
      occurredAt: new Date(vnAt('2027-03-12', 9)),
    });

    const res = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    expect(res.data.find((r) => r.tenantCustomerId === a)?.sharePercent).toBe(50);
    expect(res.data.find((r) => r.tenantCustomerId === b)?.sharePercent).toBe(30);
  });

  maybe('kỳ chưa có doanh thu ⇒ tỷ trọng là null, không phải 0%', async () => {
    await resetMoney();
    const customerId = await seedCustomer('Khách Chưa Thu');
    await seedBooking({
      vehicleId: vehicleAId,
      pickupAt: new Date(vnAt('2027-03-14', 8)),
      tenantCustomerId: customerId,
    });

    const res = await overview.byCustomer(tenantId, { from: FROM, to: TO });
    expect(res.data[0]!.sharePercent).toBeNull();
  });
});
