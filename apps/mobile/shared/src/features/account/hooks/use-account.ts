import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { accountApi, type UpdateProfileInput, type UserProfile } from '../api';

/**
 * Hồ sơ tài khoản của chính mình (`GET /users/me`).
 *
 * KHÁC `useCurrentUser()` (`/auth/me`): cái kia là PHIÊN — scope, gian hàng, danh sách quyền đọc
 * lại từ DB mỗi request. Cái này là CON NGƯỜI — có `phone`, `phoneVerified`, và là thứ màn Tài
 * khoản sửa. Gộp hai nguồn lại là để một màn sửa hồ sơ ghi đè lên trạng thái phiên.
 */
export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.account.profile(),
    queryFn: () => accountApi.me(),
    // 401 = chưa đăng nhập, là trạng thái hợp lệ chứ không phải lỗi cần thử lại.
    retry: false,
  });
}

/**
 * Cập nhật hồ sơ.
 *
 * Sau khi lưu phải đồng bộ CẢ HAI nguồn: `account.profile` (màn này) và `auth.me` (tên + avatar
 * ở header, thẻ gian hàng, mọi nơi khác đọc từ đó). Thiếu vế thứ hai thì đổi tên xong header vẫn
 * hiện tên cũ cho tới lần mở app sau — đúng lỗi web đã đóng bằng cùng hai dòng này.
 */
export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => accountApi.updateMe(input),
    onSuccess: (profile: UserProfile) => {
      queryClient.setQueryData(queryKeys.account.profile(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });
}
