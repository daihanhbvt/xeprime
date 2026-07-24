'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchMyShop, registerShop, submitShopReview, updateShopProfile } from '../api';
import type { RegisterShopInput, UpdateProfileInput } from '../types';

/** Hồ sơ gian hàng của tôi. Chỉ gọi khi user đã thuộc một gian hàng. */
export function useMyShop(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.shop.current(),
    queryFn: fetchMyShop,
    enabled,
  });
}

/** Sau đăng ký: user chuyển từ "chưa có gian hàng" → có, nên phải làm mới cả /auth/me. */
export function useRegisterShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterShopInput) => registerShop(body),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useUpdateShopProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => updateShopProfile(body),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop.current(), shop);
    },
  });
}

/** Gửi duyệt đổi trạng thái tenant → làm mới cả /auth/me (banner AppShell đọc status ở đó). */
export function useSubmitShopReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitShopReview(),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}
