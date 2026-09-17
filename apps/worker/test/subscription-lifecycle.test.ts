import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BILLING_MODE,
  BILLING_PHASE,
  COMMISSION_TRACK_TERM_MONTHS,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  resolveEffectiveBilling,
} from '@xeprime/types';

import { sweepSubscriptionLifecycle } from '../src/jobs/subscription-lifecycle';

/**
 * VÒNG ĐỜI GÓI — bộ test của F1 ở tầng JOB, trên PostgreSQL thật.
 *
 * Hai bảo đảm, và cả hai nói về cùng một thứ: trạng thái "tenant không có dòng thuê bao hiệu lực"
 * phải BIẾN MẤT khỏi dữ liệu, không chỉ được diễn giải đúng ở tầng đọc.
 *
 *  1. Dòng hoa hồng hết kỳ được nối lại NGAY, không chờ ân hạn. Ân hạn là ưu đãi cho người ĐÃ
 *     TRẢ TIỀN; dòng 0đ do hệ thống tự gán không có gì để giữ, nhưng vẫn để lại cửa sổ thật.
 *  2. Dòng mới nối LIỀN vào mốc trước — `ends_at` với hoa hồng, hết ân hạn với gói — chứ không
 *     bắt đầu từ `now`. Job chạy mỗi giờ và dừng vài tiếng khi deploy; `now` để lại khe hở đúng
 *     bằng độ trễ đó.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/worker test
 */
const prisma = createPrismaClient();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let commissionPlanId: string;
let packagePlanId: string;
const tenantIds: string[] = [];

