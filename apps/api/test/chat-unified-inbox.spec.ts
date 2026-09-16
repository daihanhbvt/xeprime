import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BILLING_MODE,
  CHAT_INBOX,
  CHAT_SIDE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ChatService } from '../src/modules/chat/chat.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { makeNotificationService } from './helpers/service-factory';

/**
 * HỘP THƯ HỢP NHẤT — `side=unified` (ADR 0038 điều 9).
 *
 * ## Người mà nó phục vụ
 *
 * Chủ xe tuyến hoa hồng không vào `/manage` được, nên hộp thư công việc của họ không có chỗ đứng
 * riêng. Với họ "tin nhắn" là MỘT khái niệm: khách hỏi xe của họ và chủ xe mà họ đang thuê nằm
 * trong cùng một dòng thời gian.
 *
 * ## Ba điều spec này khoá
 *
 *  1. **Không mở thêm phạm vi.** Hợp nhất = đúng hai phạm vi người gọi ĐÃ có. Hội thoại của người
 *     khác không lọt vào, kể cả qua ô tìm kiếm — chỗ mà bản `where.OR` cũ sẽ ghi đè chính mệnh đề
 *     quyền sở hữu.
 *  2. **Không đếm hai lần.** Hai vế rời nhau theo định nghĩa (`chatInboxScope`), nên tổng, phân
 *     trang và số chưa đọc cộng thẳng được. Một hội thoại mà người này vừa là khách vừa là chủ
 *     gian hàng (họ đi thuê xe của CHÍNH shop mình) là ca kiểm tra thật, không phải giả định.
 *  3. **Vai đọc theo từng DÒNG.** Lấy vai từ `?side=` sẽ làm một hội thoại khách hiện tên gian
 *     hàng của chính mình ở ô đối phương và đếm nhầm cột chưa đọc.
 *
 * Chạy trên PostgreSQL THẬT (ADR 0009 — Postgres là source of truth).
 */
const prisma = createPrismaClient();
const fakeConfig = { get: () => undefined } as unknown as ConfigService;
const asService = prisma as unknown as PrismaService;
const chat = new ChatService(asService, fakeConfig, makeNotificationService(asService));

let dbAvailable = false;

/** Chủ xe tuyến hoa hồng: sở hữu `ownTenantId`, đồng thời đi thuê xe của `otherTenantId`. */
let ownerId: string;
/** Nhân viên của chính gian hàng đó — dùng để chứng minh phạm vi không nới cho ai khác. */
let staffId: string;
let outsiderId: string;
let ownTenantId: string;
let otherTenantId: string;
let ownVehicleId: string;
let otherVehicleId: string;

