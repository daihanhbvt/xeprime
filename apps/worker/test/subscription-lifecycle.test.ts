import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
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
/** Bậc theo loại xe (ADR 0065) do từng test tự dựng — `after` dọn cùng. */
const extraPlanIds: string[] = [];
/** Người dùng thành viên do  dựng —  dọn cùng. */
const memberUserIds: string[] = [];

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
    data: {
      id: ownerId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Chủ vòng đời',
      email: `sl-${RUN}@xeprime.test`,
    },
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
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // Xe của các ca suất trên chợ (ADR 0085).
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.plan.deleteMany({
      where: { id: { in: [commissionPlanId, packagePlanId, ...extraPlanIds] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, ...memberUserIds] } } });
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

/*
 * ADR 0065 — gói theo LOẠI XE: một phạm vi hết ân hạn KHÔNG kéo cả gian hàng về hoa hồng khi phạm
 * vi kia còn đang ân hạn; chỉ khi phạm vi cuối cùng hết ân hạn thì mới hạ, và dòng hoa hồng nối
 * liền từ mốc hết ân hạn của CHÍNH phạm vi đó.
 */
test('gói theo loại: hạ về hoa hồng chỉ khi KHÔNG còn phạm vi nào giữ gói', async () => {
  if (!dbAvailable) return;
  const mkScopedPlan = async (scope: string) => {
    const id = newId();
    await prisma.plan.create({
      data: {
        id,
        code: `sl-${scope}-${RUN}`,
        name: `Gói ${scope}`,
        status: PLAN_STATUS.ACTIVE,
        billingMode: BILLING_MODE.PACKAGE,
        vehicleScope: scope,
        sortOrder: 999,
        limitsJson: { features: [], graceDays: 7, maxVehicles: 5, termPrices: [{ months: 1, price: '100000' }] },
      },
    });
    extraPlanIds.push(id);
    return id;
  };
  const motoPlan = await mkScopedPlan('motorbike');
  const carPlan = await mkScopedPlan('car');
  const tenantId = await mkTenant('scoped-lapse');
  const now = new Date();
  const motoEnds = new Date(now.getTime() - 9 * DAY); // hết ân hạn từ 2 ngày trước
  const carEnds = new Date(now.getTime() - 2 * DAY); // còn 5 ngày ân hạn
  for (const [planId, scope, endsAt] of [
    [motoPlan, 'motorbike', motoEnds],
    [carPlan, 'car', carEnds],
  ] as const) {
    await prisma.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId,
        planId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: 0,
        termMonths: 1,
        billingMode: BILLING_MODE.PACKAGE,
        vehicleScope: scope,
        startsAt: new Date(endsAt.getTime() - 30 * DAY),
        endsAt,
      },
    });
  }

  await sweepSubscriptionLifecycle(prisma, now);
  const commission = () =>
    prisma.tenantSubscription.findFirst({
      where: { tenantId, billingMode: BILLING_MODE.COMMISSION },
      select: { startsAt: true, vehicleScope: true },
    });
  assert.equal(await commission(), null, 'phạm vi ô tô còn ân hạn ⇒ chưa hạ tuyến');
  const rows = await prisma.tenantSubscription.findMany({
    where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE },
    select: { endsAt: true, billingMode: true, vehicleScope: true, plan: { select: { code: true, limitsJson: true } } },
  });
  assert.equal(resolveEffectiveBilling(rows, now).billingMode, BILLING_MODE.PACKAGE);

  // Sáu ngày sau: phạm vi ô tô cũng hết ân hạn ⇒ hạ, nối liền từ mốc hết ân hạn của ô tô.
  const later = new Date(now.getTime() + 6 * DAY);
  await sweepSubscriptionLifecycle(prisma, later);
  const created = await commission();
  assert.ok(created, 'hết mọi phạm vi ⇒ phải sinh dòng hoa hồng');
  assert.equal(created.startsAt.getTime(), carEnds.getTime() + 7 * DAY);
  assert.equal(created.vehicleScope, 'all');
});

