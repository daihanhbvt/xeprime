'use client';

import { TENANT_ROLE, type TenantRole } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import styles from './RolePill.module.css';

/**
 * Viên vai trò của màn Nhân viên & phân quyền (Figma `24035:69458`): chấm + nhãn, mỗi vai một sắc.
 *
 * Không đi qua `StatusTag`: đây là NHÃN VAI, không phải trạng thái nghiệp vụ, và bảng màu của nó
 * (đen cho chủ, tím cho quan sát viên) không có trong `STATUS_COLOR`.
 */
const TONE: Readonly<Record<TenantRole, string | undefined>> = {
  [TENANT_ROLE.SHOP_OWNER]: styles.owner,
  [TENANT_ROLE.SHOP_MANAGER]: styles.manager,
  [TENANT_ROLE.SHOP_STAFF]: styles.staff,
  [TENANT_ROLE.SHOP_VIEWER]: styles.viewer,
};

export function RolePill({ roleKey }: { roleKey: string }) {
  const domainLabel = useDomainLabel();
  return (
    <span className={cx(styles.pill, TONE[roleKey as TenantRole])}>
      <span className={styles.dot} aria-hidden="true" />
      {domainLabel('tenantRole', roleKey, roleKey)}
    </span>
  );
}
