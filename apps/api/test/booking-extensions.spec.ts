import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_EXTENSION_STATUS,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  PLAN_STATUS,
  SERVICE_TYPE,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  addCalendarMonthsVn,
} from '@xeprime/types';
import { sweepBookingExtensionExpiry } from '../../worker/src/jobs/booking-extension-expiry';
import { SepayService } from '../src/modules/sepay/sepay.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBillingService,
  makeBookingExtensionsService,
  makeBookingHoldsService,
  makeBookingsService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * PHỤ LỤC GIA HẠN đơn dài hạn — ADR 0077, trên PostgreSQL THẬT.
 *
 *  1. Báo giá: miễn `S`/`H`, khách trả đúng tiền thuê chia hai đường, khoản online = phần chủ xe.
 *  2. Tạo: kéo lịch của CHÍNH đơn, giờ trả chưa đổi, một phụ lục chờ mỗi đơn, trùng lịch ⇒ từ chối.
 *  3. Tiền về đủ qua SePay (mã XPE…) ⇒ hiệu lực: giờ trả dời, nghĩa vụ thuế riêng của phụ lục.
 *  4. Đơn hoàn thành ⇒ ví chủ xe nhận `D − T` của phụ lục, đúng một lần.
 *  5. Quá hạn / chủ xe huỷ ⇒ lịch thu về, phần đã chuyển hoàn vào ví khách.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const extensions = makeBookingExtensionsService(asService);
const bookings = makeBookingsService(asService);
const sepay = new SepayService(
  asService,
  makeBillingService(asService),
  makeBookingHoldsService(asService),
  {
    get: (key: string) => (key === 'SEPAY_API_KEY' ? 'test-key-ext-0123456789abcdef' : undefined),
  } as unknown as ConfigService,
  extensions,
);

const RUN = newId().slice(-8).toLowerCase();
const TX_PREFIX = `ext-${RUN}-`;
const MONTHLY = '12000000';
const DAY = 24 * 3600_000;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let strangerId: string;
let tenantId: string;
let vehicleId: string;
let branchId: string;
let planId: string;
let txCounter = 0;
let phoneCounter = 0;

function payload(code: string, amount: string): Record<string, unknown> {
  txCounter += 1;
  return {
    id: `${TX_PREFIX}${txCounter}`,
    transferType: 'in',
    transferAmount: Number(amount),
    content: `chuyen khoan ${code}`,
    transactionDate: `${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })} 09:00:00`,
  };
}

/** Một đơn DÀI HẠN đang thuê, đặt qua chợ (có yêu cầu gốc mang tài khoản khách). */
async function makeActiveLongTerm(
  opts: { serviceType?: string; startInDays?: number } = {},
): Promise<{ id: string; returnAt: Date }> {
  phoneCounter += 1;
  const start = Date.now() + (opts.startInDays ?? 1) * DAY;
  const created = await bookings.create(tenantId, ownerId, {
    vehicleId,
    customerName: 'Khách Gia Hạn',
    customerPhone: `0907${RUN.replace(/\D/g, '').padEnd(4, '1').slice(0, 4)}${String(phoneCounter).padStart(2, '0')}`,
    pickupAt: new Date(start).toISOString(),
    returnAt: new Date(start + 3 * DAY).toISOString(),
    baseAmount: '3000000',
  });
  await prisma.booking.update({
    where: { id: created.id },
    data: {
      status: BOOKING_STATUS.ACTIVE,
      serviceType: opts.serviceType ?? SERVICE_TYPE.LONG_TERM,
      actualPickupAt: new Date(),
    },
  });
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: created.id },
    select: { pickupAt: true, returnAt: true },
  });
  await prisma.bookingRequest.create({
    data: {
      id: newId(),
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      customerName: 'Khách Gia Hạn',
      customerPhone: `0908${String(phoneCounter).padStart(6, '0')}`,
      customerUserId: customerId,
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
      respondBy: new Date(Date.now() + 3600_000),
      decidedAt: new Date(),
      decidedBy: ownerId,
      bookingId: created.id,
    },
  });
  return { id: created.id, returnAt: booking.returnAt };
}

