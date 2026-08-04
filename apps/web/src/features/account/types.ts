import type { components } from '@xeprime/types';

/** Hồ sơ tài khoản KHÁCH — lấy từ contract OpenAPI (ADR 0007), không viết tay. */
type Schemas = components['schemas'];

export type UserProfile = Schemas['UserProfileDto'];
export type UpdateProfileInput = Schemas['UpdateMeDto'];
