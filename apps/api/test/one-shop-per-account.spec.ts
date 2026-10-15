import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  INVITE_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  type AccountRealm,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { RequestRealmService } from '../src/modules/auth/request-realm.service';
import { InvitesService } from '../src/modules/members/invites.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { normalizePhone } from '../src/common/phone';
import { makeTenantsService } from './helpers/service-factory';

/**
 * MỘT TÀI KHOẢN — MỘT GIAN HÀNG (ADR 0053 điều 6), trên PostgreSQL thật.
 *
 * Quyết định sản phẩm 02/10/2026: nhân viên làm cho nhiều gian hàng thì dùng nhiều tài khoản đối
 * tác. Bất biến nằm ở DB (unique index một phần `tenant_memberships_one_active_per_user`); service
 * kiểm trước để trả mã nghiệp vụ, và bắt đúng vi phạm index đó khi hai lượt chạy song song.
 *
 *  1. Nhận lời mời của gian hàng B khi đang là thành viên active của A ⇒ MEMBER_ALREADY_IN_OTHER_TENANT,
 *     lời mời vẫn chờ, không có membership nào được tạo.
 *  2. Rời A (membership `removed`) rồi nhận lời mời B ⇒ được.
 *  3. Đang là thành viên mà tự mở gian hàng ⇒ MEMBER_ALREADY_IN_OTHER_TENANT, không tenant nào ra đời.
 *  4. Hai lời mời của hai gian hàng nhận SONG SONG ⇒ đúng một thắng.
 *  5. Tài khoản KHÁCH cùng email không nhận được lời mời (realm partner mới vào gian hàng).
 *  6. DB tự chặn khi một đường ghi nào đó quên kiểm.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const SITE_URLS: Record<string, string> = {
  APP_WEB_URL: 'https://web.test',
  WEB_PARTNER_URL: 'https://partner.web.test',
  WEB_ADMIN_URL: 'https://admin.web.test',
};
const config = {
  get: () => undefined,
  getOrThrow: (key: string) => {
    const value = SITE_URLS[key];
    if (value) return value;
    throw new Error(`Spec không mong đợi key ${key}`);
  },
} as never;
const invites = new InvitesService(
  asService,
  new AuditService(asService),
  new RequestRealmService(config),
);
const tenants = makeTenantsService(asService);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
const userIds: string[] = [];
const tenantIds: string[] = [];

async function mkUser(tag: string, realm: AccountRealm = ACCOUNT_REALM.PARTNER): Promise<string> {
  const id = newId();
  await prisma.user.create({
    // SĐT ĐÃ XÁC MINH — lời mời đi bằng SĐT từ ADR 0060, và chỉ số đã xác minh mới nhận được.
    data: {
      id,
      realm,
      displayName: `OSP ${tag}`,
      email: emailOf(tag),
      phone: normalizePhone(phoneOf(tag)),
      phoneVerifiedAt: new Date(),
    },
  });
  userIds.push(id);
  return id;
}
const emailOf = (tag: string) => `osp-${tag}-${RUN}@xeprime.test`;

/** Một SĐT riêng cho mỗi `tag` trong lần chạy này — `users.phone` unique theo realm. */
const PHONE_BASE = (Date.now() % 10_000) * 100;
const phones = new Map<string, string>();
function phoneOf(tag: string): string {
  let phone = phones.get(tag);
  if (!phone) {
    phone = `0946${String((PHONE_BASE + phones.size) % 1_000_000).padStart(6, '0')}`;
    phones.set(tag, phone);
  }
  return phone;
}

