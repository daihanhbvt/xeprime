import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  PLATFORM_PARTNER_KIND,
  SHOP_ONBOARDING_STATE,
  SUPPORT_WORKSPACE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  type PlatformPartnerKind,
} from '@xeprime/types';
import { buildTenantContext, tenantContextSelect } from '../src/common/plan/tenant-context';
import { supportWorkspaceOf } from '../src/modules/tenant-support/tenant-support.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformTenantsService } from '../src/modules/platform-admin/platform-tenants.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBillingService } from './helpers/service-factory';

/**
 * Phase 7 — Quản lý gian hàng nền tảng, chạy trên PostgreSQL THẬT. Kiểm chứng: list + lọc/tìm,
 * khoá/mở khoá đổi `status` đúng bước (active↔suspended) và **chặn sai bước** (409), ghi audit
 * scope platform, NOT_FOUND khi không tồn tại.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformTenantsService(
  asService,
  new AuditService(asService),
  makeBillingService(asService),
);

let dbAvailable = false;
let adminId: string;
let t1: string;
let t2: string;
let vehicleId: string;
const suffix = () => t1.slice(-6);

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  adminId = newId();
  t1 = newId();
  t2 = newId();
  vehicleId = newId();
  await prisma.user.create({
    data: { id: adminId, displayName: 'Admin', email: `adm-${adminId}@xeprime.test` },
  });
  const mk = (id: string, name: string, status: string) =>
    prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name,
        status,
        ownerUserId: adminId,
      },
    });
  await mk(t1, `Alpha-${t1.slice(-6)}`, TENANT_STATUS.ACTIVE);
  await mk(t2, `Beta-${t2.slice(-6)}`, TENANT_STATUS.SUSPENDED);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId: t1,
      code: `XE-${vehicleId.slice(-6)}`,
      name: 'Vios',
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: [t1, t2] } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: [t1, t2] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [t1, t2] } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform tenants (Phase 7)', () => {
  maybe('list: lọc trạng thái + tìm kiếm; đếm xe', async () => {
    const active = await service.list({ status: TENANT_STATUS.ACTIVE, q: `Alpha-${suffix()}` });
    expect(active.data.some((t) => t.id === t1)).toBe(true);
    expect(active.data.every((t) => t.status === TENANT_STATUS.ACTIVE)).toBe(true);
    const row = active.data.find((t) => t.id === t1);
    expect(row?.vehicleCount).toBe(1);

    // t2 suspended → không nằm trong lọc active, nhưng tìm theo tên thì thấy.
    const activeBeta = await service.list({
      status: TENANT_STATUS.ACTIVE,
      q: `Beta-${t2.slice(-6)}`,
    });
    expect(activeBeta.data.some((t) => t.id === t2)).toBe(false);
    const anyBeta = await service.list({ q: `Beta-${t2.slice(-6)}` });
    expect(anyBeta.data.some((t) => t.id === t2)).toBe(true);
  });

  maybe('khoá active → suspended + ghi audit scope platform', async () => {
    const res = await service.lock(t1, adminId, { reason: 'Vi phạm' });
    expect(res.status).toBe(TENANT_STATUS.SUSPENDED);
    const audit = await prisma.auditLog.findFirst({
      where: { targetId: t1, action: 'tenant.lock' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.actorScope).toBe('platform');
  });

  maybe('khoá lần nữa (đang suspended) → INVALID_STATUS_TRANSITION', async () => {
    await expect(service.lock(t1, adminId, {})).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('mở khoá suspended → active; mở khoá active → INVALID_STATUS_TRANSITION', async () => {
    const res = await service.unlock(t1, adminId);
    expect(res.status).toBe(TENANT_STATUS.ACTIVE);
    await expect(service.unlock(t1, adminId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('getOne không tồn tại → NOT_FOUND', async () => {
    await expect(service.getOne(newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});

/**
 * Hai danh sách đối tác (Gian hàng gói / Chủ xe cá nhân) — `partnerKind` lọc ở DB TRƯỚC phân
 * trang và đếm, theo đúng `platformPartnerKindOf`. Mỗi nhánh của luật có một tenant riêng; mọi
 * tenant mang chung một tiền tố tên để tìm kiếm cô lập được dữ liệu của test khỏi seed.
 */
