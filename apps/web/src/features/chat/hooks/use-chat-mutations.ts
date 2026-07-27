'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { sendChatMessage, startConversation } from '../api';
import type { SendMessageInput } from '../types';

/** Gửi tin → làm mới danh sách hội thoại (last message + unread denorm). */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SendMessageInput) => sendChatMessage(conversationId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() });
    },
  });
}

/** Khách mở/lấy hội thoại với shop về một xe (dùng ở nút "Nhắn shop"). */
export function useStartConversation() {
  return useMutation({ mutationFn: (vehicleId: string) => startConversation(vehicleId) });
}
