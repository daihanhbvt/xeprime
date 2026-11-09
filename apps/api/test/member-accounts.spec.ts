import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  USER_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { LoginThrottleService } from '../src/modules/auth/login-throttle.service';
import { NativeSessionService } from '../src/modules/auth/native-session.service';
import { SessionService } from '../src/modules/auth/session.service';
import { MembersService } from '../src/modules/members/members.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { normalizePhone } from '../src/common/phone';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tài khoản nhân viên do chủ gian hàng CẤP (ADR 0087) — PostgreSQL THẬT.
 *
 *  1. Cấp tài khoản là MỘT transaction: tài khoản + membership; tên đăng nhập trùng ⇒ USERNAME_TAKEN.
 *  2. Tên đăng nhập chỉ đăng nhập được ở site PARTNER.
 *  3. Bị gian hàng tạm khoá ⇒ không đăng nhập được, mọi phiên chết ngay.
 *  4. Chủ đặt lại mật khẩu CHỈ cho tài khoản do gian hàng cấp; đặt lại giết mọi phiên.
 *  5. Gỡ ⇒ vô hiệu hoá tài khoản và trả tên đăng nhập.
 */
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return { ...actual, hash: (data: string) => actual.hash(data, 4) };
});

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const ENV: Record<string, unknown> = {
  NODE_ENV: 'test',
  SESSION_JWT_SECRET: 'test-session-secret-member-accounts-0123456789',
  SESSION_COOKIE_SECURE: false,
  MOBILE_ACCESS_TTL_MINUTES: 15,
  MOBILE_REFRESH_TTL_DAYS: 60,
  MOBILE_JWT_AUDIENCE: 'xeprime-mobile-test',
};
const config = {
  get: (k: string) => ENV[k],
  getOrThrow: (k: string) => {
    const v = ENV[k];
    if (v === undefined) throw new Error(`missing ${k}`);
    return v;
  },
} as unknown as ConfigService;

const audit = new AuditService(asService);
const webSessions = new SessionService(config, asService);
const nativeSessions = new NativeSessionService(config, asService);
const members = new MembersService(
  asService,
  audit,
  new RbacService(asService),
  webSessions,
  nativeSessions,
);
const auth = new AuthService(
  asService,
  null as never,
  null as never,
  config,
  null as never,
  null as never,
  null as never,
  webSessions,
  nativeSessions,
  new LoginThrottleService(asService),
);

const P = ACCOUNT_REALM.PARTNER;
const RUN = String(Date.now() % 1_000_000).padStart(6, '0');
const tenantId = newId();
const ownerId = newId();
const managerId = newId();
const phonedStaffId = newId();
/** Tên đăng nhập riêng cho lần chạy — unique toàn site partner. */
const uname = (base: string) => `${base}${RUN}`;

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  await prisma.user.createMany({
    data: [
      { realm: P, id: ownerId, displayName: 'Chủ Tài Khoản', phone: normalizePhone(`0941${RUN}`) },
      { realm: P, id: managerId, displayName: 'Quản Lý', phone: normalizePhone(`0942${RUN}`) },
      {
        realm: P,
        id: phonedStaffId,
        displayName: 'Nhân Viên Tự Đăng Ký',
        phone: normalizePhone(`0943${RUN}`),
        phoneVerifiedAt: new Date(),
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Tài Khoản',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({ data: { tenantId } });
  await prisma.tenantMembership.createMany({
    data: [
      [ownerId, TENANT_ROLE.SHOP_OWNER],
      [managerId, TENANT_ROLE.SHOP_MANAGER],
      [phonedStaffId, TENANT_ROLE.SHOP_STAFF],
    ].map(([userId, roleKey]) => ({
      id: newId(),
      tenantId,
      userId: userId!,
      roleKey: roleKey!,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    })),
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const managed = await prisma.user.findMany({
      where: { managedByTenantId: tenantId },
      select: { id: true },
    });
    const ids = [ownerId, managerId, phonedStaffId, ...managed.map((u) => u.id)];
    await prisma.webSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

function createStaff(username: string, over: Record<string, unknown> = {}) {
  return members.createAccount(tenantId, ownerId, TENANT_ROLE.SHOP_OWNER, null, {
    displayName: 'Lê Thị Kim',
    username,
    password: 'matkhau123',
    roleKey: TENANT_ROLE.SHOP_STAFF,
    ...over,
  });
}

describe('Cấp tài khoản nhân viên', () => {
  it('tạo tài khoản + membership active trong một lượt, không ghi mật khẩu vào nhật ký', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('kim'), { contactPhone: '0987654321' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.userId } });
    expect(user).toMatchObject({
      realm: P,
      username: uname('kim'),
      managedByTenantId: tenantId,
      phone: null,
      status: USER_STATUS.ACTIVE,
    });
    expect(created.status).toBe(MEMBERSHIP_STATUS.ACTIVE);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'member.create_account', targetId: created.userId },
    });
    expect(JSON.stringify(log)).not.toContain('matkhau123');

    // Tìm theo tên đăng nhập; chọn đúng dòng theo id (chuỗi tìm mang số RUN, khớp cả SĐT người khác).
    const roster = await members.roster(tenantId, { q: uname('kim') });
    expect(roster.data.find((r) => r.userId === created.userId)).toMatchObject({
      username: uname('kim'),
      managedAccount: true,
      contactPhone: '0987654321',
      phone: '0987654321',
    });
  });

  it('tên đăng nhập trùng (kể cả khác hoa thường) ⇒ USERNAME_TAKEN, không để lại tài khoản mồ côi', async () => {
    if (!dbAvailable) return;
    await createStaff(uname('trung'));
    const before = await prisma.user.count({ where: { managedByTenantId: tenantId } });
    await expect(createStaff(uname('TRUNG'))).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.USERNAME_TAKEN },
    });
    expect(await prisma.user.count({ where: { managedByTenantId: tenantId } })).toBe(before);
  });

  it('quản lý chỉ cấp được tài khoản Nhân viên', async () => {
    if (!dbAvailable) return;
    await expect(
      members.createAccount(tenantId, managerId, TENANT_ROLE.SHOP_MANAGER, null, {
        displayName: 'Quản Lý Hai',
        username: uname('ql'),
        password: 'matkhau123',
        roleKey: TENANT_ROLE.SHOP_MANAGER,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.MEMBER_ROLE_NOT_INVITABLE } });
  });
});

