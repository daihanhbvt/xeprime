import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type ConversationSummary = Schemas['ConversationSummaryDto'];
export type ChatMessage = Schemas['MessageDto'];
export type MessageAttachment = Schemas['MessageAttachmentDto'];
export type SendMessageInput = Schemas['SendMessageDto'];
export type ChatAttachmentPresign = Schemas['PresignResultDto'];
export type FirebaseChatToken = Schemas['FirebaseTokenDto'];
export type ChatUnreadSummary = Schemas['ChatUnreadSummaryDto'];

export const CONVERSATIONS_DEFAULT_LIMIT = 20;
export const MESSAGES_DEFAULT_LIMIT = 30;

export interface ConversationFilters {
  /** `CHAT_SIDE.CUSTOMER` | `CHAT_SIDE.SHOP` — bắt buộc, xem docblock của `chatApi`. */
  side: string;
  q?: string;
  unreadOnly?: boolean;
}

export type ConversationListResult = Paged<ConversationSummary>;

/** Cursor keyset của lịch sử tin nhắn — hai nửa đi cùng nhau, không tách rời. */
export interface MessageCursor {
  before: string;
  beforeId: string | null;
}

export interface MessagePage {
  data: ChatMessage[];
  next: MessageCursor | null;
}

export function conversationFiltersToParams(
  filters: ConversationFilters,
  page: number,
): QueryParams {
  return {
    side: filters.side,
    page,
    limit: CONVERSATIONS_DEFAULT_LIMIT,
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.unreadOnly ? { unreadOnly: true } : {}),
  };
}

interface MessageEnvelope {
  data: ChatMessage[];
  nextBefore?: string | null;
  nextBeforeId?: string | null;
}

/**
 * Chat — MỘT client cho web và app native.
 *
 * `side` là tham số BẮT BUỘC của mọi lời gọi đọc danh sách, và đó là chủ đích: một tài khoản có
 * thể vừa thuê xe của gian hàng khác vừa là nhân viên gian hàng mình, nên "hội thoại của tôi"
 * không phải một khái niệm — nó là hai hộp thư. Bắt buộc ở chữ ký hàm nghĩa là không có nơi gọi
 * nào quên nó và nhận về một danh sách trộn.
 */
export const chatApi = {
  list(filters: ConversationFilters, page: number): Promise<ConversationListResult> {
    return getApiClient().fetchPage<ConversationSummary>(
      '/conversations',
      conversationFiltersToParams(filters, page),
      CONVERSATIONS_DEFAULT_LIMIT,
    );
  },

  /**
   * Một hội thoại theo id — đường vào của deep link.
   *
   * Không suy từ danh sách: một thread im lặng ba tuần nằm ở trang 4, và `?c=` trong email hay
   * thông báo đẩy phải mở được nó mà không phải tải hết các trang trước.
   */
  detail(id: string, side: string): Promise<ConversationSummary> {
    return getApiClient().get<ConversationSummary>(`/conversations/${encodeURIComponent(id)}`, {
      side,
    });
  },

  /** Khách mở/lấy hội thoại với shop về một xe. Idempotent ở DB — bấm nhiều lần vẫn một thread. */
  start(vehicleId: string): Promise<ConversationSummary> {
    return getApiClient().post<ConversationSummary>('/conversations', { vehicleId });
  },

  unreadCount(side: string): Promise<{ count: number }> {
    return getApiClient().get<{ count: number }>('/conversations/unread-count', { side });
  },

  /**
   * Chưa đọc của CẢ HAI vai — cho biểu tượng chat trên thanh trên cùng.
   *
   * Khác `unreadCount(side)`: cái kia đếm cho MỘT hộp thư (mục menu trỏ thẳng vào hộp thư đó
   * phải hiện đúng số của nó). Cái này trả lời "có gì đang đợi tôi ở bất kỳ đâu", nên chủ gian
   * hàng đang lướt chợ xe vẫn thấy khách nhắn vào shop.
   */
  unreadSummary(): Promise<ChatUnreadSummary> {
    return getApiClient().get<ChatUnreadSummary>('/conversations/unread-summary');
  },

  async messages(conversationId: string, cursor?: MessageCursor | null): Promise<MessagePage> {
    const res = (await getApiClient().request<ChatMessage[]>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        query: {
          limit: MESSAGES_DEFAULT_LIMIT,
          ...(cursor
            ? { before: cursor.before, ...(cursor.beforeId ? { beforeId: cursor.beforeId } : {}) }
            : {}),
        },
      },
    )) as MessageEnvelope;

    return {
      data: res.data,
      next: res.nextBefore
        ? { before: res.nextBefore, beforeId: res.nextBeforeId ?? null }
        : null,
    };
  },

  send(conversationId: string, body: SendMessageInput): Promise<ChatMessage> {
    return getApiClient().post<ChatMessage>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      body,
    );
  },

  markRead(conversationId: string): Promise<{ conversationId: string; unread: number }> {
    return getApiClient().post<{ conversationId: string; unread: number }>(
      `/conversations/${encodeURIComponent(conversationId)}/read`,
    );
  },

  firebaseToken(): Promise<FirebaseChatToken> {
    return getApiClient().post<FirebaseChatToken>('/chat/firebase-token');
  },

  presignAttachment(meta: {
    fileName: string;
    contentType: string;
    fileSize: number;
  }): Promise<ChatAttachmentPresign> {
    return getApiClient().post<ChatAttachmentPresign>('/chat/attachments/presign', meta);
  },
};
