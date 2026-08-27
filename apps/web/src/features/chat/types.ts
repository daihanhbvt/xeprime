import type { components } from '@xeprime/types';

/** Shape chat lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type ConversationSummary = Schemas['ConversationSummaryDto'];
export type ChatMessage = Schemas['MessageDto'];
export type MessageAttachment = Schemas['MessageAttachmentDto'];
export type SendMessageInput = Schemas['SendMessageDto'];
export type PresignResult = Schemas['PresignResultDto'];
export type FirebaseChatToken = Schemas['FirebaseTokenDto'];
