import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  activeMemberIdsOf,
  activeTenantIdsOf,
  chatInboxScope,
  chatUnreadOf,
  computeChatUnread,
  markBadgesDirty,
  newId,
  Prisma,
} from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  CHAT_INBOX,
  CHAT_SIDE,
  CONVERSATION_STATUS,
  MEMBERSHIP_STATUS,
  MESSAGE_TYPE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OUTBOX_STATUS,
  SENDER_TYPE,
  TENANT_STATUS,
  resolveEffectiveBilling,
  resolveStorefrontKind,
  storefrontAllowsPublicChat,
  type ChatInbox,
  type ChatSide,
  type PaginationMeta,
  type SenderType,
} from '@xeprime/types';
import { chatNotificationCopy } from '@xeprime/domain';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
} from '../../common/plan/feature-state';
// CONVERSATION_STATUS.OPEN (misc.ts) — hội thoại mới mặc định "open".
import { marketplaceVehicleWhere } from '../../common/marketplace-vehicle-scope';
import { NotificationService } from '../notification/notification.service';
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
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Khách mở/lấy hội thoại với một GIAN HÀNG — từ một chiếc xe, hoặc từ trang gian hàng.
   *
   * Idempotent theo (khách, gian hàng): hỏi chiếc thứ hai của cùng salon, hay bấm "Nhắn tin" ở
   * trang gian hàng sau khi đã nhắn về một chiếc xe, đều rơi vào đúng thread cũ. Chiếc xe chỉ là
   * ĐƯỜNG VÀO — nó xác định gian hàng, rồi trở thành ngữ cảnh của câu nhắn đầu tiên (client gửi
   * kèm `vehicleId` ở `sendMessage`); vào từ trang gian hàng thì chưa có ngữ cảnh xe nào.
   *
   * Cả hai đường đều chỉ nhận gian hàng `active` chưa xoá, và `tenant_id` luôn suy ở server.
   */
  async getOrCreateConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationSummaryDto> {
    const target = dto.vehicleId
      ? await this.resolveTargetByVehicle(dto.vehicleId)
      : await this.resolveTargetByShopSlug(dto.shopSlug ?? '');

    await this.assertCustomerMayOpenChat(userId, target.tenantId);

    return toSummary(
      await this.getOrCreateFor({
        tenantId: target.tenantId,
        customerUserId: userId,
        vehicleId: target.vehicleId,
      }),
      CHAT_SIDE.CUSTOMER,
    );
  }

  /**
   * Đường vào từ một chiếc xe: chỉ xe đang THẬT SỰ nằm ngoài chợ
   * (`marketplaceVehicleWhere` — đã duyệt, chủ xe bật hiển thị, gian hàng hoạt động).
   *
   * Hội thoại ĐÃ MỞ không bị đụng tới: hàm này chỉ gác lối MỞ MỚI từ một trang xe. Chủ xe cất
   * xe đi không phải là lý do để cắt liên lạc với người đang hỏi về chuyến của họ.
   */
  private async resolveTargetByVehicle(
    vehicleId: string,
  ): Promise<{ tenantId: string; vehicleId: string | null }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ...marketplaceVehicleWhere() },
      select: { id: true, tenantId: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe không khả dụng để nhắn tin',
      });
    }
    return { tenantId: vehicle.tenantId, vehicleId: vehicle.id };
  }

  /**
   * Đường vào từ trang gian hàng: `vehicleId` là `null` vì khách chưa nói về chiếc nào cả —
   * cột đó là preview của "lần cuối bàn về xe nào", không phải danh tính hội thoại.
   *
   * Điều kiện gian hàng giống hệt đường kia (`active`, chưa xoá) chứ không lỏng hơn: nếu không,
   * trang gian hàng trở thành đường vòng để nhắn cho một shop đang bị khoá.
   */
  private async resolveTargetByShopSlug(
    slug: string,
  ): Promise<{ tenantId: string; vehicleId: string | null }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: TENANT_STATUS.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Gian hàng không khả dụng để nhắn tin',
      });
    }
    return { tenantId: tenant.id, vehicleId: null };
  }

  /**
   * "Khách này được nhắn cho gian hàng kia chưa" — MỘT phép suy, hai nơi dùng.
   *
   * `assertCustomerMayOpenChat` chặn ở đường ghi; `GET /conversations/eligibility` trả lời cho
   * giao diện để nó quyết định có vẽ nút hay không. Hai câu trả lời BẮT BUỘC phải giống nhau:
   * một cái nút hiện ra rồi bấm vào báo lỗi, hay một cái nút bị ẩn trong khi khách thừa quyền,
   * đều là cùng một lỗi — hai bản sao của cùng một luật trôi khỏi nhau.
   *
   * Luật:
   *
   *  - Tuyến GÓI mở hộp thư công khai (`storefrontAllowsPublicChat`) — luôn được.
   *  - Tuyến HOA HỒNG chỉ mở sau khi khách đã gửi ít nhất một yêu cầu thuê cho chủ xe đó.
   *  - Tenant chưa xác định được tuyến (`unconfigured` — ADR 0038 điều 1) đi theo nhánh CHẶT:
   *    mặc định "mở" khi không biết là mở một kênh thông báo đẩy tới điện thoại của một người
   *    thật dựa trên phỏng đoán.
   *
   * ## "Đã đặt xe" = đã gửi YÊU CẦU, không phải đã có đơn
   *
   * Yêu cầu là mốc sớm nhất mà khách thể hiện ý định thật, và cũng chính là lúc họ cần hỏi chủ
   * xe nhất ("giao tới đây được không?"). Đợi tới khi có `bookings` thì kênh mở sau khi mọi câu
   * hỏi đã hết cần thiết. Mọi trạng thái yêu cầu đều tính — kể cả bị từ chối hay đã huỷ: hai bên
   * vẫn có thể còn chuyện dở dang, và đóng hộp thư ngay sau một lời từ chối là cách chắc chắn để
   * không ai giải thích được điều gì cho ai.
   *
   * Khách vãng lai gửi yêu cầu bằng OTP mà chưa đăng nhập sẽ không khớp `customerUserId`. Đó là
   * đúng: hội thoại thuộc về một TÀI KHOẢN, và họ chưa có tài khoản để gắn vào.
   */
  async canCustomerOpenChat(userId: string, tenantId: string): Promise<boolean> {
    const now = new Date();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptions: {
          where: effectiveSubscriptionWhere(now),
          ...EFFECTIVE_SUBSCRIPTION_ARGS,
        },
      },
    });
    const kind = resolveStorefrontKind(
      resolveEffectiveBilling(tenant?.subscriptions[0] ?? null, now).billingMode,
    );
    if (storefrontAllowsPublicChat(kind)) return true;

    const request = await this.prisma.bookingRequest.findFirst({
      where: { tenantId, customerUserId: userId },
      select: { id: true },
    });
    return request !== null;
  }

  /**
   * Cổng ở đường GHI. Ẩn nút chỉ là trang trí — `POST /conversations` là một endpoint mở với
   * mọi khách đã đăng nhập, và một hộp thư mở ra là một thông báo đẩy tới điện thoại người thật.
   */
  private async assertCustomerMayOpenChat(userId: string, tenantId: string): Promise<void> {
    if (await this.canCustomerOpenChat(userId, tenantId)) return;

    throw new ForbiddenException({
      code: API_ERROR_CODE.CHAT_REQUIRES_BOOKING,
      message: 'Hãy gửi yêu cầu thuê trước — chủ xe cá nhân mở kênh nhắn tin sau bước đó',
    });
  }

  /**
   * Trả lời cho GIAO DIỆN: khách đang đăng nhập có nhắn được cho gian hàng theo slug này không.
   *
   * Slug không tồn tại / gian hàng đã khoá ⇒ `false` chứ không 404: đây là một câu hỏi về NÚT
   * BẤM, và một mã lỗi khác nhau giữa "shop không có" và "chưa được nhắn" là một kênh phụ để dò
   * xem slug nào tồn tại.
   */
  async chatEligibilityForShop(userId: string, slug: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: TENANT_STATUS.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) return false;
    return this.canCustomerOpenChat(userId, tenant.id);
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
   * Một HỘP THƯ, phân trang ở server.
   *
   * `side` là tham số bắt buộc và nhận ba giá trị (`CHAT_INBOX`): hộp thư khách, hộp thư gian
   * hàng, hoặc HỢP NHẤT của đúng hai cái đó.
   *
   * ## Vì sao có hộp thư hợp nhất (16/09/2026)
   *
   * Chủ xe tuyến hoa hồng không có cổng `/manage` để đặt hộp thư công việc. Với họ, "tin nhắn" là
   * MỘT khái niệm — khách hỏi xe của họ và chủ xe mà họ đang thuê nằm trong cùng một dòng thời
   * gian. Bắt họ nhớ mình đang đứng ở hộp thư nào là bắt họ làm việc của hệ thống.
   *
   * Hợp nhất diễn ra ở SERVER, trong MỘT truy vấn (`chatInboxScope`), và đó là điều kiện để nó
   * đúng: ghép hai trang kết quả ở client cho ra những trang dài ngắn khác nhau, một thứ tự thời
   * gian sai ngay ở trang thứ hai, và một con số tổng không khớp thứ đếm được trên màn hình.
   *
   * Nó KHÔNG mở thêm phạm vi nào — xem `chatInboxScope`. Ai được THẤY hộp thư hợp nhất là quyết
   * định của giao diện; ai được ĐỌC một hội thoại vẫn do `resolveAccess` quyết, không đổi.
   */
  async listConversations(
    userId: string,
    query: ConversationListQueryDto,
  ): Promise<{ data: ConversationSummaryDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, CONVERSATION_DEFAULT_LIMIT, CONVERSATION_MAX_LIMIT);
    const inbox = query.side as ChatInbox;
    const where = await this.inboxWhere(userId, inbox, query);

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
      /*
       * VAI đọc theo TỪNG DÒNG, không lấy từ tham số truy vấn.
       *
       * Ở hộp thư hợp nhất, hai dòng cạnh nhau có thể thuộc hai vai khác nhau — và vai quyết định
       * tên hiển thị của phía bên kia, ảnh đại diện, và cột đếm chưa đọc nào là của người xem.
       * Lấy vai từ `?side=` sẽ làm một hội thoại khách hiện tên GIAN HÀNG CỦA CHÍNH MÌNH ở ô đối
       * phương và đếm nhầm cột chưa đọc.
       *
       * Suy từ `customerUserId` là AN TOÀN vì hai vế của phạm vi rời nhau theo định nghĩa: vế gian
       * hàng loại trừ chính những hội thoại mà người này là khách (`chatInboxScope`).
       */
      data: rows.map((c) => toSummary(c, sideOfRow(c, userId))),
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
    inbox: ChatInbox,
  ): Promise<ConversationSummaryDto> {
    /*
     * `unified` ⇒ KHÔNG ép vai: hộp thư hợp nhất chứa cả hai, nên một deep link `?c=` mở ở đó
     * phải mở được hội thoại của bất kỳ vai nào mà người gọi có quyền. `resolveAccess` tự suy vai
     * khi không được truyền `expected` — và vẫn ném 403 nếu họ không thuộc vai nào.
     *
     * Hai giá trị kia vẫn ÉP vai, giữ nguyên hành vi cũ: `?c=` của hộp thư khách dán vào
     * `/manage/chat` không mở được, vì đó là hai màn với hai tập thông tin khác nhau.
     */
    const expected = inbox === CHAT_INBOX.UNIFIED ? undefined : (inbox as ChatSide);
    const { side } = await this.resolveAccess(userId, conversationId, expected);
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

        await this.notifyOtherSide(tx, conversation, side, userId, {
          text,
          attachmentCount: attachments.length,
          messageType,
        });

        /*
         * Badge đổi cho CẢ HAI phía: phía đối diện +1, phía người gửi về 0. Ghi một dòng tín hiệu
         * trong CÙNG transaction với tin nhắn — đẩy sang Firestore là việc của worker, vì một lời
         * gọi mạng tới Google ở đây biến sự cố của Firebase thành sự cố của chat (ADR 0009).
         */
        await markBadgesDirty(
          tx,
          await this.badgeAudience(tx, conversation, [CHAT_SIDE.CUSTOMER, CHAT_SIDE.SHOP]),
        );

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
    const { conversation, side } = await this.resolveAccess(userId, conversationId);
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

      // Chỉ bề mặt vừa đọc — bộ đếm bên kia không hề đổi. Phía gian hàng thì là cả đội, vì
      // bộ đếm ấy dùng chung.
      await markBadgesDirty(tx, await this.badgeAudience(tx, conversation, [side]));
    });

    return { conversationId, unread: 0 };
  }

  /**
   * Tổng tin chưa đọc của MỘT bề mặt, gộp mọi hội thoại — cho badge icon chat.
   *
   * Phép đếm nằm ở `@xeprime/prisma` chứ không ở đây: worker cần đúng nó để chiếu badge sang
   * Firestore, và hai bản sao của một phép đếm là hai con số sẽ lệch nhau.
   */
  async unreadCount(userId: string, inbox: ChatInbox): Promise<{ count: number }> {
    /*
     * Hợp nhất KHÔNG gộp được vào một phép `aggregate`: hai vế đếm hai CỘT khác nhau
     * (`unread_customer_count` ↔ `unread_tenant_count`), nên một câu `SUM` không chọn được cột
     * theo từng dòng. Cộng hai phép đếm là đúng vì hai vế rời nhau — xem `chatInboxScope`.
     */
    if (inbox === CHAT_INBOX.UNIFIED) {
      const chat = await computeChatUnread(this.prisma, userId);
      return { count: chat.customer + chat.shop };
    }

    const side = inbox as ChatSide;
    const tenantIds =
      side === CHAT_SIDE.SHOP ? await activeTenantIdsOf(this.prisma, userId) : [];
    return { count: await chatUnreadOf(this.prisma, userId, side, tenantIds) };
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
    const chat = await computeChatUnread(this.prisma, userId);
    return { customer: chat.customer, shop: chat.shop, total: chat.customer + chat.shop };
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
    inbox: ChatInbox,
    filters: { q?: string; unreadOnly?: boolean },
  ): Promise<Prisma.ConversationWhereInput | null> {
    const q = filters.q?.trim();
    const search = q ? { contains: q, mode: Prisma.QueryMode.insensitive } : undefined;
    const hasCustomerHalf = inbox !== CHAT_INBOX.SHOP;
    const hasShopHalf = inbox !== CHAT_INBOX.CUSTOMER;

    const tenantIds = hasShopHalf ? await activeTenantIdsOf(this.prisma, userId) : [];
    /*
     * Không thuộc gian hàng nào:
     *  - hộp thư gian hàng ⇒ `null`, nơi gọi trả danh sách rỗng thay vì dựng một `IN ()`;
     *  - hộp thư HỢP NHẤT ⇒ vẫn còn vế khách. Trả `null` ở đây sẽ giấu mất hộp thư của chính họ
     *    vì một lý do không liên quan (chưa mở gian hàng).
     */
    if (inbox === CHAT_INBOX.SHOP && tenantIds.length === 0) return null;
    const scopeInbox = tenantIds.length === 0 ? CHAT_INBOX.CUSTOMER : inbox;

    /*
     * Mệnh đề gom bằng `AND`, KHÔNG bằng `Object.assign` + gán thẳng `where.OR` như bản trước.
     *
     * Phạm vi của hộp thư hợp nhất ĐÃ là một `OR`, nên gán `where.OR` cho tìm kiếm sẽ ghi đè
     * chính phạm vi đó — kết quả là một truy vấn không còn ràng buộc quyền sở hữu nào. Đó không
     * phải lỗi giao diện; đó là hộp thư của người khác hiện ra trong ô tìm kiếm của mình.
     */
    const and: Prisma.ConversationWhereInput[] = [
      chatInboxScope(scopeInbox, userId, tenantIds),
    ];

    if (filters.unreadOnly) {
      /*
       * "Chưa đọc" đọc CỘT khác nhau theo vai, nên ở hộp thư hợp nhất nó phải đi kèm vai của chính
       * dòng đó — một `unreadTenantCount > 0` áp lên hội thoại mình là khách sẽ lọc theo số chưa
       * đọc CỦA GIAN HÀNG KIA.
       */
      const unreadHalves: Prisma.ConversationWhereInput[] = [];
      if (hasCustomerHalf) {
        unreadHalves.push({ customerUserId: userId, unreadCustomerCount: { gt: 0 } });
      }
      if (hasShopHalf && tenantIds.length > 0) {
        unreadHalves.push({
          NOT: { customerUserId: userId },
          unreadTenantCount: { gt: 0 },
        });
      }
      and.push(unreadHalves.length === 1 ? unreadHalves[0]! : { OR: unreadHalves });
    }

    if (search) {
      /*
       * Cùng một từ khoá tìm trong TÊN PHÍA BÊN KIA — và phía bên kia là ai thì tuỳ vai. Ở hộp thư
       * hợp nhất, cả hai cách hiểu đều hợp lệ, nên gộp cả hai: gõ tên một gian hàng ra hội thoại
       * mình là khách, gõ tên một khách ra hội thoại mình là chủ. Tên xe đúng với cả hai vai.
       */
      const nameSearch: Prisma.ConversationWhereInput[] = [{ vehicle: { name: search } }];
      if (hasCustomerHalf) nameSearch.push({ tenant: { name: search } });
      if (hasShopHalf) nameSearch.push({ customer: { displayName: search } });
      and.push({ OR: nameSearch });
    }

    return and.length === 1 ? and[0]! : { AND: and };
  }

  /**
   * Báo cho PHÍA ĐỐI DIỆN có tin nhắn mới — trong cùng transaction với chính tin nhắn đó.
   *
   * Ba luật, và cả ba đều đã có người vi phạm ở nơi khác:
   *
   *  1. **Không bao giờ báo cho người gửi.** Hiển nhiên, nhưng `emitToTenantMembers` fan-out cho
   *     MỌI thành viên, và nhân viên gian hàng vừa gõ xong câu trả lời cũng là một thành viên.
   *  2. **Không báo cho người đang là KHÁCH của chính thread này**, kể cả khi họ là thành viên
   *     gian hàng. Chủ shop nhắn hỏi thuê xe của shop khác là việc riêng của họ; hộp thư gian
   *     hàng không liệt kê thread đó (`inboxWhere`), nên thông báo dẫn tới nó cũng vô nghĩa.
   *  3. **Nội dung tin KHÔNG vào thông báo.** Chat là riêng tư, còn thông báo thì hiện ở màn
   *     khoá và đi qua log của OS (ADR 0009). Câu chữ dừng ở "bạn có tin nhắn mới".
   *
   * Chỉ chạy trên nhánh tin THẬT SỰ MỚI: `sendMessage` trả về sớm ở cả hai nhánh phát lại theo
   * `clientMessageId` (đường tắt và nhánh bắt P2002), nên một lần retry của client không đẻ
   * thêm thông báo — bất biến đó nằm ở chỗ hàm này được gọi bên TRONG transaction tạo tin.
   */
  private async notifyOtherSide(
    tx: Prisma.TransactionClient,
    conversation: ConversationAccessRow,
    senderSide: ChatSide,
    senderUserId: string,
    message: { text: string | null; attachmentCount: number; messageType: string },
  ): Promise<void> {
    /*
     * Tiêu đề là tên PHÍA GỬI, không phải tên người gửi cụ thể: khách thấy tên gian hàng, gian
     * hàng thấy tên khách. Người trực chat đổi ca là chuyện nội bộ của gian hàng — khách không
     * nên thấy một cái tên lạ mỗi lần, và danh tính từng nhân viên không cần rời khỏi hệ thống.
     */
    const copy = chatNotificationCopy({
      senderName:
        senderSide === CHAT_SIDE.CUSTOMER
          ? (conversation.customer?.displayName ?? null)
          : (conversation.tenant?.name ?? null),
      text: message.text,
      attachmentCount: message.attachmentCount,
      messageType: message.messageType,
    });

    const payload = {
      type: NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED,
      title: copy.title,
      body: copy.body,
      tenantId: conversation.tenantId,
      targetType: NOTIFICATION_TARGET_TYPE.CONVERSATION,
      targetId: conversation.id,
    } as const;

    if (senderSide === CHAT_SIDE.CUSTOMER) {
      await this.notifications.emitToTenantMembers(conversation.tenantId, payload, tx, {
        excludeUserIds: [senderUserId, conversation.customerUserId],
      });
      return;
    }

    // Khách vãng lai (không có tài khoản) không có ai để báo — gian hàng liên hệ qua điện thoại.
    if (!conversation.customerUserId) return;
    await this.notifications.emitToUser(conversation.customerUserId, payload, tx);
  }

  /**
   * Ai nhìn thấy con số chưa đọc của hội thoại này đổi — và vì thế phải được chiếu lại badge.
   *
   * Nhận DANH SÁCH bề mặt vì hai tình huống khác nhau hẳn:
   *
   *  - `markRead` chỉ chạm MỘT bộ đếm. Khách mở thread thì con số của gian hàng không đổi, và
   *    đánh dấu cả đội ở đó nghĩa là một lần mở hội thoại ở shop 30 người sinh 31 lượt chiếu cho
   *    một thay đổi ảnh hưởng đúng một người — đúng thứ mà cả thiết kế này muốn tránh.
   *  - `sendMessage` chạm CẢ HAI: phía đối diện +1, phía người gửi về 0.
   *
   * Phía gian hàng luôn là TOÀN ĐỘI, vì `unread_tenant_count` là bộ đếm dùng chung: một nhân
   * viên đọc thì con số của mọi người cùng về 0.
   */
  private async badgeAudience(
    tx: Prisma.TransactionClient,
    conversation: { tenantId: string; customerUserId: string | null },
    sides: readonly ChatSide[],
  ): Promise<string[]> {
    const audience: (string | null)[] = [];
    if (sides.includes(CHAT_SIDE.CUSTOMER)) audience.push(conversation.customerUserId);
    if (sides.includes(CHAT_SIDE.SHOP)) {
      audience.push(...(await activeMemberIdsOf(tx, conversation.tenantId)));
    }
    return audience.filter((id): id is string => typeof id === 'string');
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
  ): Promise<{ conversation: ConversationAccessRow; side: ChatSide }> {
    /*
     * Tên hai phía đi kèm luôn: thông báo tin nhắn lấy TÊN NGƯỜI GỬI làm tiêu đề
     * (`chatNotificationCopy`), và nạp chúng ở đây thì `sendMessage` không phải bắn thêm một
     * truy vấn nữa BÊN TRONG transaction ghi tin — chỗ mà mọi mili giây đều nằm trên đường
     * giữ khoá.
     */
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        tenantId: true,
        customerUserId: true,
        tenant: { select: { name: true } },
        customer: { select: { displayName: true } },
      },
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

