import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  INVITE_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InvitesService } from '../src/modules/members/invites.service';
import type { EmailService } from '../src/modules/email/email.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Thư mời vào gian hàng — chạy trên PostgreSQL THẬT.
 *
 * Cái được khoá ở đây là những điều mà nếu hỏng thì hỏng ÂM THẦM và hỏng về phía BẢO MẬT:
 *
 *  1. **Không ai vào được gian hàng nếu chưa tự đồng ý.** Đây là lý do cả module tồn tại —
 *     `POST /members` cũ tạo thẳng membership `active` cho một email bất kỳ.
 *  2. **Token thô không nằm trong database.** Đọc được bảng ≠ chiếm được một chỗ.
 *  3. **Link chuyển tiếp không dùng được.** Người đăng nhập phải đúng là người được mời.
 *  4. **Bấm hai lần không tạo hai thứ.** Nhận lời mời là thao tác một-lần.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

/** Thư gửi đi được GHI LẠI thay vì gửi — spec đọc chính URL để lấy token thô. */
const sentMails: Array<{ to: string; url: string }> = [];
const email = {
  sendTenantInvite: (to: string, _tenant: string, url: string) => {
    sentMails.push({ to, url });
    return Promise.resolve();
  },
} as unknown as EmailService;

const config = {
  getOrThrow: (key: string) => {
    if (key === 'APP_WEB_URL') return 'https://web.test';
    throw new Error(`Spec không mong đợi key ${key}`);
  },
} as never;

const invites = new InvitesService(asService, new AuditService(asService), email, config);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let inviteeId: string;
let strangerId: string;
let inviteeEmail: string;

/** Token thô của lời mời vừa gửi — chỉ lấy được từ URL trong thư, đúng như người dùng thật. */
function lastToken(): string {
  const mail = sentMails.at(-1);
  if (!mail) throw new Error('Chưa có thư nào được gửi');
  return mail.url.split('/').pop()!;
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
  tenantId = newId();
  inviteeEmail = `invitee-${inviteeId.toLowerCase()}@xeprime.test`;

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  await prisma.user.create({
    // Chữ HOA có chủ đích: email trong thư mời và email lúc đăng ký phải khớp sau chuẩn hoá.
    data: { id: inviteeId, displayName: 'Nhân viên', email: inviteeEmail.toUpperCase() },
  });
  await prisma.user.create({
    data: { id: strangerId, displayName: 'Người lạ', email: `str-${strangerId}@xeprime.test` },
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
  await prisma.tenantProfile.create({ data: { tenantId, displayName: 'Shop Mời' } });
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
  sentMails.length = 0;
  await prisma.tenantInvite.deleteMany({ where: { tenantId } });
  await prisma.tenantMembership.deleteMany({
    where: { tenantId, userId: { in: [inviteeId, strangerId] } },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantInvite.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, inviteeId, strangerId] } } });
  }
  await prisma.$disconnect();
});

const invite = () =>
  invites.create(tenantId, ownerId, { email: inviteeEmail, roleKey: TENANT_ROLE.SHOP_STAFF });

describe('Thư mời — gửi', () => {
  it('KHÔNG tạo membership nào lúc gửi: người được mời chưa đồng ý', async () => {
    if (!dbAvailable) return;
    await invite();

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: inviteeId },
    });
    expect(membership).toBeNull();
  });

  it('database chỉ giữ SHA-256 của token, không giữ token thô', async () => {
    if (!dbAvailable) return;
    await invite();
    const token = lastToken();

    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(token).toHaveLength(64);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it('gửi lại thì lời mời cũ bị thu hồi — chỉ đúng MỘT link còn sống', async () => {
    if (!dbAvailable) return;
    await invite();
    const firstToken = lastToken();
    await invite();

    const rows = await prisma.tenantInvite.findMany({ where: { tenantId } });
    expect(rows.filter((r) => r.status === INVITE_STATUS.PENDING)).toHaveLength(1);

    await expect(invites.accept(firstToken, inviteeId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_INVALID },
    });
  });

  it('không mời được người đã là thành viên', async () => {
    if (!dbAvailable) return;
    await invite();
    await invites.accept(lastToken(), inviteeId);

    await expect(invite()).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_ALREADY_MEMBER },
    });
  });

  it('không mời được ai làm chủ gian hàng', async () => {
    if (!dbAvailable) return;
    await expect(
      invites.create(tenantId, ownerId, {
        email: inviteeEmail,
        roleKey: TENANT_ROLE.SHOP_OWNER,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });
});

describe('Thư mời — xem trước (không cần đăng nhập)', () => {
  it('nói đủ để quyết định, và KHÔNG lộ nguyên email được mời', async () => {
    if (!dbAvailable) return;
    await invite();

    const preview = await invites.preview(lastToken());
    expect(preview.tenantName).toBe('Shop Mời');
    expect(preview.roleKey).toBe(TENANT_ROLE.SHOP_STAFF);
    expect(preview.status).toBe(INVITE_STATUS.PENDING);
    expect(preview.invitedEmailMasked).not.toBe(inviteeEmail);
    expect(preview.invitedEmailMasked).toContain('@');
  });

  it('token bịa ra thì 404, không phải một trang trống', async () => {
    if (!dbAvailable) return;
    await expect(invites.preview('khong-ton-tai')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_INVALID },
    });
  });
});

