import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS,
  MEMBERSHIP_LOCK_REASON,
  MEMBERSHIP_STATUS,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { normalizePhone } from '../src/common/phone';
import { AuditService } from '../src/modules/audit/audit.service';
import { RequestRealmService } from '../src/modules/auth/request-realm.service';
import { InvitesService } from '../src/modules/members/invites.service';
import { MembersService } from '../src/modules/members/members.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { SessionService } from '../src/modules/auth/session.service';
import { NativeSessionService } from '../src/modules/auth/native-session.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Màn Nhân viên & phân quyền theo ADR 0086 — chạy trên PostgreSQL THẬT.
 *
 *  1. Danh sách GỘP thành viên + lời mời còn hạn, phân trang và lọc trong DB.
 *  2. Quản lý chỉ mời được Nhân viên — chốt ở server, không ở ô chọn.
 *  3. Khoá tay cắt quyền; khoá vì hết gói KHÔNG mở tay được.
 *  4. Ma trận vai đọc quyền thật, kèm số người.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const config = {
  get: () => undefined,
  getOrThrow: (key: string) => {
    if (key === 'WEB_PARTNER_URL') return 'https://partner.web.test';
    if (key === 'APP_WEB_URL') return 'https://web.test';
    if (key === 'WEB_ADMIN_URL') return 'https://admin.web.test';
    throw new Error(`Spec không mong đợi key ${key}`);
  },
} as never;

const audit = new AuditService(asService);
const invites = new InvitesService(asService, audit, new RequestRealmService(config));
const members = new MembersService(
  asService,
  audit,
  new RbacService(asService),
  new SessionService(config, asService),
  new NativeSessionService(config, asService),
);

let dbAvailable = false;
const tenantId = newId();
const ownerId = newId();
const managerId = newId();
const staffId = newId();
const RUN = String(Date.now() % 1_000_000).padStart(6, '0');
const phoneOf = (prefix: string) => normalizePhone(`${prefix}${RUN}`);
const INVITEE_PHONE = `0936${RUN}`;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  const P = ACCOUNT_REALM.PARTNER;
  await prisma.user.createMany({
    data: [
      { realm: P, id: ownerId, displayName: 'Chủ Roster', phone: phoneOf('0931') },
      { realm: P, id: managerId, displayName: 'Quản Lý Roster', phone: phoneOf('0932') },
      {
        realm: P,
        id: staffId,
        displayName: 'Nhân Viên Roster',
        phone: phoneOf('0933'),
        email: `staff-${staffId}@xeprime.test`,
        lastLoginAt: new Date('2026-11-01T00:00:00Z'),
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Roster',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({ data: { tenantId } });
  const membership = (userId: string, roleKey: string) => ({
    id: newId(),
    tenantId,
    userId,
    roleKey,
    status: MEMBERSHIP_STATUS.ACTIVE,
    joinedAt: new Date(),
  });
  await prisma.tenantMembership.createMany({
    data: [
      membership(ownerId, TENANT_ROLE.SHOP_OWNER),
      membership(managerId, TENANT_ROLE.SHOP_MANAGER),
      membership(staffId, TENANT_ROLE.SHOP_STAFF),
    ],
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.tenantInvite.deleteMany({ where: { tenantId } });
  await prisma.tenantMembership.updateMany({
    where: { tenantId, userId: staffId },
    data: { status: MEMBERSHIP_STATUS.ACTIVE, lockedReason: null },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantInvite.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, managerId, staffId] } } });
  }
  await prisma.$disconnect();
});

const inviteAsOwner = (roleKey: string = TENANT_ROLE.SHOP_STAFF, nickname?: string) =>
  invites.create(
    tenantId,
    ownerId,
    { phone: INVITEE_PHONE, roleKey, nickname },
    null,
    TENANT_ROLE.SHOP_OWNER,
  );

