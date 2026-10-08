import { createPrismaClient, newId } from '@xeprime/prisma';
import { ACCOUNT_REALM, API_ERROR_CODE, AUDIT_ACTOR_SCOPE } from '@xeprime/types';
import { PlatformAuditService } from '../src/modules/platform-admin/platform-audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Đọc audit log, chạy trên PostgreSQL THẬT. Cô lập với suite khác bằng targetType
 * duy nhất theo run (bảng audit_logs là global, các suite khác cũng ghi vào). Kiểm chứng:
 * order desc, từng filter, phân trang, list KHÔNG kèm JSON, detail kèm JSON, id lạ → NOT_FOUND.
 */
const prisma = createPrismaClient();
const service = new PlatformAuditService(prisma as unknown as PrismaService);

const RUN_TARGET = `audit-spec-${newId().slice(-8)}`;

let dbAvailable = false;
let actorId: string;
let tenantId: string;
const logIds: string[] = [];

/** Tạo 1 dòng audit trực tiếp (fixture) — targetType cô lập theo run. */
async function seedLog(opts: {
  actorScope: string;
  action: string;
  createdAt: Date;
  tenantId?: string | null;
  actorUserId?: string | null;
  withJson?: boolean;
}): Promise<string> {
  const id = newId();
  await prisma.auditLog.create({
    data: {
      id,
      actorScope: opts.actorScope,
      action: opts.action,
      targetType: RUN_TARGET,
      targetId: id,
      tenantId: opts.tenantId ?? null,
      actorUserId: opts.actorUserId ?? null,
      beforeJson: opts.withJson ? { status: 'active' } : undefined,
      afterJson: opts.withJson ? { status: 'suspended', reason: 'test' } : undefined,
      createdAt: opts.createdAt,
    },
  });
  logIds.push(id);
  return id;
}

