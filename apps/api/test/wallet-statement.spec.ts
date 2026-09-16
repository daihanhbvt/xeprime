import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  REVIEW_STATUS,
  SERVICE_TYPE,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WALLET_STATEMENT_UNIT,
} from '@xeprime/types';
import { WalletStatementService } from '../src/modules/wallet/wallet-statement.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * BẢNG TỔNG HỢP GIAO DỊCH của gian hàng — trên PostgreSQL THẬT.
 *
 * Năm điều được khoá, tất cả đều là chỗ mà một bảng tiền nói dối một cách thuyết phục:
 *
 *  1. **Kỳ tính theo giờ VIỆT NAM.** Chuyến trả xe 23:30 ngày cuối tháng (giờ VN) thuộc tháng
 *     đó, không phải tháng sau. Bảy giờ lệch UTC là nơi một chuyến biến mất khỏi cả hai kỳ.
 *  2. **Cộng dồn tính trên CẢ KỲ, không theo trang.** Lật sang trang 2 không được làm tổng đổi.
 *  3. **`balanceChange` đọc từ SỔ**, nên một bút toán đảo phải hiện ra — không tính lại từ
 *     `owner_payable_amount` đã đóng băng.
 *  4. **`ownerIncome` ≠ `balanceChangeTotal`.** Phần khách trả tay lúc nhận xe không đi qua ví;
 *     đánh đồng hai con số là điều khiến chủ xe tin mình bị giữ mất tiền.
 *  5. **Không rò sang gian hàng khác.**
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const wallet = new WalletService(asService);
const statement = new WalletStatementService(asService, wallet);

const RUN = newId().slice(-8).toLowerCase();
const PERIOD = '2026-10';
/** Cuối tháng 10 giờ VN (23:30 ngày 31/10) = 16:30 UTC — vẫn là kỳ tháng 10. */
const LAST_MOMENT_VN = new Date('2026-10-31T16:30:00.000Z');
/** 00:30 ngày 01/11 giờ VN = 17:30 UTC ngày 31/10 — đã sang kỳ tháng 11. */
const FIRST_MOMENT_NEXT_VN = new Date('2026-10-31T17:30:00.000Z');

let dbAvailable = false;
let tenantId: string;
let ownerUserId: string;
let vehicleId: string;
let otherTenantId: string;
let otherOwnerUserId: string;
let otherVehicleId: string;
let customerUserId: string;
let seq = 0;

const dec = (n: number | string) => new Prisma.Decimal(n);
const owner = () => ({ type: WALLET_OWNER_TYPE.TENANT, tenantId }) as const;