describe('Đăng nhập bằng tên đăng nhập', () => {
  it('đăng nhập được ở site partner (không phân biệt hoa thường), không ở site khách', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('login'));
    await expect(auth.loginWithPassword(uname('LOGIN'), 'matkhau123', P)).resolves.toEqual({
      userId: created.userId,
    });
    await expect(
      auth.loginWithPassword(uname('login'), 'matkhau123', ACCOUNT_REALM.CUSTOMER),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.PHONE_LOGIN_REQUIRED } });
  });

  it('bị gian hàng tạm khoá ⇒ không đăng nhập được, phiên đang mở chết ngay', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('khoa'));
    const { sessionId } = await webSessions.issue(created.userId);
    await members.lock(tenantId, ownerId, created.userId, null);

    expect(await webSessions.isSessionUsable(sessionId, created.userId)).toBe(false);
    await expect(auth.loginWithPassword(uname('khoa'), 'matkhau123', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.STAFF_ACCOUNT_SUSPENDED },
    });

    await members.unlock(tenantId, ownerId, created.userId, null);
    await expect(auth.loginWithPassword(uname('khoa'), 'matkhau123', P)).resolves.toBeTruthy();
  });
});

describe('Chủ đặt lại mật khẩu', () => {
  it('mật khẩu cũ hết dùng, mật khẩu mới vào được, mọi phiên bị thu hồi', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('reset'));
    const { sessionId } = await webSessions.issue(created.userId);
    await members.resetPassword(tenantId, ownerId, created.userId, null, 'matkhaumoi456');

    expect(await webSessions.isSessionUsable(sessionId, created.userId)).toBe(false);
    await expect(auth.loginWithPassword(uname('reset'), 'matkhau123', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
    await expect(auth.loginWithPassword(uname('reset'), 'matkhaumoi456', P)).resolves.toBeTruthy();
  });

  it('tài khoản tự đăng ký bằng SĐT: KHÔNG đặt lại được, không đổi họ tên được', async () => {
    if (!dbAvailable) return;
    await expect(
      members.resetPassword(tenantId, ownerId, phonedStaffId, null, 'matkhaumoi456'),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.MEMBER_ACCOUNT_NOT_MANAGED } });
    await expect(
      members.updateRole(tenantId, ownerId, phonedStaffId, { displayName: 'Tên Khác' }, null),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.MEMBER_ACCOUNT_NOT_MANAGED } });
  });

  it('đổi họ tên + SĐT liên hệ của tài khoản do gian hàng cấp', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('ten'));
    await members.updateRole(
      tenantId,
      ownerId,
      created.userId,
      { displayName: 'Lê Thị Kim Anh', contactPhone: '0911222333' },
      null,
    );
    const roster = await members.roster(tenantId, { q: uname('ten') });
    expect(roster.data.find((r) => r.userId === created.userId)).toMatchObject({ displayName: 'Lê Thị Kim Anh', phone: '0911222333' });
  });
});

describe('Gỡ tài khoản do gian hàng cấp', () => {
  it('vô hiệu hoá tài khoản, trả tên đăng nhập để cấp lại', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('go'));
    await members.remove(tenantId, ownerId, created.userId, null);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.userId } });
    expect(user).toMatchObject({ status: USER_STATUS.LOCKED, username: null });
    await expect(auth.loginWithPassword(uname('go'), 'matkhau123', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
    await expect(createStaff(uname('go'))).resolves.toBeTruthy();
  });
});

describe('Hoạt động gần đây', () => {
  it('liệt kê việc chính người đó làm trong gian hàng, mới nhất trước', async () => {
    if (!dbAvailable) return;
    const created = await createStaff(uname('act'));
    await audit.record({
      tenantId,
      actorUserId: created.userId,
      actorScope: 'tenant',
      action: 'booking_request.approve',
      targetType: 'booking_request',
      targetId: newId(),
    });
    const rows = await members.activity(tenantId, created.userId);
    expect(rows.map((r) => r.action)).toEqual(['booking_request.approve']);
  });
});