const T0 = new Date('2026-07-01T00:00:00.000Z');
const day = (n: number) => new Date(T0.getTime() + n * 24 * 60 * 60 * 1000);

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
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: actorId,
      displayName: 'Kiểm duyệt viên',
      email: `aud-${actorId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `AuditShop-${tenantId.slice(-6)}`,
      ownerUserId: actorId,
    },
  });

  await seedLog({
    actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
    action: 'tenant.lock',
    createdAt: day(0),
    tenantId,
    actorUserId: actorId,
    withJson: true,
  });
  await seedLog({
    actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
    action: 'tenant.unlock',
    createdAt: day(1),
    tenantId,
    actorUserId: actorId,
  });
  await seedLog({
    actorScope: AUDIT_ACTOR_SCOPE.TENANT,
    action: 'booking.create',
    createdAt: day(2),
    tenantId,
  });
  await seedLog({
    actorScope: AUDIT_ACTOR_SCOPE.TENANT,
    action: 'booking.transition',
    createdAt: day(3),
  });
  await seedLog({
    actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
    action: 'system.cleanup',
    createdAt: day(4),
  });
  await seedLog({
    actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
    action: 'tenant.lock',
    createdAt: day(5),
    actorUserId: actorId,
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { targetType: RUN_TARGET } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Query cô lập theo run: luôn kèm targetType riêng. */
const listRun = (extra: Record<string, unknown> = {}) =>
  service.list({ targetType: RUN_TARGET, ...extra });

describe('Platform audit read (Phase 7)', () => {
  maybe('mặc định: mới nhất trước, list KHÔNG kèm before/after JSON', async () => {
    const res = await listRun();
    expect(res.data).toHaveLength(6);
    expect(res.meta.total).toBe(6);
    const times = res.data.map((r) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(res.data[0]!.action).toBe('tenant.lock'); // day(5) mới nhất
    // Row danh sách không mang JSON payload.
    expect('beforeJson' in res.data[0]!).toBe(false);
    expect('afterJson' in res.data[0]!).toBe(false);
  });

  maybe('filter actorScope / action / tenantId / actorUserId', async () => {
    const platform = await listRun({ actorScope: AUDIT_ACTOR_SCOPE.PLATFORM });
    expect(platform.data).toHaveLength(3);
    expect(platform.data.every((r) => r.actorScope === AUDIT_ACTOR_SCOPE.PLATFORM)).toBe(true);

    const locks = await listRun({ action: 'tenant.lock' });
    expect(locks.data).toHaveLength(2);

    const byTenant = await listRun({ tenantId });
    expect(byTenant.data).toHaveLength(3);
    expect(byTenant.data.every((r) => r.tenantName?.startsWith('AuditShop-'))).toBe(true);

    const byActor = await listRun({ actorUserId: actorId });
    expect(byActor.data).toHaveLength(3);
    expect(byActor.data[0]!.actorName).toBe('Kiểm duyệt viên');
  });

  maybe('filter khoảng thời gian (inclusive 2 đầu)', async () => {
    const mid = await listRun({
      dateFrom: day(1).toISOString(),
      dateTo: day(3).toISOString(),
    });
    expect(mid.data).toHaveLength(3);
    expect(mid.data.map((r) => r.action)).toEqual([
      'booking.transition',
      'booking.create',
      'tenant.unlock',
    ]);
  });

  maybe('phân trang: limit=2 → 3 trang, hasNext đúng', async () => {
    const p1 = await listRun({ limit: 2, page: 1 });
    expect(p1.data).toHaveLength(2);
    expect(p1.meta).toMatchObject({ page: 1, limit: 2, total: 6, hasNext: true });
    const p3 = await listRun({ limit: 2, page: 3 });
    expect(p3.data).toHaveLength(2);
    expect(p3.meta.hasNext).toBe(false);
    // Không trùng dòng giữa các trang.
    expect(new Set([...p1.data, ...p3.data].map((r) => r.id)).size).toBe(4);
  });

  maybe('getOne: kèm JSON before/after; id lạ → NOT_FOUND', async () => {
    const detail = await service.getOne(logIds[0]!);
    expect(detail.beforeJson).toEqual({ status: 'active' });
    expect(detail.afterJson).toEqual({ status: 'suspended', reason: 'test' });
    expect(detail.tenantName).toContain('AuditShop-');

    await expect(service.getOne(newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});

/**
 * Nhóm hành động, ô tìm kiếm và tên đối tượng (08/10/2026) — chạy trên cùng bộ dòng seed ở trên,
 * luôn khoanh bằng `targetType = RUN_TARGET` để không lẫn dữ liệu của spec khác.
 */
describe('Platform audit read — nhóm, tìm kiếm, tên đối tượng', () => {
  maybe('lọc theo nhóm hành động ở DB (tiền tố mã)', async () => {
    const status = await service.list({ targetType: RUN_TARGET, category: 'partner_status' });
    expect(status.meta.total).toBe(3);
    expect(status.data.every((row) => row.action.startsWith('tenant.'))).toBe(true);

    const booking = await service.list({ targetType: RUN_TARGET, category: 'booking' });
    expect(booking.data.map((row) => row.action).sort()).toEqual([
      'booking.create',
      'booking.transition',
    ]);
  });

  maybe('tìm theo tên người thực hiện và tên gian hàng', async () => {
    const byActor = await service.list({ targetType: RUN_TARGET, q: 'kiểm duyệt' });
    expect(byActor.meta.total).toBe(3);
    expect(byActor.data.every((row) => row.actorUserId === actorId)).toBe(true);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const byTenant = await service.list({ targetType: RUN_TARGET, q: tenant.name });
    expect(byTenant.meta.total).toBe(3);
    expect(byTenant.data.every((row) => row.tenantId === tenantId)).toBe(true);

    const nobody = await service.list({ targetType: RUN_TARGET, q: `khong-ai-${newId()}` });
    expect(nobody.meta.total).toBe(0);
  });

  maybe('dán một ULID khớp CHÍNH XÁC mã dòng nhật ký (kể cả chữ thường)', async () => {
    const id = logIds[2]!;
    const found = await service.list({ q: id.toLowerCase() });
    expect(found.data.map((row) => row.id)).toEqual([id]);
  });

  maybe('trả TÊN đối tượng tra theo lô; loại dữ liệu cá nhân thì không tra', async () => {
    const tenantLog = newId();
    const customerLog = newId();
    await prisma.auditLog.createMany({
      data: [
        {
          id: tenantLog,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'tenant.lock',
          targetType: 'tenant',
          targetId: tenantId,
          tenantId,
        },
        {
          id: customerLog,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'customer.contact_reveal',
          targetType: 'tenant_customer',
          targetId: newId(),
          tenantId,
        },
      ],
    });
    try {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const detail = await service.getOne(tenantLog);
      expect(detail.targetLabel).toBe(tenant.name);
      expect(detail.viaSupport).toBe(false);
      expect((await service.getOne(customerLog)).targetLabel).toBeNull();

      const page = await service.list({ tenantId, targetType: 'tenant' });
      expect(page.data.find((row) => row.id === tenantLog)?.targetLabel).toBe(tenant.name);
    } finally {
      await prisma.auditLog.deleteMany({ where: { id: { in: [tenantLog, customerLog] } } });
    }
  });
});
