import { PLATFORM_ROLE_LABEL, PLATFORM_ROLE_VALUES } from '@xeprime/types';

/**
 * Mọi vai trò nền tảng đều gán được (kể cả Super Admin — khác tenant, super admin không duy
 * nhất theo cấu trúc; BE chặn hạ/gỡ Super Admin cuối cùng).
 */
export const PLATFORM_ROLE_OPTIONS = PLATFORM_ROLE_VALUES.map((role) => ({
  value: role,
  label: PLATFORM_ROLE_LABEL[role],
}));