async function occupancyEnd(bookingId: string): Promise<Date | null> {
  const row = await prisma.vehicleOccupancy.findUnique({
    where: {
      sourceType_sourceId: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING, sourceId: bookingId },
    },
    select: { endAt: true },
  });
  return row?.endAt ?? null;
}

async function walletEntries(kind: string, sourceRefId: string) {
  return prisma.walletEntry.findMany({
    where: { kind, sourceType: WALLET_ENTRY_SOURCE.BOOKING_EXTENSION, sourceRefId },
    select: { amount: true, wallet: { select: { ownerUserId: true, ownerTenantId: true } } },
  });
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
  branchId = newId();
  planId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe',
        email: `ext-own-${RUN}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customerId,
        displayName: 'Khách',
        email: `ext-cus-${RUN}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: strangerId,
        displayName: 'Người lạ',
        email: `ext-str-${RUN}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `ExtShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: 'shop_owner',
      status: 'active',
      joinedAt: new Date(),
    },
  });
  await prisma.tenantBranch.create({
    data: {
      id: branchId,
      tenantId,
      code: `CN${branchId.slice(-4)}`,
      name: 'CN test',
      provinceCode: '79',
      isDefault: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      branchId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe gia hạn',
      vehicleType: 'car',
      plateNumber: `51E-${RUN.slice(0, 5)}`,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: new Prisma.Decimal(500_000),
      monthlyPrice: new Prisma.Decimal(MONTHLY),
      createdBy: ownerId,
    },
  });
  // Tuyến HOA HỒNG: cọc bắt buộc ⇒ khoản online = 15% tiền thuê (ADR 0077 điều 8).
  await prisma.plan.create({
    data: {
      id: planId,
      code: `ext-commission-${RUN}`,
      name: 'Hoa hồng test',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      commissionPercent: new Prisma.Decimal(10),
      basePriceMonthly: new Prisma.Decimal(0),
      limitsJson: { features: [] } as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 12,
      billingMode: BILLING_MODE.COMMISSION,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 365 * DAY),
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.bankTransaction.deleteMany({ where: { providerTxId: { startsWith: TX_PREFIX } } });
  await prisma.taxWithholding.deleteMany({ where: { tenantId } });
  await prisma.bookingExtension.deleteMany({ where: { tenantId } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [ownerId, customerId, strangerId],
    });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
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

describe('Báo giá phụ lục — miễn phí nền tảng (ADR 0077 điều 3–5)', () => {
  maybe('giá gói theo tháng lịch; không S, không H; khách trả đúng tiền thuê', async () => {
    const booking = await makeActiveLongTerm();
    const q = await extensions.quote(tenantId, booking.id, 1);

    expect(q.fromAt).toBe(booking.returnAt.toISOString());
    expect(q.toAt).toBe(addCalendarMonthsVn(booking.returnAt, 1).toISOString());
    expect(q.rentalAmount).toBe(MONTHLY);
    // Khách trả ĐÚNG tiền thuê, chia hai đường — không có phí sàn chen vào.
    expect(Number(q.onlineAmount) + Number(q.payAtPickupAmount)).toBe(Number(MONTHLY));
    // Khoản online chỉ là phần của chủ xe ⇒ ví nhận đúng online − thuế.
    expect(Number(q.ownerPayableAmount)).toBe(Number(q.onlineAmount) - Number(q.taxAmount));
    // Tuyến hoa hồng luôn thu 15% (sàn là thuế).
    expect(Number(q.onlineAmount)).toBeGreaterThanOrEqual(Number(MONTHLY) * 0.15);
    expect(q.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(q.available).toBe(true);
  });

  maybe('đơn không phải dài hạn ⇒ BOOKING_EXTENSION_NOT_ALLOWED', async () => {
    const booking = await makeActiveLongTerm({ serviceType: SERVICE_TYPE.SELF_DRIVE });
    await expect(extensions.quote(tenantId, booking.id, 1)).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.BOOKING_EXTENSION_NOT_ALLOWED,
        details: { reason: 'not_long_term' },
      },
    });
  });
});