async function mkTenant(tag: string): Promise<{ tenantId: string; ownerId: string }> {
  const ownerId = await mkUser(`owner-${tag}`);
  const tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `OSP-${tenantId.slice(-8)}`,
      slug: `osp-${tenantId.toLowerCase().slice(-10)}`,
      name: `OSP ${tag} ${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  tenantIds.push(tenantId);
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  return { tenantId, ownerId };
}

async function addMember(tenantId: string, userId: string): Promise<void> {
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId,
      roleKey: TENANT_ROLE.SHOP_STAFF,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
}

/** Mời theo SĐT rồi trả token thô — lấy từ link trả về cho người mời, đúng như người dùng thật. */
async function inviteToken(tenantId: string, ownerId: string, phone: string): Promise<string> {
  const created = await invites.create(
    tenantId,
    ownerId,
    { phone, roleKey: TENANT_ROLE.SHOP_STAFF },
    null,
  );
  return created.inviteUrl.split('/').pop()!;
}

const memberInOther = {
  response: { code: API_ERROR_CODE.MEMBER_ALREADY_IN_OTHER_TENANT },
};

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantInvite.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // Tenant do `registerShop` tạo (nếu một ca lỡ để lọt) cũng phải dọn theo chủ của nó.
    const stray = await prisma.tenant.findMany({
      where: { ownerUserId: { in: userIds } },
      select: { id: true },
    });
    const allTenants = [...new Set([...tenantIds, ...stray.map((t) => t.id)])];
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: allTenants } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: allTenants } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: allTenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: allTenants } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('một tài khoản đối tác chỉ thuộc một gian hàng', () => {
  maybe('1 + 2: đang ở A thì không nhận lời mời B; rời A rồi thì nhận được', async () => {
    const a = await mkTenant('a1');
    const b = await mkTenant('b1');
    const staffId = await mkUser('staff1');
    await addMember(a.tenantId, staffId);

    const token = await inviteToken(b.tenantId, b.ownerId, phoneOf('staff1'));
    await expect(invites.accept(token, staffId)).rejects.toMatchObject(memberInOther);

    // Không có gì nửa vời: lời mời còn chờ, không membership nào ở B.
    const invite = await prisma.tenantInvite.findFirstOrThrow({
      where: { tenantId: b.tenantId, phone: normalizePhone(phoneOf('staff1')) },
      select: { status: true },
    });
    expect(invite.status).toBe(INVITE_STATUS.PENDING);
    expect(
      await prisma.tenantMembership.count({ where: { tenantId: b.tenantId, userId: staffId } }),
    ).toBe(0);

    // Rời A ⇒ tài khoản trống chỗ, nhận lời mời B được.
    await prisma.tenantMembership.updateMany({
      where: { tenantId: a.tenantId, userId: staffId },
      data: { status: MEMBERSHIP_STATUS.REMOVED },
    });
    const answer = await invites.accept(token, staffId);
    expect(answer.status).toBe(INVITE_STATUS.ACCEPTED);
  });

  maybe('3: đang là thành viên mà tự mở gian hàng ⇒ chặn, không tenant nào ra đời', async () => {
    const a = await mkTenant('a3');
    const staffId = await mkUser('staff3');
    await addMember(a.tenantId, staffId);

    await expect(
      tenants.registerShop(staffId, { name: `Shop riêng ${RUN}`, provinceCode: '79' } as never),
    ).rejects.toMatchObject(memberInOther);
    expect(await prisma.tenant.count({ where: { ownerUserId: staffId } })).toBe(0);
  });

  maybe('4: hai lời mời nhận SONG SONG ⇒ đúng một thắng, bên kia nhận mã nghiệp vụ', async () => {
    const a = await mkTenant('a4');
    const b = await mkTenant('b4');
    const staffId = await mkUser('staff4');
    const tokenA = await inviteToken(a.tenantId, a.ownerId, phoneOf('staff4'));
    const tokenB = await inviteToken(b.tenantId, b.ownerId, phoneOf('staff4'));

    const results = await Promise.allSettled([
      invites.accept(tokenA, staffId),
      invites.accept(tokenB, staffId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject(memberInOther);
    expect(
      await prisma.tenantMembership.count({
        where: { userId: staffId, status: MEMBERSHIP_STATUS.ACTIVE },
      }),
    ).toBe(1);
  });

  maybe('5: tài khoản KHÁCH cùng email không nhận được lời mời vào gian hàng', async () => {
    const a = await mkTenant('a5');
    const customerId = await mkUser('khach5', ACCOUNT_REALM.CUSTOMER);
    const token = await inviteToken(a.tenantId, a.ownerId, phoneOf('khach5'));

    await expect(invites.accept(token, customerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.REALM_NOT_ALLOWED },
    });
  });

  maybe('6: DB tự chặn membership active thứ hai — kể cả khi một đường ghi quên kiểm', async () => {
    const a = await mkTenant('a6');
    const b = await mkTenant('b6');
    const staffId = await mkUser('staff6');
    await addMember(a.tenantId, staffId);

    await expect(addMember(b.tenantId, staffId)).rejects.toThrow();
    // …nhưng membership ĐÃ RỜI thì không chiếm chỗ (index một phần chỉ trên `active`).
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: b.tenantId,
        userId: staffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.REMOVED,
      },
    });
  });

  maybe('6b: DB chặn tài khoản khách/quản trị làm thành viên hay chủ gian hàng', async () => {
    const a = await mkTenant('a7');
    const customerId = await mkUser('khach7', ACCOUNT_REALM.CUSTOMER);
    const platformId = await mkUser('admin7', ACCOUNT_REALM.PLATFORM);

    await expect(addMember(a.tenantId, customerId)).rejects.toThrow(/realm partner/);
    await expect(addMember(a.tenantId, platformId)).rejects.toThrow(/realm partner/);
    await expect(
      prisma.tenant.update({ where: { id: a.tenantId }, data: { ownerUserId: customerId } }),
    ).rejects.toThrow(/realm partner/);
  });
});
