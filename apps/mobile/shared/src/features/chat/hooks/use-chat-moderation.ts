import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ReportConversationInput } from '@/features/chat/api';
import { queryKeys } from '@/queries/query-keys';

/**
 * Chặn / bỏ chặn phía bên kia (App Store Guideline 1.2) — cùng hành vi `useToggleChatBlock` web.
 *
 * Làm mới TOÀN BỘ cache chat: cờ `canSend` / `blockedByMe` nằm trên hội thoại ở cả danh sách lẫn
 * chi tiết, và ở mọi hộp thư (khách, gian hàng, hợp nhất).
 */
export function useToggleChatBlock(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (block: boolean) =>
      block ? chatApi.block(conversationId) : chatApi.unblock(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.all }),
  });
}

/**
 * Báo cáo hội thoại vi phạm — gửi MÃ lý do (`CHAT_REPORT_REASON`), nhãn do client dịch. Server chỉ
 * ghi nhận cho nền tảng xem xét.
 */
export function useReportConversation(conversationId: string) {
  return useMutation({
    mutationFn: (body: ReportConversationInput) => chatApi.report(conversationId, body),
  });
}