/** Hai bậc theo loại xe dùng chung cho các test ADR 0065 bên dưới. */
async function scopedPlans(): Promise<{ moto: string; car: string }> {
  const mk = async (scope: string) => {
    const id = newId();
    await prisma.plan.create({
      data: {
        id,
        code: `sl2-${scope}-${RUN}-${id.slice(-4)}`,
        name: scope === 'car' ? 'Ô tô · 5 xe' : 'Xe máy · 1 xe',
        status: PLAN_STATUS.ACTIVE,
        billingMode: BILLING_MODE.PACKAGE,
        vehicleScope: scope,
        sortOrder: 999,
        limitsJson: { features: [], graceDays: 7, maxVehicles: 5, termPrices: [{ months: 1, price: '100000' }] },
      },
    });
    extraPlanIds.push(id);
    return id;
  };
  return { moto: await mk('motorbike'), car: await mk('car') };
}

async function scopedRow(tenantId: string, planId: string, scope: string, endsAt: Date) {
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 1,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: scope,
      startsAt: new Date(endsAt.getTime() - 30 * DAY),
      endsAt,
    },
  });
}

test('hai phạm vi cùng qua ân hạn trong MỘT lượt ⇒ hoa hồng nối từ mốc hết ân hạn MUỘN NHẤT', async () => {
  if (!dbAvailable) return;
  const plans = await scopedPlans();
  const tenantId = await mkTenant('both-lapsed');
  const now = new Date();
  const motoEnds = new Date(now.getTime() - 12 * DAY); // ân hạn hết 5 ngày trước
  const carEnds = new Date(now.getTime() - 9 * DAY); // ân hạn hết 2 ngày trước — muộn hơn
  await scopedRow(tenantId, plans.moto, 'motorbike', motoEnds);
  await scopedRow(tenantId, plans.car, 'car', carEnds);

  await sweepSubscriptionLifecycle(prisma, now);
  const rows = await prisma.tenantSubscription.findMany({
    where: { tenantId, billingMode: BILLING_MODE.COMMISSION },
    select: { startsAt: true },
  });
  assert.equal(rows.length, 1, 'đúng MỘT dòng hoa hồng');
  assert.equal(rows[0]!.startsAt.getTime(), carEnds.getTime() + 7 * DAY);
});

test('cặp gói ô tô + xe máy hết hạn cùng lúc ⇒ MỘT tin hết hạn nói cả hai loại', async () => {
  if (!dbAvailable) return;
  const plans = await scopedPlans();
  const tenantId = await mkTenant('pair-expired');
  // Người nhận tin là THÀNH VIÊN gian hàng (`notifyTenantMembers`).
  await prisma.tenantMembership.create({
    data: { id: newId(), tenantId, userId: ownerId, roleKey: 'shop_owner', status: 'active' },
  });
  const endsAt = new Date(Date.now() - HOUR);
  await scopedRow(tenantId, plans.moto, 'motorbike', endsAt);
  await scopedRow(tenantId, plans.car, 'car', endsAt);

  await sweepSubscriptionLifecycle(prisma, new Date());
  const notes = await prisma.notification.findMany({
    where: { tenantId, type: 'subscription_expired' },
    select: { title: true, body: true, userId: true },
  });
  const perUser = new Map<string, number>();
  for (const n of notes) perUser.set(n.userId ?? '', (perUser.get(n.userId ?? '') ?? 0) + 1);
  assert.ok(notes.length > 0, 'phải có tin hết hạn');
  for (const count of perUser.values()) assert.equal(count, 1, 'mỗi người MỘT tin cho cả cặp');
  assert.match(notes[0]!.title, /Xe máy · 1 xe/);
  assert.match(notes[0]!.title, /Ô tô · 5 xe/);
  assert.match(notes[0]!.body ?? '', /xe máy/);
  assert.match(notes[0]!.body ?? '', /ô tô/);
});

