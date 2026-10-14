import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  INVITE_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { createHash, randomBytes } from 'node:crypto';
import { normalizePhone } from '../src/common/phone';
import { AuditService } from '../src/modules/audit/audit.service';
import { InvitesService } from '../src/modules/members/invites.service';
import { RequestRealmService } from '../src/modules/auth/request-realm.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Lời mời vào gian hàng — chạy trên PostgreSQL THẬT.
 *
 * Cái được khoá ở đây là những điều mà nếu hỏng thì hỏng ÂM THẦM và hỏng về phía BẢO MẬT:
 *
 *  1. **Không ai vào được gian hàng nếu chưa tự đồng ý.** Đây là lý do cả module tồn tại —
 *     `POST /members` cũ tạo thẳng membership `active` cho một email bất kỳ.
 *  2. **Token thô không nằm trong database.** Đọc được bảng ≠ chiếm được một chỗ.
 *  3. **Link chuyển tiếp không dùng được.** Người đăng nhập phải có ĐÚNG số được mời, ĐÃ XÁC MINH
 *     (ADR 0060 — lời mời đi bằng SĐT, không còn bằng email).
 *  4. **Bấm hai lần không tạo hai thứ.** Nhận lời mời là thao tác một-lần.
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
// Link mời trỏ về site PARTNER (ADR 0053) — URL dựng từ `WEB_PARTNER_URL`.
const realms = new RequestRealmService(config);

const invites = new InvitesService(asService, new AuditService(asService), realms);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let inviteeId: string;
let strangerId: string;
/** Tài khoản mang ĐÚNG số được mời nhưng CHƯA xác minh số đó. */
let unverifiedId: string;

/** SĐT riêng cho lần chạy này — `users.phone` unique theo realm. */
const RUN = String(Date.now() % 1_000_000).padStart(6, '0');
const INVITEE_PHONE = `0948${RUN}`;
const STRANGER_PHONE = `0948${String((Number(RUN) + 1) % 1_000_000).padStart(6, '0')}`;
const UNVERIFIED_PHONE = `0948${String((Number(RUN) + 2) % 1_000_000).padStart(6, '0')}`;

/** Token thô — chỉ lấy được từ link trả về cho người mời, đúng như người dùng thật. */
function tokenOf(created: { inviteUrl: string }): string {
  return created.inviteUrl.split('/').pop()!;
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

  ownerId = newId();
  inviteeId = newId();
  strangerId = newId();
  unverifiedId = newId();
  tenantId = newId();

  const P = ACCOUNT_REALM.PARTNER;
  await prisma.user.createMany({
    data: [
      { realm: P, id: ownerId, displayName: 'Chủ shop', phone: normalizePhone(`0949${RUN}`) },
      {
        realm: P,
        id: inviteeId,
        displayName: 'Nhân viên',
        phone: normalizePhone(INVITEE_PHONE),
        phoneVerifiedAt: new Date(),
        // Email cũ của lời mời email (ca cuối) — chữ HOA có chủ đích, so khớp sau chuẩn hoá.
        email: `INVITEE-${inviteeId}@XEPRIME.TEST`,
      },
      {
        realm: P,
        id: strangerId,
        displayName: 'Người lạ',
        phone: normalizePhone(STRANGER_PHONE),
        phoneVerifiedAt: new Date(),
      },
      {
        realm: P,
        id: unverifiedId,
        displayName: 'Chưa xác minh',
        phone: normalizePhone(UNVERIFIED_PHONE),
      },
    ],
  });

  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Mời',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({ data: { tenantId } });
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
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.tenantInvite.deleteMany({ where: { tenantId } });
  await prisma.tenantMembership.deleteMany({
    where: { tenantId, userId: { in: [inviteeId, strangerId, unverifiedId] } },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantInvite.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, inviteeId, strangerId, unverifiedId] } },
    });
  }
  await prisma.$disconnect();
});

const invite = (phone = INVITEE_PHONE) =>
  invites.create(tenantId, ownerId, { phone, roleKey: TENANT_ROLE.SHOP_STAFF }, null);

