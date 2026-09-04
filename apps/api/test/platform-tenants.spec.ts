import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, TENANT_STATUS, VEHICLE_TYPE } from '@xeprime/types';
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
    data: { id: vehicleId, tenantId: t1, code: `XE-${vehicleId.slice(-6)}`, name: 'Vios', vehicleType: VEHICLE_TYPE.CAR },
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
    const activeBeta = await service.list({ status: TENANT_STATUS.ACTIVE, q: `Beta-${t2.slice(-6)}` });
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