/**
 * Hội thoại ở dạng tối thiểu cho kiểm quyền — cộng TÊN hai phía.
 *
 * Tên có mặt vì một lý do duy nhất: dựng tiêu đề thông báo tin nhắn. Khai tường minh thay vì
 * `ConversationGetPayload` của `CONVERSATION_SELECT` (bản đầy đủ, có logo/ảnh xe/đếm chưa đọc)
 * để không ai vô tình dựa vào một trường mà truy vấn này không nạp.
 */
type ConversationAccessRow = {
  id: string;
  tenantId: string;
  customerUserId: string | null;
  tenant: { name: string } | null;
  customer: { displayName: string | null } | null;
};

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

/**
 * VAI của người xem trong MỘT hội thoại.
 *
 * Suy từ dữ liệu của chính dòng đó, không từ tham số truy vấn — xem docblock ở `listConversations`.
 * An toàn vì hai vế của `chatInboxScope` rời nhau: một hội thoại mà người này là khách không bao
 * giờ nằm trong vế gian hàng, kể cả khi họ là chủ chính gian hàng đó.
 */
function sideOfRow(c: { customerUserId: string | null }, userId: string): ChatSide {
  return c.customerUserId === userId ? CHAT_SIDE.CUSTOMER : CHAT_SIDE.SHOP;
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