describe('Platform tenants — tách hai loại đối tác', () => {
  const DAY = 86_400_000;
  const prefix = `Partner-${newId().slice(-8)}`;
  const planId = newId();
  const ids: Record<string, string> = {};
  const { PACKAGE_SHOP, INDIVIDUAL_OWNER } = PLATFORM_PARTNER_KIND;

  /** Tên → loại mong đợi. Tên đặt theo thứ tự chữ cái để kiểm sort `name`. */
  const EXPECTED: Record<string, PlatformPartnerKind> = {
    a_pending: PACKAGE_SHOP,
    b_active: PACKAGE_SHOP,
    c_active_lapsed: PACKAGE_SHOP,
    d_upgraded: PACKAGE_SHOP,
    e_upgraded_grace: PACKAGE_SHOP,
    f_commission: INDIVIDUAL_OWNER,
    g_upgraded_lapsed: INDIVIDUAL_OWNER,
    h_unconfigured: INDIVIDUAL_OWNER,
    i_commission_locked: INDIVIDUAL_OWNER,
  };
  const namesOf = (kind: PlatformPartnerKind) =>
    Object.keys(EXPECTED).filter((key) => EXPECTED[key] === kind);

  beforeAll(async () => {
    if (!dbAvailable) return;
    const now = Date.now();
    await prisma.plan.create({
      data: {
        id: planId,
        code: `test-grace-${planId.slice(-8)}`,
        name: 'Gói test ân hạn',
        billingMode: BILLING_MODE.PACKAGE,
        limitsJson: { graceDays: 7 },
        status: 'archived',
      },
    });

    const tenant = async (
      key: string,
      onboardingState: string,
      status: string = TENANT_STATUS.ACTIVE,
    ) => {
      const id = newId();
      ids[key] = id;
      await prisma.tenant.create({
        data: {
          id,
          code: `P-${id.slice(-8)}`,
          slug: `p-${id.toLowerCase().slice(-10)}`,
          name: `${prefix}-${key}`,
          status,
          onboardingState,
          ownerUserId: adminId,
        },
      });
      return id;
    };
    /** Dòng thuê bao đã bắt đầu, kết thúc sau `endsInDays` ngày (âm = đã hết hạn). */
    const sub = (tenantId: string, billingMode: string, endsInDays: number) =>
      prisma.tenantSubscription.create({
        data: {
          id: newId(),
          tenantId,
          planId,
          price: 0,
          billingMode,
          startsAt: new Date(now - 400 * DAY),
          endsAt: new Date(now + endsInDays * DAY),
        },
      });

    const { COMMISSION, PACKAGE_PENDING, PACKAGE_ACTIVE } = SHOP_ONBOARDING_STATE;
    await tenant('a_pending', PACKAGE_PENDING);
    await sub(
      await tenant('b_active', PACKAGE_ACTIVE, TENANT_STATUS.SUSPENDED),
      BILLING_MODE.PACKAGE,
      30,
    );
    await sub(await tenant('c_active_lapsed', PACKAGE_ACTIVE), BILLING_MODE.PACKAGE, -60);
    await sub(await tenant('d_upgraded', COMMISSION), BILLING_MODE.PACKAGE, 30);
    await sub(await tenant('e_upgraded_grace', COMMISSION), BILLING_MODE.PACKAGE, -3);
    await sub(await tenant('f_commission', COMMISSION), BILLING_MODE.COMMISSION, 300);
    await sub(await tenant('g_upgraded_lapsed', COMMISSION), BILLING_MODE.PACKAGE, -30);
    await tenant('h_unconfigured', COMMISSION);
    await sub(
      await tenant('i_commission_locked', COMMISSION, TENANT_STATUS.SUSPENDED),
      BILLING_MODE.COMMISSION,
      300,
    );

    // Số xe để kiểm sort `vehicles`: d nhiều nhất, b nhì.
    for (const [key, count] of [
      ['d_upgraded', 2],
      ['b_active', 1],
    ] as const) {
      for (let i = 0; i < count; i += 1) {
        const id = newId();
        await prisma.vehicle.create({
          data: {
            id,
            tenantId: ids[key]!,
            code: `XE-${id.slice(-6)}`,
            name: 'Vios',
            vehicleType: VEHICLE_TYPE.CAR,
          },
        });
      }
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    const tenantIds = Object.values(ids);
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.plan.deleteMany({ where: { id: planId } });
  });

  const keysOf = (rows: { name: string }[]) => rows.map((row) => row.name.slice(prefix.length + 1));

  maybe('mỗi loại trả đúng tập của nó, rời nhau và phủ kín; tổng đúng theo loại', async () => {
    const shops = await service.list({ q: prefix, partnerKind: PACKAGE_SHOP, sort: 'name' });
    const owners = await service.list({ q: prefix, partnerKind: INDIVIDUAL_OWNER, sort: 'name' });
    const all = await service.list({ q: prefix });

    expect(keysOf(shops.data)).toEqual(namesOf(PACKAGE_SHOP));
    expect(keysOf(owners.data)).toEqual(namesOf(INDIVIDUAL_OWNER));
    expect(shops.meta.total).toBe(namesOf(PACKAGE_SHOP).length);
    expect(owners.meta.total).toBe(namesOf(INDIVIDUAL_OWNER).length);
    expect(shops.meta.total + owners.meta.total).toBe(all.meta.total);

    // Nhãn loại trên từng dòng do server suy — khớp với danh sách chứa nó.
    expect(shops.data.every((row) => row.partnerKind === PACKAGE_SHOP)).toBe(true);
    expect(owners.data.every((row) => row.partnerKind === INDIVIDUAL_OWNER)).toBe(true);
    for (const row of all.data) {
      expect(row.partnerKind).toBe(EXPECTED[row.name.slice(prefix.length + 1)]);
    }
  });

  maybe(
    'phân trang + đếm chạy SAU điều kiện loại: không lặp, không sót, hasNext đúng',
    async () => {
      const seen: string[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const res = await service.list({
          q: prefix,
          partnerKind: PACKAGE_SHOP,
          sort: 'name',
          page,
          limit: 2,
        });
        expect(res.meta.total).toBe(5);
        expect(res.meta.hasNext).toBe(page < 3);
        seen.push(...keysOf(res.data));
      }
      expect(seen).toEqual(namesOf(PACKAGE_SHOP));
    },
  );

  maybe('lọc trạng thái không làm mất điều kiện loại', async () => {
    const lockedShops = await service.list({
      q: prefix,
      partnerKind: PACKAGE_SHOP,
      status: TENANT_STATUS.SUSPENDED,
    });
    const lockedOwners = await service.list({
      q: prefix,
      partnerKind: INDIVIDUAL_OWNER,
      status: TENANT_STATUS.SUSPENDED,
    });
    expect(keysOf(lockedShops.data)).toEqual(['b_active']);
    expect(keysOf(lockedOwners.data)).toEqual(['i_commission_locked']);
  });

  maybe('tìm kiếm trúng một đối tác loại KHÁC thì trả rỗng, không rò sang', async () => {
    const res = await service.list({ q: `${prefix}-d_upgraded`, partnerKind: INDIVIDUAL_OWNER });
    expect(res.data).toEqual([]);
    expect(res.meta.total).toBe(0);
  });

  maybe('sắp xếp: số xe, cũ nhất, mới nhất — vẫn trong đúng loại', async () => {
    const byVehicles = await service.list({
      q: prefix,
      partnerKind: PACKAGE_SHOP,
      sort: 'vehicles',
    });
    expect(keysOf(byVehicles.data).slice(0, 2)).toEqual(['d_upgraded', 'b_active']);
    expect(byVehicles.data.every((row) => row.partnerKind === PACKAGE_SHOP)).toBe(true);

    const oldest = await service.list({ q: prefix, partnerKind: INDIVIDUAL_OWNER, sort: 'oldest' });
    const newest = await service.list({ q: prefix, partnerKind: INDIVIDUAL_OWNER, sort: 'newest' });
    expect(keysOf(newest.data)).toEqual([...keysOf(oldest.data)].reverse());
    expect(new Set(keysOf(oldest.data))).toEqual(new Set(namesOf(INDIVIDUAL_OWNER)));
  });

  /*
   * Nút "Mở phiên hỗ trợ" ở cả hai danh sách không gửi loại nào — server tự chọn workspace
   * (`supportWorkspaceOf`, ADR 0050 điều 2). Khoá sự ăn khớp giữa hai luật: danh sách cá nhân
   * không bao giờ mở ra Full Manage; gian hàng gói còn gói hiệu lực thì vào Manage, đang chờ
   * kích hoạt thì vào onboarding, hết gói hẳn thì về Owner Lite (khách cũ cần gia hạn).
   */
  maybe('phiên hỗ trợ mở từ mỗi danh sách vào đúng workspace do server chọn', async () => {
    const now = new Date();
    const workspaceOf = async (key: string) => {
      const row = await prisma.tenant.findUniqueOrThrow({
        where: { id: ids[key]! },
        select: tenantContextSelect(now),
      });
      return supportWorkspaceOf(buildTenantContext(row, now, TENANT_ROLE.SHOP_VIEWER, []));
    };

    expect(await workspaceOf('a_pending')).toBe(SUPPORT_WORKSPACE.ONBOARDING);
    expect(await workspaceOf('b_active')).toBe(SUPPORT_WORKSPACE.MANAGE);
    expect(await workspaceOf('d_upgraded')).toBe(SUPPORT_WORKSPACE.MANAGE);
    expect(await workspaceOf('e_upgraded_grace')).toBe(SUPPORT_WORKSPACE.MANAGE);
    expect(await workspaceOf('c_active_lapsed')).toBe(SUPPORT_WORKSPACE.OWNER_LITE);
    for (const key of namesOf(INDIVIDUAL_OWNER)) {
      expect(await workspaceOf(key)).toBe(SUPPORT_WORKSPACE.OWNER_LITE);
    }
  });

  maybe('chi tiết mang cùng nhãn loại với danh sách', async () => {
    expect((await service.getOne(ids['a_pending']!)).partnerKind).toBe(PACKAGE_SHOP);
    expect((await service.getOne(ids['e_upgraded_grace']!)).partnerKind).toBe(PACKAGE_SHOP);
    expect((await service.getOne(ids['g_upgraded_lapsed']!)).partnerKind).toBe(INDIVIDUAL_OWNER);
  });
});
