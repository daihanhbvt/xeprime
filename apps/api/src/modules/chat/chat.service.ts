import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  CONVERSATION_STATUS,
  MEMBERSHIP_STATUS,
  MESSAGE_TYPE,
  OUTBOX_STATUS,
  SENDER_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
  type SenderType,
} from '@xeprime/types';
// CONVERSATION_STATUS.OPEN (misc.ts) — hội thoại mới mặc định "open".
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConversationSummaryDto,
  CreateConversationDto,
  MessageDto,
  MessageListQueryDto,
  SendMessageDto,
  CONVERSATION_DEFAULT_LIMIT,
  CONVERSATION_MAX_LIMIT,
  MESSAGE_DEFAULT_LIMIT,
  MESSAGE_MAX_LIMIT,
} from './dto/chat.dto';

/** Phía của người xem trong một hội thoại — quyết định quyền, senderType, và unread counter. */
type Side = 'customer' | 'shop';

const CONVERSATION_SELECT = {
  id: true,
  vehicleId: true,
  tenantId: true,
  customerUserId: true,
  status: true,
  lastMessageText: true,
  lastMessageAt: true,
  lastSenderType: true,
  unreadCustomerCount: true,
  unreadTenantCount: true,
  tenant: { select: { name: true } },
  customer: { select: { displayName: true } },
  vehicle: { select: { name: true } },
} satisfies Prisma.ConversationSelect;

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderUserId: true,
  senderType: true,
  messageType: true,
  text: true,
  sentAt: true,
  attachments: {
    select: { fileUrl: true, fileType: true, fileName: true, fileSize: true },
  },
} satisfies Prisma.MessageSelect;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Khách mở/lấy hội thoại với shop về một xe. Idempotent theo (customerUserId, vehicleId):
   * mở lại đúng thread cũ. Chỉ nhận xe đã `approved_public` thuộc shop `active` (như luồng
   * Marketplace). `tenant_id` suy từ xe ở server, không nhận client.
   */
  async getOrCreateConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationSummaryDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: dto.vehicleId,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      },
      select: { id: true, tenantId: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe không khả dụng để nhắn tin',
      });
    }

    const existing = await this.prisma.conversation.findFirst({
      where: { customerUserId: userId, vehicleId: vehicle.id },
      select: CONVERSATION_SELECT,
    });
    if (existing) return toSummary(existing, 'customer');

    const id = newId();
    const created = await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          id,
          tenantId: vehicle.tenantId,
          customerUserId: userId,
          vehicleId: vehicle.id,
          status: CONVERSATION_STATUS.OPEN,
        },
        select: CONVERSATION_SELECT,
      });
      // Bản ghi participant của khách để lưu mốc đã đọc; phía shop truy cập qua membership.
      await tx.conversationParticipant.create({
        data: {
          id: newId(),
          conversationId: id,
          userId,
          participantType: 'customer',
          lastReadAt: new Date(),
        },
      });
      return conv;
    });

    return toSummary(created, 'customer');
  }

  async listConversations(
    userId: string,
    query: { page?: number; limit?: number },
  ): Promise<{ data: ConversationSummaryDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      CONVERSATION_MAX_LIMIT,
      Math.max(1, query.limit ?? CONVERSATION_DEFAULT_LIMIT),
    );

    const tenantIds = await this.activeTenantIds(userId);
    const where: Prisma.ConversationWhereInput = {
      OR: [{ customerUserId: userId }, ...(tenantIds.length ? [{ tenantId: { in: tenantIds } }] : [])],
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: CONVERSATION_SELECT,
      }),
    ]);

    return {
      data: rows.map((c) => toSummary(c, c.customerUserId === userId ? 'customer' : 'shop')),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: MessageListQueryDto,
  ): Promise<{ data: MessageDto[]; nextBefore: string | null }> {
    await this.loadWithAccess(userId, conversationId);
    const limit = Math.min(MESSAGE_MAX_LIMIT, Math.max(1, query.limit ?? MESSAGE_DEFAULT_LIMIT));

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query.before ? { sentAt: { lt: new Date(query.before) } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
      select: MESSAGE_SELECT,
    });

    // Còn có thể nhiều tin cũ hơn nếu lấy đủ `limit` → cursor = tin cũ nhất lô này.
    const nextBefore =
      rows.length === limit ? (rows[rows.length - 1]?.sentAt.toISOString() ?? null) : null;

    return { data: rows.map(toMessageDto), nextBefore };
  }

  /**
   * Gửi tin: ghi Message (+ đính kèm) + Outbox trong CÙNG transaction (ADR 0009 §3), cập nhật
   * denorm hội thoại (last message + unread phía đối diện). Worker đẩy outbox sang Firestore.
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const { conversation, side } = await this.loadWithAccess(userId, conversationId);

    const text = dto.text?.trim() || null;
    const attachments = dto.attachments ?? [];
    if (!text && attachments.length === 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Tin nhắn phải có nội dung hoặc đính kèm',
      });
    }
    this.assertAttachmentUrls(attachments);

    const senderType: SenderType =
      side === 'customer' ? SENDER_TYPE.CUSTOMER : SENDER_TYPE.SHOP_MEMBER;
    const messageType = resolveMessageType(dto.messageType, attachments);
    const preview = text ?? `[${attachments.length} đính kèm]`;
    const id = newId();
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          id,
          conversationId,
          senderUserId: userId,
          senderType,
          messageType,
          text,
          sentAt: now,
          ...(attachments.length
            ? {
                attachments: {
                  create: attachments.map((a) => ({
                    id: newId(),
                    fileUrl: a.url,
                    fileType: a.fileType ?? null,
                    fileName: a.fileName ?? null,
                    fileSize: a.fileSize ?? null,
                  })),
                },
              }
            : {}),
        },
        select: MESSAGE_SELECT,
      });

      // Đẩy realtime đi qua outbox (worker), không ghi Firestore thẳng ở request.
      await tx.messageOutbox.create({
        data: { id: newId(), messageId: id, status: OUTBOX_STATUS.PENDING, nextAttemptAt: now },
      });

      // Người gửi coi như đã đọc; phía đối diện +1 chưa đọc.
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: preview,
          lastMessageAt: now,
          lastSenderType: senderType,
          ...(side === 'customer'
            ? { unreadCustomerCount: 0, unreadTenantCount: { increment: 1 } }
            : { unreadTenantCount: 0, unreadCustomerCount: { increment: 1 } }),
        },
      });

      if (side === 'customer') {
        await tx.conversationParticipant.updateMany({
          where: { conversationId, userId },
          data: { lastReadAt: now },
        });
      }

      return message;
    });

    // Đảm bảo hội thoại không còn đang tạo dở khiến outbox trỏ message chưa denorm — đã trong tx.
    void conversation;
    return toMessageDto(row);
  }

  async markRead(userId: string, conversationId: string): Promise<{ conversationId: string; unread: number }> {
    const { side } = await this.loadWithAccess(userId, conversationId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        data: side === 'customer' ? { unreadCustomerCount: 0 } : { unreadTenantCount: 0 },
      });
      if (side === 'customer') {
        await tx.conversationParticipant.updateMany({
          where: { conversationId, userId },
          data: { lastReadAt: now },
        });
      }
    });

    return { conversationId, unread: 0 };
  }

  // --- helpers -------------------------------------------------------------

  /** Tenant mà user đang là thành viên active — dùng để scope hội thoại phía shop. */
  private async activeTenantIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.tenantMembership.findMany({
      where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }

  /** Nạp hội thoại + xác định quyền/phía của actor (customer hoặc thành viên shop). */
  private async loadWithAccess(
    userId: string,
    conversationId: string,
  ): Promise<{ conversation: { id: string; tenantId: string; customerUserId: string | null }; side: Side }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, tenantId: true, customerUserId: true },
    });
    if (!conversation) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hội thoại',
      });
    }

    if (conversation.customerUserId === userId) {
      return { conversation, side: 'customer' };
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId: conversation.tenantId, status: MEMBERSHIP_STATUS.ACTIVE },
      select: { userId: true },
    });
    if (membership) {
      return { conversation, side: 'shop' };
    }

    throw new ForbiddenException({
      code: API_ERROR_CODE.FORBIDDEN,
      message: 'Bạn không có quyền truy cập hội thoại này',
    });
  }

  /** Đính kèm phải là URL R2 công khai của mình — chặn nhét link bừa làm "đính kèm". */
  private assertAttachmentUrls(attachments: { url: string }[]): void {
    if (attachments.length === 0) return;
    const base = this.config.get<string>('R2_PUBLIC_BASE_URL');
    if (!base) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Đính kèm chưa khả dụng (chưa cấu hình lưu trữ)',
      });
    }
    const normalized = base.replace(/\/+$/, '');
    for (const a of attachments) {
      if (!a.url.startsWith(normalized)) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'URL đính kèm không hợp lệ',
        });
      }
    }
  }
}

