import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PLATFORM_ROLE,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { PlatformAccountLookupService } from '../src/modules/platform-admin/platform-account-lookup.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tra cứu XUYÊN REALM cho hỗ trợ — ADR 0053 điều 9, trên PostgreSQL thật.
 *
 * Một số điện thoại có thể là ba tài khoản (khách · đối tác · quản trị). Màn tra cứu trả MỌI tài
 * khoản trùng định danh, mỗi dòng ghi rõ realm, liên hệ đã che; thứ tự realm cố định để màn hình
 * luôn đọc cùng một hàng.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformAccountLookupService(asService);

const RUN = newId().slice(-8).toLowerCase();
/** Dạng khách gõ (`09…`) — KHÁC dạng lưu (`84…`): tra cứu phải khớp cả hai. */
const LOCAL_PHONE = `093${String(Date.now()).slice(-7)}`;
const STORED_PHONE = `84${LOCAL_PHONE.slice(1)}`;
const EMAIL = `lookup-${RUN}@xeprime.test`;

let dbAvailable = false;
const ids = { customer: newId(), partner: newId(), platform: newId(), deleted: newId() };
let tenantId: string;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  // Tạo theo thứ tự NGƯỢC realm để chứng minh kết quả không dựa vào thứ tự tạo.
  await prisma.user.createMany({
    data: [
      {
        id: ids.platform,
        realm: ACCOUNT_REALM.PLATFORM,
        displayName: 'Người A (quản trị)',
        phone: STORED_PHONE,
        email: EMAIL,
      },
      {
        id: ids.partner,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: 'Người A (chủ xe)',
        phone: STORED_PHONE,
        email: EMAIL,
      },
      {
        id: ids.customer,
        realm: ACCOUNT_REALM.CUSTOMER,
        displayName: 'Người A (khách)',
        phone: STORED_PHONE,
        email: EMAIL,
      },
    ],
  });
  tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `LK-${tenantId.slice(-8)}`,
      slug: `lk-${tenantId.toLowerCase().slice(-10)}`,
      name: `Gara Tra Cứu ${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ids.partner,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ids.partner,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.platformMembership.create({
    data: {
      id: newId(),
      userId: ids.platform,
      roleKey: PLATFORM_ROLE.SUPPORT,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.platformMembership.deleteMany({ where: { userId: ids.platform } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('GET /platform/accounts/lookup — tra cứu xuyên realm', () => {
  maybe(
    'một SĐT ⇒ ba tài khoản, thứ tự khách → đối tác → quản trị, kèm vai của từng tài khoản',
    async () => {
      const rows = await service.lookup({ phone: LOCAL_PHONE });

      expect(rows.map((r) => r.id)).toEqual([ids.customer, ids.partner, ids.platform]);
      expect(rows.map((r) => r.realm)).toEqual([
        ACCOUNT_REALM.CUSTOMER,
        ACCOUNT_REALM.PARTNER,
        ACCOUNT_REALM.PLATFORM,
      ]);
      expect(rows[1]).toMatchObject({
        tenantName: `Gara Tra Cứu ${RUN}`,
        tenantRoleKey: TENANT_ROLE.SHOP_OWNER,
        platformRoleKey: null,
      });
      expect(rows[2]).toMatchObject({ tenantName: null, platformRoleKey: PLATFORM_ROLE.SUPPORT });
    },
  );

  maybe('liên hệ LUÔN đã che — màn hỗ trợ không bao giờ thấy SĐT/email đầy đủ ở đây', async () => {
    const rows = await service.lookup({ phone: STORED_PHONE });
    const json = JSON.stringify(rows);
    expect(json).not.toContain(STORED_PHONE);
    expect(json).not.toContain(LOCAL_PHONE);
    expect(json).not.toContain(EMAIL);
    expect(rows.every((r) => r.phoneMasked && r.emailMasked)).toBe(true);
  });

  maybe('tra theo email (không phân biệt hoa thường) ra cùng ba tài khoản', async () => {
    const rows = await service.lookup({ email: EMAIL.toUpperCase() });
    expect(rows).toHaveLength(3);
  });

  maybe('tài khoản đã xoá mềm không hiện', async () => {
    await prisma.user.create({
      data: {
        id: ids.deleted,
        realm: ACCOUNT_REALM.CUSTOMER,
        displayName: 'Đã xoá',
        email: `deleted-${RUN}@xeprime.test`,
        deletedAt: new Date(),
      },
    });
    expect(await service.lookup({ email: `deleted-${RUN}@xeprime.test` })).toEqual([]);
  });

  it('đúng MỘT định danh: thiếu cả hai hoặc gửi cả hai ⇒ VALIDATION_FAILED', async () => {
    await expect(service.lookup({})).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
    await expect(service.lookup({ phone: LOCAL_PHONE, email: EMAIL })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });
});
