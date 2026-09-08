import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  CHAT_SIDE,
  MEMBERSHIP_STATUS,
  OUTBOX_STATUS,
  SENDER_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ChatService } from '../src/modules/chat/chat.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Chat chạy trên PostgreSQL THẬT (source of truth, ADR 0009). Kiểm chứng: getOrCreate idempotent
 * KỂ CẢ khi hai request chạy song song, sendMessage ghi Message + Outbox trong 1 tx + cập nhật
 * unread đúng phía, idempotency theo clientMessageId, cursor keyset, markRead, tách hai hộp thư,
 * và guard chặn người ngoài. Firestore/worker verify live riêng.
 */
const prisma = createPrismaClient();
// ChatService chỉ dùng ConfigService cho R2_PUBLIC_BASE_URL (đính kèm) — test tin text nên trả undefined.
const fakeConfig = { get: () => undefined } as unknown as ConfigService;
const chat = new ChatService(prisma as unknown as PrismaService, fakeConfig);

let dbAvailable = false;
let customerId: string;
let ownerId: string;
let staffId: string;
let strangerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;
let raceVehicleId: string;
let otherVehicleId: string;
let conversationId: string;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  customerId = newId();
  ownerId = newId();
  staffId = newId();
  strangerId = newId();
  tenantId = newId();
  otherTenantId = newId();
  vehicleId = newId();
  raceVehicleId = newId();
  otherVehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: staffId, displayName: 'Nhân viên', email: `stf-${staffId}@xeprime.test` },
      { id: strangerId, displayName: 'Người lạ', email: `str-${strangerId}@xeprime.test` },
    ],
  });

  for (const [id, name] of [
    [tenantId, 'Shop chat'],
    [otherTenantId, 'Shop khác'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `TEST-${id.slice(-8)}`,
        slug: `test-${id.toLowerCase().slice(-8)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: id === tenantId ? ownerId : strangerId,
      },
    });
  }

  await prisma.tenantMembership.createMany({
    data: [
      {
        id: newId(),
        tenantId,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId,
        userId: staffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId: otherTenantId,
        userId: strangerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    ],
  });

  await prisma.vehicle.createMany({
    data: [
      {
        id: vehicleId,
        tenantId,
        code: 'V1',
        name: 'Xe chat',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      },
      {
        id: raceVehicleId,
        tenantId,
        code: 'V2',
        name: 'Xe đua race',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      },
      {
        id: otherVehicleId,
        tenantId: otherTenantId,
        code: 'V3',
        name: 'Xe shop khác',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [customerId, ownerId, staffId, strangerId] } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('ChatService — hội thoại', () => {
  maybe('getOrCreate idempotent theo (khách, GIAN HÀNG)', async () => {
    const c1 = await chat.getOrCreateConversation(customerId, { vehicleId });
    const c2 = await chat.getOrCreateConversation(customerId, { vehicleId });
    expect(c1.id).toBe(c2.id);
    expect(c1.side).toBe(CHAT_SIDE.CUSTOMER);
    expect(c1.partyName).toBe('Shop chat'); // khách thấy tên shop
    conversationId = c1.id;
  });

  /**
   * Điều người dùng thực sự cần: hỏi chiếc thứ hai của CÙNG một salon không được đẻ ra hộp thư
   * thứ hai. Đây là lý do danh tính bỏ xe ra khỏi khoá.
   */
  maybe('hỏi XE KHÁC của cùng shop vẫn rơi vào ĐÚNG một hội thoại', async () => {
    const first = await chat.getOrCreateConversation(customerId, { vehicleId });
    const second = await chat.getOrCreateConversation(customerId, { vehicleId: raceVehicleId });

    expect(second.id).toBe(first.id);
    expect(
      await prisma.conversation.count({ where: { customerUserId: customerId, tenantId } }),
    ).toBe(1);
  });

  /**
   * Bất biến thật nằm ở unique DB, nên test phải chạy SONG SONG — gọi tuần tự hai lần chỉ chứng
   * minh cái `findFirst` mở đầu hoạt động, đúng cái không chống được race.
   */
  maybe('6 request song song "Nhắn shop" chỉ tạo MỘT hội thoại', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        chat.getOrCreateConversation(customerId, { vehicleId: raceVehicleId }),
      ),
    );

    const ids = new Set(results.map((c) => c.id));
    expect(ids.size).toBe(1);

    const stored = await prisma.conversation.count({
      where: { customerUserId: customerId, tenantId },
    });
    expect(stored).toBe(1);

    // Đúng một bản ghi participant — không phải sáu bản chồng lên nhau.
    const participants = await prisma.conversationParticipant.count({
      where: { conversationId: results[0]!.id },
    });
    expect(participants).toBe(1);
  });

  maybe('DB từ chối hội thoại trùng cặp (khách, gian hàng) ở tầng constraint', async () => {
    await expect(
      prisma.conversation.create({
        data: { id: newId(), tenantId, customerUserId: customerId, vehicleId },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  maybe('deep link: đọc được hội thoại theo id, đúng side', async () => {
    const asCustomer = await chat.getConversation(customerId, conversationId, CHAT_SIDE.CUSTOMER);
    expect(asCustomer.id).toBe(conversationId);
    expect(asCustomer.side).toBe(CHAT_SIDE.CUSTOMER);

    const asShop = await chat.getConversation(ownerId, conversationId, CHAT_SIDE.SHOP);
    expect(asShop.partyName).toBe('Khách');

    // Dán id của hộp thư khách vào khu quản lý: cùng người, sai bề mặt → chặn.
    await expect(
      chat.getConversation(customerId, conversationId, CHAT_SIDE.SHOP),
    ).rejects.toThrow(/quyền/);
    await expect(chat.getConversation(strangerId, conversationId, CHAT_SIDE.SHOP)).rejects.toThrow(
      /quyền/,
    );
  });
});

describe('ChatService — tin nhắn', () => {
  maybe('khách gửi tin → Message + Outbox(pending) trong 1 tx, unread về phía shop', async () => {
    const msg = await chat.sendMessage(customerId, conversationId, { text: 'Chào shop' });
    expect(msg.senderType).toBe(SENDER_TYPE.CUSTOMER);
    expect(msg.senderName).toBe('Khách');

    const outbox = await prisma.messageOutbox.findUnique({ where: { messageId: msg.id } });
    expect(outbox?.status).toBe(OUTBOX_STATUS.PENDING);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.lastMessageText).toBe('Chào shop');
    expect(conv.unreadTenantCount).toBe(1);
    expect(conv.unreadCustomerCount).toBe(0);
  });

  maybe('shop trả lời → senderType shop_member, unread về phía khách', async () => {
    const msg = await chat.sendMessage(ownerId, conversationId, { text: 'Chào bạn' });
    expect(msg.senderType).toBe(SENDER_TYPE.SHOP_MEMBER);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.unreadCustomerCount).toBe(1);
    expect(conv.unreadTenantCount).toBe(0);
  });

  maybe('nhân viên khác cùng gian hàng cũng gửi ở phía shop, kèm tên thật', async () => {
    const msg = await chat.sendMessage(staffId, conversationId, { text: 'Em hỗ trợ ạ' });
    expect(msg.senderType).toBe(SENDER_TYPE.SHOP_MEMBER);
    expect(msg.senderName).toBe('Nhân viên');
    expect(msg.senderUserId).toBe(staffId);
  });

  maybe('gửi lại cùng clientMessageId trả về ĐÚNG tin cũ, không tạo tin thứ hai', async () => {
    const clientMessageId = newId();
    const first = await chat.sendMessage(customerId, conversationId, {
      text: 'Gửi một lần thôi',
      clientMessageId,
    });
    const retry = await chat.sendMessage(customerId, conversationId, {
      text: 'Gửi một lần thôi',
      clientMessageId,
    });

    expect(retry.id).toBe(first.id);
    expect(retry.clientMessageId).toBe(clientMessageId);

    const stored = await prisma.message.count({ where: { conversationId, clientMessageId } });
    expect(stored).toBe(1);
  });

  maybe('5 lần gửi SONG SONG cùng clientMessageId vẫn chỉ lưu một tin', async () => {
    const clientMessageId = newId();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        chat.sendMessage(customerId, conversationId, { text: 'Bấm nhanh', clientMessageId }),
      ),
    );

    expect(new Set(results.map((m) => m.id)).size).toBe(1);
    expect(await prisma.message.count({ where: { conversationId, clientMessageId } })).toBe(1);
  });

  /**
   * Thay cho việc tách hội thoại theo xe: ngữ cảnh sống ở TỪNG TIN NHẮN. Hai xe khác nhau nói
   * trong cùng một thread mà vẫn phân biệt được câu nào hỏi chiếc nào.
   */
  maybe('tin nhắn mang thẻ ngữ cảnh xe, hai xe cùng một thread', async () => {
    const first = await chat.sendMessage(customerId, conversationId, {
      text: 'Xe này còn không shop?',
      vehicleId,
    });
    expect(first.vehicle?.id).toBe(vehicleId);
    expect(first.vehicle?.name).toBe('Xe chat');

    const second = await chat.sendMessage(customerId, conversationId, {
      text: 'Còn chiếc kia nữa',
      vehicleId: raceVehicleId,
    });
    expect(second.vehicle?.id).toBe(raceVehicleId);

    // Denorm hội thoại theo xe được nhắc GẦN NHẤT — dòng phụ ở danh sách đọc từ đây.
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.vehicleId).toBe(raceVehicleId);
  });

  maybe('tin không gắn xe thì KHÔNG xoá mất chủ đề đang bàn', async () => {
    const before = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const plain = await chat.sendMessage(customerId, conversationId, { text: 'ok bạn' });

    expect(plain.vehicle).toBeNull();
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(after.vehicleId).toBe(before.vehicleId);
  });

  /** Thẻ ngữ cảnh là một liên kết hiện trong hộp thư người khác — không nhận id xe tuỳ ý. */
  maybe('xe của gian hàng KHÁC bị bỏ khỏi ngữ cảnh, nhưng tin vẫn gửi được', async () => {
    const msg = await chat.sendMessage(customerId, conversationId, {
      text: 'thử gắn xe lạ',
      vehicleId: otherVehicleId,
    });
    expect(msg.vehicle).toBeNull();
    expect(msg.text).toBe('thử gắn xe lạ');
  });

  maybe('người ngoài không gửi/không đọc được', async () => {
    await expect(chat.sendMessage(strangerId, conversationId, { text: 'hack' })).rejects.toThrow(
      /quyền/,
    );
    await expect(chat.listMessages(strangerId, conversationId, {})).rejects.toThrow(/quyền/);
  });

  maybe('markRead reset unread phía người đọc', async () => {
    await chat.markRead(customerId, conversationId);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.unreadCustomerCount).toBe(0);
  });

  /**
   * Cursor keyset: nhiều tin CÙNG `sentAt` là trường hợp một cột `sentAt` làm sai — nên test
   * dựng đúng tình huống đó chứ không dựa vào việc mỗi tin rơi vào một mili-giây khác nhau.
   */
  maybe('phân trang keyset: không trùng, không sót kể cả khi trùng mốc thời gian', async () => {
    const sameInstant = new Date();
    await prisma.message.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        id: newId(),
        conversationId,
        senderUserId: customerId,
        senderType: SENDER_TYPE.CUSTOMER,
        text: `đồng hồ ${i}`,
        sentAt: sameInstant,
      })),
    });

    const total = await prisma.message.count({ where: { conversationId } });
    const seen: string[] = [];
    let cursor: { before?: string; beforeId?: string } = {};

    for (let page = 0; page < 20; page++) {
      const res = await chat.listMessages(customerId, conversationId, { ...cursor, limit: 3 });
      seen.push(...res.data.map((m) => m.id));
      if (!res.nextBefore) break;
      cursor = { before: res.nextBefore, beforeId: res.nextBeforeId ?? undefined };
    }

    expect(new Set(seen).size).toBe(seen.length); // không trùng
    expect(seen.length).toBe(total); // không sót
  });
});

describe('ChatService — tách hai hộp thư', () => {
  maybe('cùng một tài khoản vừa là khách vừa là chủ shop: hai inbox không trộn', async () => {
    // Chủ shop `tenantId` đi thuê xe của gian hàng KHÁC → hội thoại đó là việc riêng của họ.
    const personal = await chat.getOrCreateConversation(ownerId, { vehicleId: otherVehicleId });

    const ownerCustomerInbox = await chat.listConversations(ownerId, { side: CHAT_SIDE.CUSTOMER });
    const ownerShopInbox = await chat.listConversations(ownerId, { side: CHAT_SIDE.SHOP });

    const customerIds = ownerCustomerInbox.data.map((c) => c.id);
    const shopIds = ownerShopInbox.data.map((c) => c.id);

    expect(customerIds).toContain(personal.id);
    expect(shopIds).not.toContain(personal.id);
    expect(shopIds).toContain(conversationId);
    expect(customerIds).not.toContain(conversationId);

    expect(ownerCustomerInbox.data.every((c) => c.side === CHAT_SIDE.CUSTOMER)).toBe(true);
    expect(ownerShopInbox.data.every((c) => c.side === CHAT_SIDE.SHOP)).toBe(true);
  });

  maybe('inbox gian hàng không lộ hội thoại của tenant khác', async () => {
    const inbox = await chat.listConversations(strangerId, { side: CHAT_SIDE.SHOP });
    expect(inbox.data.map((c) => c.id)).not.toContain(conversationId);
  });

  maybe('tìm kiếm lọc theo tên xe / tên phía bên kia', async () => {
    const hit = await chat.listConversations(customerId, {
      side: CHAT_SIDE.CUSTOMER,
      q: 'xe đua',
    });
    expect(hit.data.map((c) => c.vehicleName)).toContain('Xe đua race');

    const miss = await chat.listConversations(customerId, {
      side: CHAT_SIDE.CUSTOMER,
      q: 'không-có-xe-nào-tên-này',
    });
    expect(miss.data).toHaveLength(0);
    expect(miss.meta.total).toBe(0);
  });

  maybe('lọc chưa đọc chỉ trả hội thoại còn tin chưa đọc', async () => {
    await chat.sendMessage(customerId, conversationId, { text: 'còn chưa đọc nhé' });
    const unread = await chat.listConversations(ownerId, {
      side: CHAT_SIDE.SHOP,
      unreadOnly: true,
    });
    expect(unread.data.every((c) => c.unread > 0)).toBe(true);
    expect(unread.data.map((c) => c.id)).toContain(conversationId);
  });

  maybe('gửi tin rỗng (không text, không đính kèm) bị chặn', async () => {
    await expect(chat.sendMessage(customerId, conversationId, {})).rejects.toThrow(/nội dung/);
  });

  /**
   * Chủ gian hàng đang ở khu khách vẫn phải thấy có tin: `total` gộp hai vai, nhưng hai con số
   * vẫn đi RIÊNG để giao diện dẫn người dùng tới đúng hộp thư.
   */
  maybe('unread-summary gộp hai vai mà vẫn tách được từng vai', async () => {
    const asCustomer = await chat.unreadCount(ownerId, CHAT_SIDE.CUSTOMER);
    const asShop = await chat.unreadCount(ownerId, CHAT_SIDE.SHOP);

    const summary = await chat.unreadSummary(ownerId);
    expect(summary.customer).toBe(asCustomer.count);
    expect(summary.shop).toBe(asShop.count);
    expect(summary.total).toBe(asCustomer.count + asShop.count);

    // Người chưa thuộc gian hàng nào: vai shop là 0, không phải lỗi, và total = vai khách.
    const customerOnly = await chat.unreadSummary(customerId);
    expect(customerOnly.shop).toBe(0);
    expect(customerOnly.total).toBe(customerOnly.customer);
  });

  maybe('unread-count tính theo BỀ MẶT, không cộng gộp hai vai', async () => {
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const shop = await chat.unreadCount(ownerId, CHAT_SIDE.SHOP);
    expect(shop.count).toBe(conv.unreadTenantCount);

    // Người chưa thuộc gian hàng nào: đếm phía shop là 0, không phải lỗi.
    const noTenant = await chat.unreadCount(customerId, CHAT_SIDE.SHOP);
    expect(noTenant.count).toBe(0);
  });
});