type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof CONVERSATION_SELECT }>;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function toSummary(c: ConversationRow, side: Side): ConversationSummaryDto {
  return {
    id: c.id,
    vehicleId: c.vehicleId,
    vehicleName: c.vehicle?.name ?? null,
    partyName: side === 'customer' ? c.tenant.name : (c.customer?.displayName ?? 'Khách'),
    side,
    lastMessageText: c.lastMessageText,
    lastMessageAt: (c.lastMessageAt as unknown as string | null) ?? null,
    lastSenderType: c.lastSenderType,
    unread: side === 'customer' ? c.unreadCustomerCount : c.unreadTenantCount,
    status: c.status,
  };
}

function toMessageDto(m: MessageRow): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderUserId: m.senderUserId,
    senderType: m.senderType,
    messageType: m.messageType,
    text: m.text,
    attachments: m.attachments.map((a) => ({
      url: a.fileUrl,
      fileType: a.fileType,
      fileName: a.fileName,
      fileSize: a.fileSize,
    })),
    sentAt: m.sentAt as unknown as string,
  };
}

function resolveMessageType(
  requested: string | undefined,
  attachments: { fileType?: string }[],
): string {
  if (requested) return requested;
  if (attachments.length === 0) return MESSAGE_TYPE.TEXT;
  const first = attachments[0]?.fileType ?? '';
  return first.startsWith('image/') ? MESSAGE_TYPE.IMAGE : MESSAGE_TYPE.FILE;
}
