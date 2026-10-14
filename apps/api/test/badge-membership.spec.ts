import { computeUserBadges, createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InvitesService } from '../src/modules/members/invites.service';
import { RequestRealmService } from '../src/modules/auth/request-realm.service';
import { MembersService } from '../src/modules/members/members.service';
import { normalizePhone } from '../src/common/phone';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Huy hiệu và THAY ĐỔI THÀNH VIÊN — chạy trên PostgreSQL THẬT.
 *
 * Vì sao cần spec riêng: chat và thông báo đổi con số một cách hiển nhiên, nên chúng được nhớ
 * tới. Membership thì đổi con số một cách GIÁN TIẾP — không có tin nhắn nào mới, không có thông
 * báo nào mới, chỉ là phạm vi hộp thư công việc của một người vừa rộng ra hoặc hẹp lại. Đó đúng
 * là loại nguồn dễ bị bỏ quên, và hậu quả của việc quên là một con số ĐỨNG IM vĩnh viễn:
 *
 *  - vào gian hàng mà không đánh dấu ⇒ badge nằm ở 0 cho tới sự kiện chat kế tiếp;
 *  - bị gỡ mà không đánh dấu ⇒ badge vẫn báo tin của một hộp thư họ không còn mở được, và bản
 *    chiếu Firestore giữ nguyên con số đó không giới hạn thời gian.
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

const audit = new AuditService(asService);
const invites = new InvitesService(asService, audit, realms);
const members = new MembersService(asService, audit);

let dbAvailable = false;
let ownerId: string;
let staffId: string;
let customerId: string;
let tenantId: string;
/** SĐT ĐÃ XÁC MINH của nhân viên — lời mời đi bằng SĐT từ ADR 0060. Riêng cho lần chạy này. */
const STAFF_PHONE = `0947${String(Date.now() % 1_000_000).padStart(6, '0')}`;

/** Mời nhân viên bằng SĐT rồi trả token thô — lấy từ link trả về cho người mời, như thật. */
async function inviteStaff(): Promise<string> {
  const created = await invites.create(
    tenantId,
    ownerId,
    { phone: STAFF_PHONE, roleKey: TENANT_ROLE.SHOP_STAFF },
    null,
  );
  return created.inviteUrl.split('/').pop()!;
}

const signalOf = (userId: string) =>
  prisma.userBadgeSignal.findUnique({ where: { userId }, select: { revision: true } });

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

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
  staffId = newId();
  customerId = newId();
  tenantId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ shop',
        email: `own-${ownerId}@xeprime.test`,
      },
      {
        id: staffId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: 'Nhân viên',
        phone: normalizePhone(STAFF_PHONE),
        phoneVerifiedAt: new Date(),
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customerId,
        displayName: 'Khách',
        email: `cus-${customerId}@xeprime.test`,
      },
    ],
  });

  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop huy hiệu',
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

  const vehicleId = newId();
  await prisma.vehicle.create({
    data: { id: vehicleId, tenantId, code: 'V1', name: 'Xe', vehicleType: VEHICLE_TYPE.CAR },
  });
  // Hộp thư gian hàng ĐANG có việc dở từ trước — đúng tình huống mà người mới vào phải thấy ngay.
  await prisma.conversation.create({
    data: { id: newId(), tenantId, customerUserId: customerId, vehicleId, unreadTenantCount: 5 },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, staffId, customerId] } } });
  }
  await prisma.$disconnect();
});

describe('Huy hiệu — thay đổi thành viên gian hàng', () => {
  maybe('nhận lời mời: có tín hiệu, và chatShop nhận ngay số chưa đọc sẵn có', async () => {
    await prisma.userBadgeSignal.deleteMany({ where: { userId: staffId } });

    await invites.accept(await inviteStaff(), staffId);

    expect(await signalOf(staffId)).not.toBeNull();
    const badges = await computeUserBadges(prisma, staffId);
    expect(badges.chatShop).toBe(5);
  });

  maybe('bị gỡ khỏi gian hàng: có tín hiệu, và chatShop về 0', async () => {
    await prisma.userBadgeSignal.deleteMany({ where: { userId: staffId } });

    await members.remove(tenantId, ownerId, staffId, null);

    expect(await signalOf(staffId)).not.toBeNull();
    const badges = await computeUserBadges(prisma, staffId);
    expect(badges.chatShop).toBe(0);
  });

  /**
   * Tín hiệu phải nằm TRONG transaction của chính thay đổi membership.
   *
   * Kiểm gián tiếp nhưng chặt: một lần `accept` THẤT BẠI (lời mời đã dùng rồi) không được để lại
   * dấu vết nào. Nếu ai đó dời `markBadgesDirty` ra ngoài — hoặc lên trước câu `updateMany` có
   * điều kiện — thì số hiệu sẽ nhích lên dù không có thay đổi nào xảy ra, và test này đỏ.
   */
  maybe('accept thất bại thì KHÔNG để lại tín hiệu nào', async () => {
    const token = await inviteStaff();
    await invites.accept(token, staffId);

    const before = await signalOf(staffId);
    await expect(invites.accept(token, staffId)).rejects.toThrow();
    const after = await signalOf(staffId);

    expect(after?.revision).toBe(before?.revision);
  });

  maybe('tạo lại membership qua lời mời thứ hai cũng đánh dấu (kích hoạt lại)', async () => {
    await members.remove(tenantId, ownerId, staffId, null);
    await prisma.userBadgeSignal.deleteMany({ where: { userId: staffId } });

    await invites.accept(await inviteStaff(), staffId);

    expect(await signalOf(staffId)).not.toBeNull();
    expect((await computeUserBadges(prisma, staffId)).chatShop).toBe(5);
  });
});
