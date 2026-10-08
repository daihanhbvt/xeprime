import {
  AlertOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  CarOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  FileTextOutlined,
  IdcardOutlined,
  InboxOutlined,
  LockOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  AUDIT_ACTION_CATEGORY,
  auditActionCategoryOf,
  type AuditActionCategory,
} from '@xeprime/types';
import type { ComponentType } from 'react';
import { cx } from '@/lib/cx';
import styles from './AuditCategoryIcon.module.css';

/** Biểu tượng của từng NHÓM hành động — mắt quét theo hình trước khi đọc chữ. */
const ICONS: Readonly<Record<AuditActionCategory, ComponentType>> = {
  [AUDIT_ACTION_CATEGORY.VEHICLE]: CarOutlined,
  [AUDIT_ACTION_CATEGORY.VEHICLE_DOCUMENT]: FileTextOutlined,
  [AUDIT_ACTION_CATEGORY.MAINTENANCE]: ToolOutlined,
  [AUDIT_ACTION_CATEGORY.BOOKING]: CalendarOutlined,
  [AUDIT_ACTION_CATEGORY.BOOKING_REQUEST]: InboxOutlined,
  [AUDIT_ACTION_CATEGORY.FINANCE]: DollarOutlined,
  [AUDIT_ACTION_CATEGORY.BRANCH]: ApartmentOutlined,
  [AUDIT_ACTION_CATEGORY.MEMBER]: TeamOutlined,
  [AUDIT_ACTION_CATEGORY.SUBSCRIPTION]: CrownOutlined,
  [AUDIT_ACTION_CATEGORY.PROFILE]: IdcardOutlined,
  [AUDIT_ACTION_CATEGORY.PARTNER_STATUS]: LockOutlined,
  [AUDIT_ACTION_CATEGORY.CUSTOMER]: UserOutlined,
  [AUDIT_ACTION_CATEGORY.SUPPORT_SESSION]: CustomerServiceOutlined,
  [AUDIT_ACTION_CATEGORY.SUPPORT_CASE]: AlertOutlined,
  [AUDIT_ACTION_CATEGORY.OTHER]: AppstoreOutlined,
};

export function AuditCategoryIcon({
  action,
  size = 'md',
}: {
  action: string;
  size?: 'md' | 'lg';
}) {
  const Icon = ICONS[auditActionCategoryOf(action)];
  return (
    <span className={cx(styles.chip, size === 'lg' && styles.chipLg)} aria-hidden>
      <Icon />
    </span>
  );
}