async function mkTenant(label: string): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `SL-${id.slice(-8)}`,
      slug: `sl-${id.toLowerCase().slice(-10)}`,
      name: `Lifecycle-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  tenantIds.push(id);
  return id;
}

async function subscribe(
  tenantId: string,
  planId: string,
  billingMode: string,
  endsAt: Date,
): Promise<void> {
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 12,
      billingMode,
      commissionPercent: billingMode === BILLING_MODE.COMMISSION ? 10 : null,
      startsAt: new Date(endsAt.getTime() - 365 * DAY),
      endsAt,
    },
  });
}

/** Dòng thuê bao hiệu lực, đọc đúng cách `TenantScopeGuard` đọc. */
async function effectiveOf(tenantId: string, at: Date) {
  const row = await prisma.tenantSubscription.findFirst({
    where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, startsAt: { lte: at } },
    orderBy: { endsAt: 'desc' },
    select: { endsAt: true, billingMode: true, plan: { select: { code: true, limitsJson: true } } },
  });
  return resolveEffectiveBilling(row, at);
}

before(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  ownerId = newId();
  commissionPlanId = newId();
  packagePlanId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ vòng đời', email: `sl-${RUN}@xeprime.test` },
  });
  await prisma.plan.create({
    data: {
      id: commissionPlanId,
      code: `sl-commission-${RUN}`,
      name: 'Hoa hồng',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      commissionPercent: 10,
      basePriceMonthly: 0,
      // `sortOrder` nhỏ nhất trong các bậc hoa hồng đang bán ⇒ job chọn đúng bậc này làm fallback.
      sortOrder: -1,
      limitsJson: { features: [], graceDays: 7, termPrices: [] },
    },
  });
  await prisma.plan.create({
    data: {
      id: packagePlanId,
      code: `sl-package-${RUN}`,
      name: 'Gói theo xe',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: 0,
      // Bậc gian hàng phải có BẢNG GIÁ, nếu không job chào gói lọc nó ra (ADR 0041 điều 5).
      limitsJson: {
        features: [],
        graceDays: 7,
        maxVehicles: 3,
        maxBranches: 1,
        termPrices: [{ months: 1, price: '100000' }],
      },
    },
  });
});

after(async () => {
  if (dbAvailable) {
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: [commissionPlanId, packagePlanId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

test('dòng HOA HỒNG hết kỳ được nối lại NGAY, không chờ ân hạn', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('comm');
  const endsAt = new Date(Date.now() - 2 * HOUR); // hết 2 giờ trước; ân hạn của bậc này là 7 ngày
  await subscribe(tenantId, commissionPlanId, BILLING_MODE.COMMISSION, endsAt);

  await sweepSubscriptionLifecycle(prisma, new Date());

  const rows = await prisma.tenantSubscription.findMany({
    where: { tenantId },
    orderBy: { endsAt: 'asc' },
    select: { startsAt: true, billingMode: true },
  });
  assert.equal(rows.length, 2);
  // Nối LIỀN: dòng mới bắt đầu đúng lúc dòng cũ kết thúc — không một giây nào hở.
  assert.equal(rows[1]!.startsAt.getTime(), endsAt.getTime());
  assert.equal(rows[1]!.billingMode, BILLING_MODE.COMMISSION);

  const billing = await effectiveOf(tenantId, new Date());
  assert.equal(billing.phase, BILLING_PHASE.CURRENT);
  assert.equal(billing.billingMode, BILLING_MODE.COMMISSION);
});

test('dòng GÓI vẫn chờ hết ân hạn — ưu đãi của người đã trả tiền không bị cắt', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('pkg-grace');
  const endsAt = new Date(Date.now() - 3 * DAY); // ân hạn 7 ngày ⇒ còn 4 ngày
  await subscribe(tenantId, packagePlanId, BILLING_MODE.PACKAGE, endsAt);

  await sweepSubscriptionLifecycle(prisma, new Date());

  assert.equal(await prisma.tenantSubscription.count({ where: { tenantId } }), 1);

  const billing = await effectiveOf(tenantId, new Date());
  assert.equal(billing.phase, BILLING_PHASE.GRACE);
  assert.equal(billing.billingMode, BILLING_MODE.PACKAGE);
});

test('dòng GÓI hết ân hạn ⇒ chuyển tuyến, dòng mới bắt đầu từ mốc HẾT ÂN HẠN', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('pkg-lapsed');
  const endsAt = new Date(Date.now() - 9 * DAY); // ân hạn 7 ngày ⇒ đã hết từ 2 ngày trước
  await subscribe(tenantId, packagePlanId, BILLING_MODE.PACKAGE, endsAt);

  await sweepSubscriptionLifecycle(prisma, new Date());

  const created = await prisma.tenantSubscription.findFirst({
    where: { tenantId, billingMode: BILLING_MODE.COMMISSION },
    select: { startsAt: true, termMonths: true },
  });
  assert.ok(created, 'phải sinh dòng hoa hồng sau khi hết ân hạn');
  /*
   * Bắt đầu từ HẾT ÂN HẠN, không phải từ `ends_at`: trong ân hạn tenant vẫn là tuyến gói, và một
   * dòng commission lùi về `ends_at` sẽ nói dối về bảy ngày đã qua.
   */
  assert.equal(created.startsAt.getTime(), endsAt.getTime() + 7 * DAY);
  assert.equal(created.termMonths, COMMISSION_TRACK_TERM_MONTHS);

  const billing = await effectiveOf(tenantId, new Date());
  assert.equal(billing.billingMode, BILLING_MODE.COMMISSION);
});

test('chạy lại job ⇒ KHÔNG sinh thêm dòng nào (claim bằng lapse_handled_at)', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('rerun');
  await subscribe(tenantId, commissionPlanId, BILLING_MODE.COMMISSION, new Date(Date.now() - HOUR));

  await sweepSubscriptionLifecycle(prisma, new Date());
  const after1 = await prisma.tenantSubscription.count({ where: { tenantId } });
  await sweepSubscriptionLifecycle(prisma, new Date());
  await sweepSubscriptionLifecycle(prisma, new Date());
  const after3 = await prisma.tenantSubscription.count({ where: { tenantId } });

  assert.equal(after1, 2);
  assert.equal(after3, 2, 'job idempotent: chạy lại phải ra đúng cùng một số dòng');
});

/*
 * TIỀN ĐÃ ĐÓNG BĂNG KHÔNG BỊ HỒI TỐ (ADR 0024).
 *
 * Chuyển tuyến đổi cách tính cho đơn TẠO SAU, và chỉ vậy. Đơn đã có mang snapshot của chính nó,
 * và không job nào — kể cả job vừa đổi tuyến của tenant — được phép chạm vào nó.
 *
 * Kiểm bằng cách so BYTE từng cột tiền trước và sau khi job chạy, thay vì tin vào việc "không
 * thấy câu UPDATE nào": một hiệu ứng phụ qua cascade hay trigger sẽ không xuất hiện trong code.
 */
test('chuyển tuyến KHÔNG viết lại tiền của đơn đã tạo', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('frozen');
  const endsAt = new Date(Date.now() - 9 * DAY);
  await subscribe(tenantId, packagePlanId, BILLING_MODE.PACKAGE, endsAt);

  const vehicleId = newId();
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe đã có đơn',
      vehicleType: 'car',
      weekdayPrice: '700000',
    },
  });
  const bookingId = newId();
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `BK-${bookingId.slice(-8)}`,
      customerName: 'Khách cũ',
      customerPhone: '0900000001',
      pickupAt: new Date(Date.now() - 2 * DAY),
      returnAt: new Date(Date.now() - DAY),
      totalAmount: '700000',
      // Snapshot của tuyến GÓI: phí dịch vụ 0đ, khách trả đúng giá thuê.
      billingMode: BILLING_MODE.PACKAGE,
      serviceFeePercent: '0',
      serviceFeeAmount: '0',
      customerTotalAmount: '700000',
      ownerPayableAmount: '700000',
    },
  });

  const MONEY = {
    billingMode: true,
    serviceFeePercent: true,
    serviceFeeAmount: true,
    customerTotalAmount: true,
    ownerPayableAmount: true,
    totalAmount: true,
  } as const;
  const before = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: MONEY,
  });

  await sweepSubscriptionLifecycle(prisma, new Date());

  // Tenant ĐÃ chuyển tuyến…
  assert.equal(
    (await effectiveOf(tenantId, new Date())).billingMode,
    BILLING_MODE.COMMISSION,
  );
  // …nhưng đơn cũ không đổi một đồng nào, và vẫn mang tuyến của lúc nó ra đời.
  const afterRun = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: MONEY,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(afterRun)), JSON.parse(JSON.stringify(before)));
  assert.equal(afterRun.billingMode, BILLING_MODE.PACKAGE);

  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.vehicle.deleteMany({ where: { tenantId } });
});

/*
 * Bất biến TỔNG của F1: không mốc nào tenant bị đọc thành tuyến gói hay `unconfigured`.
 * Quét qua toàn bộ cửa sổ mà bản cũ để hở (kỳ 12 tháng hết hạn + 7 ngày ân hạn).
 */
test('quét từng 6 giờ qua cửa sổ cũ: không mốc nào thành tuyến gói hay unconfigured', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('sweep');
  const endsAt = new Date(Date.now() - 10 * DAY);
  await subscribe(tenantId, commissionPlanId, BILLING_MODE.COMMISSION, endsAt);
  await sweepSubscriptionLifecycle(prisma, new Date());

  for (let hour = 0; hour <= 10 * 24; hour += 6) {
    const at = new Date(endsAt.getTime() + hour * HOUR + 1_000);
    const billing = await effectiveOf(tenantId, at);
    assert.equal(billing.billingMode, BILLING_MODE.COMMISSION, `lệch tuyến ở giờ +${hour}`);
    assert.notEqual(billing.phase, BILLING_PHASE.UNCONFIGURED, `unconfigured ở giờ +${hour}`);
  }
});