/** Hội thoại khách-của-shop-khác (chủ xe đứng vai KHÁCH). */
let asRenterId: string;
/** Hội thoại khách-lạ-với-shop-của-mình (chủ xe đứng vai CHỦ). */
let asHostId: string;

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
  outsiderId = newId();
  ownTenantId = newId();
  otherTenantId = newId();
  ownVehicleId = newId();
  otherVehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe hoa hồng', email: `own-${ownerId}@xeprime.test` },
      { id: staffId, displayName: 'Nhân viên', email: `stf-${staffId}@xeprime.test` },
      { id: outsiderId, displayName: 'Khách lạ', email: `out-${outsiderId}@xeprime.test` },
    ],
  });

  for (const [id, name, owner] of [
    [ownTenantId, 'Gara của tôi', ownerId],
    [otherTenantId, 'Gara người khác', outsiderId],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `TEST-${id.slice(-8)}`,
        slug: `test-${id.toLowerCase().slice(-8)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: owner,
      },
    });
    // Tuyến GÓI — hộp thư mở công khai. Spec này đo HỘP THƯ HỢP NHẤT, không đo cổng mở kênh
    // (cổng đó có spec riêng ở `chat.spec.ts`); thiếu gói thì mọi lượt mở hội thoại ở đây bị
    // `assertCustomerMayOpenChat` chặn và spec đo nhầm thứ.
    await giveTenantPlan(prisma, id, { billingMode: BILLING_MODE.PACKAGE });
  }

  await prisma.tenantMembership.createMany({
    data: [
      {
        id: newId(),
        tenantId: ownTenantId,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId: ownTenantId,
        userId: staffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId: otherTenantId,
        userId: outsiderId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    ],
  });

  await prisma.vehicle.createMany({
    data: [
      {
        id: ownVehicleId,
        tenantId: ownTenantId,
        code: 'U1',
        name: 'Toyota Vios của tôi',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      },
      {
        id: otherVehicleId,
        tenantId: otherTenantId,
        code: 'U2',
        name: 'Mazda CX5 người khác',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      },
    ],
  });

  // Chủ xe ĐI THUÊ xe của gara khác → họ là KHÁCH trong hội thoại này.
  asRenterId = (await chat.getOrCreateConversation(ownerId, { vehicleId: otherVehicleId })).id;
  // Khách lạ hỏi xe của chính họ → họ là CHỦ trong hội thoại này.
  asHostId = (await chat.getOrCreateConversation(outsiderId, { vehicleId: ownVehicleId })).id;
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [ownTenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, staffId, outsiderId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Danh sách của một hộp thư, trang 1 — bọc lại để mỗi khẳng định đọc được trong một dòng. */
function list(userId: string, side: string, extra: Record<string, unknown> = {}) {
  return chat.listConversations(userId, { side, ...extra } as never);
}

describe('Hộp thư hợp nhất — nội dung', () => {
  maybe('chứa CẢ HAI vai trong một danh sách', async () => {
    const page = await list(ownerId, CHAT_INBOX.UNIFIED);
    const ids = page.data.map((c) => c.id);

    expect(ids).toContain(asRenterId);
    expect(ids).toContain(asHostId);
  });

  /*
   * Hai hộp thư cũ KHÔNG đổi hành vi. Đây là nửa còn lại của mọi lần mở rộng: chứng minh nó không
   * rò sang chỗ khác. Gian hàng tuyến gói vẫn dựa vào đúng hai tập rời nhau này.
   */
  maybe('hai hộp thư một-vai giữ nguyên tập của mình', async () => {
    const customer = await list(ownerId, CHAT_INBOX.CUSTOMER);
    const shop = await list(ownerId, CHAT_INBOX.SHOP);

    expect(customer.data.map((c) => c.id)).toEqual([asRenterId]);
    expect(shop.data.map((c) => c.id)).toEqual([asHostId]);
  });

  /*
   * VAI theo từng DÒNG. Nếu nó đến từ tham số truy vấn thì một trong hai dòng sẽ hiện tên gian
   * hàng CỦA CHÍNH MÌNH ở ô "phía bên kia" — và người đọc không còn cách nào biết ai đang nói.
   */
  maybe('mỗi dòng mang đúng vai và đúng tên phía bên kia', async () => {
    const page = await list(ownerId, CHAT_INBOX.UNIFIED);
    const renter = page.data.find((c) => c.id === asRenterId);
    const host = page.data.find((c) => c.id === asHostId);

    expect(renter?.side).toBe(CHAT_SIDE.CUSTOMER);
    expect(renter?.partyName).toBe('Gara người khác');

    expect(host?.side).toBe(CHAT_SIDE.SHOP);
    expect(host?.partyName).toBe('Khách lạ');
  });

  maybe('tổng KHÔNG đếm hai lần — bằng đúng tổng hai hộp thư một-vai', async () => {
    const [unified, customer, shop] = await Promise.all([
      list(ownerId, CHAT_INBOX.UNIFIED),
      list(ownerId, CHAT_INBOX.CUSTOMER),
      list(ownerId, CHAT_INBOX.SHOP),
    ]);

    expect(unified.meta.total).toBe(customer.meta.total + shop.meta.total);
    expect(new Set(unified.data.map((c) => c.id)).size).toBe(unified.data.length);
  });
});

describe('Hộp thư hợp nhất — KHÔNG nới phạm vi', () => {
  /*
   * Ô tìm kiếm là chỗ dễ vỡ nhất: phạm vi của hộp thư hợp nhất ĐÃ là một `OR`, nên bản trước gán
   * thẳng `where.OR` cho tìm kiếm sẽ ghi đè chính mệnh đề quyền sở hữu. Kết quả không phải một lỗi
   * giao diện — đó là hội thoại của người khác hiện ra trong ô tìm kiếm của mình.
   */
  maybe('tìm kiếm KHÔNG kéo hội thoại của người khác vào', async () => {
    // Hội thoại giữa khách lạ và gara người khác: chủ xe của ta không liên quan gì tới nó.
    const foreign = await chat.getOrCreateConversation(staffId, { vehicleId: otherVehicleId });

    const page = await list(ownerId, CHAT_INBOX.UNIFIED, { q: 'Gara' });

    expect(page.data.map((c) => c.id)).not.toContain(foreign.id);
    // …nhưng vẫn tìm được hội thoại THẬT SỰ của mình theo tên gian hàng kia.
    expect(page.data.map((c) => c.id)).toContain(asRenterId);
  });

  maybe('tìm theo tên KHÁCH ra hội thoại mình là chủ', async () => {
    const page = await list(ownerId, CHAT_INBOX.UNIFIED, { q: 'Khách lạ' });

    expect(page.data.map((c) => c.id)).toContain(asHostId);
  });

  maybe('tìm theo tên XE hoạt động ở cả hai vai', async () => {
    const mine = await list(ownerId, CHAT_INBOX.UNIFIED, { q: 'Vios' });
    const theirs = await list(ownerId, CHAT_INBOX.UNIFIED, { q: 'CX5' });

    expect(mine.data.map((c) => c.id)).toContain(asHostId);
    expect(theirs.data.map((c) => c.id)).toContain(asRenterId);
  });

  /* Người ngoài gõ `side=unified` chỉ nhận về hộp thư của chính họ — không có phạm vi thứ ba. */
  maybe('người khác gọi unified vẫn chỉ thấy hội thoại của chính họ', async () => {
    const page = await list(outsiderId, CHAT_INBOX.UNIFIED);

    expect(page.data.map((c) => c.id)).toContain(asHostId); // họ là KHÁCH ở đây
    expect(page.data.map((c) => c.id)).toContain(asRenterId); // và là CHỦ ở đây
    for (const row of page.data) {
      const conv = await prisma.conversation.findUniqueOrThrow({
        where: { id: row.id },
        select: { customerUserId: true, tenantId: true },
      });
      const mine = conv.customerUserId === outsiderId || conv.tenantId === otherTenantId;
      expect(mine).toBe(true);
    }
  });
});

describe('Hộp thư hợp nhất — chưa đọc', () => {
  /*
   * "Chưa đọc" đọc CỘT khác nhau theo vai. Một `unreadTenantCount > 0` áp lên hội thoại mình là
   * khách sẽ lọc theo số chưa đọc CỦA GIAN HÀNG KIA — tức là hiện những hội thoại mà người khác
   * chưa đọc, không phải mình.
   */
  maybe('lọc chưa đọc dùng đúng cột theo từng vai', async () => {
    // Khách lạ nhắn vào shop của ta ⇒ tăng `unreadTenantCount` của `asHostId`.
    await chat.sendMessage(outsiderId, asHostId, { text: 'Xe còn trống không anh' });
    // Ta nhắn cho gara kia ⇒ tăng `unreadTenantCount` của `asRenterId`, KHÔNG phải phần của ta.
    await chat.sendMessage(ownerId, asRenterId, { text: 'Cho hỏi giá thuê tuần' });

    const page = await list(ownerId, CHAT_INBOX.UNIFIED, { unreadOnly: true });
    const ids = page.data.map((c) => c.id);

    expect(ids).toContain(asHostId);
    expect(ids).not.toContain(asRenterId);
  });

  maybe('số chưa đọc của hợp nhất = tổng hai vai', async () => {
    const [unified, customer, shop] = await Promise.all([
      chat.unreadCount(ownerId, CHAT_INBOX.UNIFIED),
      chat.unreadCount(ownerId, CHAT_SIDE.CUSTOMER),
      chat.unreadCount(ownerId, CHAT_SIDE.SHOP),
    ]);

    expect(unified.count).toBe(customer.count + shop.count);
  });

  /* Đánh dấu đã đọc vẫn đi theo VAI của hội thoại — `resolveAccess` tự suy, không cần tham số. */
  maybe('đánh dấu đã đọc trừ đúng vế, không chạm vế kia', async () => {
    const before = await chat.unreadCount(ownerId, CHAT_INBOX.UNIFIED);
    await chat.markRead(ownerId, asHostId);
    const after = await chat.unreadCount(ownerId, CHAT_INBOX.UNIFIED);

    expect(after.count).toBeLessThan(before.count);
    // Vế khách không bị đụng tới: ta không có tin chưa đọc nào ở đó, và vẫn vậy.
    expect((await chat.unreadCount(ownerId, CHAT_SIDE.CUSTOMER)).count).toBe(0);
  });
});

describe('Hộp thư hợp nhất — deep link', () => {
  /*
   * `?c=` mở ở hộp thư hợp nhất phải mở được hội thoại của BẤT KỲ vai nào — đó là cả điểm của nó.
   * Hai hộp thư một-vai vẫn ép vai như cũ, nên link của hộp thư khách dán vào `/manage/chat` vẫn
   * không mở được.
   */
  maybe('unified mở được hội thoại của cả hai vai', async () => {
    const renter = await chat.getConversation(ownerId, asRenterId, CHAT_INBOX.UNIFIED);
    const host = await chat.getConversation(ownerId, asHostId, CHAT_INBOX.UNIFIED);

    expect(renter.side).toBe(CHAT_SIDE.CUSTOMER);
    expect(host.side).toBe(CHAT_SIDE.SHOP);
  });

  maybe('hộp thư một-vai vẫn từ chối link của vai kia', async () => {
    await expect(chat.getConversation(ownerId, asHostId, CHAT_SIDE.CUSTOMER)).rejects.toThrow();
    await expect(chat.getConversation(ownerId, asRenterId, CHAT_SIDE.SHOP)).rejects.toThrow();
  });

  maybe('unified KHÔNG mở được hội thoại của người khác', async () => {
    const foreign = await chat.getOrCreateConversation(staffId, { vehicleId: otherVehicleId });

    await expect(
      chat.getConversation(outsiderId, foreign.id, CHAT_INBOX.UNIFIED),
    ).resolves.toBeTruthy(); // outsider LÀ chủ gara kia — đúng là của họ

    // Còn một người không thuộc vai nào thì vẫn bị chặn.
    const stranger = newId();
    await prisma.user.create({
      data: { id: stranger, displayName: 'Vô can', email: `x-${stranger}@xeprime.test` },
    });
    await expect(
      chat.getConversation(stranger, foreign.id, CHAT_INBOX.UNIFIED),
    ).rejects.toThrow();
    await prisma.user.delete({ where: { id: stranger } });
  });
});

describe('Hộp thư hợp nhất — người chưa có gian hàng', () => {
  /*
   * Khách thuê thuần gọi `unified` phải nhận về hộp thư khách của mình, KHÔNG phải danh sách rỗng.
   * Bản `side=shop` trả `null` khi không thuộc gian hàng nào — mang nguyên luật đó sang hợp nhất
   * sẽ giấu mất hộp thư của chính họ vì một lý do không liên quan.
   */
  maybe('vẫn nhận hộp thư khách của mình, không rỗng', async () => {
    const renterOnly = newId();
    await prisma.user.create({
      data: { id: renterOnly, displayName: 'Khách thuần', email: `r-${renterOnly}@xeprime.test` },
    });
    const conv = await chat.getOrCreateConversation(renterOnly, { vehicleId: ownVehicleId });

    const page = await list(renterOnly, CHAT_INBOX.UNIFIED);

    expect(page.data.map((c) => c.id)).toEqual([conv.id]);
    expect(page.data[0]?.side).toBe(CHAT_SIDE.CUSTOMER);

    await prisma.conversation.delete({ where: { id: conv.id } });
    await prisma.user.delete({ where: { id: renterOnly } });
  });
});
