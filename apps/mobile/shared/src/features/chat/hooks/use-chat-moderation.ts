import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppLocale } from '@xeprime/types';
import { useLocale } from 'use-intl';
import {
  chatApi,
  type ChatReportReason,
  type ReportConversationInput,
} from '@/features/chat/api';
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
 * Lý do báo cáo đang bật — gọi ngay khi mở hội thoại để tấm báo cáo mở ra là có danh sách. Khoá
 * dùng chung với web (`queryKeys.chat.reportReasons`), `staleTime` 5 phút.
 */
export function useChatReportReasons() {
  const locale = useLocale() as AppLocale;
  return useQuery({
    queryKey: queryKeys.chat.reportReasons(),
    queryFn: () => chatApi.reportReasons(),
    staleTime: 5 * 60_000,
    // Chọn nhãn theo NGÔN NGỮ đang hiển thị một lần ở tầng dữ liệu (như `localizeCatalogItem`):
    // mọi chỗ đọc `r.label` tự đúng ngôn ngữ. Lý do chưa có bản tiếng Anh giữ nhãn tiếng Việt.
    select: (rows: ChatReportReason[]) =>
      locale === 'en' ? rows.map((r) => ({ ...r, label: r.labelEn ?? r.label })) : rows,
  });
}

/** Báo cáo hội thoại vi phạm — server chỉ ghi nhận cho nền tảng xem xét. */
export function useReportConversation(conversationId: string) {
  return useMutation({
    mutationFn: (body: ReportConversationInput) => chatApi.report(conversationId, body),
  });
}
