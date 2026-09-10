import type { components } from '@xeprime/types';
import type { Paged } from '@/services/api-client';

/**
 * Shape chat lấy từ contract OpenAPI (ADR 0007) — bản của WEB.
 *
 * ADR 0031: web và app native mỗi bên giữ tầng gọi API riêng; bản của app ở
 * `apps/mobile/src/api/chat/api.ts`. Đổi contract chat thì sửa CẢ HAI.
 */
type Schemas = components['schemas'];

export type ConversationSummary = Schemas['ConversationSummaryDto'];
export type ChatMessage = Schemas['MessageDto'];
export type MessageAttachment = Schemas['MessageAttachmentDto'];
export type SendMessageInput = Schemas['SendMessageDto'];
export type ChatAttachmentPresign = Schemas['PresignResultDto'];
export type FirebaseChatToken = Schemas['FirebaseTokenDto'];
export type ChatUnreadSummary = Schemas['ChatUnreadSummaryDto'];

export type ConversationListResult = Paged<ConversationSummary>;

export interface ConversationFilters {
  /** `CHAT_SIDE.CUSTOMER` | `CHAT_SIDE.SHOP` — bắt buộc, xem docblock của `chatApi`. */
  side: string;
  q?: string;
  unreadOnly?: boolean;
}

/** Cursor keyset của lịch sử tin nhắn — hai nửa đi cùng nhau, không tách rời. */
export interface MessageCursor {
  before: string;
  beforeId: string | null;
}

export interface MessagePage {
  data: ChatMessage[];
  next: MessageCursor | null;
}
