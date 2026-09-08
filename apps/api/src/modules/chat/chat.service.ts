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
  CHAT_SIDE,
  CONVERSATION_STATUS,
  MEMBERSHIP_STATUS,
  MESSAGE_TYPE,
  OUTBOX_STATUS,
  SENDER_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type ChatSide,
  type PaginationMeta,
  type SenderType,
} from '@xeprime/types';
// CONVERSATION_STATUS.OPEN (misc.ts) — hội thoại mới mặc định "open".
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConversationListQueryDto,
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
import { paginationMeta, resolvePaging } from '../../common/pagination';

/** Postgres báo vi phạm unique bằng mã này — Prisma giữ nguyên trong `code`. */
const UNIQUE_VIOLATION = 'P2002';

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
  tenant: { select: { name: true, profile: { select: { logoUrl: true } } } },
  customer: { select: { displayName: true, avatarUrl: true } },
  vehicle: { select: { name: true, mainImageUrl: true } },
} satisfies Prisma.ConversationSelect;

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderUserId: true,
  senderType: true,
  messageType: true,
  text: true,
  clientMessageId: true,
  vehicleId: true,
  sentAt: true,
  sender: { select: { displayName: true } },
  vehicle: { select: { id: true, name: true, mainImageUrl: true } },
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
   * Khách mở/lấy hội thoại với SHOP sở hữu một xe.
   *
   * Idempotent theo (khách, gian hàng): hỏi chiếc thứ hai của cùng salon vẫn rơi vào đúng thread
   * cũ. Chiếc xe chỉ là ĐƯỜNG VÀO — nó xác định gian hàng, rồi trở thành ngữ cảnh của câu nhắn
   * đầu tiên (client gửi kèm `vehicleId` ở `sendMessage`). Chỉ nhận xe đã `approved_public` thuộc
   * shop `active` (như luồng Marketplace); `tenant_id` suy từ xe ở server, không nhận client.
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

    return toSummary(
      await this.getOrCreateFor({
        tenantId: vehicle.tenantId,
        customerUserId: userId,
        vehicleId: vehicle.id,
      }),
      CHAT_SIDE.CUSTOMER,
    );
  }

  /**
   * Gian hàng mở/lấy hội thoại với KHÁCH CỦA MỘT YÊU CẦU THUÊ.
   *
   * Đường vào của phía shop cố ý KHÁC `getOrCreateConversation`: bên đó lấy người đang gọi làm
   * KHÁCH của hội thoại, nên nhân viên gian hàng dùng lại nó sẽ tự biến mình thành khách và mở
   * một thread rác. Ở đây `customerUserId` và `vehicleId` đọc từ chính yêu cầu, còn `tenantId`
   * đến từ scope của phiên — client không gửi cả ba.
   *
   * Yêu cầu của gian hàng khác → 404 y hệt yêu cầu không tồn tại (không lộ sự tồn tại).
   * Khách vãng lai (không có tài khoản) → `CHAT_CUSTOMER_UNAVAILABLE`: không có ai ở phía bên
   * kia để nhắn, gian hàng phải gọi điện/Zalo.
   *
   * Idempotent theo (khách, gian hàng) như đường của khách — cùng một hàm dựng, nên hai phía
   * không thể đẻ ra hai thread song song cho cùng một cặp.
   */
  async getOrCreateConversationForBookingRequest(
    tenantId: string,
    requestId: string,
  ): Promise<ConversationSummaryDto> {
    const request = await this.prisma.bookingRequest.findFirst({
      where: { id: requestId, tenantId },
      select: { customerUserId: true, vehicleId: true },
    });
    if (!request) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy yêu cầu đặt xe',
      });
    }
    if (!request.customerUserId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.CHAT_CUSTOMER_UNAVAILABLE,
        message: 'Khách chưa có tài khoản trên nền tảng — hãy gọi điện hoặc nhắn Zalo',
      });
    }

    return toSummary(
      await this.getOrCreateFor({
        tenantId,
        customerUserId: request.customerUserId,
        vehicleId: request.vehicleId,
      }),
      CHAT_SIDE.SHOP,
    );
  }

  /**
   * Tìm-hoặc-tạo hội thoại của một cặp (khách, GIAN HÀNG). MỘT hiện thực cho cả hai phía: khách
   * bấm "Nhắn shop" và gian hàng bấm "Nhắn khách" phải rơi vào đúng một thread, nếu không hai
   * bên ngồi nhìn hai hộp thư khác nhau.
   *
   * Danh tính KHÔNG có xe: khách hỏi ba chiếc của cùng một salon vẫn đang nói chuyện với một
   * người bán. Xe đi kèm TỪNG TIN NHẮN (`Message.vehicleId`) dưới dạng thẻ ngữ cảnh, nên một
   * thread nói về nhiều xe mà vẫn rõ từng câu hỏi chiếc nào.
   *
   * Chống trùng là `conversations_customer_tenant_key` ở DB, KHÔNG phải cái `findFirst` mở đầu.
   * Lần đọc đó chỉ để tránh một INSERT thừa ở đường đi thường gặp; hai request song song đều đọc
   * "chưa có" là chuyện bình thường, và khi đó đúng một cái thắng INSERT còn cái kia bắt P2002
   * rồi đọc lại bản của người thắng. Đây là lý do bất biến phải nằm ở DB: không có thứ tự thực
   * thi nào ở tầng app làm được điều này.
   */
  private async getOrCreateFor(params: {
    tenantId: string;
    customerUserId: string;
    /** Xe khách đang xem lúc mở chat — chỉ để hiện preview, KHÔNG thuộc danh tính hội thoại. */
    vehicleId?: string | null;
  }): Promise<ConversationRow> {
    const where = { customerUserId: params.customerUserId, tenantId: params.tenantId };

    const existing = await this.prisma.conversation.findFirst({
      where,
      select: CONVERSATION_SELECT,
    });
    if (existing) return existing;

    const id = newId();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.create({
          data: {
            id,
            tenantId: params.tenantId,
            customerUserId: params.customerUserId,
            vehicleId: params.vehicleId ?? null,
            status: CONVERSATION_STATUS.OPEN,
          },
          select: CONVERSATION_SELECT,
        });
        // Bản ghi participant của khách để lưu mốc đã đọc; phía shop truy cập qua membership.
        await tx.conversationParticipant.create({
          data: {
            id: newId(),
            conversationId: id,
            userId: params.customerUserId,
            participantType: CHAT_SIDE.CUSTOMER,
            lastReadAt: new Date(),
          },
        });
        return conv;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.conversation.findFirst({
        where,
        select: CONVERSATION_SELECT,
      });
      if (!winner) throw error;
      return winner;
    }
  }

  /**
   * Hộp thư của MỘT bề mặt. `side` là tham số bắt buộc, không phải bộ lọc trang trí: một tài
   * khoản vừa thuê xe của shop khác vừa là nhân viên shop mình có hai hộp thư, và không có
   * đường nào ở đây sinh ra danh sách trộn cả hai.
   */
  async listConversations(
    userId: string,
    query: ConversationListQueryDto,
  ): Promise<{ data: ConversationSummaryDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, CONVERSATION_DEFAULT_LIMIT, CONVERSATION_MAX_LIMIT);
    const side = query.side as ChatSide;
    const where = await this.inboxWhere(userId, side, query);

    if (where === null) {
      return { data: [], meta: paginationMeta(paging, 0) };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: CONVERSATION_SELECT,
      }),
    ]);

    return {
      data: rows.map((c) => toSummary(c, side)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Một hội thoại theo id — đường vào của DEEP LINK (`/chat?c=…`).
   *
   * Tồn tại vì màn chat không được suy hội thoại đang mở TỪ trang đầu của danh sách: một thread
   * im lặng ba tuần nằm ở trang 4, và không có endpoint này thì đường dẫn trong email/thông báo
   * mở ra một màn trống. `side` được kiểm chứ không phải suy ra, nên `?c=` của hộp thư khách dán
   * vào `/manage/chat` không mở được — cùng một quy tắc scope với danh sách.
   */
  async getConversation(
    userId: string,
    conversationId: string,
    side: ChatSide,
  ): Promise<ConversationSummaryDto> {
    await this.resolveAccess(userId, conversationId, side);
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hội thoại',
      });
    }
    return toSummary(row, side);
  }

  /**
   * Lịch sử tin nhắn, mới nhất trước, phân trang KEYSET theo cặp `(sentAt, id)`.
   *
   * Cursor một cột `sentAt` là sai ngay khi hai tin trùng mili-giây — một lần gửi kèm nhiều ảnh
   * hoặc hai người bấm cùng lúc là đủ: `lt sentAt` bỏ luôn tin còn lại của mốc đó, còn `lte` trả
   * lại chính tin vừa hiển thị. So cả `id` thì mỗi tin đi qua đúng một lần.
   */
  async listMessages(
    userId: string,
    conversationId: string,
    query: MessageListQueryDto,
  ): Promise<{ data: MessageDto[]; nextBefore: string | null; nextBeforeId: string | null }> {
    await this.resolveAccess(userId, conversationId);
    const limit = Math.min(MESSAGE_MAX_LIMIT, Math.max(1, query.limit ?? MESSAGE_DEFAULT_LIMIT));

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...beforeCursor(query),
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: MESSAGE_SELECT,
    });

    // Còn có thể nhiều tin cũ hơn nếu lấy đủ `limit` → cursor = tin cũ nhất lô này.
    const oldest = rows.length === limit ? rows[rows.length - 1] : undefined;

    return {
      data: rows.map(toMessageDto),
      nextBefore: oldest?.sentAt.toISOString() ?? null,
      nextBeforeId: oldest?.id ?? null,
    };
  }

  /**
   * Gửi tin: ghi Message (+ đính kèm) + Outbox trong CÙNG transaction (ADR 0009 §3), cập nhật
   * denorm hội thoại (last message + unread phía đối diện). Worker đẩy outbox sang Firestore.
   *
   * `clientMessageId` làm cho thao tác này IDEMPOTENT: mạng rớt sau khi server đã ghi là chuyện
   * thường trên 3G, và client thử lại là đúng — cái sai là để lần thử lại đó đẻ ra tin thứ hai
   * nằm vĩnh viễn trong lịch sử. Khoá chống trùng là unique `(conversation_id, client_message_id)`
   * ở DB; đoạn `findFirst` chỉ là đường tắt cho trường hợp thường gặp.
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const { conversation, side } = await this.resolveAccess(userId, conversationId);

    const text = dto.text?.trim() || null;
    const attachments = dto.attachments ?? [];
    if (!text && attachments.length === 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Tin nhắn phải có nội dung hoặc đính kèm',
      });
    }
    this.assertAttachmentUrls(attachments);

    const clientMessageId = dto.clientMessageId ?? null;
    if (clientMessageId) {
      const replayed = await this.findByClientId(conversationId, clientMessageId);
      if (replayed) return replayed;
    }

    const vehicleId = await this.resolveVehicleContext(conversation.tenantId, dto.vehicleId);

    const senderType: SenderType =
      side === CHAT_SIDE.CUSTOMER ? SENDER_TYPE.CUSTOMER : SENDER_TYPE.SHOP_MEMBER;
    const messageType = resolveMessageType(dto.messageType, attachments);
    const preview = text ?? `[${attachments.length} đính kèm]`;
    const id = newId();
    const now = new Date();

    let row: MessageRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            id,
            conversationId,
            senderUserId: userId,
            senderType,
            messageType,
            text,
            clientMessageId,
            vehicleId,
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
            // Chỉ ghi đè khi tin này CÓ ngữ cảnh — một câu "ok bạn" không xoá mất chủ đề đang bàn.
            ...(vehicleId ? { vehicleId } : {}),
            ...(side === CHAT_SIDE.CUSTOMER
              ? { unreadCustomerCount: 0, unreadTenantCount: { increment: 1 } }
              : { unreadTenantCount: 0, unreadCustomerCount: { increment: 1 } }),
          },
        });

        if (side === CHAT_SIDE.CUSTOMER) {
          await tx.conversationParticipant.updateMany({
            where: { conversationId, userId },
            data: { lastReadAt: now },
          });
        }

        return message;
      });
    } catch (error) {
      // Hai lần gửi song song cùng một khoá: bản thua đọc lại bản thắng thay vì báo lỗi cho
      // người dùng về một tin ĐÃ gửi thành công.
      if (clientMessageId && isUniqueViolation(error)) {
        const winner = await this.findByClientId(conversationId, clientMessageId);
        if (winner) return winner;
      }
      throw error;
    }

    return toMessageDto(row);
  }

  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<{ conversationId: string; unread: number }> {
    const { side } = await this.resolveAccess(userId, conversationId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        // Đặt VỀ 0, không trừ dần: trừ là mở đường cho số âm khi hai tab cùng đánh dấu đã đọc.
        data:
          side === CHAT_SIDE.CUSTOMER ? { unreadCustomerCount: 0 } : { unreadTenantCount: 0 },
      });
      if (side === CHAT_SIDE.CUSTOMER) {
        await tx.conversationParticipant.updateMany({
          where: { conversationId, userId },
          data: { lastReadAt: now },
        });
      }
    });

    return { conversationId, unread: 0 };
  }

  /** Tổng tin chưa đọc của MỘT bề mặt, gộp mọi hội thoại — cho badge icon chat. */
  async unreadCount(userId: string, side: ChatSide): Promise<{ count: number }> {
    const where = await this.inboxWhere(userId, side, {});
    if (where === null) return { count: 0 };

    const sum = await this.prisma.conversation.aggregate({
      where,
      _sum: { unreadCustomerCount: true, unreadTenantCount: true },
    });

    const count =
      side === CHAT_SIDE.CUSTOMER
        ? (sum._sum.unreadCustomerCount ?? 0)
        : (sum._sum.unreadTenantCount ?? 0);
    return { count };
  }

  /**
   * Chưa đọc của CẢ HAI vai, kèm số của từng vai.
   *
   * Tách khỏi `unreadCount(side)` vì nó trả lời một câu hỏi khác: "có gì đang đợi tôi, ở bất kỳ
   * đâu?" — thứ mà biểu tượng chat trên thanh trên cùng phải trả lời dù người dùng đang đứng ở
   * trang nào. Chủ gian hàng lướt chợ xe mà khách nhắn vào shop thì con số phải sáng lên ngay,
   * không đợi tới lúc họ tự mở khu quản lý.
   *
   * Vẫn KHÔNG trộn dữ liệu: hai con số đi riêng và có nhãn riêng, nên nơi gọi biết chính xác cái
   * nào thuộc hộp thư nào và dẫn người dùng tới đúng chỗ. Ràng buộc "một danh sách không bao giờ
   * chứa cả hai vai" (ADR 0009 · `listConversations`) không hề bị nới.
   */
  async unreadSummary(
    userId: string,
  ): Promise<{ customer: number; shop: number; total: number }> {
    const [customer, shop] = await Promise.all([
      this.unreadCount(userId, CHAT_SIDE.CUSTOMER),
      this.unreadCount(userId, CHAT_SIDE.SHOP),
    ]);
    return {
      customer: customer.count,
      shop: shop.count,
      total: customer.count + shop.count,
    };
  }

  // --- helpers -------------------------------------------------------------

  /**
   * Điều kiện WHERE của một hộp thư. `null` = bề mặt này không có hộp thư nào cho user (chưa
   * thuộc gian hàng nào) — nơi gọi trả danh sách rỗng thay vì dựng một truy vấn `IN ()`.
   *
   * Phía shop loại các hội thoại mà CHÍNH user là khách: chủ shop nhắn hỏi thuê xe của người
   * khác thì đó là việc riêng của họ, không phải việc của inbox gian hàng — và đó cũng chính là
   * quy tắc `resolveAccess` áp cho `side=shop`, nên danh sách và quyền truy cập không lệch nhau.
   */
  private async inboxWhere(
    userId: string,
    side: ChatSide,
    filters: { q?: string; unreadOnly?: boolean },
  ): Promise<Prisma.ConversationWhereInput | null> {
    const q = filters.q?.trim();
    const search = q ? { contains: q, mode: Prisma.QueryMode.insensitive } : undefined;

    if (side === CHAT_SIDE.CUSTOMER) {
      return {
        customerUserId: userId,
        ...(filters.unreadOnly ? { unreadCustomerCount: { gt: 0 } } : {}),
        ...(search
          ? { OR: [{ tenant: { name: search } }, { vehicle: { name: search } }] }
          : {}),
      };
    }

    const tenantIds = await this.activeTenantIds(userId);
    if (tenantIds.length === 0) return null;

    return {
      tenantId: { in: tenantIds },
      NOT: { customerUserId: userId },
      ...(filters.unreadOnly ? { unreadTenantCount: { gt: 0 } } : {}),
      ...(search
        ? { OR: [{ customer: { displayName: search } }, { vehicle: { name: search } }] }
        : {}),
    };
  }

  /** Tenant mà user đang là thành viên active — dùng để scope hội thoại phía shop. */
  private async activeTenantIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.tenantMembership.findMany({
      where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }

  private async findByClientId(
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageDto | null> {
    const row = await this.prisma.message.findFirst({
      where: { conversationId, clientMessageId },
      select: MESSAGE_SELECT,
    });
    return row ? toMessageDto(row) : null;
  }

  /**
   * Nạp hội thoại + xác định phía của actor.
   *
   * `expected` có mặt khi lời gọi đến TỪ một bề mặt cụ thể (mở deep link ở `/chat` hay
   * `/manage/chat`): khi đó phía được KIỂM, không phải suy ra — nếu không, dán id hội thoại
   * riêng vào khu quản lý sẽ mở ra một thread mà inbox gian hàng không bao giờ liệt kê.
   */
  private async resolveAccess(
    userId: string,
    conversationId: string,
    expected?: ChatSide,
  ): Promise<{
    conversation: { id: string; tenantId: string; customerUserId: string | null };
    side: ChatSide;
  }> {
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

    const isCustomer = conversation.customerUserId === userId;
    if (isCustomer && expected !== CHAT_SIDE.SHOP) {
      return { conversation, side: CHAT_SIDE.CUSTOMER };
    }

    if (!isCustomer && expected !== CHAT_SIDE.CUSTOMER) {
      const membership = await this.prisma.tenantMembership.findFirst({
        where: { userId, tenantId: conversation.tenantId, status: MEMBERSHIP_STATUS.ACTIVE },
        select: { userId: true },
      });
      if (membership) return { conversation, side: CHAT_SIDE.SHOP };
    }

    throw new ForbiddenException({
      code: API_ERROR_CODE.FORBIDDEN,
      message: 'Bạn không có quyền truy cập hội thoại này',
    });
  }

  /**
   * Xe gắn kèm một tin nhắn phải THUỘC gian hàng của hội thoại đó.
   *
   * Không kiểm thì client gửi được id xe bất kỳ và thẻ ngữ cảnh trở thành một đường dẫn tuỳ ý
   * chèn vào hộp thư người khác — vừa sai nghĩa vừa là một lối phát tán liên kết. Xe không hợp
   * lệ thì BỎ ngữ cảnh chứ không chặn cả tin: nội dung người dùng gõ quan trọng hơn cái thẻ.
   */
  private async resolveVehicleContext(
    tenantId: string,
    vehicleId: string | undefined,
  ): Promise<string | null> {
    if (!vehicleId) return null;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
      select: { id: true },
    });
    return vehicle?.id ?? null;
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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
  );
}