/**
 * Thành viên nhận tin của gian hàng (`notifyTenantMembers`). Mỗi gian hàng một người dùng RIÊNG:
 * một tài khoản đối tác thuộc tối đa MỘT gian hàng (ADR 0053, unique `user_id`).
 */
async function addMember(tenantId: string) {
  const userId = newId();
  await prisma.user.create({
    data: {
      id: userId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Thành viên vòng đời',
      email: `sl-m-${userId.slice(-8).toLowerCase()}-${RUN}@xeprime.test`,
    },
  });
  memberUserIds.push(userId);
  await prisma.tenantMembership.create({
    data: { id: newId(), tenantId, userId, roleKey: 'shop_owner', status: 'active' },
  });
}

const notesOf = (tenantId: string, type: string) =>
  prisma.notification.findMany({ where: { tenantId, type }, select: { body: true } });

test('đã gia hạn (có kỳ xếp sau) ⇒ không nhắc sắp hết hạn; huỷ kỳ xếp sau ⇒ được nhắc lại', async () => {
  if (!dbAvailable) return;
  const plans = await scopedPlans();
  const tenantId = await mkTenant('renewed-remind');
  await addMember(tenantId);
  const now = new Date();
  const endsAt = new Date(now.getTime() + 2 * DAY);
  await scopedRow(tenantId, plans.moto, 'motorbike', endsAt);
  const nextId = newId();
  await prisma.tenantSubscription.create({
    data: {
      id: nextId,
      tenantId,
      planId: plans.moto,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 1,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: 'motorbike',
      startsAt: endsAt,
      endsAt: new Date(endsAt.getTime() + 30 * DAY),
    },
  });

  await sweepSubscriptionLifecycle(prisma, now);
  assert.equal((await notesOf(tenantId, 'subscription_expiring')).length, 0, 'đã gia hạn ⇒ không nhắc');

  await prisma.tenantSubscription.update({
    where: { id: nextId },
    data: { status: SUBSCRIPTION_STATUS.CANCELLED },
  });
  await sweepSubscriptionLifecycle(prisma, now);
  assert.ok((await notesOf(tenantId, 'subscription_expiring')).length > 0, 'huỷ kỳ sau ⇒ nhắc lại');
});

test('kỳ hết hạn đã có kỳ nối tiếp ⇒ không báo "đã hết hạn", và cột mốc vẫn được claim', async () => {
  if (!dbAvailable) return;
  const plans = await scopedPlans();
  const tenantId = await mkTenant('renewed-expired');
  await addMember(tenantId);
  const now = new Date();
  const endsAt = new Date(now.getTime() - HOUR);
  await scopedRow(tenantId, plans.car, 'car', endsAt);
  // Kỳ nối tiếp là gói DOANH NGHIỆP (`all`) — xung đột với ô tô, nên cũng là "đã gia hạn".
  const entId = newId();
  await prisma.plan.create({
    data: {
      id: entId,
      code: `sl2-ent-${RUN}-${entId.slice(-4)}`,
      name: 'Doanh nghiệp',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: 'all',
      sortOrder: 999,
      limitsJson: { features: [], graceDays: 7, maxVehicles: null, salesOnly: true, termPrices: [] },
    },
  });
  extraPlanIds.push(entId);
  await scopedRow(tenantId, entId, 'all', new Date(endsAt.getTime() + 30 * DAY));
  await prisma.tenantSubscription.updateMany({
    where: { tenantId, planId: entId },
    data: { startsAt: endsAt },
  });

  await sweepSubscriptionLifecycle(prisma, now);
  assert.equal((await notesOf(tenantId, 'subscription_expired')).length, 0);
  const old = await prisma.tenantSubscription.findFirstOrThrow({
    where: { tenantId, planId: plans.car },
    select: { expiryNotifiedAt: true },
  });
  assert.ok(old.expiryNotifiedAt, 'claim để lượt sau không quét lại');
});

