import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_MIME_TYPES } from '@xeprime/types';
import { ApiClientError, apiGet, apiPost, apiRequest, fetchPage } from '@/services/api-client';
import { uploadToR2 } from '@/services/upload';
import type {
  ChatAttachmentPresign,
  ChatMessage,
  ConversationFilters,
  ConversationListResult,
  ConversationSummary,
  FirebaseChatToken,
  MessageCursor,
  MessagePage,
  SendMessageInput,
} from './types';

/**
 * Lối gọi API chat của WEB.
 *
 * ADR 0031: app native có bản riêng ở `apps/mobile/src/api/chat/api.ts`. Đường dẫn, tham số và
 * cách bóc phong bì phải khớp nhau — chúng gọi cùng một backend — nhưng sửa một bên KHÔNG còn
 * tự động sang bên kia.
 *
 * `side` là tham số BẮT BUỘC của mọi lời gọi đọc danh sách, và đó là chủ đích: một tài khoản có
 * thể vừa thuê xe của gian hàng khác vừa là nhân viên gian hàng mình, nên "hội thoại của tôi"
 * không phải một khái niệm — nó là hai hộp thư. Bắt buộc ở chữ ký hàm nghĩa là không có nơi gọi
 * nào quên nó và nhận về một danh sách trộn.
 */
const CONVERSATIONS_DEFAULT_LIMIT = 20;
const MESSAGES_DEFAULT_LIMIT = 30;

interface MessageEnvelope {
  data: ChatMessage[];
  nextBefore?: string | null;
  nextBeforeId?: string | null;
}

export const chatApi = {
  list(filters: ConversationFilters, page: number): Promise<ConversationListResult> {
    return fetchPage<ConversationSummary>(
      '/conversations',
      {
        side: filters.side,
        page,
        limit: CONVERSATIONS_DEFAULT_LIMIT,
        ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
        ...(filters.unreadOnly ? { unreadOnly: true } : {}),
      },
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
    return apiGet<ConversationSummary>(`/conversations/${encodeURIComponent(id)}`, { side });
  },

  /** Khách mở/lấy hội thoại với shop về một xe. Idempotent ở DB — bấm nhiều lần vẫn một thread. */
  start(vehicleId: string): Promise<ConversationSummary> {
    return apiPost<ConversationSummary>('/conversations', { vehicleId });
  },

  async messages(conversationId: string, cursor?: MessageCursor | null): Promise<MessagePage> {
    const res = (await apiRequest<ChatMessage[]>(
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
      next: res.nextBefore ? { before: res.nextBefore, beforeId: res.nextBeforeId ?? null } : null,
    };
  },

  send(conversationId: string, body: SendMessageInput): Promise<ChatMessage> {
    return apiPost<ChatMessage>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      body,
    );
  },

  markRead(conversationId: string): Promise<{ conversationId: string; unread: number }> {
    return apiPost<{ conversationId: string; unread: number }>(
      `/conversations/${encodeURIComponent(conversationId)}/read`,
    );
  },

  firebaseToken(): Promise<FirebaseChatToken> {
    return apiPost<FirebaseChatToken>('/chat/firebase-token');
  },

  presignAttachment(meta: {
    fileName: string;
    contentType: string;
    fileSize: number;
  }): Promise<ChatAttachmentPresign> {
    return apiPost<ChatAttachmentPresign>('/chat/attachments/presign', meta);
  },
};

/** `accept` của `<input type="file">` — dựng từ chính bộ MIME dùng chung, không gõ lại chuỗi. */
export const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_MIME_TYPES.join(',');

export type ChatAttachmentRejection = 'type' | 'tooLarge';

/**
 * Chặn tệp sai TRƯỚC khi presign — báo ngay thay vì để người dùng chờ hết một vòng upload rồi
 * mới nhận 400. Trần thật vẫn ở backend; đây là phép lịch sự, không phải lớp bảo vệ.
 */
export function validateChatAttachment(file: File): ChatAttachmentRejection | null {
  if (!(CHAT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return 'tooLarge';
  return null;
}

export interface UploadedChatAttachment {
  url: string;
  fileType: string;
  fileName: string;
  fileSize: number;
}

/**
 * Presign → PUT thẳng R2 → trả metadata để gắn vào tin nhắn (ADR 0009 §5).
 *
 * `onProgress` đi tới `uploadToR2`, nơi đã có nhánh `XMLHttpRequest` cho phần trăm thật — một
 * thanh tiến trình giả (nhảy 0 → 100) nói dối đúng lúc người dùng cần biết còn bao lâu.
 */
export async function uploadChatAttachment(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedChatAttachment> {
  const rejection = validateChatAttachment(file);
  if (rejection) {
    throw new ApiClientError({
      code: `CHAT_ATTACHMENT_${rejection}`,
      message: `Chat attachment rejected: ${rejection}`,
      status: 0,
    });
  }

  const contentType = file.type || 'application/octet-stream';
  const ticket: ChatAttachmentPresign = await chatApi.presignAttachment({
    fileName: file.name,
    contentType,
    fileSize: file.size,
  });
  await uploadToR2(ticket.uploadUrl, file, onProgress);

  return {
    url: ticket.publicUrl,
    fileType: contentType,
    fileName: file.name,
    fileSize: file.size,
  };
}
