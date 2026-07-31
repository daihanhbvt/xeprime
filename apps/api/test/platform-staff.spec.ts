import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, MEMBERSHIP_STATUS, PLATFORM_ROLE } from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformStaffService } from '../src/modules/platform-admin/platform-staff.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Nhân sự nền tảng, chạy trên PostgreSQL THẬT. Kiểm chứng: add theo email (+audit),
 * email lạ → NOT_FOUND, trùng → CONFLICT, đổi vai trò (+audit before/after), tự thao tác mình
 * → VALIDATION_FAILED, remove → khỏi danh sách, re-add kích hoạt lại, chặn Super Admin cuối
 * cùng (per-fixture: các user của suite này, DB chung có thể có admin seed khác — test last-admin
 * dùng đếm THỰC nên chỉ assert khi suite kiểm soát được; xem từng case).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformStaffService(asService, new AuditService(asService));

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let actorId: string;
let staffAId: string;
let staffBId: string;
const userIds: string[] = [];

async function mkUser(tag: string): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, displayName: `Staff ${tag}`, email: `staff-${tag}-${RUN}@xeprime.test` },
  });
  userIds.push(id);
  return id;
}

const emailOf = (tag: string) => `staff-${tag}-${RUN}@xeprime.test`;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  actorId = await mkUser('actor');
  staffAId = await mkUser('a');
  staffBId = await mkUser('b');
  // Actor là platform_admin sẵn (người thao tác các case).
  await prisma.platformMembership.create({
    data: {
      id: newId(),
      userId: actorId,
      roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: userIds } } });
    await prisma.platformMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform staff (Phase 7)', () => {
  maybe('add theo email → active + audit; email lạ → NOT_FOUND; trùng → CONFLICT', async () => {
    const added = await service.add(actorId, {
      email: emailOf('a'),
      roleKey: PLATFORM_ROLE.REVIEWER,
    });
    expect(added.userId).toBe(staffAId);
    expect(added.roleKey).toBe(PLATFORM_ROLE.REVIEWER);
    expect(added.status).toBe(MEMBERSHIP_STATUS.ACTIVE);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: staffAId, action: 'platform_staff.add' },
    });
    expect(audit?.actorScope).toBe('platform');
    expect(audit?.afterJson).toEqual({ roleKey: PLATFORM_ROLE.REVIEWER });

    await expect(
      service.add(actorId, { email: `khong-ton-tai-${RUN}@xeprime.test`, roleKey: PLATFORM_ROLE.SUPPORT }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });

    await expect(
      service.add(actorId, { email: emailOf('a'), roleKey: PLATFORM_ROLE.SUPPORT }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
  });

  maybe('list: thấy nhân sự vừa thêm, lọc theo vai trò, tìm theo email', async () => {
    const all = await service.list({ q: `-${RUN}` });
    const ids = all.data.map((s) => s.userId);
    expect(ids).toContain(actorId);
    expect(ids).toContain(staffAId);

    const reviewers = await service.list({ q: `-${RUN}`, roleKey: PLATFORM_ROLE.REVIEWER });
    expect(reviewers.data.map((s) => s.userId)).toEqual([staffAId]);
  });

  maybe('updateRole: đổi vai trò + audit before/after; tự đổi mình → reject', async () => {
    const updated = await service.updateRole(actorId, staffAId, {
      roleKey: PLATFORM_ROLE.SUPPORT,
    });
    expect(updated.roleKey).toBe(PLATFORM_ROLE.SUPPORT);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: staffAId, action: 'platform_staff.update_role' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.beforeJson).toEqual({ roleKey: PLATFORM_ROLE.REVIEWER });
    expect(audit?.afterJson).toEqual({ roleKey: PLATFORM_ROLE.SUPPORT });

    await expect(
      service.updateRole(actorId, actorId, { roleKey: PLATFORM_ROLE.SUPPORT }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('remove → biến khỏi list + audit; tự gỡ mình → reject; re-add kích hoạt lại row cũ', async () => {
    await expect(service.remove(actorId, actorId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });

    const res = await service.remove(actorId, staffAId);
    expect(res.userId).toBe(staffAId);
    const after = await service.list({ q: `-${RUN}` });
    expect(after.data.map((s) => s.userId)).not.toContain(staffAId);
    const audit = await prisma.auditLog.findFirst({
      where: { targetId: staffAId, action: 'platform_staff.remove' },
    });
    expect(audit?.beforeJson).toEqual({ roleKey: PLATFORM_ROLE.SUPPORT });

    // Re-add cùng vai trò cũ → kích hoạt lại row (không thêm row mới cho [user, role] đó).
    const readded = await service.add(actorId, {
      email: emailOf('a'),
      roleKey: PLATFORM_ROLE.SUPPORT,
    });
    expect(readded.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    const rows = await prisma.platformMembership.count({
      where: { userId: staffAId, roleKey: PLATFORM_ROLE.SUPPORT },
    });
    expect(rows).toBe(1);
  });

  maybe('đổi vai trò sang role có row removed cũ → dọn row rác, không nổ unique', async () => {
    // staffB: add reviewer → remove → add support → đổi về reviewer (row removed reviewer tồn tại).
    await service.add(actorId, { email: emailOf('b'), roleKey: PLATFORM_ROLE.REVIEWER });
    await service.remove(actorId, staffBId);
    await service.add(actorId, { email: emailOf('b'), roleKey: PLATFORM_ROLE.SUPPORT });
    const updated = await service.updateRole(actorId, staffBId, {
      roleKey: PLATFORM_ROLE.REVIEWER,
    });
    expect(updated.roleKey).toBe(PLATFORM_ROLE.REVIEWER);
    const rows = await prisma.platformMembership.findMany({
      where: { userId: staffBId },
      select: { roleKey: true, status: true },
    });
    // Chỉ còn đúng 1 row chưa-removed (reviewer); row support đã đổi tại chỗ, row rác đã dọn.
    expect(rows.filter((r) => r.status !== MEMBERSHIP_STATUS.REMOVED)).toEqual([
      { roleKey: PLATFORM_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.ACTIVE },
    ]);
  });

  maybe('last-admin: không gỡ / hạ vai trò Super Admin ACTIVE cuối cùng', async () => {
    // Cô lập: khoá tạm mọi admin ACTIVE ngoài fixture rồi trả lại — DB dev có admin seed.
    const outsiders = await prisma.platformMembership.findMany({
      where: {
        roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
        status: MEMBERSHIP_STATUS.ACTIVE,
        userId: { notIn: userIds },
      },
      select: { id: true },
    });
    const outsiderIds = outsiders.map((o) => o.id);
    await prisma.platformMembership.updateMany({
      where: { id: { in: outsiderIds } },
      data: { status: MEMBERSHIP_STATUS.LOCKED },
    });
    try {
      // Giờ actor là admin ACTIVE duy nhất. Một admin khác (staffB → admin) thao tác lên actor.
      await service.updateRole(actorId, staffBId, { roleKey: PLATFORM_ROLE.PLATFORM_ADMIN });
      // 2 admin → gỡ actor được phép? staffB gỡ actor: còn staffB là admin → OK.
      await service.remove(staffBId, actorId);
      // Còn mỗi staffB là admin → không ai gỡ/hạ được staffB nữa.
      await expect(service.remove(actorId, staffBId)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.VALIDATION_FAILED },
      });
      await expect(
        service.updateRole(actorId, staffBId, { roleKey: PLATFORM_ROLE.SUPPORT }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    } finally {
      await prisma.platformMembership.updateMany({
        where: { id: { in: outsiderIds } },
        data: { status: MEMBERSHIP_STATUS.ACTIVE },
      });
    }
  });
});