test('gói bán qua tư vấn sắp hết hạn ⇒ lời nhắc chỉ lối liên hệ XePrime', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('sales-only');
  await addMember(tenantId);
  const entId = newId();
  await prisma.plan.create({
    data: {
      id: entId,
      code: `sl2-ent2-${RUN}-${entId.slice(-4)}`,
      name: 'Doanh nghiệp',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: 'all',
      sortOrder: 999,
      limitsJson: { features: [], graceDays: 7, maxVehicles: null, salesOnly: true, termPrices: [] },
    },
  });
  extraPlanIds.push(entId);
  const now = new Date();
  await scopedRow(tenantId, entId, 'all', new Date(now.getTime() + 2 * DAY));

  await sweepSubscriptionLifecycle(prisma, now);
  const notes = await notesOf(tenantId, 'subscription_expiring');
  assert.ok(notes.length > 0);
  assert.match(notes[0]!.body ?? '', /liên hệ XePrime/);
  assert.doesNotMatch(notes[0]!.body ?? '', /Gói của tôi/);
});

// ─────────────────────── ADR 0085 — suất trên chợ khi đổi tuyến / đổi gói ───────────────────────

/** Xe đã duyệt; `marketplaceEnabled` = đang chiếm suất hay không. */
async function mkVehicle(tenantId: string, opts: { listed: boolean; publicStatus?: string }) {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `SLV-${id.slice(-8)}`,
      name: `Xe ${id.slice(-4)}`,
      vehicleType: 'car',
      publicStatus: opts.publicStatus ?? 'approved_public',
      marketplaceEnabled: opts.listed,
    } as never,
  });
  return id;
}

const marketOf = (id: string) =>
  prisma.vehicle.findUniqueOrThrow({
    where: { id },
    select: { marketplaceEnabled: true, marketplacePausedReason: true },
  });

/** Thành viên KHÔNG phải chủ — người sẽ bị khoá khi gian hàng về tuyến hoa hồng. */
async function addStaff(tenantId: string): Promise<string> {
  const userId = newId();
  await prisma.user.create({
    data: {
      id: userId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Nhân viên vòng đời',
      email: `sl-s-${userId.slice(-8).toLowerCase()}-${RUN}@xeprime.test`,
    },
  });
  memberUserIds.push(userId);
  const membershipId = newId();
  await prisma.tenantMembership.create({
    data: { id: membershipId, tenantId, userId, roleKey: 'shop_staff', status: 'active' },
  });
  return membershipId;
}

test('ADR 0085: hết ân hạn mọi gói ⇒ toàn bộ xe đang hiện tạm ẩn, nhân viên tạm khoá, chủ thì không', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('slot-lapse');
  await addMember(tenantId); // chủ
  const staff = await addStaff(tenantId);
  const shown = [await mkVehicle(tenantId, { listed: true }), await mkVehicle(tenantId, { listed: true })];
  const paused = await mkVehicle(tenantId, { listed: false });
  await subscribe(tenantId, packagePlanId, BILLING_MODE.PACKAGE, new Date(Date.now() - 9 * DAY));

  await sweepSubscriptionLifecycle(prisma, new Date());

  for (const id of shown) {
    assert.deepEqual(await marketOf(id), { marketplaceEnabled: false, marketplacePausedReason: 'plan_limit' });
  }
  // Xe chủ đã tự tạm ẩn từ trước: giữ nguyên lý do của chủ (NULL), không bị đổi thành "hết suất".
  assert.deepEqual(await marketOf(paused), { marketplaceEnabled: false, marketplacePausedReason: null });

  const members = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: { id: true, roleKey: true, status: true, lockedReason: true },
  });
  const staffRow = members.find((m) => m.id === staff)!;
  assert.equal(staffRow.status, 'locked');
  assert.equal(staffRow.lockedReason, 'plan_lapsed');
  const owner = members.find((m) => m.roleKey === 'shop_owner')!;
  assert.equal(owner.status, 'active');

  const notes = await notesOf(tenantId, 'subscription_lapsed');
  assert.ok(notes.length > 0);
  assert.match(notes[0]!.body ?? '', /2 xe đã tạm ẩn/);
  assert.doesNotMatch(notes[0]!.body ?? '', /VẪN Ở TRÊN CHỢ/);
});