describe('Tạo phụ lục — lịch của chính đơn (ADR 0077 điều 6)', () => {
  maybe(
    'kéo lịch tới to_at, giờ trả của đơn CHƯA đổi, mã XPE…, một phụ lục chờ mỗi đơn',
    async () => {
      const booking = await makeActiveLongTerm();
      const ext = await extensions.create(tenantId, booking.id, 2, ownerId);

      expect(ext.status).toBe(BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);
      expect(ext.code.startsWith('XPE')).toBe(true);
      expect(ext.toAt).toBe(addCalendarMonthsVn(booking.returnAt, 2).toISOString());
      expect((await occupancyEnd(booking.id))?.toISOString()).toBe(ext.toAt);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(row.returnAt.toISOString()).toBe(booking.returnAt.toISOString());

      await expect(extensions.create(tenantId, booking.id, 1, ownerId)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.BOOKING_EXTENSION_PENDING },
      });
    },
  );

  maybe(
    'xe đã có chuyến sau giờ trả ⇒ từ chối, không để lại phụ lục hay lịch dở dang',
    async () => {
      const booking = await makeActiveLongTerm();
      // Một chuyến khác của CÙNG xe bắt đầu 10 ngày sau giờ trả — nằm trong 1 tháng gia hạn.
      phoneCounter += 1;
      await bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Khách sau',
        customerPhone: `0906${String(phoneCounter).padStart(6, '0')}`,
        pickupAt: new Date(booking.returnAt.getTime() + 10 * DAY).toISOString(),
        returnAt: new Date(booking.returnAt.getTime() + 12 * DAY).toISOString(),
        baseAmount: '1000000',
      });

      const q = await extensions.quote(tenantId, booking.id, 1);
      expect(q.available).toBe(false);
      expect(q.busyFrom).not.toBeNull();

      await expect(extensions.create(tenantId, booking.id, 1, ownerId)).rejects.toBeDefined();
      expect(await prisma.bookingExtension.count({ where: { bookingId: booking.id } })).toBe(0);
      expect((await occupancyEnd(booking.id))?.toISOString()).toBe(booking.returnAt.toISOString());
    },
  );
});

describe('Tiền về qua SePay — hiệu lực khi ĐỦ (ADR 0077 điều 5)', () => {
  maybe('thiếu ⇒ partial; đủ ⇒ active, giờ trả dời, thuế riêng của phụ lục', async () => {
    const booking = await makeActiveLongTerm();
    const ext = await extensions.create(tenantId, booking.id, 1, ownerId);
    const half = new Prisma.Decimal(ext.onlineAmount).div(2).floor();

    const partial = await sepay.ingest(payload(ext.code, half.toFixed(0)));
    expect(partial).toMatchObject({ matched: true, note: 'partial' });
    let row = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: ext.id } });
    expect(row.status).toBe(BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);

    const rest = new Prisma.Decimal(ext.onlineAmount).minus(half);
    const done = await sepay.ingest(payload(ext.code, rest.toFixed(0)));
    expect(done).toMatchObject({ matched: true, note: 'activated' });

    row = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: ext.id } });
    expect(row.status).toBe(BOOKING_EXTENSION_STATUS.ACTIVE);
    expect(row.activatedAt).not.toBeNull();
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(b.returnAt.toISOString()).toBe(ext.toAt);

    const taxRows = await prisma.taxWithholding.findMany({ where: { bookingExtensionId: ext.id } });
    if (row.taxAmount.gt(0)) {
      expect(taxRows).toHaveLength(1);
      expect(taxRows[0]!.amount.toFixed(0)).toBe(row.taxAmount.toFixed(0));
    } else {
      expect(taxRows).toHaveLength(0);
    }

    // Chuyển thêm sau khi đã hiệu lực ⇒ tiền THỪA về ví khách, giao dịch vẫn khớp (đánh dấu thừa).
    const over = await sepay.ingest(payload(ext.code, '50000'));
    expect(over).toMatchObject({ matched: true, note: 'already_paid' });
    const overpay = await walletEntries(WALLET_ENTRY_KIND.HOLD_OVERPAY, ext.id);
    expect(overpay.map((e) => e.amount.toFixed(0))).toEqual(['50000']);
    expect(overpay[0]!.wallet.ownerUserId).toBe(customerId);
  });

  maybe('đơn hoàn thành ⇒ ví chủ xe nhận D − T của phụ lục, đúng một lần', async () => {
    const booking = await makeActiveLongTerm();
    const ext = await extensions.create(tenantId, booking.id, 1, ownerId);
    await sepay.ingest(payload(ext.code, ext.onlineAmount));

    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(
        tx,
        tenantId,
        booking.id,
        ownerId,
        BOOKING_STATUS.ACTIVE,
        BOOKING_STATUS.COMPLETED,
      ),
    );
    const release = await walletEntries(WALLET_ENTRY_KIND.EXTENSION_RELEASE, ext.id);
    expect(release).toHaveLength(1);
    expect(release[0]!.wallet.ownerTenantId).toBe(tenantId);
    expect(release[0]!.amount.toFixed(0)).toBe(ext.ownerPayableAmount);
    const row = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: ext.id } });
    expect(row.settledAt).not.toBeNull();
  });
});

