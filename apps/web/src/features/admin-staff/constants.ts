'use client';

import { PLATFORM_ROLE_VALUES } from '@xeprime/types';
import { useMemo } from 'react';

import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Mọi vai trò nền tảng đều gán được (kể cả Super Admin — khác tenant, super admin không duy nhất
 * theo cấu trúc; BE chặn hạ/gỡ Super Admin cuối cùng). Nhãn theo ngôn ngữ đang dùng (`Domain`).
 */
export function usePlatformRoleOptions(): { value: string; label: string }[] {
  const dl = useDomainLabel();
  return useMemo(
    () => PLATFORM_ROLE_VALUES.map((role) => ({ value: role, label: dl('platformRole', role) })),
    [dl],
  );
}
