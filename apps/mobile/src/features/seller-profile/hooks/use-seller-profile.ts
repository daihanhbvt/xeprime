import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { sellerProfileApi, type SaveSellerProfileInput } from '../api';

/**
 * Hồ sơ người bán của gian hàng đang mở (`GET /seller-profile`).
 *
 * Query key dùng chung với web (`queryKeys.sellerProfile.me()`): hai client cùng một nhánh cache,
 * nên lưu ở đây thì màn nào của app đọc hồ sơ cũng thấy bản mới.
 */
export function useSellerProfile(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.sellerProfile.me(),
    queryFn: () => sellerProfileApi.me(),
    // `enabled` để màn TẮT hẳn request khi người dùng thiếu `seller_profile.view` — gọi rồi mới
    // hiện 403 là một vòng mạng thừa và một lỗi trong log không nói lên điều gì.
    enabled: options?.enabled ?? true,
  });
}

export function useSaveSellerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSellerProfileInput) => sellerProfileApi.save(body),
    // Server trả bản vừa lưu — ghi thẳng vào cache thay vì bắt màn gọi lại một vòng nữa.
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.sellerProfile.me(), profile),
  });
}

/**
 * Gửi hồ sơ đi xác minh.
 *
 * Server trả bản đã đổi trạng thái (`submitted`) — ghi thẳng vào cache như `save`, để nhãn trạng
 * thái trên header và mấy khối cảnh báo đổi ngay mà không cần một vòng đọc lại.
 */
export function useSubmitSellerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sellerProfileApi.submit(),
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.sellerProfile.me(), profile),
  });
}
