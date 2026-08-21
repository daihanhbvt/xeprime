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

/**
 * Đăng ký gian hàng.
 *
 * `POST /tenants` TRẢ VỀ hồ sơ vừa tạo, nên nó được nạp thẳng vào cache của màn hồ sơ: người
 * dùng vừa bấm xong là thấy trang `/manage/shop` có nội dung, không phải ngồi nhìn spinner của
 * một lần fetch lại thứ mình vừa nhận. Trước đây chỗ này gọi `invalidateQueries()` KHÔNG khoá —
 * xoá sạch mọi query trong ứng dụng, kể cả những nhánh chẳng liên quan gì tới việc mở gian hàng.
 *
 * `auth.me` thì phải làm mới thật: user vừa chuyển từ "chưa có gian hàng" sang có, và cả khung
 * quản lý (sidebar, quyền, dải trạng thái) đọc scope từ đó.
 */
export function useRegisterShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterShopInput) => registerShop(body),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    },
  });
}

/**
 * Lưu hồ sơ.
 *
 * Đổi tỉnh/thành ở hồ sơ là backend DỜI CHI NHÁNH MẶC ĐỊNH và đồng bộ lại vị trí công khai của
 * xe thuộc chi nhánh đó — nên hai nhánh cache kia cũng cũ theo, không riêng gì `shop.current`.
 * Bỏ sót chúng thì màn Chi nhánh còn hiện tỉnh cũ cho tới lần F5 tiếp theo.
 */
export function useUpdateShopProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => updateShopProfile(body),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
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
