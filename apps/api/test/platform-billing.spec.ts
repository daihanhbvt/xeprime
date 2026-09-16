import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BILLING_PHASE,
  OWNER_LITE_VEHICLE_LIMIT,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  VEHICLE_TYPE,
  addCalendarMonthsVn,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeVehiclesService,
  vehicleCreator,
  makeBillingService,
  verifyShop,
} from './helpers/service-factory';

/**
 * Phase 7 — Gói/hạn (ADR 0010), chạy trên PostgreSQL THẬT. Kiểm chứng: plan CRUD + code unique,
 * gán → gói hiện hành đúng, gia hạn trước hạn nối đuôi (history 2 dòng, không chồng), huỷ →
 * current null, quota max_vehicles chặn tạo xe (PLAN_LIMIT_REACHED), không gói = không giới hạn,
 * audit đủ cho mọi mutation.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing = makeBillingService(asService);
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
let packagePlanId: string;
let pkgPlanId: string;
const planIds: string[] = [];
/** Tenant do từng test tự dựng — afterAll dọn cùng bộ với bốn tenant cố định. */
const cleanupTenantIds: string[] = [];

type CreatePlanInput = Parameters<typeof billing.createPlan>[1];

/**
 * Bậc gói mới qua ĐƯỜNG ADMIN. Mặc định `package` — từ 15/09/2026 tuyến hoa hồng là một bậc
 * DUY NHẤT được bảo vệ, nên `createPlan` từ chối bậc `commission` thứ hai
 * (`COMMISSION_PLAN_IS_SINGLETON`). Bậc hoa hồng dùng trong spec này dựng bằng
 * `mkCommissionPlanDirect` bên dưới.
 */
async function mkPlan(
  code: string,
  opts: { maxVehicles?: number | null } & Partial<CreatePlanInput> = {},
) {
  const { maxVehicles, ...rest } = opts;
  const plan = await billing.createPlan(actorId, {
    code: `${code}-${RUN}`,
    name: `Gói ${code}`,
    billingMode: BILLING_MODE.PACKAGE,
    price: '500000',
    maxVehicles: maxVehicles ?? null,
    ...rest,
  });
  planIds.push(plan.id);
  return plan;
}

/**
 * Bậc TUYẾN HOA HỒNG dựng thẳng bằng Prisma, cố ý đi vòng qua `BillingService`.
 *
 * Không phải một cửa hậu: danh mục THẬT chỉ có đúng một bậc hoa hồng (`free`, seed dữ liệu
 * nền), và spec này cần một bậc RIÊNG để bật/tắt tự do mà không đụng bậc mặc định của
 * database test — bậc đó là thứ mọi spec khác dựa vào. Cổng singleton ở tầng service được
 * kiểm riêng ở test "bậc hoa hồng là SINGLETON".
 */
