import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
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
 * Chat chạy trên PostgreSQL THẬT (source of truth, ADR 0009). Kiểm chứng: getOrCreate idempotent,
 * sendMessage ghi Message + Outbox trong 1 tx + cập nhật unread đúng phía, cursor phân trang,
 * markRead, và guard chặn người ngoài. Firestore/worker verify live riêng.
 */
const prisma = createPrismaClient();
// ChatService chỉ dùng ConfigService cho R2_PUBLIC_BASE_URL (đính kèm) — test tin text nên trả undefined.
const fakeConfig = { get: () => undefined } as unknown as ConfigService;
const chat = new ChatService(prisma as unknown as PrismaService, fakeConfig);

let dbAvailable = false;
let customerId: string;
let ownerId: string;
let strangerId: string;
let tenantId: string;
let vehicleId: string;
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
  strangerId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: strangerId, displayName: 'Người lạ', email: `str-${strangerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop chat',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: 'V1',
      name: 'Xe chat',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, ownerId, strangerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('ChatService', () => {
  maybe('getOrCreate idempotent theo (khách, xe)', async () => {
    const c1 = await chat.getOrCreateConversation(customerId, { vehicleId });
    const c2 = await chat.getOrCreateConversation(customerId, { vehicleId });
    expect(c1.id).toBe(c2.id);
    expect(c1.side).toBe('customer');
    expect(c1.partyName).toBe('Shop chat'); // khách thấy tên shop
    conversationId = c1.id;
  });

  maybe('khách gửi tin → Message + Outbox(pending) trong 1 tx, unread về phía shop', async () => {
    const msg = await chat.sendMessage(customerId, conversationId, { text: 'Chào shop' });
    expect(msg.senderType).toBe(SENDER_TYPE.CUSTOMER);

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

  maybe('người ngoài không gửi/không đọc được', async () => {
    await expect(
      chat.sendMessage(strangerId, conversationId, { text: 'hack' }),
    ).rejects.toThrow(/quyền/);
    await expect(chat.listMessages(strangerId, conversationId, {})).rejects.toThrow(/quyền/);
  });

  maybe('markRead reset unread phía người đọc', async () => {
    await chat.markRead(customerId, conversationId);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.unreadCustomerCount).toBe(0);
  });

  maybe('listMessages phân trang cursor (mới nhất trước)', async () => {
    // Thêm nhiều tin để có cursor.
    for (let i = 0; i < 5; i++) {
      await chat.sendMessage(customerId, conversationId, { text: `tin ${i}` });
    }
    const firstPage = await chat.listMessages(customerId, conversationId, { limit: 3 });
    expect(firstPage.data).toHaveLength(3);
    expect(firstPage.nextBefore).toBeTruthy();

    const older = await chat.listMessages(customerId, conversationId, {
      limit: 3,
      before: firstPage.nextBefore ?? undefined,
    });
    // Không trùng tin giữa hai trang.
    const ids = new Set(firstPage.data.map((m) => m.id));
    expect(older.data.every((m) => !ids.has(m.id))).toBe(true);
  });

  maybe('list hội thoại: khách thấy (side customer), shop thấy (side shop)', async () => {
    const asCustomer = await chat.listConversations(customerId, {});
    const asShop = await chat.listConversations(ownerId, {});
    expect(asCustomer.data.find((c) => c.id === conversationId)?.side).toBe('customer');
    expect(asShop.data.find((c) => c.id === conversationId)?.side).toBe('shop');
    // Shop thấy tên khách.
    expect(asShop.data.find((c) => c.id === conversationId)?.partyName).toBe('Khách');
  });

  maybe('gửi tin rỗng (không text, không đính kèm) bị chặn', async () => {
    await expect(chat.sendMessage(customerId, conversationId, {})).rejects.toThrow(/nội dung/);
  });

  maybe('unread-count tổng khớp counter phía mình', async () => {
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    // Khách chỉ có đúng một hội thoại này → tổng = unreadCustomerCount; shop = unreadTenantCount.
    const customer = await chat.unreadCount(customerId);
    const shop = await chat.unreadCount(ownerId);
    expect(customer.count).toBe(conv.unreadCustomerCount);
    expect(shop.count).toBe(conv.unreadTenantCount);
  });
});
