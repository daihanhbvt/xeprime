import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  VEHICLE_TYPE,
  addCalendarMonthsVn,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Phase 7 — Gói/hạn (ADR 0010), chạy trên PostgreSQL THẬT. Kiểm chứng: plan CRUD + code unique,
 * gán → gói hiện hành đúng, gia hạn trước hạn nối đuôi (history 2 dòng, không chồng), huỷ →
 * current null, quota max_vehicles chặn tạo xe (PLAN_LIMIT_REACHED), không gói = không giới hạn,
 * audit đủ cho mọi mutation.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const billing = new BillingService(asService, audit);
const vehicles = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehicles, asService);

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let actorId: string;
let tenantId: string;
let tenantFreeId: string;
let tenantPkgId: string;
let tenantQuotaId: string;
let planId: string;
let pkgPlanId: string;
const planIds: string[] = [];

type CreatePlanInput = Parameters<typeof billing.createPlan>[1];

/** Mặc định: bậc tuyến hoa hồng 10% (hình dạng tối thiểu hợp lệ sau ADR 0020). */
async function mkPlan(
  code: string,
  opts: { maxVehicles?: number | null } & Partial<CreatePlanInput> = {},
) {
  const { maxVehicles, ...rest } = opts;
  const plan = await billing.createPlan(actorId, {
    code: `${code}-${RUN}`,
    name: `Gói ${code}`,
    billingMode: BILLING_MODE.COMMISSION,
    commissionPercent: 10,
    price: '500000',
    maxVehicles: maxVehicles ?? null,
    ...rest,
  });
  planIds.push(plan.id);
  return plan;
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
  tenantId = newId();
  tenantFreeId = newId();
  tenantPkgId = newId();
  tenantQuotaId = newId();
  await prisma.user.create({
    data: { id: actorId, displayName: 'Billing Admin', email: `bill-${RUN}@xeprime.test` },
  });
  const mkTenant = (id: string, tag: string) =>
    prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: `BillShop-${tag}-${RUN}`,
        status: 'active',
        ownerUserId: actorId,
      },
    });
  await mkTenant(tenantId, 'a');
  await mkTenant(tenantFreeId, 'free');
  await mkTenant(tenantPkgId, 'pkg');
  await mkTenant(tenantQuotaId, 'quota');
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({
      where: { targetType: { in: ['plan', 'tenant_subscription'] }, actorUserId: actorId },
    });
    await prisma.auditLog.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId] } },
    });
    await prisma.subscriptionInvoice.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId] } },
    });
    await prisma.tenantSubscription.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId] } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.vehicle.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId] } },
    });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Billing — plans & subscriptions (ADR 0010)', () => {
  maybe('plan: tạo (+audit), trùng code → CONFLICT, sửa, archive chặn gán mới', async () => {
    const plan = await mkPlan('basic', { maxVehicles: 1 });
    planId = plan.id;
    expect(plan.status).toBe(PLAN_STATUS.ACTIVE);
    expect(plan.price).toBe('500000');

    const auditRow = await prisma.auditLog.findFirst({
      where: { targetId: plan.id, action: 'plan.create' },
    });
    expect(auditRow?.actorScope).toBe('platform');

    await expect(
      billing.createPlan(actorId, {
        code: `basic-${RUN}`,
        name: 'Trùng',
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: 10,
        price: '1',
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });

    const updated = await billing.updatePlan(actorId, plan.id, { price: '600000' });
    expect(updated.price).toBe('600000');

    const toArchive = await mkPlan('old');
    const archived = await billing.archivePlan(actorId, toArchive.id);
    expect(archived.status).toBe(PLAN_STATUS.ARCHIVED);
    await expect(
      billing.assign(tenantId, actorId, { planId: toArchive.id, termMonths: 1 }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
  });

  maybe(
    'kiểm điểm giao (ADR 0020): package thiếu giả định / phí nền dưới ngưỡng bị TỪ CHỐI',
    async () => {
      const packageKnobs = {
        billingMode: BILLING_MODE.PACKAGE,
        commissionPercent: undefined,
        limits: {
          perVehiclePrice: { car: '100000', motorbike: null },
          includedCars: 5,
          maxCars: 10,
          terms: [
            { months: 1, discountPercent: 0 },
            { months: 12, discountPercent: 10 },
          ],
        },
        // Ngưỡng = 5 × 10% × 1.000.000 = 500.000đ/tháng.
        assumedMonthlyGmv: { monthlyGmvPerCar: '1000000', commissionPercent: 10 },
      };

      // Thiếu giả định → không chứng minh được bài toán khuyến khích → từ chối.
      await expect(
        billing.createPlan(actorId, {
          code: `pkg-nogmv-${RUN}`,
          name: 'Gói thiếu giả định',
          billingMode: BILLING_MODE.PACKAGE,
          limits: packageKnobs.limits,
        }),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PLAN_INCENTIVE_INVALID,
          details: { reason: 'MISSING_ASSUMPTIONS' },
        },
      });

      // Phí nền 400k < ngưỡng 500k → điểm hoà vốn rơi dưới includedCars → từ chối.
      await expect(
        billing.createPlan(actorId, {
          code: `pkg-cheap-${RUN}`,
          name: 'Gói phá phễu',
          ...packageKnobs,
          basePriceMonthly: '400000',
        }),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PLAN_INCENTIVE_INVALID,
          details: { reason: 'BREAKEVEN_BELOW_INCLUDED', minBasePriceMonthly: '500000' },
        },
      });

      // Đúng ngưỡng thì lưu được; % hoa hồng bị tự xoá (package không có %).
      const ok = await mkPlan('pkg-ok', { ...packageKnobs, basePriceMonthly: '500000' });
      pkgPlanId = ok.id;
      expect(ok.billingMode).toBe(BILLING_MODE.PACKAGE);
      expect(ok.commissionPercent).toBeNull();
      expect(ok.basePriceMonthly).toBe('500000');
      expect(ok.limits.includedCars).toBe(5);

      // Update chạy trên hình MERGED: chỉ hạ phí nền cũng bị kiểm lại và từ chối.
      await expect(
        billing.updatePlan(actorId, ok.id, { basePriceMonthly: '499999' }),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.PLAN_INCENTIVE_INVALID },
      });

      // Gán (tenant riêng, không đụng các phép đếm ở test sau): mua thêm chỗ tính đơn giá.
      const sub = await billing.assign(tenantPkgId, actorId, {
        planId: ok.id,
        termMonths: 1,
        slots: { car: 7, motorbike: 0 },
      });
      // 500.000 (nền, đã gồm 5 chỗ) + 2 × 100.000 = 700.000đ/tháng × 1 tháng.
      expect(sub.price).toBe('700000');
      expect(sub.slots).toEqual({ car: 7, motorbike: 0 });
      expect(sub.termMonths).toBe(1);
      expect(sub.billingMode).toBe(BILLING_MODE.PACKAGE);
      expect(sub.commissionPercent).toBeNull();

      // Kỳ 12 tháng ăn % giảm của terms: 700.000 × 12 × 90% = 7.560.000.
      const yearly = await billing.assign(tenantPkgId, actorId, {
        planId: ok.id,
        termMonths: 12,
        slots: { car: 7, motorbike: 0 },
      });
      expect(yearly.price).toBe('7560000');

      // Vượt trần chỗ của bậc gói → chặn.
      await expect(
        billing.assign(tenantPkgId, actorId, {
          planId: ok.id,
          termMonths: 1,
          slots: { car: 11, motorbike: 0 },
        }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    },
  );

  maybe('gán → gói hiện hành đúng (snapshot mode); ends_at THÁNG LỊCH; gia hạn nối đuôi', async () => {
    const before = await billing.currentPlan(tenantId);
    expect(before).toBeNull();

    const first = await billing.assign(tenantId, actorId, {
      planId,
      termMonths: 1,
      note: 'Gán lần đầu',
    });
    expect(first.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    // Bậc commission: phí nền 0, không chỗ tính tiền → cả kỳ 0đ (tiền của tuyến này nằm ở
    // khoản giữ chỗ theo chuyến — ADR 0021, không phải ở thuê bao).
    expect(first.price).toBe('0');
    // SNAPSHOT chế độ lúc gán (ADR 0024 điều 2).
    expect(first.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(first.commissionPercent).toBe(10);
    expect(first.termMonths).toBe(1);
    // THÁNG LỊCH, không phải +30 ngày (ADR 0015 điều 2).
    expect(first.endsAt).toBe(
      addCalendarMonthsVn(new Date(first.startsAt), 1).toISOString(),
    );

    const current = await billing.currentPlan(tenantId);
    expect(current?.planId).toBe(planId);
    expect(current?.maxVehicles).toBe(1);
    expect(current?.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(current?.commissionPercent).toBe(10);

    // Gia hạn trước hạn → chu kỳ mới NỐI ĐUÔI, không chồng; 12 tháng lịch từ điểm nối.
    const second = await billing.assign(tenantId, actorId, { planId, termMonths: 12 });
    expect(second.startsAt).toBe(first.endsAt);
    expect(second.endsAt).toBe(
      addCalendarMonthsVn(new Date(second.startsAt), 12).toISOString(),
    );

    const history = await billing.listSubscriptions(tenantId, {});
    expect(history.meta.total).toBe(2);
    expect(history.data[0]!.id).toBe(second.id); // mới nhất trước

    const renewAudit = await prisma.auditLog.findFirst({
      where: { targetId: second.id, action: 'subscription.renew' },
    });
    expect(renewAudit).toBeTruthy();
    const assignAudit = await prisma.auditLog.findFirst({
      where: { targetId: first.id, action: 'subscription.assign' },
    });
    expect(assignAudit).toBeTruthy();
  });

  maybe(
    'quota CHỖ theo LOẠI XE (ADR 0015 điều 1+7): slots chặn từng loại kèm details; tuyến hoa hồng và không gói thoải mái',
    async () => {
      const mkVehicle = (tid: string, code: string, type: string = VEHICLE_TYPE.CAR) =>
        createVehicle(tid, actorId, {
          code,
          name: 'Vios',
          vehicleType: type,
        } as Parameters<typeof vehicles.create>[2]);

      // tenantId đang có gói COMMISSION hiệu lực (test 'gán') → tuyến A không bán chỗ,
      // KHÔNG giới hạn số xe (ADR 0020) — dù plan cũ ghi maxVehicles=1.
      await mkVehicle(tenantId, `XE1-${RUN}`);
      await mkVehicle(tenantId, `XE2-${RUN}`);

      // Gói PACKAGE bán chỗ: mua 1 chỗ ô tô + 1 chỗ xe máy.
      const quotaPlan = await mkPlan('pkg-quota', {
        billingMode: BILLING_MODE.PACKAGE,
        commissionPercent: undefined,
        basePriceMonthly: '100000', // ngưỡng = 1 chỗ × 10% × 1tr = 100k ✓
        assumedMonthlyGmv: { monthlyGmvPerCar: '1000000', commissionPercent: 10 },
        limits: {
          perVehiclePrice: { car: '50000', motorbike: '20000' },
          includedCars: 1,
          includedMotorbikes: 1,
          maxCars: 5,
          maxMotorbikes: 5,
        },
      });
      await billing.assign(tenantQuotaId, actorId, {
        planId: quotaPlan.id,
        termMonths: 1,
        slots: { car: 1, motorbike: 1 },
      });

      const car1 = await mkVehicle(tenantQuotaId, `XQ1-${RUN}`);
      await expect(mkVehicle(tenantQuotaId, `XQ2-${RUN}`)).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
          details: { vehicleType: VEHICLE_TYPE.CAR, used: 1, limit: 1 },
        },
      });

      // Xe máy đếm RIÊNG — hết chỗ ô tô không chặn xe máy.
      await mkVehicle(tenantQuotaId, `XQM1-${RUN}`, VEHICLE_TYPE.MOTORBIKE);
      await expect(
        mkVehicle(tenantQuotaId, `XQM2-${RUN}`, VEHICLE_TYPE.MOTORBIKE),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
          details: { vehicleType: VEHICLE_TYPE.MOTORBIKE, used: 1, limit: 1 },
        },
      });

      // ĐIỂM CHẶN THỨ HAI (marketplace): xe đang chiếm suất trên chợ đếm theo publicStatus.
      // Dựng tiền đề bằng Prisma trực tiếp (spec không kiểm đường duyệt ở đây).
      await prisma.vehicle.update({
        where: { id: car1.id },
        data: { publicStatus: 'approved_public' },
      });
      // Một xe KHÁC xin lên chợ khi suất duy nhất đã bị chiếm → chặn.
      await expect(
        billing.assertVehicleQuota(tenantQuotaId, VEHICLE_TYPE.CAR, {
          scope: 'marketplace',
          excludeVehicleId: newId(),
        }),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
          details: { vehicleType: VEHICLE_TYPE.CAR, used: 1, limit: 1 },
        },
      });
      // Chính xe đang chiếm suất gửi LẠI duyệt thì không tự chặn mình.
      await expect(
        billing.assertVehicleQuota(tenantQuotaId, VEHICLE_TYPE.CAR, {
          scope: 'marketplace',
          excludeVehicleId: car1.id,
        }),
      ).resolves.toBeUndefined();

      // Không có gói = không giới hạn (grandfather — ADR 0010).
      await mkVehicle(tenantFreeId, `XF1-${RUN}`);
      await mkVehicle(tenantFreeId, `XF2-${RUN}`);
    },
  );

  maybe(
    'hoá đơn gói (ADR 0015 điều 5): gán tay → PAID; tự mua → ISSUED + mã XPG, hoá đơn chờ cũ bị void',
    async () => {
      // Hai lượt gán package ở test kiểm điểm giao đã sinh hai hoá đơn PAID gắn subscription.
      const paid = await prisma.subscriptionInvoice.findMany({
        where: { tenantId: tenantPkgId, status: 'paid' },
        orderBy: { createdAt: 'asc' },
      });
      expect(paid).toHaveLength(2);
      expect(paid[0]!.code.startsWith('XPG')).toBe(true);
      expect(paid[0]!.totalAmount.toString()).toBe('700000');
      expect(paid[1]!.totalAmount.toString()).toBe('7560000');
      expect(paid.every((i) => i.subscriptionId !== null)).toBe(true);

      // Tenant tự mua: hoá đơn ISSUED, CHƯA có subscription — gói chỉ bật khi tiền về (ADR 0026).
      const inv = await billing.purchase(tenantPkgId, actorId, {
        planId: pkgPlanId,
        termMonths: 3,
        slots: { car: 6, motorbike: 0 },
      });
      expect(inv.status).toBe('issued');
      expect(inv.subscriptionId).toBeNull();
      expect(inv.code.startsWith('XPG')).toBe(true);
      expect(inv.expiresAt).toBeTruthy();
      // (500k nền + 1 chỗ thêm × 100k) × 3 tháng, kỳ 3 không khai % giảm → 1.800.000.
      expect(inv.totalAmount).toBe('1800000');
      expect(inv.lines).toHaveLength(2);

      // Mua lần nữa → hoá đơn chờ cũ bị VOID (một mã sống tại một thời điểm), slots bỏ trống
      // = đúng số chỗ gồm sẵn.
      const inv2 = await billing.purchase(tenantPkgId, actorId, {
        planId: pkgPlanId,
        termMonths: 1,
      });
      expect(inv2.totalAmount).toBe('500000');
      const oldRow = await prisma.subscriptionInvoice.findUnique({ where: { id: inv.id } });
      expect(oldRow?.status).toBe('void');

      // Gói 0đ (tuyến hoa hồng) không có gì để mua.
      await expect(
        billing.purchase(tenantPkgId, actorId, { planId, termMonths: 1 }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    },
  );

  maybe(
    'mua thêm chỗ giữa kỳ (ADR 0015 điều 8): dòng mới CÙNG ends_at, prorate tròn tháng, MỘT dòng hiệu lực',
    async () => {
      const before = await billing.currentPlan(tenantPkgId);
      expect(before?.slots).toEqual({ car: 7, motorbike: 0 });

      const updated = await billing.addSlots(tenantPkgId, actorId, {
        slots: { car: 9, motorbike: 0 },
      });
      expect(updated.slots).toEqual({ car: 9, motorbike: 0 });
      // CÙNG ends_at — không kéo dài kỳ (ADR 0015 điều 8).
      expect(updated.endsAt).toBe(before!.endsAt);

      // Bất biến: đúng MỘT dòng hiệu lực tại thời điểm hiện tại.
      const now = new Date();
      const actives = await prisma.tenantSubscription.findMany({
        where: {
          tenantId: tenantPkgId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      });
      expect(actives).toHaveLength(1);
      expect(actives[0]!.id).toBe(updated.id);

      // Prorate: 2 chỗ × 100k × 1 tháng còn lại = 200k, hoá đơn PAID gắn dòng mới.
      const addInv = await prisma.subscriptionInvoice.findFirst({
        where: { subscriptionId: updated.id },
      });
      expect(addInv?.status).toBe('paid');
      expect(addInv?.totalAmount.toString()).toBe('200000');

      // Mua BỚT bị chặn — hoàn tiền không phải nghiệp vụ này.
      await expect(
        billing.addSlots(tenantPkgId, actorId, { slots: { car: 8, motorbike: 0 } }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    },
  );

  maybe(
    'huỷ cả 2 chu kỳ → current null; huỷ lần nữa → INVALID_STATUS_TRANSITION; quota mở lại',
    async () => {
      const history = await billing.listSubscriptions(tenantId, {});
      for (const sub of history.data) {
        const cancelled = await billing.cancel(tenantId, actorId, sub.id);
        expect(cancelled.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
      }
      expect(await billing.currentPlan(tenantId)).toBeNull();

      await expect(billing.cancel(tenantId, actorId, history.data[0]!.id)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
      });

      const cancelAudit = await prisma.auditLog.count({
        where: { action: 'subscription.cancel', tenantId },
      });
      expect(cancelAudit).toBe(2);

      // Hết gói giới hạn → tạo xe lại được (unlimited).
      await createVehicle(tenantId, actorId, {
        code: `XE3-${RUN}`,
        name: 'Vios',
        vehicleType: VEHICLE_TYPE.CAR,
      } as Parameters<typeof vehicles.create>[2]);
    },
  );

  maybe('id lạ → NOT_FOUND (plan / tenant / subscription)', async () => {
    await expect(billing.updatePlan(actorId, newId(), { price: '1' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(
      billing.assign(newId(), actorId, { planId, termMonths: 1 }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(billing.cancel(tenantId, actorId, newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
