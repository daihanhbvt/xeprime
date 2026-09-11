import type { ConfigService } from '@nestjs/config';
import { computeUserBadges, createPrismaClient, newId } from '@xeprime/prisma';
import {
  CHAT_NOTIFICATION_COPY,
  CHAT_SIDE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OUTBOX_STATUS,
  SENDER_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ChatService } from '../src/modules/chat/chat.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeNotificationService } from './helpers/service-factory';

/**
 * Chat chạy trên PostgreSQL THẬT (source of truth, ADR 0009). Kiểm chứng: getOrCreate idempotent
 * KỂ CẢ khi hai request chạy song song, sendMessage ghi Message + Outbox trong 1 tx + cập nhật
 * unread đúng phía, idempotency theo clientMessageId, cursor keyset, markRead, tách hai hộp thư,
 * và guard chặn người ngoài. Firestore/worker verify live riêng.
 */
const prisma = createPrismaClient();
// ChatService chỉ dùng ConfigService cho R2_PUBLIC_BASE_URL (đính kèm) — test tin text nên trả undefined.
const fakeConfig = { get: () => undefined } as unknown as ConfigService;
const asService = prisma as unknown as PrismaService;
// Thông báo dùng bản THẬT (nó ghi vào `notifications`, và chính hàng đó là thứ spec kiểm);
// push tắt — hàng đợi đẩy có spec riêng ở `push-notifications.spec.ts`.
const notifications = makeNotificationService(asService);
const chat = new ChatService(asService, fakeConfig, notifications);

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

/**
 * Thông báo tin nhắn mới (10/09/2026) — phần in-app; hàng đợi ĐẨY có spec riêng
 * (`push-notifications.spec.ts`) và việc gửi FCM nằm ở worker.
 *
 * Điều được khoá: người gửi không tự nhận thông báo, phía đối diện thì có, một lần retry của
 * client không sinh tin thứ hai, và nội dung riêng tư không rò ra khỏi hội thoại.
 */
