/**
 * Shape chat lấy từ contract OpenAPI qua `@xeprime/api-client` (ADR 0007) — không viết tay lại
 * DTO, và không khai lần thứ hai ở web: app native import đúng những type này.
 */
export type {
  ChatAttachmentPresign,
  ChatMessage,
  ConversationFilters,
  ConversationListResult,
  ConversationSummary,
  FirebaseChatToken,
  MessageAttachment,
  MessageCursor,
  MessagePage,
  SendMessageInput,
} from '@xeprime/api-client';
