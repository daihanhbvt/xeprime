import { computeUserBadges, createPrismaClient, newId } from '@xeprime/prisma';
import {
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InvitesService } from '../src/modules/members/invites.service';
import { MembersService } from '../src/modules/members/members.service';
import type { EmailService } from '../src/modules/email/email.service';
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

const audit = new AuditService(asService);
const invites = new InvitesService(asService, audit, email, config);
const members = new MembersService(asService, audit);

let dbAvailable = false;
let ownerId: string;
let staffId: string;
let customerId: string;
let tenantId: string;
let staffEmail: string;

const lastToken = (): string => sentMails.at(-1)!.url.split('/').pop()!;

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
  staffEmail = `staff-${staffId.toLowerCase()}@xeprime.test`;

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: staffId, displayName: 'Nhân viên', email: staffEmail },
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
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
  await prisma.tenantProfile.create({ data: { tenantId, displayName: 'Shop huy hiệu' } });
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

    await invites.create(tenantId, ownerId, {
      email: staffEmail,
      roleKey: TENANT_ROLE.SHOP_STAFF,
    });
    await invites.accept(lastToken(), staffId);

    expect(await signalOf(staffId)).not.toBeNull();
    const badges = await computeUserBadges(prisma, staffId);
    expect(badges.chatShop).toBe(5);
  });

  maybe('bị gỡ khỏi gian hàng: có tín hiệu, và chatShop về 0', async () => {
    await prisma.userBadgeSignal.deleteMany({ where: { userId: staffId } });

    await members.remove(tenantId, ownerId, staffId);

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
    await invites.create(tenantId, ownerId, {
      email: staffEmail,
      roleKey: TENANT_ROLE.SHOP_STAFF,
    });
    const token = lastToken();
    await invites.accept(token, staffId);

    const before = await signalOf(staffId);
    await expect(invites.accept(token, staffId)).rejects.toThrow();
    const after = await signalOf(staffId);

    expect(after?.revision).toBe(before?.revision);
  });

  maybe('tạo lại membership qua lời mời thứ hai cũng đánh dấu (kích hoạt lại)', async () => {
    await members.remove(tenantId, ownerId, staffId);
    await prisma.userBadgeSignal.deleteMany({ where: { userId: staffId } });

    await invites.create(tenantId, ownerId, {
      email: staffEmail,
      roleKey: TENANT_ROLE.SHOP_STAFF,
    });
    await invites.accept(lastToken(), staffId);

    expect(await signalOf(staffId)).not.toBeNull();
    expect((await computeUserBadges(prisma, staffId)).chatShop).toBe(5);
  });
});
