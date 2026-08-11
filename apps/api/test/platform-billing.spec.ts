import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, PLAN_STATUS, SUBSCRIPTION_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';

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
const vehicles = new VehiclesService(
  asService,
  audit,
  new ListingsService(asService),
  billing,
  new CatalogService(asService, audit),
  new PricingService(asService, audit),
);

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let actorId: string;
let tenantId: string;
let tenantFreeId: string;
let planId: string;
const planIds: string[] = [];

async function mkPlan(
  code: string,
  opts: { durationDays?: number; maxVehicles?: number | null } = {},
) {
  const plan = await billing.createPlan(actorId, {
    code: `${code}-${RUN}`,
    name: `Gói ${code}`,
    price: '500000',
    durationDays: opts.durationDays ?? 30,
    maxVehicles: opts.maxVehicles ?? null,
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
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({
      where: { targetType: { in: ['plan', 'tenant_subscription'] }, actorUserId: actorId },
    });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, tenantFreeId] } } });
    await prisma.tenantSubscription.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId] } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: [tenantId, tenantFreeId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, tenantFreeId] } } });
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
        price: '1',
        durationDays: 30,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });

    const updated = await billing.updatePlan(actorId, plan.id, { price: '600000' });
    expect(updated.price).toBe('600000');

    const toArchive = await mkPlan('old');
    const archived = await billing.archivePlan(actorId, toArchive.id);
    expect(archived.status).toBe(PLAN_STATUS.ARCHIVED);
    await expect(billing.assign(tenantId, actorId, { planId: toArchive.id })).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.CONFLICT } },
    );
  });

  maybe('gán → gói hiện hành đúng (price snapshot); gia hạn trước hạn nối đuôi', async () => {
    const before = await billing.currentPlan(tenantId);
    expect(before).toBeNull();

    const first = await billing.assign(tenantId, actorId, { planId, note: 'Gán lần đầu' });
    expect(first.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(first.price).toBe('600000'); // snapshot giá tại thời điểm gán (đã update ở test trên)

    const current = await billing.currentPlan(tenantId);
    expect(current?.planId).toBe(planId);
    expect(current?.maxVehicles).toBe(1);

    // Gia hạn trước hạn → chu kỳ mới NỐI ĐUÔI, không chồng.
    const second = await billing.assign(tenantId, actorId, { planId });
    expect(second.startsAt).toBe(first.endsAt);
    expect(new Date(second.endsAt).getTime()).toBeGreaterThan(new Date(second.startsAt).getTime());

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
    'quota: max_vehicles=1 → xe thứ 2 bị PLAN_LIMIT_REACHED; tenant không gói thì thoải mái',
    async () => {
      const mkVehicle = (tid: string, code: string) =>
        vehicles.create(tid, actorId, {
          code,
          name: 'Vios',
          vehicleType: VEHICLE_TYPE.CAR,
        } as Parameters<typeof vehicles.create>[2]);

      await mkVehicle(tenantId, `XE1-${RUN}`);
      await expect(mkVehicle(tenantId, `XE2-${RUN}`)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.PLAN_LIMIT_REACHED },
      });

      // Không có gói = không giới hạn (grandfather — ADR 0010).
      await mkVehicle(tenantFreeId, `XF1-${RUN}`);
      await mkVehicle(tenantFreeId, `XF2-${RUN}`);
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
      await vehicles.create(tenantId, actorId, {
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
    await expect(billing.assign(newId(), actorId, { planId })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(billing.cancel(tenantId, actorId, newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
