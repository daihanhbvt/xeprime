'use client';

import { useTranslations } from 'next-intl';
import type { TenantRole } from '@xeprime/types';
import styles from './RoleOption.module.css';

/**
 * Một dòng của ô chọn vai: "Quản lý gian hàng · điều hành mọi hoạt động" (Figma `24035:69694`).
 * Dùng chung cho hộp Thêm nhân viên và hộp Chỉnh sửa.
 */
export function RoleOption({ value, label }: { value: string; label: string }) {
  const t = useTranslations('Members.roleShortHint');
  return (
    <span className={styles.option}>
      {label}
      <span className={styles.hint}>{t(value as TenantRole)}</span>
    </span>
  );
}
