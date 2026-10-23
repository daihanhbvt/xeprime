import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArgumentsHost } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  addCalendarMonthsVn,
  API_ERROR_CODE,
  BILLING_MODE,
  BILLING_PHASE,
  PLAN_STATUS,
  PLAN_VEHICLE_SCOPE,
  SHOP_ONBOARDING_STATE,
  SUBSCRIPTION_CHANGE_TIMING,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
  VEHICLE_TYPE,
  type PlanVehicleScope,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { tenantPlanSummary } from '../src/modules/platform-admin/plan-terms';
import { SepayService } from '../src/modules/sepay/sepay.service';
import {
  giveShopStorefront,
  makeBillingService,
  makeBookingHoldsService,
  makeVehiclesService,
  seedBranch,
  vehicleCreator,
} from './helpers/service-factory';
import { requiredVehicleImageRows } from './helpers/vehicle-media';

/**
 * ADR 0065 — gói gian hàng theo LOẠI XE, trên PostgreSQL THẬT.
 *
 * Khoá đúng các bất biến mà ADR đặt ra: gói ô tô + gói xe máy chạy song song; hai kỳ cùng phạm vi
 * hay một kỳ `all` chồng lên kỳ theo loại bị DB từ chối (EXCLUDE, không phải check ở app); hạn mức
 * đếm theo loại; loại xe chưa có gói ⇒ `PLAN_SCOPE_REQUIRED`; một phạm vi hết hạn không kéo cả gian
 * hàng về hoa hồng; hoá đơn của bậc cũ (trước ADR 0065) vẫn kích hoạt được.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing = makeBillingService(asService);

const RUN = newId().slice(-8).toLowerCase();
const DAY = 86_400_000;

let dbAvailable = false;
let actorId: string;
const planIds: string[] = [];
const tenantIds: string[] = [];

type Plans = Record<'car5' | 'car1' | 'moto1' | 'moto5' | 'moto10' | 'enterprise', { id: string }>;
let plans: Plans;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function mkPlan(
  code: string,
  vehicleScope: PlanVehicleScope,
  maxVehicles: number | null,
  salesOnly = false,
) {
  const plan = await billing.createPlan(actorId, {
    code: `${code}-${RUN}`,
    name: `Gói ${code}`,
    billingMode: BILLING_MODE.PACKAGE,
    vehicleScope,
    sortOrder: 950,
    limits: {
      maxVehicles,
      graceDays: 7,
      salesOnly,
      termPrices: salesOnly ? [] : [{ months: 1, price: '100000' }, { months: 3, price: '270000' }],
      features: ['finance'],
    },
  });
  planIds.push(plan.id);
  return plan;
}

async function mkTenant(tag: string): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name: `ScopeShop-${tag}-${RUN}`,
      status: 'active',
      ownerUserId: actorId,
    },
  });
  tenantIds.push(id);
  return id;
}

async function mkVehicles(tenantId: string, type: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    const id = newId();
    await prisma.vehicle.create({
      data: {
        id,
        tenantId,
        code: `SC-${id.slice(-8)}`,
        name: `Xe ${type} ${i}`,
        vehicleType: type,
      } as Prisma.VehicleUncheckedCreateInput,
    });
  }
}

function liveRows(tenantId: string) {
  return prisma.tenantSubscription.findMany({
    where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
    include: { plan: { select: { code: true } } },
  });
}

/** Chèn THẲNG một kỳ gói bằng Prisma — để chứng minh DB tự chặn, không qua BillingService. */
function rawPackageRow(tenantId: string, planId: string, scope: string, startsAt: Date, endsAt: Date) {
  return prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 1,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: scope,
      quotaJson: { maxVehicles: 5, maxBranches: null, maxMembers: null },
      startsAt,
      endsAt,
    },
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
  actorId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: actorId,
      displayName: 'Scope Admin',
      email: `scope-${RUN}@xeprime.test`,
    },
  });
  plans = {
    car1: await mkPlan('car_1', PLAN_VEHICLE_SCOPE.CAR, 1),
    car5: await mkPlan('car_5', PLAN_VEHICLE_SCOPE.CAR, 5),
    moto1: await mkPlan('moto_1', PLAN_VEHICLE_SCOPE.MOTORBIKE, 1),
    moto5: await mkPlan('moto_5', PLAN_VEHICLE_SCOPE.MOTORBIKE, 5),
    moto10: await mkPlan('moto_10', PLAN_VEHICLE_SCOPE.MOTORBIKE, 10),
    enterprise: await mkPlan('enterprise', PLAN_VEHICLE_SCOPE.ALL, null, true),
  };
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: actorId } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
  await prisma.$disconnect();
});

