import { apiGet, apiPatch } from '@/services/api-client';
import type { UpdateProfileInput, UserProfile } from './types';

/** GET /users/me — hồ sơ của chính mình. Khác `/auth/me` (scope + quyền) ở chỗ có `phone`. */
export const fetchMyProfile = (): Promise<UserProfile> => apiGet<UserProfile>('/users/me');

/**
 * PATCH /users/me — backend CHỈ nhận `displayName` và `avatarUrl`.
 * `email`/`phone` là khoá nhận diện, đổi phải đi qua luồng xác thực riêng (chưa có) — nên UI
 * để read-only thay vì giả vờ sửa được rồi im lặng bỏ qua.
 */
export const updateMyProfile = (input: UpdateProfileInput): Promise<UserProfile> =>
  apiPatch<UserProfile>('/users/me', input);
