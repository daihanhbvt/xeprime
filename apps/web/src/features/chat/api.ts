import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, apiRequest, fetchPage, type Paged } from '@/services/api-client';
import type {
  ChatMessage,
  ConversationSummary,
  FirebaseChatToken,
  PresignResult,
  SendMessageInput,
} from './types';

export const CONVERSATIONS_LIMIT = DEFAULT_PAGE_SIZE;

export type ConversationListResult = Paged<ConversationSummary>;

export const fetchConversations = (page = 1): Promise<ConversationListResult> =>
  fetchPage<ConversationSummary>(
    '/conversations',
    { page, limit: CONVERSATIONS_LIMIT },
    CONVERSATIONS_LIMIT,
  );

export const startConversation = (vehicleId: string): Promise<ConversationSummary> =>
  apiPost<ConversationSummary>('/conversations', { vehicleId });

export const fetchChatUnreadCount = (): Promise<{ count: number }> =>
  apiGet<{ count: number }>('/conversations/unread-count');

export interface MessagePage {
  data: ChatMessage[];
  nextBefore: string | null;
}

/** Endpoint trả `{ data, nextBefore }` (không bọc thêm lớp data — ResponseInterceptor). */
export async function fetchMessages(conversationId: string, before?: string): Promise<MessagePage> {
  const res = await apiRequest<ChatMessage[]>(`/conversations/${conversationId}/messages`, {
    query: before ? { before } : undefined,
  });
  const nextBefore = (res as { nextBefore?: string | null }).nextBefore ?? null;
  return { data: res.data, nextBefore };
}

export const sendChatMessage = (
  conversationId: string,
  body: SendMessageInput,
): Promise<ChatMessage> => apiPost<ChatMessage>(`/conversations/${conversationId}/messages`, body);

export const markConversationRead = (
  conversationId: string,
): Promise<{ conversationId: string; unread: number }> =>
  apiPost(`/conversations/${conversationId}/read`);

export const fetchFirebaseChatToken = (): Promise<FirebaseChatToken> =>
  apiPost<FirebaseChatToken>('/chat/firebase-token');

export const presignChatAttachment = (
  fileName: string,
  contentType: string,
): Promise<PresignResult> =>
  apiPost<PresignResult>('/chat/attachments/presign', { fileName, contentType });

/** Upload R2 dùng chung toàn app — chuyển về services/upload (skill shared-code). */
export { uploadToR2 } from '@/services/upload';