describe('Thư mời — trả lời', () => {
  it('đồng ý: thành thành viên ĐÚNG vai được mời, lời mời đóng lại', async () => {
    if (!dbAvailable) return;
    await invite();

    const answer = await invites.accept(lastToken(), inviteeId);
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
    await invite();

    await invites.decline(lastToken(), inviteeId);

    expect(
      await prisma.tenantMembership.findFirst({ where: { tenantId, userId: inviteeId } }),
    ).toBeNull();
    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(row.status).toBe(INVITE_STATUS.DECLINED);
  });

  /** Link mời đi qua hộp thư và bị chuyển tiếp là chuyện thường. */
  it('người KHÁC cầm link thì không nhận được — email phải khớp', async () => {
    if (!dbAvailable) return;
    await invite();

    await expect(invites.accept(lastToken(), strangerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_EMAIL_MISMATCH },
    });
    expect(
      await prisma.tenantMembership.findFirst({ where: { tenantId, userId: strangerId } }),
    ).toBeNull();
  });

  it('người lạ cũng không TỪ CHỐI hộ được', async () => {
    if (!dbAvailable) return;
    await invite();

    await expect(invites.decline(lastToken(), strangerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_EMAIL_MISMATCH },
    });
    const row = await prisma.tenantInvite.findFirstOrThrow({ where: { tenantId } });
    expect(row.status).toBe(INVITE_STATUS.PENDING);
  });

  it('lời mời hết hạn thì không nhận được nữa', async () => {
    if (!dbAvailable) return;
    await invite();
    const token = lastToken();
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

  it('lời mời đã thu hồi thì link trong email hết giá trị ngay', async () => {
    if (!dbAvailable) return;
    const created = await invite();
    const token = lastToken();
    await invites.revoke(tenantId, ownerId, created.id);

    await expect(invites.accept(token, inviteeId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVITE_INVALID },
    });
  });

  /** Bấm đúp, hoặc mở link ở hai tab rồi bấm cả hai. */
  it('hai lần nhận song song: đúng MỘT lần thành công', async () => {
    if (!dbAvailable) return;
    await invite();
    const token = lastToken();

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
    await invite();
    await invites.accept(lastToken(), inviteeId);

    const rows = await prisma.tenantMembership.findMany({ where: { tenantId, userId: inviteeId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(MEMBERSHIP_STATUS.ACTIVE);
    expect(rows[0]!.roleKey).toBe(TENANT_ROLE.SHOP_STAFF);
  });
});

describe('Thư mời — danh sách của gian hàng', () => {
  it('mặc định chỉ trả lời mời ĐANG CHỜ, và không kèm token', async () => {
    if (!dbAvailable) return;
    const created = await invite();
    await invites.revoke(tenantId, ownerId, created.id);
    await invite();

    const page = await invites.list(tenantId, {});
    expect(page.data).toHaveLength(1);
    expect(page.data[0]!.status).toBe(INVITE_STATUS.PENDING);
    expect(JSON.stringify(page.data)).not.toContain(lastToken());

    const all = await invites.list(tenantId, { status: INVITE_STATUS.REVOKED });
    expect(all.data).toHaveLength(1);
  });
});

/**
 * SMTP hỏng — chuyện đã xảy ra thật trên staging ngày 04/09/2026 ngay khi bật email thật.
 *
 * Lời mời đã nằm trong database trước khi chạm tới SMTP, nên để lỗi gửi thư ném lên là biến một
 * việc ĐÃ XONG MỘT NỬA thành HTTP 500: người dùng thấy "Máy chủ gặp sự cố", bấm lại, và mỗi lần
 * bấm lại thu hồi lời mời cũ rồi tạo lời mời mới.
 *
 * Nhưng cũng không được im lặng nuốt lỗi — `emailSent: false` là cách nói thật với người gửi.
 */
describe('Thư mời — SMTP hỏng', () => {
  it('vẫn tạo được lời mời, và nói thẳng rằng thư CHƯA gửi được', async () => {
    if (!dbAvailable) return;

    const failing = {
      sendTenantInvite: () => Promise.reject(new Error('ECONNREFUSED smtp.resend.com:587')),
    } as unknown as EmailService;
    const service = new InvitesService(asService, new AuditService(asService), failing, config);

    const created = await service.create(tenantId, ownerId, {
      email: `smtp-down-${Date.now()}@congty.vn`,
      roleKey: TENANT_ROLE.SHOP_STAFF,
    });

    expect(created.emailSent).toBe(false);
    expect(created.status).toBe(INVITE_STATUS.PENDING);

    // Lời mời PHẢI còn trong database — nếu không thì "thử lại" là cách duy nhất, mà thử lại
    // cũng hỏng y hệt.
    const row = await prisma.tenantInvite.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe(INVITE_STATUS.PENDING);
  });

  it('gửi được thì emailSent là true', async () => {
    if (!dbAvailable) return;
    const created = await invite();
    expect(created.emailSent).toBe(true);
  });
});
