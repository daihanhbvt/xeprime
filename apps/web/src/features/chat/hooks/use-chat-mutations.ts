'use client';

import { useMutation } from '@tanstack/react-query';
import { chatApi } from '../api';
import type { ConversationTarget } from '../types';

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