describe('Danh sách gộp', () => {
  it('ghép thành viên và lời mời còn hạn, chủ đứng đầu, sắp theo vai', async () => {
    if (!dbAvailable) return;
    await inviteAsOwner(TENANT_ROLE.SHOP_STAFF, 'Hạnh quầy');

    const page = await members.roster(tenantId, {});
    expect(page.meta.total).toBe(4);
    expect(page.data.map((r) => r.roleKey)).toEqual([
      TENANT_ROLE.SHOP_OWNER,
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_STAFF,
    ]);
    const pending = page.data.find((r) => r.kind === MEMBER_ROSTER_KIND.INVITE)!;
    expect(pending).toMatchObject({
      status: MEMBER_ROSTER_STATUS.PENDING,
      nickname: 'Hạnh quầy',
      phone: INVITEE_PHONE,
      userId: null,
      invitedByName: 'Chủ Roster',
    });
    const staff = page.data.find((r) => r.userId === staffId)!;
    expect(staff.lastActiveAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('lời mời quá hạn không còn là dòng "Chờ xác nhận"', async () => {
    if (!dbAvailable) return;
    const created = await inviteAsOwner();
    await prisma.tenantInvite.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const page = await members.roster(tenantId, { status: MEMBER_ROSTER_STATUS.PENDING });
    expect(page.meta.total).toBe(0);
  });

  it('lọc trạng thái, vai, và tìm theo SĐT / tên gợi nhớ; phân trang ở DB', async () => {
    if (!dbAvailable) return;
    await inviteAsOwner(TENANT_ROLE.SHOP_VIEWER, 'Kế toán Lan');

    const pending = await members.roster(tenantId, { status: MEMBER_ROSTER_STATUS.PENDING });
    expect(pending.data.map((r) => r.kind)).toEqual([MEMBER_ROSTER_KIND.INVITE]);

    const managers = await members.roster(tenantId, { roleKey: TENANT_ROLE.SHOP_MANAGER });
    expect(managers.data.map((r) => r.userId)).toEqual([managerId]);

    // Mọi số của lần chạy chung 6 số cuối (`RUN`) — lấy 7 số để chỉ khớp đúng nhân viên.
    const byPhone = await members.roster(tenantId, { q: `0933${RUN}`.slice(-7) });
    expect(byPhone.data.map((r) => r.userId)).toEqual([staffId]);

    const byNickname = await members.roster(tenantId, { q: 'kế toán' });
    expect(byNickname.data.map((r) => r.nickname)).toEqual(['Kế toán Lan']);

    // Ký tự đại diện của LIKE là chữ thường, không phải "khớp mọi thứ".
    expect((await members.roster(tenantId, { q: '%' })).meta.total).toBe(0);

    const first = await members.roster(tenantId, { page: 1, limit: 2 });
    const second = await members.roster(tenantId, { page: 2, limit: 2 });
    expect(first.meta).toMatchObject({ total: 4, hasNext: true });
    expect(second.data).toHaveLength(2);
    expect(new Set([...first.data, ...second.data].map((r) => r.id)).size).toBe(4);
  });
});

describe('Vai được mời', () => {
  it('quản lý chỉ mời được Nhân viên', async () => {
    if (!dbAvailable) return;
    await expect(
      invites.create(
        tenantId,
        managerId,
        { phone: INVITEE_PHONE, roleKey: TENANT_ROLE.SHOP_MANAGER },
        null,
        TENANT_ROLE.SHOP_MANAGER,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.MEMBER_ROLE_NOT_INVITABLE } });

    const ok = await invites.create(
      tenantId,
      managerId,
      { phone: INVITEE_PHONE, roleKey: TENANT_ROLE.SHOP_STAFF },
      null,
      TENANT_ROLE.SHOP_MANAGER,
    );
    expect(ok.roleKey).toBe(TENANT_ROLE.SHOP_STAFF);
  });
});

describe('Khoá / mở khoá', () => {
  it('khoá tay rồi mở lại, có audit', async () => {
    if (!dbAvailable) return;
    const locked = await members.lock(tenantId, ownerId, staffId, null);
    expect(locked.status).toBe(MEMBERSHIP_STATUS.LOCKED);
    await expect(members.lock(tenantId, ownerId, staffId, null)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });

    const roster = await members.roster(tenantId, { status: MEMBER_ROSTER_STATUS.LOCKED });
    expect(roster.data.map((r) => r.userId)).toEqual([staffId]);

    const unlocked = await members.unlock(tenantId, ownerId, staffId, null);
    expect(unlocked.status).toBe(MEMBERSHIP_STATUS.ACTIVE);

    const actions = await prisma.auditLog.findMany({
      where: { tenantId, targetId: staffId, action: { in: ['member.lock', 'member.unlock'] } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(['member.lock', 'member.unlock']);
  });

  it('khoá vì hết gói KHÔNG mở tay được', async () => {
    if (!dbAvailable) return;
    await prisma.tenantMembership.updateMany({
      where: { tenantId, userId: staffId },
      data: { status: MEMBERSHIP_STATUS.LOCKED, lockedReason: MEMBERSHIP_LOCK_REASON.PLAN_LAPSED },
    });
    await expect(members.unlock(tenantId, ownerId, staffId, null)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.MEMBER_LOCKED_BY_SYSTEM },
    });
  });

  it('không khoá được chủ, cũng không tự khoá mình', async () => {
    if (!dbAvailable) return;
    await expect(members.lock(tenantId, managerId, ownerId, null)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
    await expect(members.lock(tenantId, staffId, staffId, null)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });
});

describe('Tên gợi nhớ', () => {
  it('đặt và gỡ qua PATCH, không đụng vai', async () => {
    if (!dbAvailable) return;
    await members.updateRole(tenantId, ownerId, staffId, { nickname: '  Bình ca sáng ' }, null);
    let row = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId, userId: staffId } },
    });
    expect(row).toMatchObject({ displayNameInTenant: 'Bình ca sáng', roleKey: TENANT_ROLE.SHOP_STAFF });

    await members.updateRole(tenantId, ownerId, staffId, { nickname: '' }, null);
    row = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId, userId: staffId } },
    });
    expect(row.displayNameInTenant).toBeNull();
  });
});

describe('Ma trận vai', () => {
  it('đọc quyền thật của bốn vai kèm số người', async () => {
    if (!dbAvailable) return;
    const roles = await members.roles(tenantId);
    const byRole = new Map(roles.map((r) => [r.roleKey, r]));
    expect(roles.map((r) => r.roleKey)).toHaveLength(4);
    expect(byRole.get(TENANT_ROLE.SHOP_OWNER)?.memberCount).toBe(1);
    expect(byRole.get(TENANT_ROLE.SHOP_VIEWER)?.memberCount).toBe(0);
    // Quyền mặc định mới (ADR 0086 điều 2) — migration đã cấp cho vai hệ thống.
    expect(byRole.get(TENANT_ROLE.SHOP_STAFF)?.permissions).toContain(
      PERMISSION.BOOKING_REQUEST_APPROVE,
    );
    expect(byRole.get(TENANT_ROLE.SHOP_VIEWER)?.permissions).toContain(PERMISSION.FINANCE_VIEW);
  });
});
