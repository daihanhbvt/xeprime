'use client';

import { useMutation } from '@tanstack/react-query';
import { chatApi } from '../api';

/**
 * Khách mở/lấy hội thoại với shop về một xe (dùng ở nút "Nhắn shop").
 *
 * Không cần chống double-click ở đây: endpoint idempotent theo (khách, xe) và bất biến đó là
 * unique ở DB (`conversations_customer_vehicle_key`), nên mười cú bấm vẫn ra đúng một thread.
 * Nút vẫn khoá lúc đang gửi — nhưng để tránh mười request thừa, không phải để tránh mười thread.
 */
export function useStartConversation() {
  return useMutation({ mutationFn: (vehicleId: string) => chatApi.start(vehicleId) });
}