async function mkCommissionPlanDirect(code: string, opts: { maxVehicles?: number | null } = {}) {
  const plan = await prisma.plan.create({
    data: {
      id: newId(),
      code: `${code}-${RUN}`,
      name: `Gói ${code}`,
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      commissionPercent: 10,
      price: '0',
      durationDays: 30,
      maxVehicles: opts.maxVehicles ?? null,
      // `sortOrder` lớn để bậc này KHÔNG bị chọn làm "gói mặc định" của database test
      // (`loadDefaultCommissionPlanOrThrow` lấy `sort_order` nhỏ nhất).
      sortOrder: 900,
    },
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
  /*
   * Mua gói THUÊ BAO đòi gian hàng đã được xác minh (ADR 0036) — fixture phải phản ánh đúng
   * production. Spec này kiểm vòng đời GÓI, không kiểm cổng xác minh; cổng đó có spec riêng.
   */
  for (const id of [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId]) {
    await verifyShop(asService, id, actorId);
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({
      where: { targetType: { in: ['plan', 'tenant_subscription'] }, actorUserId: actorId },
    });
    await prisma.auditLog.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId, ...cleanupTenantIds] } },
    });
    await prisma.subscriptionInvoice.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId, ...cleanupTenantIds] } },
    });
    await prisma.tenantSubscription.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId, ...cleanupTenantIds] } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.vehicle.deleteMany({
      where: { tenantId: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId, ...cleanupTenantIds] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, tenantFreeId, tenantPkgId, tenantQuotaId, ...cleanupTenantIds] } },
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
    packagePlanId = plan.id;
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
        billingMode: BILLING_MODE.PACKAGE,
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
    'tuyến hoa hồng là bậc DUY NHẤT và được bảo vệ: không tạo bậc thứ hai, không archive, không đổi sang package',
    async () => {
      /*
       * Ba cổng, một lý do: `assignDefaultPlanWithinTx` và job vòng đời đều chọn "bậc
       * commission đang bán có `sort_order` nhỏ nhất". Bậc thứ hai biến phép chọn đó thành xổ
       * số; archive hoặc đổi bậc duy nhất sang `package` thì phép chọn không còn gì để chọn và
       * mọi gian hàng mở sau đó ra đời KHÔNG có tuyến thu phí.
       */
      const existing = await prisma.plan.findFirst({
        where: { billingMode: BILLING_MODE.COMMISSION },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true },
      });
      expect(existing).toBeTruthy();

      await expect(
        billing.createPlan(actorId, {
          code: `comm-2-${RUN}`,
          name: 'Hoa hồng thứ hai',
          billingMode: BILLING_MODE.COMMISSION,
          commissionPercent: 12,
        }),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.COMMISSION_PLAN_IS_SINGLETON },
      });

      await expect(billing.archivePlan(actorId, existing!.id)).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.DEFAULT_PLAN_PROTECTED,
          details: { operation: 'archive' },
        },
      });

      await expect(
        billing.updatePlan(actorId, existing!.id, { billingMode: BILLING_MODE.PACKAGE }),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.DEFAULT_PLAN_PROTECTED,
          details: { operation: 'change_billing_mode' },
        },
      });

      // Chiều ngược lại cũng chặn: nâng một bậc `package` lên `commission` sinh ra bậc thứ hai.
      await expect(
        billing.updatePlan(actorId, packagePlanId, {
          billingMode: BILLING_MODE.COMMISSION,
          commissionPercent: 10,
        }),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.COMMISSION_PLAN_IS_SINGLETON },
      });

      // % phí dịch vụ vẫn sửa được TRÊN CHÍNH bậc đó — đó là dữ liệu, không phải cấu trúc.
      const before = await prisma.plan.findUniqueOrThrow({
        where: { id: existing!.id },
        select: { commissionPercent: true },
      });
      const bumped = await billing.updatePlan(actorId, existing!.id, { commissionPercent: 11 });
      expect(bumped.commissionPercent).toBe(11);
      await billing.updatePlan(actorId, existing!.id, {
        commissionPercent: Number(before.commissionPercent),
      });
    },
  );

  maybe(
    'danh mục BÁN cho gian hàng chỉ có bậc `package` — tuyến hoa hồng không phải một SKU',
    async () => {
      const catalog = await billing.listPlansForTenant();
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog.every((plan) => plan.billingMode === BILLING_MODE.PACKAGE)).toBe(true);

      // Mọi bậc trong danh mục đều bán được ít nhất một kỳ hạn, và kỳ hạn đó nằm trong
      // `limits.terms` — màn mua dựng thẻ từ chính danh sách này.
      for (const plan of catalog) {
        expect(plan.status).toBe(PLAN_STATUS.ACTIVE);
      }
    },
  );
  maybe(
    'bậc gói package (ADR 0029): phí nền 0đ hợp lệ, không cần giả định, % hoa hồng tự xoá',
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
            { months: 3, discountPercent: 0 },
            { months: 12, discountPercent: 10 },
          ],
        },
        // Từ ADR 0029 đây là THAM KHẢO định giá — không còn là đầu vào của phép kiểm nào.
        assumedMonthlyGmv: { monthlyGmvPerCar: '1000000', commissionPercent: 10 },
      };

      /*
       * Đảo ngược bài test cũ, có chủ đích: kiểm điểm giao của ADR 0020 đã bị ADR 0029 gỡ
       * (phí theo chuyến nay do KHÁCH gánh nên phí nền thấp không phá phễu). Ba ca dưới đây
       * từng bị TỪ CHỐI với `PLAN_INCENTIVE_INVALID`; giờ chúng phải LƯU ĐƯỢC — gói pilot
       * chính thức có phí nền 0đ.
       */
      const noGmv = await mkPlan('pkg-nogmv', {
        billingMode: BILLING_MODE.PACKAGE,
        limits: packageKnobs.limits,
        basePriceMonthly: '0',
      });
      expect(noGmv.basePriceMonthly).toBe('0');

      const cheap = await mkPlan('pkg-cheap', { ...packageKnobs, basePriceMonthly: '400000' });
      expect(cheap.basePriceMonthly).toBe('400000');

      const ok = await mkPlan('pkg-ok', { ...packageKnobs, basePriceMonthly: '500000' });
      pkgPlanId = ok.id;
      expect(ok.billingMode).toBe(BILLING_MODE.PACKAGE);
      expect(ok.commissionPercent).toBeNull();
      expect(ok.basePriceMonthly).toBe('500000');
      expect(ok.limits.includedCars).toBe(5);

      // Hạ phí nền qua update cũng tự do — không còn ngưỡng nào canh.
      const lowered = await billing.updatePlan(actorId, ok.id, { basePriceMonthly: '1000' });
      expect(lowered.basePriceMonthly).toBe('1000');
      await billing.updatePlan(actorId, ok.id, { basePriceMonthly: '500000' });

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

  maybe(
    'gán → gói hiện hành đúng (snapshot mode); ends_at THÁNG LỊCH; gia hạn nối đuôi',
    async () => {
      const before = await billing.currentPlan(tenantId);
      expect(before).toBeNull();

      planId = (await mkCommissionPlanDirect('basic-comm', { maxVehicles: 1 })).id;
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
      expect(first.endsAt).toBe(addCalendarMonthsVn(new Date(first.startsAt), 1).toISOString());

      const current = await billing.currentPlan(tenantId);
      expect(current?.planId).toBe(planId);
      expect(current?.maxVehicles).toBe(1);
      expect(current?.billingMode).toBe(BILLING_MODE.COMMISSION);
      expect(current?.commissionPercent).toBe(10);

      /*
       * Gán LẠI bậc hoa hồng KHÔNG nối đuôi — nó THAY dòng cũ (15/09/2026).
       *
       * Dòng hoa hồng là dòng hệ thống 0đ, không ai trả gì cho nó, nên không có kỳ nào để tôn
       * trọng. Nối sau nó là cách một gian hàng vừa MUA GÓI phải đợi hết 12 tháng hoa hồng mới
       * được dùng thứ họ đã trả tiền — xem test "NÂNG CẤP hoa hồng → gói" bên dưới.
       *
       * Bất biến còn lại vẫn nguyên: đúng MỘT dòng hiệu lực, và lịch sử giữ đủ hai dòng.
       */
      const second = await billing.assign(tenantId, actorId, { planId, termMonths: 12 });
      expect(new Date(second.startsAt).getTime()).toBeLessThan(new Date(first.endsAt).getTime());
      expect(second.endsAt).toBe(addCalendarMonthsVn(new Date(second.startsAt), 12).toISOString());

      const replaced = await prisma.tenantSubscription.findUniqueOrThrow({
        where: { id: first.id },
        select: { status: true },
      });
      expect(replaced.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);

      const history = await billing.listSubscriptions(tenantId, {});
      expect(history.meta.total).toBe(2);
      expect(history.data[0]!.id).toBe(second.id); // mới nhất trước

      /*
       * Cả hai lượt đều là `assign`, KHÔNG phải `renew`: `renew` dành riêng cho việc nối sau
       * một kỳ đã trả tiền, và gọi một lần thay dòng 0đ là "gia hạn" làm mất dấu đúng sự kiện
       * mà một cuộc đối soát doanh thu đi tìm. Ca `renew` thật được khoá ở test riêng bên dưới.
       */
      for (const id of [first.id, second.id]) {
        const assignAudit = await prisma.auditLog.findFirst({
          where: { targetId: id, action: 'subscription.assign' },
        });
        expect(assignAudit).toBeTruthy();
      }
    },
  );

  maybe(
    'quota: tuyến gói chặn theo LOẠI (ADR 0015), tuyến hoa hồng chặn theo TỔNG 3 xe (Owner Lite)',
    async () => {
      const mkVehicle = (tid: string, code: string, type: string = VEHICLE_TYPE.CAR) =>
        createVehicle(tid, actorId, {
          code,
          name: 'Vios',
          vehicleType: type,
        } as Parameters<typeof vehicles.create>[2]);

      // tenantId đang có gói COMMISSION hiệu lực (test 'gán') → Owner Lite: trần 3 xe TỔNG,
      // không đọc `maxVehicles` của bậc gói (ADR 0038).
      await mkVehicle(tenantId, `XE1-${RUN}`);
      await mkVehicle(tenantId, `XE2-${RUN}`);
      const quota = await billing.vehicleQuotaFor(tenantId);
      expect(quota).toEqual({ kind: 'total', limit: OWNER_LITE_VEHICLE_LIMIT, reason: 'owner_lite' });

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

      /*
       * KHÔNG có dòng thuê bao nào (`BILLING_PHASE.UNCONFIGURED`) đi CÙNG ĐƯỜNG với tuyến hoa
       * hồng, không đi cùng đường với "không giới hạn" (ADR 0038 điều 1). Bản trước trả vô hạn
       * ở đây, và vì `findCurrent` cũng trả `null` trong cả cửa sổ ÂN HẠN, trần biến mất định
       * kỳ cho mọi tenant cùng lúc.
       */
      expect(await billing.vehicleQuotaFor(tenantFreeId)).toEqual({
        kind: 'total',
        limit: OWNER_LITE_VEHICLE_LIMIT,
        // Chưa có dòng thuê bao nào ⇒ LỖI CẤU HÌNH, không phải Owner Lite — thông điệp khác hẳn.
        reason: 'billing_unconfigured',
      });
      await mkVehicle(tenantFreeId, `XF1-${RUN}`);
      await mkVehicle(tenantFreeId, `XF2-${RUN}`);

      /*
       * Trần là TỔNG, không phải 3 mỗi loại: hai ô tô + một xe máy đã đầy, và chiếc thứ tư bị
       * từ chối dù nó là loại xe chưa chạm trần nào.
       */
      await mkVehicle(tenantFreeId, `XF3-${RUN}`, VEHICLE_TYPE.MOTORBIKE);
      await expect(
        mkVehicle(tenantFreeId, `XF4-${RUN}`, VEHICLE_TYPE.MOTORBIKE),
      ).rejects.toMatchObject({
        response: {
          // Tenant này CHƯA có gói ⇒ mã nói về CẤU HÌNH, không nói về hạn mức gói.
          code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED,
          details: { scope: 'owner_lite_total', used: 3, limit: OWNER_LITE_VEHICLE_LIMIT },
        },
      });
      await expect(mkVehicle(tenantFreeId, `XF5-${RUN}`)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED },
      });
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

      /*
       * Kỳ hạn NGOÀI danh sách gói bán bị từ chối ở SERVER (ADR 0029 điều 3) — gói này bán
       * 1/3/12, nên kỳ 6 tháng không mua được dù nó nằm trong bộ kỳ hạn toàn cục của DTO.
       * Ẩn lựa chọn ở PurchaseModal chỉ là UX; đây mới là lớp chặn.
       */
      await expect(
        billing.purchase(tenantPkgId, actorId, { planId: pkgPlanId, termMonths: 6 }),
      ).rejects.toMatchObject({
        response: {
          code: API_ERROR_CODE.VALIDATION_FAILED,
          details: { field: 'termMonths', allowedTerms: [1, 3, 12] },
        },
      });

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
    'huỷ cả 2 chu kỳ → current null; huỷ lần nữa → INVALID_STATUS_TRANSITION; trần về Owner Lite',
    async () => {
      const history = await billing.listSubscriptions(tenantId, {});
      /*
       * Chỉ huỷ dòng còn ACTIVE: dòng hoa hồng đầu tiên đã bị chính lượt gán thứ hai thay thế
       * (`resolveChainStart`), nên nó vào đây với trạng thái `cancelled` sẵn.
       */
      const active = history.data.filter((sub) => sub.status === SUBSCRIPTION_STATUS.ACTIVE);
      expect(active).toHaveLength(1);
      for (const sub of active) {
        const cancelled = await billing.cancel(tenantId, actorId, sub.id);
        expect(cancelled.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
      }
      expect(await billing.currentPlan(tenantId)).toBeNull();

      await expect(billing.cancel(tenantId, actorId, active[0]!.id)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
      });

      const cancelAudit = await prisma.auditLog.count({
        where: { action: 'subscription.cancel', tenantId },
      });
      expect(cancelAudit).toBe(1);

      /*
       * Huỷ hết thuê bao KHÔNG mở trần ra vô hạn — nó đưa tenant về Owner Lite (3 xe TỔNG).
       * `tenantId` đang có 2 xe từ test quota, nên chiếc thứ 3 vào được và chiếc thứ 4 thì
       * không. Đây là nơi bản cũ nói "unlimited", và câu đó chính là lỗ hổng ADR 0038 vá.
       */
      expect(await billing.vehicleQuotaFor(tenantId)).toEqual({
        kind: 'total',
        limit: OWNER_LITE_VEHICLE_LIMIT,
        // Huỷ hết thuê bao ⇒ không còn dòng nào ⇒ "chưa cấu hình", không phải hoa hồng.
        reason: 'billing_unconfigured',
      });
      await createVehicle(tenantId, actorId, {
        code: `XE3-${RUN}`,
        name: 'Vios',
        vehicleType: VEHICLE_TYPE.CAR,
      } as Parameters<typeof vehicles.create>[2]);
      await expect(
        createVehicle(tenantId, actorId, {
          code: `XE4-${RUN}`,
          name: 'Vios',
          vehicleType: VEHICLE_TYPE.CAR,
        } as Parameters<typeof vehicles.create>[2]),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED },
      });
    },
  );

  maybe(
    'NÂNG CẤP hoa hồng → gói có hiệu lực NGAY, không xếp hàng sau kỳ hoa hồng 12 tháng',
    async () => {
      /*
       * Lỗi tiền thật mà test này khoá lại.
       *
       * Mọi tenant mang một dòng hoa hồng 0đ dài `COMMISSION_TRACK_TERM_MONTHS` (12 tháng) do
       * `assignDefaultPlanWithinTx` gán lúc mở gian hàng. Phép "nối sau `ends_at` muộn nhất" đặt
       * `starts_at` của gói vừa mua ở 12 THÁNG SAU — và `effectiveSubscriptionWhere` đòi
       * `starts_at <= now`, nên dòng đó không được tính. Gian hàng trả tiền, hoá đơn `paid`,
       * audit có, mà tuyến KHÔNG đổi: vẫn trần Owner Lite 3 xe, vẫn bị đẩy khỏi `/manage`, và
       * khách của họ vẫn bị cộng phí dịch vụ. Không màn nào trông như đang hỏng.
       */
      const upgradeTenantId = newId();
      await prisma.tenant.create({
        data: {
          id: upgradeTenantId,
          code: `T-${upgradeTenantId.slice(-8)}`,
          slug: `t-${upgradeTenantId.toLowerCase().slice(-10)}`,
          name: `BillShop-upgrade-${RUN}`,
          status: 'active',
          ownerUserId: actorId,
        },
      });
      cleanupTenantIds.push(upgradeTenantId);
      await verifyShop(asService, upgradeTenantId, actorId);

      // Đúng đường production: `registerShop` gán gói mặc định trong cùng transaction.
      await prisma.$transaction((tx) => billing.assignDefaultPlanWithinTx(tx, upgradeTenantId));
      const seeded = await billing.currentPlan(upgradeTenantId);
      expect(seeded?.billingMode).toBe(BILLING_MODE.COMMISSION);

      const pkg = await mkPlan(`pkg-upgrade`, {
        billingMode: BILLING_MODE.PACKAGE,
        basePriceMonthly: '0',
        limits: {
          perVehiclePrice: { car: '100000', motorbike: '40000' },
          includedCars: 0,
          includedMotorbikes: 0,
          terms: [{ months: 3, discountPercent: 0 }],
        },
      });

      const sub = await billing.assign(upgradeTenantId, actorId, {
        planId: pkg.id,
        termMonths: 3,
        slots: { car: 2, motorbike: 0 },
      });

      // Bắt đầu NGAY, không phải sau 12 tháng.
      expect(new Date(sub.startsAt).getTime()).toBeLessThanOrEqual(Date.now() + 5_000);

      // Và đó mới là phép kiểm thật: tuyến HIỆU LỰC đã đổi.
      const billingNow = await billing.effectiveBillingFor(upgradeTenantId);
      expect(billingNow.billingMode).toBe(BILLING_MODE.PACKAGE);
      expect(billingNow.phase).toBe(BILLING_PHASE.CURRENT);

      // Trần xe đi theo tuyến ngay trong cùng một nhịp — không còn là 3 xe TỔNG.
      expect(await billing.vehicleQuotaFor(upgradeTenantId)).toEqual({
        kind: 'per_type',
        limit: { car: 2, motorbike: 0 },
      });

      // Dòng hoa hồng bị HUỶ, không bị xoá — lịch sử tuyến phải kể lại được.
      const rows = await prisma.tenantSubscription.findMany({
        where: { tenantId: upgradeTenantId },
        orderBy: { createdAt: 'asc' },
        select: { status: true, billingMode: true },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        status: SUBSCRIPTION_STATUS.CANCELLED,
        billingMode: BILLING_MODE.COMMISSION,
      });
      expect(rows[1]).toEqual({
        status: SUBSCRIPTION_STATUS.ACTIVE,
        billingMode: BILLING_MODE.PACKAGE,
      });

      // Và đúng MỘT dòng hiệu lực — bất biến mà `findCurrent` dựa vào.
      const actives = await prisma.tenantSubscription.count({
        where: {
          tenantId: upgradeTenantId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
        },
      });
      expect(actives).toBe(1);
    },
  );

  maybe(
    'GIA HẠN một kỳ ĐÃ TRẢ TIỀN vẫn nối đuôi — không cắt ngắn thứ khách đã mua',
    async () => {
      const before = await billing.currentPlan(tenantPkgId);
      expect(before).toBeTruthy();

      const renewed = await billing.assign(tenantPkgId, actorId, {
        planId: pkgPlanId,
        termMonths: 1,
        slots: { car: 6, motorbike: 0 },
      });
      // Nối từ `ends_at` của kỳ đang chạy, KHÔNG từ `now`.
      expect(new Date(renewed.startsAt).getTime()).toBeGreaterThanOrEqual(
        new Date(before!.endsAt).getTime(),
      );

      const renewAudit = await prisma.auditLog.findFirst({
        where: { targetId: renewed.id, action: 'subscription.renew' },
      });
      expect(renewAudit).toBeTruthy();
    },
  );
  maybe('id lạ → NOT_FOUND (plan / tenant / subscription)', async () => {
    await expect(billing.updatePlan(actorId, newId(), { price: '1' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(billing.assign(newId(), actorId, { planId, termMonths: 1 })).rejects.toMatchObject(
      {
        response: { code: API_ERROR_CODE.NOT_FOUND },
      },
    );
    await expect(billing.cancel(tenantId, actorId, newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