describe('ChatService — thông báo cho phía đối diện', () => {
  const chatNotifications = (userId: string) =>
    prisma.notification.findMany({
      where: { userId, type: NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED, targetId: conversationId },
      orderBy: { createdAt: 'asc' },
    });

  maybe('khách nhắn → mọi thành viên gian hàng nhận, người gửi thì không', async () => {
    const ownerBefore = (await chatNotifications(ownerId)).length;
    const staffBefore = (await chatNotifications(staffId)).length;
    // Khách đã nhận thông báo từ các tin shop gửi ở những case trước — đo ĐỘ LỆCH, không đo tổng.
    const customerBefore = (await chatNotifications(customerId)).length;

    await chat.sendMessage(customerId, conversationId, { text: 'Xe còn trống không shop?' });

    expect((await chatNotifications(ownerId)).length).toBe(ownerBefore + 1);
    expect((await chatNotifications(staffId)).length).toBe(staffBefore + 1);
    // Người gửi là khách — họ không được nhận tin về chính câu mình vừa gõ.
    expect((await chatNotifications(customerId)).length).toBe(customerBefore);
  });

  maybe('shop trả lời → khách nhận, nhân viên vừa gõ thì không', async () => {
    const staffBefore = (await chatNotifications(staffId)).length;
    const customerBefore = (await chatNotifications(customerId)).length;

    await chat.sendMessage(staffId, conversationId, { text: 'Còn bạn nhé' });

    expect((await chatNotifications(customerId)).length).toBe(customerBefore + 1);
    expect((await chatNotifications(staffId)).length).toBe(staffBefore);
  });

  maybe('nội dung tin KHÔNG lọt vào thông báo, và đích là đúng hội thoại', async () => {
    const secret = `Số tài khoản của tôi là ${newId()}`;
    await chat.sendMessage(customerId, conversationId, { text: secret });

    const latest = (await chatNotifications(ownerId)).at(-1);
    expect(latest?.title).toBe(CHAT_NOTIFICATION_COPY.TITLE);
    expect(latest?.body).toBe(CHAT_NOTIFICATION_COPY.BODY);
    expect(latest?.body).not.toContain(secret);
    expect(latest?.targetType).toBe(NOTIFICATION_TARGET_TYPE.CONVERSATION);
    expect(latest?.targetId).toBe(conversationId);
    expect((latest?.dataJson as { url: string }).url).toBe(`/chat/${conversationId}`);
  });

  maybe('gửi lại cùng clientMessageId KHÔNG tạo thông báo lần hai', async () => {
    const clientMessageId = newId();
    await chat.sendMessage(customerId, conversationId, { text: 'Một lần thôi', clientMessageId });
    const after = (await chatNotifications(ownerId)).length;

    await chat.sendMessage(customerId, conversationId, { text: 'Một lần thôi', clientMessageId });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        chat.sendMessage(customerId, conversationId, { text: 'Một lần thôi', clientMessageId }),
      ),
    );

    expect((await chatNotifications(ownerId)).length).toBe(after);
  });

  /**
   * Chủ shop nhắn hỏi thuê xe của CHÍNH shop mình sẽ là khách của thread đó. Hộp thư gian hàng
   * không liệt kê thread ấy (`inboxWhere`), nên một thông báo dẫn tới nó là một ngõ cụt.
   */
  maybe('thành viên đang là KHÁCH của chính thread đó không nhận thông báo phía shop', async () => {
    const selfConv = await chat.getOrCreateConversation(ownerId, { vehicleId });
    const before = await prisma.notification.count({
      where: { userId: ownerId, targetId: selfConv.id },
    });

    await chat.sendMessage(ownerId, selfConv.id, { text: 'Tự hỏi mình' });

    expect(
      await prisma.notification.count({ where: { userId: ownerId, targetId: selfConv.id } }),
    ).toBe(before);
    // Nhân viên vẫn nhận — thread này là việc của gian hàng, chỉ người gửi bị loại.
    expect(
      await prisma.notification.count({ where: { userId: staffId, targetId: selfConv.id } }),
    ).toBeGreaterThan(0);
  });
});

/**
 * Tín hiệu chiếu huy hiệu — thứ quyết định badge có cập nhật hay không.
 *
 * Đây là đoạn dây dễ đứt âm thầm nhất của cả tính năng: phép đếm và job chiếu đều có spec riêng,
 * nhưng nếu KHÔNG ai đánh dấu thì cả hai chạy đúng trên một hàng đợi vĩnh viễn rỗng, và badge
 * đứng im cho tới nhịp poll — không có test nào đỏ.
 */