describe('Lời mời — tạo', () => {
  it('KHÔNG tạo membership nào lúc mời: người được mời chưa đồng ý', async () => {
    if (!dbAvailable) return;
    await invite();

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: inviteeId },
    });
    expect(membership).toBeNull();
  });

  it('trả link MỘT lần cho người mời; DB lưu SĐT dạng chuẩn và chỉ SHA-256 của token', async () => {
    if (!dbAvailable) return;
    const created = await invite();
    const token = tokenOf(created);

    expect(created.inviteUrl).toBe(`https://partner.web.test/invites/${token}`);
    expect(created.phone).toBe(INVITEE_PHONE);
    expect(created.email).toBeNull();

    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(row.phone).toBe(normalizePhone(INVITEE_PHONE));
    expect(token).toHaveLength(64);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it('mời lại cùng số thì lời mời cũ bị thu hồi — chỉ đúng MỘT link còn sống', async () => {
    if (!dbAvailable) return;
    const first = await invite();
    // Cùng một số, khác cách viết — vẫn là lời mời trước đó.
    await invite(`+84${INVITEE_PHONE.slice(1)}`);

    const rows = await prisma.tenantInvite.findMany({ where: { tenantId } });
    expect(rows.filter((r) => r.status === INVITE_STATUS.PENDING)).toHaveLength(1);

    await expect(invites.accept(tokenOf(first), inviteeId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_INVALID },
    });
  });

  /**
   * Thu hồi-rồi-tạo một mình không đủ ở READ COMMITTED: hai lượt song song cùng thấy 0 lời mời đang
   * chờ và cùng tạo. Khoá tư vấn theo (gian hàng, số) là thứ giữ "một số một link sống".
   */
  it('hai lượt mời song song cùng số: vẫn đúng MỘT link còn sống', async () => {
    if (!dbAvailable) return;
    const created = await Promise.all([invite(), invite(), invite()]);

    const rows = await prisma.tenantInvite.findMany({ where: { tenantId } });
    const pending = rows.filter((r) => r.status === INVITE_STATUS.PENDING);
    expect(pending).toHaveLength(1);
    // Link còn sống là của lượt commit SAU CÙNG; hai link kia đã hết giá trị.
    const live = created.filter((c) => c.id === pending[0]!.id);
    expect(live).toHaveLength(1);
  });

  it('không mời được người đã là thành viên', async () => {
    if (!dbAvailable) return;
    await invites.accept(tokenOf(await invite()), inviteeId);

    await expect(invite()).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_ALREADY_MEMBER },
    });
  });

  it('không mời được ai làm chủ gian hàng', async () => {
    if (!dbAvailable) return;
    await expect(
      invites.create(
        tenantId,
        ownerId,
        { phone: INVITEE_PHONE, roleKey: TENANT_ROLE.SHOP_OWNER },
        null,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });
});

describe('Lời mời — xem trước (không cần đăng nhập)', () => {
  it('nói đủ để quyết định, và KHÔNG lộ nguyên SĐT được mời', async () => {
    if (!dbAvailable) return;
    const preview = await invites.preview(tokenOf(await invite()));
    expect(preview.tenantName).toBe('Shop Mời');
    expect(preview.roleKey).toBe(TENANT_ROLE.SHOP_STAFF);
    expect(preview.status).toBe(INVITE_STATUS.PENDING);
    expect(preview.invitedPhoneMasked).toBeTruthy();
    expect(preview.invitedPhoneMasked).not.toContain(INVITEE_PHONE);
    expect(preview.invitedPhoneMasked?.endsWith(INVITEE_PHONE.slice(-3))).toBe(true);
    expect(preview.invitedEmailMasked).toBeNull();
  });

  it('token bịa ra thì 404, không phải một trang trống', async () => {
    if (!dbAvailable) return;
    await expect(invites.preview('khong-ton-tai')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_INVALID },
    });
  });
});