describe('Đóng phụ lục còn chờ — lịch thu về, tiền đã chuyển hoàn khách', () => {
  maybe(
    'quá hạn (worker) ⇒ expired, lịch về giờ trả cũ, ví khách nhận phần đã chuyển',
    async () => {
      const booking = await makeActiveLongTerm();
      const ext = await extensions.create(tenantId, booking.id, 1, ownerId);
      await sepay.ingest(payload(ext.code, '100000'));
      await prisma.bookingExtension.update({
        where: { id: ext.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      // Tiền về SAU hạn (worker chưa kịp quét) ⇒ không khớp, không kéo lịch.
      const late = await sepay.ingest(payload(ext.code, '20000'));
      expect(late).toMatchObject({ matched: false });

      const result = await sweepBookingExtensionExpiry(prisma);
      expect(result.expired).toBeGreaterThanOrEqual(1);

      const row = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: ext.id } });
      expect(row.status).toBe(BOOKING_EXTENSION_STATUS.EXPIRED);
      expect((await occupancyEnd(booking.id))?.toISOString()).toBe(booking.returnAt.toISOString());
      const refund = await walletEntries(WALLET_ENTRY_KIND.EXTENSION_REFUND, ext.id);
      expect(refund.map((e) => e.amount.toFixed(0))).toEqual(['100000']);
      expect(refund[0]!.wallet.ownerUserId).toBe(customerId);

      // Chạy lại không hoàn đôi.
      await sweepBookingExtensionExpiry(prisma);
      expect(await walletEntries(WALLET_ENTRY_KIND.EXTENSION_REFUND, ext.id)).toHaveLength(1);
    },
  );

  maybe('chủ xe huỷ ⇒ cancelled, lịch thu về; huỷ lần nữa ⇒ NOT_CANCELLABLE', async () => {
    const booking = await makeActiveLongTerm();
    const ext = await extensions.create(tenantId, booking.id, 3, ownerId);
    const cancelled = await extensions.cancel(tenantId, booking.id, ext.id, ownerId);
    expect(cancelled.status).toBe(BOOKING_EXTENSION_STATUS.CANCELLED);
    expect((await occupancyEnd(booking.id))?.toISOString()).toBe(booking.returnAt.toISOString());

    await expect(extensions.cancel(tenantId, booking.id, ext.id, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.BOOKING_EXTENSION_NOT_CANCELLABLE },
    });
    // Huỷ xong thì tạo được phụ lục mới (unique "một phụ lục chờ" chỉ tính bản đang chờ).
    const again = await extensions.create(tenantId, booking.id, 1, ownerId);
    expect(again.status).toBe(BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);
  });
});

describe('Phía khách — chỉ thấy phụ lục của chuyến của chính mình', () => {
  maybe('khách của đơn thấy mã + số tiền; người khác nhận mảng rỗng', async () => {
    const booking = await makeActiveLongTerm();
    const ext = await extensions.create(tenantId, booking.id, 1, ownerId);

    const mine = await extensions.listForCustomer(customerId, booking.id);
    expect(mine.map((e) => e.code)).toEqual([ext.code]);
    expect(mine[0]).not.toHaveProperty('taxAmount');
    expect(mine[0]).not.toHaveProperty('ownerPayableAmount');
    expect(await extensions.listForCustomer(strangerId, booking.id)).toEqual([]);
  });
});