describe('ChatService — tín hiệu huy hiệu', () => {
  const dirtyAtOf = async (userId: string): Promise<Date | null> =>
    (await prisma.userBadgeSignal.findUnique({ where: { userId } }))?.dirtyAt ?? null;

  const clearSignals = () =>
    prisma.userBadgeSignal.deleteMany({
      where: { userId: { in: [customerId, ownerId, staffId] } },
    });

  maybe('gửi tin đánh dấu CẢ HAI phía — người nhận và chính người gửi', async () => {
    await clearSignals();

    await chat.sendMessage(customerId, conversationId, { text: 'Cho hỏi giá thuê' });

    // Phía gian hàng: +1 chưa đọc cho TOÀN ĐỘI, vì `unread_tenant_count` là bộ đếm dùng chung.
    expect(await dirtyAtOf(ownerId)).not.toBeNull();
    expect(await dirtyAtOf(staffId)).not.toBeNull();
    // Người gửi: phía họ vừa về 0, nên con số của họ cũng đổi.
    expect(await dirtyAtOf(customerId)).not.toBeNull();
  });

  maybe('đọc ở phía gian hàng đánh dấu cả đội, không riêng người vừa đọc', async () => {
    await chat.sendMessage(customerId, conversationId, { text: 'Còn xe không shop' });
    await clearSignals();

    await chat.markRead(staffId, conversationId);

    expect(await dirtyAtOf(staffId)).not.toBeNull();
    expect(await dirtyAtOf(ownerId)).not.toBeNull();
  });

  /**
   * Chiều ngược lại, và đây mới là chỗ tốn kém nếu làm sai: khách mở thread chỉ chạm bộ đếm CỦA
   * HỌ. Đánh dấu cả gian hàng ở đây nghĩa là một lần đọc ở shop 30 người sinh 31 lượt chiếu cho
   * một thay đổi ảnh hưởng đúng một người — đúng thứ mà cả thiết kế badge này muốn tránh.
   */
  maybe('khách đọc thì KHÔNG đánh dấu gian hàng — bộ đếm bên kia không hề đổi', async () => {
    await chat.sendMessage(staffId, conversationId, { text: 'Còn bạn nhé' });
    await clearSignals();

    await chat.markRead(customerId, conversationId);

    expect(await dirtyAtOf(customerId)).not.toBeNull();
    expect(await dirtyAtOf(ownerId)).toBeNull();
    expect(await dirtyAtOf(staffId)).toBeNull();
  });

  maybe('sự kiện thứ hai đẩy mốc lên, không sinh dòng thứ hai', async () => {
    await clearSignals();

    await chat.sendMessage(customerId, conversationId, { text: 'Tin một' });
    const first = await dirtyAtOf(ownerId);
    await chat.sendMessage(customerId, conversationId, { text: 'Tin hai' });
    const second = await dirtyAtOf(ownerId);

    expect(first).not.toBeNull();
    expect(second!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
    expect(await prisma.userBadgeSignal.count({ where: { userId: ownerId } })).toBe(1);
  });
});

/**
 * Tin nhắn chat KHÔNG hiện ở chuông.
 *
 * Biểu tượng chat đã mang số chưa đọc và mở ra là thấy đúng hội thoại; một dòng "Bạn có tin nhắn
 * mới" trong chuông không thêm thông tin gì, lại đẩy những thứ THẬT SỰ cần xử lý (yêu cầu thuê
 * sắp hết hạn, giữ chỗ quá hạn) xuống dưới.
 *
 * Nhưng bản ghi `notifications` vẫn phải TỒN TẠI: `push_deliveries` tham chiếu tới nó, nên xoá nó
 * đi là tắt luôn thông báo đẩy của chat trên app native. Đó là ranh giới mà spec này khoá.
 */
describe('ChatService — thông báo chat không vào chuông', () => {
  maybe('gửi tin: có bản ghi thông báo, nhưng chuông KHÔNG thấy nó', async () => {
    const before = await notifications.unreadCount(ownerId);

    await chat.sendMessage(customerId, conversationId, { text: 'Còn xe không shop' });

    // Bản ghi vẫn được tạo — đây là thứ thông báo đẩy dựa vào.
    const rows = await prisma.notification.count({
      where: { userId: ownerId, type: NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED },
    });
    expect(rows).toBeGreaterThan(0);

    // Nhưng chuông không đếm nó, và danh sách chuông không liệt kê nó.
    expect((await notifications.unreadCount(ownerId)).count).toBe(before.count);

    const page = await notifications.list(ownerId, { page: 1, limit: 50 });
    expect(page.data.some((n) => n.type === NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED)).toBe(false);
  });

  maybe('huy hiệu và chuông đếm GIỐNG nhau — lệch là con số không bao giờ về 0', async () => {
    await chat.sendMessage(customerId, conversationId, { text: 'Thêm một tin nữa' });

    const bell = await notifications.unreadCount(ownerId);
    const badges = await computeUserBadges(prisma, ownerId);

    expect(badges.notificationsUnread).toBe(bell.count);
  });
});