describe('Lời mời — trả lời', () => {
  it('đồng ý: thành thành viên ĐÚNG vai được mời, lời mời đóng lại', async () => {
    if (!dbAvailable) return;
    const answer = await invites.accept(tokenOf(await invite()), inviteeId);
    expect(answer.status).toBe(INVITE_STATUS.ACCEPTED);

    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId, userId: inviteeId },
    });
    expect(membership.roleKey).toBe(TENANT_ROLE.SHOP_STAFF);
    expect(membership.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    expect(membership.invitedBy).toBe(ownerId);

    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(row.status).toBe(INVITE_STATUS.ACCEPTED);
    expect(row.acceptedBy).toBe(inviteeId);
  });

  it('từ chối: KHÔNG có membership nào, và gian hàng thấy được câu trả lời', async () => {
    if (!dbAvailable) return;
    await invites.decline(tokenOf(await invite()), inviteeId);

    expect(
      await prisma.tenantMembership.findFirst({ where: { tenantId, userId: inviteeId } }),
    ).toBeNull();
    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(row.status).toBe(INVITE_STATUS.DECLINED);
  });

  /** Link mời đi qua Zalo / tin nhắn và bị chuyển tiếp là chuyện thường. */
  it('người KHÁC cầm link thì không nhận được — SĐT phải khớp', async () => {
    if (!dbAvailable) return;
    const token = tokenOf(await invite());

    await expect(invites.accept(token, strangerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_PHONE_MISMATCH },
    });
    expect(
      await prisma.tenantMembership.findFirst({ where: { tenantId, userId: strangerId } }),
    ).toBeNull();
  });

  /**
   * Số chỉ tự khai vào hồ sơ mà chưa qua OTP thì không phải bằng chứng — nếu không, ai cũng chiếm
   * được chỗ của người khác bằng cách gõ số của họ.
   */
  it('đúng số nhưng CHƯA xác minh thì không nhận được', async () => {
    if (!dbAvailable) return;
    const token = tokenOf(await invite(UNVERIFIED_PHONE));

    await expect(invites.accept(token, unverifiedId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_PHONE_MISMATCH },
    });
  });

  it('người lạ cũng không TỪ CHỐI hộ được', async () => {
    if (!dbAvailable) return;
    const token = tokenOf(await invite());

    await expect(invites.decline(token, strangerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_PHONE_MISMATCH },
    });
    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(row.status).toBe(INVITE_STATUS.PENDING);
  });

  it('lời mời hết hạn thì không nhận được nữa', async () => {
    if (!dbAvailable) return;
    const token = tokenOf(await invite());
    await prisma.tenantInvite.updateMany({
      where: { tenantId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(invites.accept(token, inviteeId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_EXPIRED },
    });
    // Xem trước vẫn mở được và nói đúng lý do, thay vì im lặng 404.
    expect((await invites.preview(token)).status).toBe(INVITE_STATUS.EXPIRED);
  });

  it('lời mời đã thu hồi thì link đã gửi hết giá trị ngay', async () => {
    if (!dbAvailable) return;
    const created = await invite();
    await invites.revoke(tenantId, ownerId, created.id, null);

    await expect(invites.accept(tokenOf(created), inviteeId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_INVALID },
    });
  });

  /** Bấm đúp, hoặc mở link ở hai tab rồi bấm cả hai. */
  it('hai lần nhận song song: đúng MỘT lần thành công', async () => {
    if (!dbAvailable) return;
    const token = tokenOf(await invite());

    const results = await Promise.allSettled([
      invites.accept(token, inviteeId),
      invites.accept(token, inviteeId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId, userId: inviteeId },
    });
    expect(memberships).toHaveLength(1);
  });

  it('người từng bị gỡ được mời lại: kích hoạt lại đúng một hàng membership', async () => {
    if (!dbAvailable) return;
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId,
        userId: inviteeId,
        roleKey: TENANT_ROLE.SHOP_VIEWER,
        status: MEMBERSHIP_STATUS.REMOVED,
      },
    });
    await invites.accept(tokenOf(await invite()), inviteeId);

    const rows = await prisma.tenantMembership.findMany({ where: { tenantId, userId: inviteeId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    expect(rows[0]!.roleKey).toBe(TENANT_ROLE.SHOP_STAFF);
  });

  /**
   * Lời mời EMAIL tạo trước ADR 0060 vẫn còn trong DB tới khi hết hạn 7 ngày — không được gãy giữa
   * chừng. Dựng thẳng bản ghi cũ (không còn đường tạo nào ghi email).
   */
  it('lời mời email CŨ còn hạn: vẫn nhận được bằng tài khoản có đúng email đó', async () => {
    if (!dbAvailable) return;
    const token = randomBytes(32).toString('hex');
    await prisma.tenantInvite.create({
      data: {
        id: newId(),
        tenantId,
        email: `invitee-${inviteeId}@xeprime.test`.toLowerCase(),
        roleKey: TENANT_ROLE.SHOP_VIEWER,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        status: INVITE_STATUS.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        createdBy: ownerId,
      },
    });

    expect((await invites.preview(token)).invitedEmailMasked).toContain('@');
    await expect(invites.accept(token, strangerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_EMAIL_MISMATCH },
    });
    expect((await invites.accept(token, inviteeId)).status).toBe(INVITE_STATUS.ACCEPTED);
  });
});

describe('Lời mời — danh sách của gian hàng', () => {
  it('mặc định chỉ trả lời mời ĐANG CHỜ, và không kèm token', async () => {
    if (!dbAvailable) return;
    const created = await invite();
    await invites.revoke(tenantId, ownerId, created.id, null);
    const live = await invite();

    const page = await invites.list(tenantId, {});
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.status).toBe(INVITE_STATUS.PENDING);
    expect(page.data[0]!.phone).toBe(INVITEE_PHONE);
    expect(JSON.stringify(page.data)).not.toContain(tokenOf(live));

    const all = await invites.list(tenantId, { status: INVITE_STATUS.REVOKED });
    expect(all.data).toHaveLength(1);
  });
});