describe('ADR 0065 — gói theo loại xe', () => {
  maybe('bậc commission chỉ được phạm vi all', async () => {
    await expect(
      billing.createPlan(actorId, {
        code: `bad-comm-${RUN}`,
        name: 'x',
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: 10,
        vehicleScope: PLAN_VEHICLE_SCOPE.CAR,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('gói ô tô + gói xe máy chạy SONG SONG; hạn mức đếm theo loại', async () => {
    const tenantId = await mkTenant('pair');
    await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    await billing.assign(tenantId, actorId, { planId: plans.moto1.id, termMonths: 1 });

    const live = await liveRows(tenantId);
    // Cả hai bắt đầu NGAY — gói xe máy không nối đuôi gói ô tô.
    expect(live.map((r) => r.vehicleScope).sort()).toEqual(['car', 'motorbike']);
    expect(live.every((r) => r.startsAt.getTime() <= Date.now())).toBe(true);

    const eff = await billing.effectiveBillingFor(tenantId);
    expect(eff.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(eff.packageScopes).toEqual(['car', 'motorbike']);

    await mkVehicles(tenantId, VEHICLE_TYPE.CAR, 4);
    await mkVehicles(tenantId, VEHICLE_TYPE.MOTORBIKE, 1);
    // Ô tô còn đúng một suất; xe máy đã chạm trần 1 dù ô tô còn chỗ (không dùng trần của nhau).
    await expect(billing.assertVehicleQuota(tenantId, VEHICLE_TYPE.CAR)).resolves.toBeUndefined();
    await expect(billing.assertVehicleQuota(tenantId, VEHICLE_TYPE.MOTORBIKE)).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        details: { vehicleType: VEHICLE_TYPE.MOTORBIKE, used: 1, limit: 1 },
      },
    });

    const mine = await billing.mySubscription(tenantId);
    expect(mine.currentPlans.map((p) => p.vehicleScope)).toEqual(['car', 'motorbike']);
    expect(mine.vehicleQuotas.car).toMatchObject({ kind: 'total', limit: 5, used: 4, countedScope: 'car' });
    expect(mine.vehicleQuotas.motorbike).toMatchObject({ kind: 'total', limit: 1, used: 1 });
    expect(mine.fleetQuota).toMatchObject({ kind: 'total', totalLimit: 6, totalUsed: 5 });
  });

  maybe('tuyến gói chưa có gói cho một loại ⇒ PLAN_SCOPE_REQUIRED, không rơi về Owner Lite', async () => {
    const tenantId = await mkTenant('scope-required');
    await billing.assign(tenantId, actorId, { planId: plans.car1.id, termMonths: 1 });
    for (const scope of ['fleet', 'marketplace'] as const) {
      await expect(
        billing.assertVehicleQuota(tenantId, VEHICLE_TYPE.MOTORBIKE, { scope }),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED,
          details: { vehicleType: VEHICLE_TYPE.MOTORBIKE },
        },
      });
    }
    const mine = await billing.mySubscription(tenantId);
    expect(mine.vehicleQuotas.motorbike.kind).toBe('scope_required');
  });

  maybe('DB từ chối hai kỳ gói CÙNG phạm vi chồng nhau (EXCLUDE)', async () => {
    const tenantId = await mkTenant('overlap');
    const now = Date.now();
    await rawPackageRow(tenantId, plans.car5.id, 'car', new Date(now), new Date(now + 30 * DAY));
    await expect(
      rawPackageRow(tenantId, plans.car1.id, 'car', new Date(now + DAY), new Date(now + 40 * DAY)),
    ).rejects.toThrow(/tenant_subscriptions_package_scope_no_overlap|23P01|exclusion/i);
    // Nối đuôi (`[)` nửa mở) thì được.
    await expect(
      rawPackageRow(tenantId, plans.car1.id, 'car', new Date(now + 30 * DAY), new Date(now + 60 * DAY)),
    ).resolves.toBeTruthy();
    // Khác loại thì chồng được.
    await expect(
      rawPackageRow(tenantId, plans.moto1.id, 'motorbike', new Date(now), new Date(now + 30 * DAY)),
    ).resolves.toBeTruthy();
    // Kỳ `all` chồng lên kỳ theo loại ⇒ bị từ chối.
    await expect(
      rawPackageRow(tenantId, plans.enterprise.id, 'all', new Date(now + DAY), new Date(now + 2 * DAY)),
    ).rejects.toThrow(/tenant_subscriptions_package_scope_no_overlap|23P01|exclusion/i);
  });

  maybe('trigger: phạm vi trên dòng thuê bao phải khớp phạm vi của bậc', async () => {
    const tenantId = await mkTenant('scope-mismatch');
    const now = Date.now();
    await expect(
      rawPackageRow(tenantId, plans.car5.id, 'motorbike', new Date(now), new Date(now + DAY)),
    ).rejects.toThrow(/vehicle_scope/);
  });

  maybe('gói doanh nghiệp: next_term nối sau kỳ muộn nhất; now huỷ cả hai kỳ theo loại', async () => {
    const tenantId = await mkTenant('enterprise');
    await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    await billing.assign(tenantId, actorId, { planId: plans.moto1.id, termMonths: 3 });

    // Bậc salesOnly bắt buộc giá đàm phán.
    await expect(
      billing.assign(tenantId, actorId, { planId: plans.enterprise.id, termMonths: 1 }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const scheduled = await billing.assign(tenantId, actorId, {
      planId: plans.enterprise.id,
      termMonths: 1,
      price: '5000000',
    });
    const moto = (await liveRows(tenantId)).find((r) => r.vehicleScope === 'motorbike')!;
    expect(new Date(scheduled.startsAt).getTime()).toBe(moto.endsAt.getTime());

    // Huỷ kỳ doanh nghiệp đã xếp lịch rồi đổi NGAY.
    await billing.cancel(tenantId, actorId, scheduled.id);
    const now = await billing.assign(tenantId, actorId, {
      planId: plans.enterprise.id,
      termMonths: 1,
      price: '5000000',
      timing: SUBSCRIPTION_CHANGE_TIMING.NOW,
    });
    const live = await liveRows(tenantId);
    expect(live.map((r) => r.id)).toEqual([now.id]);
    expect(now.vehicleScope).toBe('all');
    const cancels = await prisma.auditLog.count({
      where: { tenantId, action: 'subscription.cancel', afterJson: { path: ['reason'], equals: 'replaced' } },
    });
    expect(cancels).toBe(2);
  });

  maybe('gán gói doanh nghiệp void hoá đơn mở của ô tô/xe máy', async () => {
    const tenantId = await mkTenant('enterprise-void');
    const carInvoice = await billing.purchase(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    const motoInvoice = await billing.purchase(tenantId, actorId, { planId: plans.moto1.id, termMonths: 3 });
    // Mỗi phạm vi giữ MỘT hoá đơn trả được — hai hoá đơn cùng sống.
    const pending = await billing.pendingInvoiceForTenant(tenantId);
    expect(pending.invoices.map((i) => i.id).sort()).toEqual([carInvoice.id, motoInvoice.id].sort());
    expect(carInvoice.vehicleScope).toBe('car');

    await billing.assign(tenantId, actorId, {
      planId: plans.enterprise.id,
      termMonths: 1,
      price: '5000000',
    });
    const statuses = await prisma.subscriptionInvoice.findMany({
      where: { id: { in: [carInvoice.id, motoInvoice.id] } },
      select: { status: true },
    });
    expect(statuses.every((s) => s.status === SUBSCRIPTION_INVOICE_STATUS.VOID)).toBe(true);
  });

  maybe('moto_5 → moto_10 đổi ngay chỉ đụng chuỗi xe máy', async () => {
    const tenantId = await mkTenant('moto-upgrade');
    const car = await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    await billing.assign(tenantId, actorId, { planId: plans.moto5.id, termMonths: 1 });
    const up = await billing.assign(tenantId, actorId, {
      planId: plans.moto10.id,
      termMonths: 1,
      timing: SUBSCRIPTION_CHANGE_TIMING.NOW,
    });
    const live = await liveRows(tenantId);
    expect(live.map((r) => r.id).sort()).toEqual([car.id, up.id].sort());
  });

  maybe('huỷ gói ô tô khi gói xe máy còn chạy ⇒ vẫn tuyến gói, KHÔNG gán dòng hoa hồng', async () => {
    const tenantId = await mkTenant('cancel-one');
    const car = await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    await billing.assign(tenantId, actorId, { planId: plans.moto1.id, termMonths: 1 });
    await billing.cancel(tenantId, actorId, car.id);
    const live = await liveRows(tenantId);
    expect(live.map((r) => r.billingMode)).toEqual([BILLING_MODE.PACKAGE]);
    expect((await billing.effectiveBillingFor(tenantId)).billingMode).toBe(BILLING_MODE.PACKAGE);
  });

  maybe('một phạm vi hết ân hạn, phạm vi kia còn ⇒ vẫn tuyến gói; hết cả hai ⇒ hoa hồng', async () => {
    const tenantId = await mkTenant('lapse-one');
    const now = Date.now();
    // Kỳ xe máy đã qua ân hạn (7 ngày), kỳ ô tô còn hạn.
    await rawPackageRow(tenantId, plans.moto1.id, 'motorbike', new Date(now - 60 * DAY), new Date(now - 20 * DAY));
    const car = await rawPackageRow(tenantId, plans.car5.id, 'car', new Date(now - DAY), new Date(now + 10 * DAY));
    let eff = await billing.effectiveBillingFor(tenantId);
    expect(eff.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(eff.packageScopes).toEqual(['car']);
    await expect(billing.assertVehicleQuota(tenantId, VEHICLE_TYPE.MOTORBIKE)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED },
    });

    // Kỳ ô tô cũng qua ân hạn ⇒ cả gian hàng về hoa hồng (pha lapsed), trần Owner Lite.
    await prisma.tenantSubscription.update({
      where: { id: car.id },
      data: { startsAt: new Date(now - 50 * DAY), endsAt: new Date(now - 19 * DAY) },
    });
    eff = await billing.effectiveBillingFor(tenantId);
    expect(eff.phase).toBe(BILLING_PHASE.LAPSED);
    expect(eff.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(await billing.vehicleQuotaFor(tenantId, VEHICLE_TYPE.MOTORBIKE)).toMatchObject({
      kind: 'total',
      reason: 'owner_lite',
      countedScope: 'all',
    });
  });

  maybe('hoá đơn của bậc CŨ (trước ADR 0065) vẫn kích hoạt — ra kỳ `all`, xếp sau kỳ đang chạy', async () => {
    const tenantId = await mkTenant('legacy-invoice');
    const legacy = await prisma.plan.create({
      data: {
        id: newId(),
        code: `legacy-basic-${RUN}`,
        name: 'Gói cơ bản (cũ)',
        billingMode: BILLING_MODE.PACKAGE,
        status: PLAN_STATUS.ARCHIVED,
        sortOrder: 990,
        limitsJson: { maxVehicles: 3, maxBranches: 1, termPrices: [], graceDays: 7, features: [] },
      },
    });
    planIds.push(legacy.id);
    const car = await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });

    const code = `XPG${RUN.toUpperCase().slice(0, 8)}`.slice(0, 11);
    const now = new Date();
    await prisma.subscriptionInvoice.create({
      data: {
        id: newId(),
        tenantId,
        code,
        periodFrom: now,
        periodTo: addCalendarMonthsVn(now, 3),
        // Hình dạng TRƯỚC ADR 0065 (và trước ADR 0041): không `vehicleScope`, `slots` thay `quota`.
        linesJson: {
          planId: legacy.id,
          planCode: legacy.code,
          termMonths: 3,
          slots: { car: 2, motorbike: 1 },
          lines: [{ kind: 'package', quantity: 1, months: 3, unitPrice: '250000', amount: '250000' }],
        },
        subtotal: 250000,
        totalAmount: 250000,
        status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      },
    });
    const result = await prisma.$transaction((tx) =>
      billing.applyBankPaymentWithinTx(tx, {
        code,
        amount: new Prisma.Decimal(250000),
        providerTxId: `tx-${RUN}`,
      }),
    );
    expect(result.outcome).toBe('activated');
    const sub = await prisma.tenantSubscription.findUniqueOrThrow({
      where: { id: (result as { subscriptionId: string }).subscriptionId },
    });
    expect(sub.vehicleScope).toBe('all');
    expect(sub.quotaJson).toMatchObject({ maxVehicles: 3 });
    // `all` xung đột với kỳ ô tô ⇒ bắt đầu khi kỳ ô tô kết thúc, không chồng.
    expect(sub.startsAt.toISOString()).toBe(car.endsAt);
  });
});

// ───────────────────────────── Vòng review (21/10/2026) ─────────────────────────────

const vehiclesService = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehiclesService, asService);
const sepay = new SepayService(asService, billing, makeBookingHoldsService(asService), {
  get: (key: string) => (key === 'SEPAY_API_KEY' ? 'test-key-adr0065-0123456789' : undefined),
} as unknown as ConfigService);

/** Gọi bộ lọc lỗi toàn cục với lỗi THẬT — đúng đường mà một request HTTP đi qua. */
function throughFilter(error: unknown): { status: number; body: { error: { code: string } } } {
  const captured = { status: 0, body: { error: { code: '' } } };
  const res = {
    setHeader: () => undefined,
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: { error: { code: string } }) {
      captured.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter(true).catch(error, host);
  return captured;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

function rawInvoice(tenantId: string, scope: string, status: string) {
  return prisma.subscriptionInvoice.create({
    data: {
      id: newId(),
      tenantId,
      code: `XPG${newId().slice(-8)}`,
      periodFrom: new Date(),
      periodTo: addCalendarMonthsVn(new Date(), 1),
      vehicleScope: scope,
      linesJson: { planId: plans.enterprise.id, planCode: 'legacy', termMonths: 1, lines: [] },
      subtotal: 100000,
      totalAmount: 100000,
      paidAmount: status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID ? 50000 : 0,
      status,
    },
  });
}

describe('ADR 0065 — vòng review', () => {
  maybe('M2: EXCLUDE chuỗi kỳ ⇒ 409 SUBSCRIPTION_TERM_CONFLICT; trigger phạm vi ⇒ 400 VALIDATION_FAILED', async () => {
    const tenantId = await mkTenant('filter');
    const now = Date.now();
    await rawPackageRow(tenantId, plans.car5.id, 'car', new Date(now), new Date(now + 30 * DAY));
    const overlap = await caught(
      rawPackageRow(tenantId, plans.car1.id, 'car', new Date(now + DAY), new Date(now + 2 * DAY)),
    );
    expect(throughFilter(overlap)).toMatchObject({
      status: 409,
      body: { error: { code: API_ERROR_CODE.SUBSCRIPTION_TERM_CONFLICT } },
    });
    const mismatch = await caught(
      rawPackageRow(tenantId, plans.car5.id, 'motorbike', new Date(now), new Date(now + DAY)),
    );
    expect(throughFilter(mismatch)).toMatchObject({
      status: 400,
      body: { error: { code: API_ERROR_CODE.VALIDATION_FAILED } },
    });
  });

  maybe('M3: hoá đơn `all` cũ còn mở bị void khi mua gói ô tô; `all` trả dở thì CHẶN mua', async () => {
    const tenantId = await mkTenant('legacy-all-invoice');
    const partial = await rawInvoice(tenantId, 'all', SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID);
    // `all` xung đột với MỌI phạm vi ⇒ chặn cả mua ô tô lẫn mua xe máy.
    for (const planId of [plans.car5.id, plans.moto1.id]) {
      await expect(billing.purchase(tenantId, actorId, { planId, termMonths: 1 })).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.SUBSCRIPTION_INVOICE_PARTIALLY_PAID },
      });
    }
    await prisma.subscriptionInvoice.update({
      where: { id: partial.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });

    const issued = await rawInvoice(tenantId, 'all', SUBSCRIPTION_INVOICE_STATUS.ISSUED);
    await billing.purchase(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    expect(
      (await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: issued.id } })).status,
    ).toBe(SUBSCRIPTION_INVOICE_STATUS.VOID);
  });

  maybe('M3: KÍCH HOẠT gói ô tô void hoá đơn `all` còn mở (chiều ngược của gán doanh nghiệp)', async () => {
    const tenantId = await mkTenant('activate-voids-all');
    const car = await billing.purchase(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    // Hoá đơn `all` sinh SAU (dữ liệu cũ/ghi tay) — cùng sống với hoá đơn ô tô.
    const all = await rawInvoice(tenantId, 'all', SUBSCRIPTION_INVOICE_STATUS.ISSUED);
    const result = await prisma.$transaction((tx) =>
      billing.applyBankPaymentWithinTx(tx, {
        code: car.code,
        amount: new Prisma.Decimal(car.totalAmount),
        providerTxId: `act-${RUN}`,
      }),
    );
    expect(result.outcome).toBe('activated');
    expect(
      (await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: all.id } })).status,
    ).toBe(SUBSCRIPTION_INVOICE_STATUS.VOID);
  });

  maybe('mua SONG SONG hai phạm vi khác nhau ⇒ cả hai hoá đơn cùng sống', async () => {
    const tenantId = await mkTenant('concurrent');
    const [car, moto] = await Promise.all([
      billing.purchase(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 }),
      billing.purchase(tenantId, actorId, { planId: plans.moto1.id, termMonths: 1 }),
    ]);
    const pending = await billing.pendingInvoiceForTenant(tenantId);
    expect(pending.invoices.map((i) => i.id).sort()).toEqual([car.id, moto.id].sort());
  });

  maybe('L5: huỷ gói ô tô khi gói xe máy đang ÂN HẠN ⇒ không gán dòng hoa hồng, vẫn tuyến gói', async () => {
    const tenantId = await mkTenant('cancel-grace');
    const now = Date.now();
    await rawPackageRow(
      tenantId,
      plans.moto1.id,
      'motorbike',
      new Date(now - 30 * DAY),
      new Date(now - 2 * DAY),
    );
    const car = await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    await billing.cancel(tenantId, actorId, car.id);
    expect(
      await prisma.tenantSubscription.count({
        where: { tenantId, billingMode: BILLING_MODE.COMMISSION },
      }),
    ).toBe(0);
    const eff = await billing.effectiveBillingFor(tenantId);
    expect(eff.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(eff.phase).toBe(BILLING_PHASE.GRACE);
  });

  maybe('L6: bậc `draft` không lên bảng giá, không tự mua, gán tay phải có giá; mở bán ⇒ bán được', async () => {
    const draft = await mkPlan('draft-car', PLAN_VEHICLE_SCOPE.CAR, 3);
    await prisma.plan.update({ where: { id: draft.id }, data: { status: PLAN_STATUS.DRAFT } });
    const tenantId = await mkTenant('draft');

    expect((await billing.listPlansForTenant()).some((p) => p.id === draft.id)).toBe(false);
    await expect(
      billing.purchase(tenantId, actorId, { planId: draft.id, termMonths: 1 }),
    ).rejects.toMatchObject({ response: { details: { planStatus: PLAN_STATUS.DRAFT } } });
    await expect(
      billing.assign(tenantId, actorId, { planId: draft.id, termMonths: 1 }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    await expect(
      billing.assign(tenantId, actorId, { planId: draft.id, termMonths: 1, price: '123000' }),
    ).resolves.toMatchObject({ price: '123000' });

    const published = await billing.activatePlan(actorId, draft.id);
    expect(published.status).toBe(PLAN_STATUS.ACTIVE);
    expect((await billing.listPlansForTenant()).some((p) => p.id === draft.id)).toBe(true);
    const catalog = await billing.planCatalogForTenant();
    expect(catalog.groups.map((g) => g.vehicleScope)).toEqual(['motorbike', 'car', 'all']);
  });

  maybe('L9: trần gộp của danh sách admin không đếm một loại xe hai lần', async () => {
    const now = new Date();
    const row = (scope: string, max: number | null, endsAt: Date) => ({
      id: newId(),
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: scope,
      startsAt: new Date(endsAt.getTime() - 30 * DAY),
      endsAt,
      quotaJson: { maxVehicles: max, maxBranches: null, maxMembers: null },
      plan: { code: scope, name: scope, limitsJson: { graceDays: 7 } },
    });
    // Kỳ `all` (trần 10) đang ân hạn + kỳ ô tô (trần 5) còn hạn: ô tô do kỳ ô tô gác, xe máy do
    // kỳ `all` gác ⇒ 5 + 10 — KHÔNG phải 5 + 10 + 10.
    const summary = tenantPlanSummary(
      [row('car', 5, new Date(now.getTime() + 10 * DAY)), row('all', 10, new Date(now.getTime() - DAY))],
      null,
      now,
    );
    expect(summary.vehicleLimit).toBe(15);
  });

  maybe('PLAN_SCOPE_REQUIRED khi ĐỔI LOẠI xe sang loại chưa có gói (VehiclesService.update)', async () => {
    const tenantId = await mkTenant('type-change');
    await billing.assign(tenantId, actorId, { planId: plans.car5.id, termMonths: 1 });
    const car = await createVehicle(tenantId, actorId, {
      code: `TC-${RUN}`,
      name: 'Vios',
      vehicleType: VEHICLE_TYPE.CAR,
    } as Parameters<typeof vehiclesService.create>[2]);
    await expect(
      vehiclesService.update(
        tenantId,
        car.id,
        actorId,
        { vehicleType: VEHICLE_TYPE.MOTORBIKE } as Parameters<typeof vehiclesService.update>[3],
        null,
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED,
        details: { vehicleType: VEHICLE_TYPE.MOTORBIKE },
      },
    });
  });

  maybe('PLAN_SCOPE_REQUIRED khi GỬI LÊN CHỢ xe thuộc loại chưa có gói (submitForPublicReview)', async () => {
    const tenantId = await mkTenant('submit');
    await billing.assign(tenantId, actorId, { planId: plans.moto1.id, termMonths: 1 });
    await giveShopStorefront(asService, tenantId);
    const branchId = await seedBranch(asService, { tenantId });
    const id = newId();
    await prisma.vehicle.create({
      data: {
        id,
        tenantId,
        branchId,
        code: `SB-${id.slice(-6)}`,
        name: 'Toyota Vios',
        vehicleType: VEHICLE_TYPE.CAR,
        plateNumber: '51K-654.32',
        description: 'Xe 5 chỗ máy xăng.',
        mainImageUrl: 'https://img.example/sb-vios.jpg',
        brand: 'toyota',
        model: 'Vios',
        manufactureYear: 2022,
        seatCount: 5,
        fuelType: 'gasoline',
        transmission: 'automatic',
        fuelConsumptionCombined: 7.5,
        weekdayPrice: '600000',
        bodyType: 'sedan',
      },
    });
    await prisma.vehicleImage.createMany({
      data: requiredVehicleImageRows({ vehicleId: id, tenantId, vehicleType: VEHICLE_TYPE.CAR }),
    });
    await expect(vehiclesService.submitForPublicReview(tenantId, id, actorId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED, details: { vehicleType: VEHICLE_TYPE.CAR } },
    });
  });

  maybe('SePay XPG: gói ĐẦU TIÊN (phạm vi bất kỳ) đưa package_pending → package_active', async () => {
    const tenantId = await mkTenant('sepay-first-scope');
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING },
    });
    const invoice = await billing.purchase(tenantId, actorId, { planId: plans.moto1.id, termMonths: 1 });
    const providerTxId = `ADR0065-${RUN}`;
    try {
      const result = await sepay.ingest({
        id: providerTxId,
        gateway: 'MBBank',
        transactionDate: '2026-10-21 10:15:00',
        accountNumber: '0000111122',
        content: `Thanh toan ${invoice.code}`,
        transferType: 'in',
        transferAmount: Number(invoice.totalAmount),
        accumulated: 0,
        referenceCode: 'FT-ADR0065',
      });
      expect(result).toMatchObject({ received: true, matched: true });
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant.onboardingState).toBe(SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE);
      expect((await billing.effectiveBillingFor(tenantId)).packageScopes).toEqual(['motorbike']);
    } finally {
      await prisma.bankTransaction.deleteMany({ where: { providerTxId } });
    }
  });

  /*
   * Ánh xạ thuê bao cũ của migration — chạy CHÍNH đoạn SQL bước 4 của file migration (đọc từ đĩa)
   * trên dữ liệu dựng sẵn, trong một transaction rồi ROLLBACK, nên database test không đổi.
   */
  maybe('migration bước 4: đội xe 0 / 1+1 / 5+2 / 6+5 / 11 xe máy / shop-pro', async () => {
    const sql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261021110000_per_vehicle_type_plans/migration.sql'),
      'utf8',
    );
    const start = sql.indexOf('DROP TABLE IF EXISTS "_adr0065_map";');
    const end = sql.indexOf('-- Nói ra số dòng đã ánh xạ');
    expect(start).toBeGreaterThan(0);
    const statements = sql
      .slice(start, end)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*\n/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    const legacy = await prisma.plan.findMany({
      where: { code: { in: ['shop-basic', 'shop-pro'] } },
      select: { id: true, code: true },
    });
    const basic = legacy.find((p) => p.code === 'shop-basic');
    const pro = legacy.find((p) => p.code === 'shop-pro');
    if (!basic || !pro) {
      console.warn('[skip] database test thiếu bậc shop-basic/shop-pro');
      return;
    }
    const fleets: Record<string, { cars: number; motos: number; plan: string }> = {
      f0: { cars: 0, motos: 0, plan: basic.id },
      f1: { cars: 1, motos: 1, plan: basic.id },
      f5: { cars: 5, motos: 2, plan: basic.id },
      f6: { cars: 6, motos: 5, plan: basic.id },
      f11: { cars: 0, motos: 11, plan: basic.id },
      pro: { cars: 2, motos: 0, plan: pro.id },
    };
    const expected: Record<string, string[]> = {
      f0: ['car_1', 'moto_1'],
      f1: ['car_1', 'moto_1'],
      f5: ['car_5', 'moto_5'],
      f6: ['car_10', 'moto_5'],
      f11: ['enterprise_contact'],
      pro: ['enterprise_contact'],
    };

    const ROLLBACK = new Error('rollback');
    const observed: Record<string, { code: string; price: string; scope: string }[]> = {};
    await prisma
      .$transaction(
        async (tx) => {
          const tenantOf: Record<string, string> = {};
          for (const [key, fleet] of Object.entries(fleets)) {
            const tenantId = newId();
            tenantOf[key] = tenantId;
            await tx.tenant.create({
              data: {
                id: tenantId,
                code: `M-${tenantId.slice(-8)}`,
                slug: `m-${tenantId.toLowerCase().slice(-10)}`,
                name: `MapShop-${key}-${RUN}`,
                status: 'active',
                ownerUserId: actorId,
              },
            });
            for (const [type, count] of [
              [VEHICLE_TYPE.CAR, fleet.cars],
              [VEHICLE_TYPE.MOTORBIKE, fleet.motos],
            ] as const) {
              for (let i = 0; i < count; i += 1) {
                const vid = newId();
                await tx.vehicle.create({
                  data: {
                    id: vid,
                    tenantId,
                    code: `MV-${vid.slice(-8)}`,
                    name: 'x',
                    vehicleType: type,
                  } as Prisma.VehicleUncheckedCreateInput,
                });
              }
            }
            await tx.tenantSubscription.create({
              data: {
                id: newId(),
                tenantId,
                planId: fleet.plan,
                status: SUBSCRIPTION_STATUS.ACTIVE,
                price: 250000,
                termMonths: 3,
                billingMode: BILLING_MODE.PACKAGE,
                vehicleScope: 'all',
                quotaJson: { maxVehicles: 3, maxBranches: 1, maxMembers: null },
                startsAt: new Date(Date.now() - DAY),
                endsAt: new Date(Date.now() + 60 * DAY),
              },
            });
          }
          for (const statement of statements) await tx.$executeRawUnsafe(statement);
          for (const [key, tenantId] of Object.entries(tenantOf)) {
            const rows = await tx.tenantSubscription.findMany({
              where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE },
              include: { plan: { select: { code: true } } },
            });
            observed[key] = rows
              .map((r) => ({ code: r.plan.code, price: r.price.toString(), scope: r.vehicleScope }))
              .sort((a, b) => a.code.localeCompare(b.code));
          }
          throw ROLLBACK;
        },
        { timeout: 60_000 },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });

    for (const [key, codes] of Object.entries(expected)) {
      expect(observed[key]!.map((r) => r.code)).toEqual(codes);
    }
    // Dòng gốc (ô tô) giữ GIÁ; dòng anh em xe máy 0đ — tiền của kỳ ghi đúng một lần.
    expect(observed.f5).toEqual([
      { code: 'car_5', price: '250000', scope: 'car' },
      { code: 'moto_5', price: '0', scope: 'motorbike' },
    ]);
    expect(observed.pro![0]).toMatchObject({ price: '250000', scope: 'all' });
  });
});
