import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { tenantsApi, type RegisterShopInput, type UpdateShopProfileInput } from '../api';

/**
 * Hồ sơ gian hàng của tôi (SHP-02). `enabled` để không gọi khi chưa có membership hoặc thiếu
 * `tenant.view` — gọi rồi nuốt 403 là một request vô nghĩa ở mọi lần mở màn.
 */
export function useMyShop(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.shop.current(),
    queryFn: () => tenantsApi.myShop(),
    enabled,
  });
}

/**
 * Đăng ký gian hàng (SHP-01).
 *
 * `POST /tenants` TRẢ VỀ hồ sơ vừa tạo, nên nó được nạp thẳng vào cache của màn hồ sơ: người dùng
 * vừa bấm xong là thấy màn `/manage/shop` có nội dung, không phải nhìn spinner của một lần fetch
 * lại chính thứ mình vừa nhận.
 *
 * `auth.me` thì phải làm mới THẬT: tài khoản vừa chuyển từ "chưa có gian hàng" sang có, và cả vỏ
 * quản lý (menu, quyền, dải trạng thái, `ScopeGuard`) đọc scope từ đó. Thiếu bước này thì app
 * vẫn nói "bạn chưa có gian hàng" cho tới lần refetch kế tiếp.
 *
 * `branches` vì đăng ký tạo luôn CHI NHÁNH MẶC ĐỊNH ở tỉnh vừa chọn.
 */
export function useRegisterShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterShopInput) => tenantsApi.register(body),
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
 * Bỏ sót chúng thì màn Chi nhánh còn hiện tỉnh cũ cho tới lần mở lại app.
 */
export function useUpdateShopProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateShopProfileInput) => tenantsApi.updateProfile(body),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

/** Gửi duyệt đổi TRẠNG THÁI tenant → làm mới cả `/auth/me` (vỏ quản lý đọc status ở đó). */
export function useSubmitShopReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantsApi.submitReview(),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}