async function seedTenant(label: string): Promise<{ tenant: string; user: string; vehicle: string }> {
  const user = newId();
  const tenant = newId();
  const vehicle = newId();
  await prisma.user.create({
    data: { id: user, displayName: `Chủ ${label}`, email: `stmt-${label}-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: `StmtShop-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: user,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: tenant,
      userId: user,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicle,
      tenantId: tenant,
      code: `XE${vehicle.slice(-5)}`,
      name: `Xe ${label}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: dec('700000'),
      createdBy: user,
    },
  });
  return { tenant, user, vehicle };
}

/** Một chuyến ĐÃ HOÀN THÀNH với đủ các con số tiền mà bảng đọc tới. */
async function seedTrip(opts: {
  tenant?: string;
  vehicle?: string;
  returnAt: Date;
  actualReturnAt?: Date | null;
  total: number;
  deposit: number;
  tax: number;
  days?: number;
  longTermMonthly?: string;
  withSnapshot?: boolean;
  status?: string;
}): Promise<string> {
  const id = newId();
  seq += 1;
  const tenant = opts.tenant ?? tenantId;
  const returnAt = opts.returnAt;
  const days = opts.days ?? 3;
  const pickupAt = new Date(returnAt.getTime() - days * 24 * 3600_000);
  const withSnapshot = opts.withSnapshot ?? true;

  await prisma.booking.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: opts.vehicle ?? vehicleId,
      code: `XP-${RUN}-${seq}`,
      status: opts.status ?? BOOKING_STATUS.COMPLETED,
      serviceType: opts.longTermMonthly ? SERVICE_TYPE.LONG_TERM : SERVICE_TYPE.SELF_DRIVE,
      customerName: `Khách ${seq}`,
      customerPhone: `0977${String(100000 + seq).slice(-6)}`,
      pickupAt,
      returnAt,
      ...(opts.actualReturnAt === undefined ? {} : { actualReturnAt: opts.actualReturnAt }),
      baseAmount: dec(opts.total),
      totalAmount: dec(opts.total),
      taxAmount: dec(opts.tax),
      depositAmountOnline: dec(opts.deposit),
      ownerPayableAmount: dec(opts.deposit - opts.tax),
      ...(withSnapshot
        ? {
            priceSnapshot: opts.longTermMonthly
              ? {
                  calculatedAt: pickupAt.toISOString(),
                  source: 'quote',
                  currency: 'VND',
                  longTerm: {
                    packageMonths: 3,
                    baseMonthlyPrice: opts.longTermMonthly,
                    basePackageAmount: String(opts.total),
                    durationDiscountPercent: null,
                    durationDiscountAmount: '0',
                    finalPackageAmount: String(opts.total),
                    effectiveMonthlyAmount: opts.longTermMonthly,
                  },
                  rows: [],
                  totalAmount: String(opts.total),
                  depositAmount: '0',
                  policy: null,
                }
              : {
                  calculatedAt: pickupAt.toISOString(),
                  source: 'quote',
                  currency: 'VND',
                  days,
                  rows: [],
                  totalAmount: String(opts.total),
                  depositAmount: '0',
                  policy: null,
                },
          }
        : {}),
    },
  });
  return id;
}

/** Ghi có vào ví gian hàng cho một chuyến — đúng đường mà `hold_release` đi. */
async function creditTrip(bookingId: string, amount: number) {
  await prisma.$transaction((tx) =>
    wallet.creditWithinTx(tx, {
      owner: owner(),
      kind: WALLET_ENTRY_KIND.HOLD_RELEASE,
      sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
      sourceRefId: newId(),
      amount: dec(amount),
      bookingId,
    }),
  );
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

  const main = await seedTenant('main');
  tenantId = main.tenant;
  ownerUserId = main.user;
  vehicleId = main.vehicle;

  const other = await seedTenant('other');
  otherTenantId = other.tenant;
  otherOwnerUserId = other.user;
  otherVehicleId = other.vehicle;

  customerUserId = newId();
  await prisma.user.create({
    data: { id: customerUserId, displayName: 'Khách đánh giá', email: `stmt-c-${RUN}@xeprime.test` },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    for (const tenant of [tenantId, otherTenantId]) {
      if (!tenant) continue;
      await prisma.review.deleteMany({ where: { tenantId: tenant } });
      await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: tenant } });
      await prisma.bookingRequest.deleteMany({ where: { tenantId: tenant } });
      /*
       * Ví phải được gỡ TRƯỚC tenant: `wallets.owner_tenant_id` là RESTRICT, và xoá tenant khi
       * còn một dòng sổ sẽ chết ở FK chứ không phải ở đâu khác.
       */
      const w = await prisma.wallet.findFirst({ where: { ownerTenantId: tenant } });
      if (w) {
        await prisma.walletEntry.deleteMany({ where: { walletId: w.id } });
        await prisma.wallet.delete({ where: { id: w.id } });
      }
      await prisma.booking.deleteMany({ where: { tenantId: tenant } });
      await prisma.vehicle.deleteMany({ where: { tenantId: tenant } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: tenant } });
      await prisma.tenant.delete({ where: { id: tenant } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, otherOwnerUserId, customerUserId].filter(Boolean) } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Ranh giới kỳ theo giờ Việt Nam', () => {
  maybe('chuyến trả xe 23:30 ngày 31/10 giờ VN thuộc kỳ 2026-10, không phải 2026-11', async () => {
    const inside = await seedTrip({
      returnAt: LAST_MOMENT_VN,
      total: 4_050_000,
      deposit: 1_215_000,
      tax: 0,
      days: 3,
    });
    const outside = await seedTrip({
      returnAt: FIRST_MOMENT_NEXT_VN,
      total: 1_000_000,
      deposit: 300_000,
      tax: 0,
    });

    const october = await statement.tenantStatement(tenantId, owner(), { period: PERIOD });
    const codes = october.items.map((i) => i.bookingId);
    expect(codes).toContain(inside);
    expect(codes).not.toContain(outside);

    const november = await statement.tenantStatement(tenantId, owner(), { period: '2026-11' });
    expect(november.items.map((i) => i.bookingId)).toContain(outside);
  });

  /**
   * Ngày về THỰC TẾ thắng ngày về theo lịch — nó mới là lúc chuyến kết thúc, và cũng là mốc xếp
   * chuyến vào kỳ. Chuyến lẽ ra trả cuối tháng 9 nhưng trả muộn sang tháng 10 thuộc kỳ tháng 10.
   */
  maybe('trả xe muộn sang kỳ sau ⇒ tính theo ngày về THỰC TẾ', async () => {
    const late = await seedTrip({
      returnAt: new Date('2026-09-28T03:00:00.000Z'),
      actualReturnAt: new Date('2026-10-02T03:00:00.000Z'),
      total: 800_000,
      deposit: 240_000,
      tax: 0,
    });
    const october = await statement.tenantStatement(tenantId, owner(), { period: PERIOD });
    const row = october.items.find((i) => i.bookingId === late);
    expect(row).toBeDefined();
    expect(row?.returnAt).toBe('2026-10-02T03:00:00.000Z');

    const september = await statement.tenantStatement(tenantId, owner(), { period: '2026-09' });
    expect(september.items.map((i) => i.bookingId)).not.toContain(late);
  });

  maybe('chỉ đếm chuyến ĐÃ HOÀN THÀNH — đơn đang chạy không vào bảng', async () => {
    const active = await seedTrip({
      returnAt: new Date('2026-10-20T03:00:00.000Z'),
      total: 500_000,
      deposit: 150_000,
      tax: 0,
      status: BOOKING_STATUS.ACTIVE,
    });
    const october = await statement.tenantStatement(tenantId, owner(), { period: PERIOD });
    expect(october.items.map((i) => i.bookingId)).not.toContain(active);
  });
});

describe('Cộng dồn của kỳ', () => {
  maybe('tổng KHÔNG đổi khi lật trang — nó là số của kỳ, không của trang', async () => {
    const full = await statement.tenantStatement(tenantId, owner(), { period: PERIOD });
    expect(full.total).toBeGreaterThan(1);

    const firstPage = await statement.tenantStatement(tenantId, owner(), {
      period: PERIOD,
      page: 1,
      limit: 1,
    });
    const secondPage = await statement.tenantStatement(tenantId, owner(), {
      period: PERIOD,
      page: 2,
      limit: 1,
    });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.totals).toEqual(full.totals);
    expect(secondPage.totals).toEqual(full.totals);
    expect(firstPage.total).toBe(full.total);
    expect(firstPage.items[0]?.bookingId).not.toBe(secondPage.items[0]?.bookingId);
  });

  /**
   * Ca trung tâm của cả file: thu nhập chủ gian hàng KHÔNG bằng số ví nhúc nhích. Phần
   * `B − D` khách trả tay lúc nhận xe không bao giờ đi qua XePrime (ADR 0032 điều 2).
   */
  maybe('thu nhập = doanh thu − thuế − phí gói, và KHÁC tổng thay đổi số dư', async () => {
    const trip = await seedTrip({
      returnAt: new Date('2026-12-10T03:00:00.000Z'),
      total: 4_000_000,
      deposit: 1_200_000,
      tax: 200_000,
      days: 4,
    });
    await creditTrip(trip, 1_000_000);
    await prisma.subscriptionInvoice.create({
      data: {
        id: newId(),
        tenantId,
        code: `XPG-${RUN.toUpperCase()}`,
        periodFrom: new Date('2026-12-01T00:00:00.000Z'),
        periodTo: new Date('2027-01-01T00:00:00.000Z'),
        linesJson: {},
        subtotal: dec(1_000_000),
        totalAmount: dec(1_000_000),
        paidAmount: dec(1_000_000),
        status: SUBSCRIPTION_INVOICE_STATUS.PAID,
        paidAt: new Date('2026-12-02T03:00:00.000Z'),
      },
    });

    const december = await statement.tenantStatement(tenantId, owner(), { period: '2026-12' });
    expect(december.totals.revenueTotal).toBe('4000000');
    expect(december.totals.taxTotal).toBe('200000');
    // `B − D` = 4.000.000 − 1.200.000
    expect(december.totals.payAtPickupTotal).toBe('2800000');
    expect(december.totals.subscriptionFeeTotal).toBe('1000000');
    // 4.000.000 − 200.000 − 1.000.000
    expect(december.totals.ownerIncome).toBe('2800000');
    expect(december.totals.balanceChangeTotal).toBe('1000000');
    expect(december.totals.ownerIncome).not.toBe(december.totals.balanceChangeTotal);
  });

  /** Sổ là nguồn sự thật của cột số dư: một bút toán đảo phải kéo con số xuống. */
  maybe('bút toán đảo hiện ra ở `balanceChange` — không tính lại từ số đã đóng băng', async () => {
    const trip = await seedTrip({
      returnAt: new Date('2026-08-12T03:00:00.000Z'),
      total: 2_000_000,
      deposit: 600_000,
      tax: 0,
    });
    await creditTrip(trip, 600_000);
    const before = await statement.tenantStatement(tenantId, owner(), { period: '2026-08' });
    expect(before.items.find((i) => i.bookingId === trip)?.balanceChange).toBe('600000');

    const walletId = await wallet.findWalletId(owner());
    await prisma.walletEntry.create({
      data: {
        id: newId(),
        walletId: walletId as string,
        kind: WALLET_ENTRY_KIND.ADJUSTMENT,
        sourceType: WALLET_ENTRY_SOURCE.MANUAL,
        sourceRefId: newId(),
        amount: dec(-100_000),
        balanceAfter: dec(0),
        bookingId: trip,
        note: 'Điều chỉnh thử',
      },
    });

    const after = await statement.tenantStatement(tenantId, owner(), { period: '2026-08' });
    expect(after.items.find((i) => i.bookingId === trip)?.balanceChange).toBe('500000');
    expect(after.totals.balanceChangeTotal).toBe('500000');
  });
});

describe('Đơn giá đọc từ snapshot', () => {
  maybe('đơn theo ngày ⇒ đơn giá NGÀY; đơn dài hạn ⇒ đơn giá THÁNG', async () => {
    const daily = await seedTrip({
      returnAt: new Date('2026-07-10T03:00:00.000Z'),
      total: 4_050_000,
      deposit: 0,
      tax: 0,
      days: 3,
    });
    const longTerm = await seedTrip({
      returnAt: new Date('2026-07-20T03:00:00.000Z'),
      total: 18_000_000,
      deposit: 0,
      tax: 0,
      longTermMonthly: '6000000',
    });

    const july = await statement.tenantStatement(tenantId, owner(), { period: '2026-07' });
    const dailyRow = july.items.find((i) => i.bookingId === daily);
    expect(dailyRow?.unitKind).toBe(WALLET_STATEMENT_UNIT.DAY);
    expect(dailyRow?.unitAmount).toBe('1350000');

    const longRow = july.items.find((i) => i.bookingId === longTerm);
    expect(longRow?.unitKind).toBe(WALLET_STATEMENT_UNIT.MONTH);
    // KHÔNG chia gói cho 30 ngày (ADR 0011) — đơn giá của gói là giá THÁNG.
    expect(longRow?.unitAmount).toBe('6000000');
  });

  maybe('đơn không có bảng kê giá ⇒ đơn giá `null`, không suy ngược từ tổng', async () => {
    const manual = await seedTrip({
      returnAt: new Date('2026-06-10T03:00:00.000Z'),
      total: 900_000,
      deposit: 0,
      tax: 0,
      withSnapshot: false,
    });
    const june = await statement.tenantStatement(tenantId, owner(), { period: '2026-06' });
    const row = june.items.find((i) => i.bookingId === manual);
    expect(row?.unitAmount).toBeNull();
    expect(row?.unitKind).toBeNull();
  });
});

describe('Chỉ số của kỳ', () => {
  maybe('chưa ai đánh giá / chưa yêu cầu nào tới hạn ⇒ `null`, KHÔNG phải 0', async () => {
    const empty = await statement.tenantStatement(tenantId, owner(), { period: '2026-05' });
    expect(empty.stats.ratingAvg).toBeNull();
    expect(empty.stats.ratingCount).toBe(0);
    expect(empty.stats.responseRatePercent).toBeNull();
    expect(empty.stats.completedTripCount).toBe(0);
    expect(empty.items).toHaveLength(0);
  });

  maybe('tỉ lệ phản hồi chỉ đếm yêu cầu đã ngã ngũ trong kỳ', async () => {
    const at = new Date('2026-04-10T03:00:00.000Z');
    const mkRequest = async (status: string) => {
      seq += 1;
      await prisma.bookingRequest.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          status,
          customerName: `YC ${seq}`,
          customerPhone: `0966${String(100000 + seq).slice(-6)}`,
          customerUserId,
          pickupAt: at,
          returnAt: new Date(at.getTime() + 24 * 3600_000),
          respondBy: at,
          createdAt: at,
        },
      });
    };
    await mkRequest(BOOKING_REQUEST_STATUS.APPROVED_BY_HOST);
    await mkRequest(BOOKING_REQUEST_STATUS.REJECTED_BY_HOST);
    await mkRequest(BOOKING_REQUEST_STATUS.EXPIRED);
    // Ngoài mẫu số: khách tự rút, và yêu cầu còn trong hạn.
    await mkRequest(BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER);
    await mkRequest(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);

    const april = await statement.tenantStatement(tenantId, owner(), { period: '2026-04' });
    // 2 trả lời / 3 đã ngã ngũ
    expect(april.stats.responseRatePercent).toBe(67);
  });

  maybe('điểm đánh giá lấy các review NHẬN ĐƯỢC trong kỳ', async () => {
    const at = new Date('2026-03-15T03:00:00.000Z');
    for (const rating of [4, 5]) {
      await prisma.review.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          customerId: customerUserId,
          rating,
          status: REVIEW_STATUS.PUBLISHED,
          createdAt: at,
        },
      });
    }
    const march = await statement.tenantStatement(tenantId, owner(), { period: '2026-03' });
    expect(march.stats.ratingCount).toBe(2);
    expect(march.stats.ratingAvg).toBe(4.5);
  });
});

describe('Phạm vi gian hàng', () => {
  maybe('chuyến của gian hàng khác KHÔNG lọt vào bảng', async () => {
    const theirs = await seedTrip({
      tenant: otherTenantId,
      vehicle: otherVehicleId,
      returnAt: new Date('2026-10-15T03:00:00.000Z'),
      total: 9_999_000,
      deposit: 0,
      tax: 0,
    });
    const october = await statement.tenantStatement(tenantId, owner(), { period: PERIOD });
    expect(october.items.map((i) => i.bookingId)).not.toContain(theirs);
    expect(october.totals.revenueTotal).not.toContain('9999000');
  });

  maybe('kỳ không hợp lệ rơi về kỳ hiện tại thay vì nổ', async () => {
    const result = await statement.tenantStatement(tenantId, owner(), { period: 'xx' });
    expect(result.periodKey).toBe(statement.currentPeriodKey());
  });
});
