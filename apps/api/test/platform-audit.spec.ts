import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, AUDIT_ACTOR_SCOPE } from '@xeprime/types';
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
    data: { id: actorId, displayName: 'Kiểm duyệt viên', email: `aud-${actorId}@xeprime.test` },
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

  await seedLog({ actorScope: AUDIT_ACTOR_SCOPE.PLATFORM, action: 'tenant.lock', createdAt: day(0), tenantId, actorUserId: actorId, withJson: true });
  await seedLog({ actorScope: AUDIT_ACTOR_SCOPE.PLATFORM, action: 'tenant.unlock', createdAt: day(1), tenantId, actorUserId: actorId });
  await seedLog({ actorScope: AUDIT_ACTOR_SCOPE.TENANT, action: 'booking.create', createdAt: day(2), tenantId });
  await seedLog({ actorScope: AUDIT_ACTOR_SCOPE.TENANT, action: 'booking.transition', createdAt: day(3) });
  await seedLog({ actorScope: AUDIT_ACTOR_SCOPE.SYSTEM, action: 'system.cleanup', createdAt: day(4) });
  await seedLog({ actorScope: AUDIT_ACTOR_SCOPE.PLATFORM, action: 'tenant.lock', createdAt: day(5), actorUserId: actorId });
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
