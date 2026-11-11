'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppLocale } from '@xeprime/types';
import { useLocale } from 'next-intl';
import { queryKeys } from '@/services/query-keys';
import { chatApi } from '../api';
import type { ChatReportReason, ConversationTarget, ReportConversationInput } from '../types';

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

/**
 * Lý do báo cáo đang BẬT, theo thứ tự admin sắp. Gọi ngay khi mở hội thoại để hộp báo cáo hiện ra
 * là có danh sách; khoá dùng chung mọi hội thoại và `staleTime` 5 phút nên chuyển qua lại giữa
 * các hội thoại không bắn thêm request.
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
