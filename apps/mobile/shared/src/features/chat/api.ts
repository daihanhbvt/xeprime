// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  chatApi,
  conversationFiltersToParams,
  CONVERSATIONS_DEFAULT_LIMIT,
  MESSAGES_DEFAULT_LIMIT,
} from '@/api/chat/api';

export type {
  ChatAttachmentPresign,
  ChatMessage,
  ChatUnreadSummary,
  ConversationFilters,
  ConversationListResult,
  ConversationSummary,
  FirebaseChatToken,
  MessageAttachment,
  MessageCursor,
  MessagePage,
  SendMessageInput,
} from '@/api/chat/api';
