'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { chatApi } from '../api';
import type { ConversationTarget, ReportConversationInput } from '../types';

/**
 * Chặn / bỏ chặn phía bên kia (App Store 1.2). Làm mới TOÀN BỘ cache chat: cờ `canSend` /
 * `blockedByMe` nằm trên hội thoại ở cả danh sách lẫn chi tiết, và ở cả hai hộp thư.
 */
export function useToggleChatBlock(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (block: boolean) =>
      block ? chatApi.block(conversationId) : chatApi.unblock(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.all }),
  });
}

/** Báo cáo hội thoại vi phạm — gửi MÃ lý do (`CHAT_REPORT_REASON`), nhãn do client dịch. */
export function useReportConversation(conversationId: string) {
  return useMutation({
    mutationFn: (body: ReportConversationInput) => chatApi.report(conversationId, body),
  });
}

/**
 * Khách mở/lấy hội thoại với một gian hàng (dùng ở nút "Nhắn shop" và "Nhắn tin" trang gian hàng).
 *
 * Không cần chống double-click ở đây: endpoint idempotent theo (khách, GIAN HÀNG) và bất biến đó
 * là unique ở DB (`conversations_customer_tenant_key`), nên mười cú bấm vẫn ra đúng một thread —
 * kể cả khi mười cú đó đến từ hai đường vào khác nhau. Nút vẫn khoá lúc đang gửi, nhưng để tránh
 * mười request thừa, không phải để tránh mười thread.
 */
export function useStartConversation() {
  return useMutation({ mutationFn: (target: ConversationTarget) => chatApi.start(target) });
}