/** Nhánh WHERE của cursor keyset — "cũ hơn (sentAt, id)" viết bằng ngôn ngữ Prisma. */
function beforeCursor(query: MessageListQueryDto): Prisma.MessageWhereInput {
  if (!query.before) return {};
  const before = new Date(query.before);
  if (!query.beforeId) return { sentAt: { lt: before } };
  return {
    OR: [{ sentAt: { lt: before } }, { sentAt: before, id: { lt: query.beforeId } }],
  };
}

function toSummary(c: ConversationRow, side: ChatSide): ConversationSummaryDto {
  const viewingAsCustomer = side === CHAT_SIDE.CUSTOMER;
  return {
    id: c.id,
    vehicleId: c.vehicleId,
    vehicleName: c.vehicle?.name ?? null,
    vehicleImageUrl: c.vehicle?.mainImageUrl ?? null,
    partyName: viewingAsCustomer ? c.tenant.name : (c.customer?.displayName ?? 'Khách'),
    partyAvatarUrl: viewingAsCustomer
      ? (c.tenant.profile?.logoUrl ?? null)
      : (c.customer?.avatarUrl ?? null),
    side,
    lastMessageText: c.lastMessageText,
    lastMessageAt: (c.lastMessageAt as unknown as string | null) ?? null,
    lastSenderType: c.lastSenderType,
    unread: viewingAsCustomer ? c.unreadCustomerCount : c.unreadTenantCount,
    status: c.status,
  };
}

function toMessageDto(m: MessageRow): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderUserId: m.senderUserId,
    senderName: m.sender?.displayName ?? null,
    senderType: m.senderType,
    messageType: m.messageType,
    text: m.text,
    clientMessageId: m.clientMessageId,
    vehicle: m.vehicle
      ? { id: m.vehicle.id, name: m.vehicle.name, imageUrl: m.vehicle.mainImageUrl }
      : null,
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
