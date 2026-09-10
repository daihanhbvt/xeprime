import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Hồ sơ tài khoản của CON NGƯỜI đang đăng nhập (`GET /users/me`). */
export type UserProfile = Schemas['UserProfileDto'];
/**
 * `PATCH /users/me` — backend CHỈ nhận `displayName` và `avatarUrl`.
 *
 * `email`/`phone` là khoá nhận diện, đổi phải đi qua luồng xác thực riêng (chưa có) — nên UI để
 * read-only thay vì giả vờ sửa được rồi im lặng bỏ qua.
 */
export type UpdateProfileInput = Schemas['UpdateMeDto'];

export const accountApi = {
  /**
   * KHÁC `/auth/me`: đó là phiên + scope + quyền (thứ RBAC đọc lại mỗi request), còn đây là hồ
   * sơ con người — có `phone`, `phoneVerified`, và là thứ màn Tài khoản sửa.
   */
  me(): Promise<UserProfile> {
    return getApiClient().get<UserProfile>('/users/me');
  },

  updateMe(body: UpdateProfileInput): Promise<UserProfile> {
    return getApiClient().patch<UserProfile>('/users/me', body);
  },
};
