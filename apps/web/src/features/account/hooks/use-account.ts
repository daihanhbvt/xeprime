'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchMyProfile, updateMyProfile } from '../api';
import type { UpdateProfileInput, UserProfile } from '../types';

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.account.profile(),
    queryFn: fetchMyProfile,
    // 401 = chưa đăng nhập, là trạng thái hợp lệ chứ không phải lỗi cần thử lại.
    retry: false,
  });
}

/**
 * Cập nhật hồ sơ.
 *
 * Sau khi lưu phải đồng bộ BA nguồn: `account.profile` (trang này), `auth.me` (header, avatar,
 * menu ở khắp nơi đọc từ đó) và `shop` — từ 16/09/2026 khối "Chủ gian hàng" ở `/manage/shop`
 * hiện tên chủ đọc từ tài khoản, nên đổi tên ở đây phải hiện ngay bên đó.
 */
export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMyProfile(input),
    onSuccess: (profile: UserProfile) => {
      queryClient.setQueryData(queryKeys.account.profile(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
    },
  });
}