test('ADR 0085: kỳ hạ bậc vừa bắt đầu ⇒ áp lựa chọn xe giữ lại trên hoá đơn, đúng MỘT lần', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('slot-term-start');
  const keep = await mkVehicle(tenantId, { listed: true });
  const drop = await mkVehicle(tenantId, { listed: true });
  const subId = newId();
  await prisma.tenantSubscription.create({
    data: {
      id: subId,
      tenantId,
      planId: packagePlanId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 100000,
      termMonths: 1,
      billingMode: BILLING_MODE.PACKAGE,
      quotaJson: { maxVehicles: 1, maxBranches: null, maxMembers: null },
      startsAt: new Date(Date.now() - HOUR),
      endsAt: new Date(Date.now() + 30 * DAY),
    },
  });
  const now = new Date();
  await prisma.subscriptionInvoice.create({
    data: {
      id: newId(),
      tenantId,
      subscriptionId: subId,
      code: `XPG${newId().slice(-8)}`,
      periodFrom: now,
      periodTo: new Date(now.getTime() + 30 * DAY),
      linesJson: {
        planId: packagePlanId,
        planCode: `sl-package-${RUN}`,
        termMonths: 1,
        vehicleScope: 'all',
        quota: { maxVehicles: 1, maxBranches: null, maxMembers: null },
        lines: [{ kind: 'package', quantity: 1, months: 1, unitPrice: '100000', amount: '100000' }],
        vehicleSlots: { keepVehicleIds: [keep] },
      },
      subtotal: 100000,
      totalAmount: 100000,
      paidAmount: 100000,
      status: 'paid',
    },
  });

  await sweepSubscriptionLifecycle(prisma, new Date());
  await sweepSubscriptionLifecycle(prisma, new Date());

  assert.equal((await marketOf(keep)).marketplaceEnabled, true);
  assert.deepEqual(await marketOf(drop), { marketplaceEnabled: false, marketplacePausedReason: 'plan_limit' });
  const sub = await prisma.tenantSubscription.findUniqueOrThrow({
    where: { id: subId },
    select: { slotsAppliedAt: true },
  });
  assert.ok(sub.slotsAppliedAt, 'kỳ đã áp suất phải được claim');
  const audits = await prisma.auditLog.count({
    where: { tenantId, action: 'vehicle.marketplace_paused_by_plan' },
  });
  assert.equal(audits, 1, 'chạy lại job không áp lần hai');
});

test('ADR 0085: còn chưa tới 1 ngày ân hạn ⇒ nhắc lần cuối MỘT lần, nói rõ hậu quả', async () => {
  if (!dbAvailable) return;
  const tenantId = await mkTenant('slot-final-reminder');
  await addMember(tenantId);
  // Ân hạn 7 ngày ⇒ kết thúc sau 12 giờ nữa.
  await subscribe(tenantId, packagePlanId, BILLING_MODE.PACKAGE, new Date(Date.now() - 7 * DAY + 12 * HOUR));

  await sweepSubscriptionLifecycle(prisma, new Date());
  await sweepSubscriptionLifecycle(prisma, new Date());

  const finals = (await notesOf(tenantId, 'subscription_expired')).filter((n) =>
    /toàn bộ xe sẽ tạm ẩn/.test(n.body ?? ''),
  );
  assert.equal(finals.length >= 1, true);
  const titles = await prisma.notification.findMany({
    where: { tenantId, title: { startsWith: 'Còn 1 ngày ân hạn' } },
    select: { userId: true },
  });
  // Một tin mỗi người nhận, không lặp ở lượt chạy thứ hai.
  assert.equal(new Set(titles.map((t) => t.userId)).size, titles.length);
  assert.ok(titles.length > 0);
});
