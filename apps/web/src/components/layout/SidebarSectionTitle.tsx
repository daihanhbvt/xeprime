'use client';

import { DownOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { NavBadge } from './NavBadge';
import { needsActionLabel } from './needs-action-label';
import styles from './SidebarSectionTitle.module.css';

export interface SidebarSectionTitleProps {
  label: string;
  expanded: boolean;
  /** Khối luôn hiện (Tổng quan, Hỗ trợ) — nhãn tĩnh, không có nút gập. */
  pinned?: boolean;
  /** Việc cần xử lý đang bị giấu bên trong khối đã gập. */
  badgeCount?: number;
  /** Trong số việc bị giấu có việc trễ / sắp trễ — huy hiệu đỏ. */
  badgeUrgent?: boolean;
  onToggle: () => void;
}

/**
 * Nhãn của một khối menu — chữ nhỏ in hoa, và là NÚT GẬP khi khối gập được.
 *
 * `type: 'group'` của AntD Menu không có khái niệm gập, nên phần gập nằm ở đây: nơi gọi dựng
 * khối với `children: []` khi gập, còn nút này chỉ báo trạng thái và phát tín hiệu đảo. Đổi lại
 * là menu vẫn là MỘT cây AntD duy nhất — không có cây thứ hai cho chế độ gập, và điều hướng
 * bằng bàn phím vẫn do AntD lo.
 *
 * Khối "ghim" dựng ra một `<span>` chứ không phải `<button>` bị vô hiệu hoá: một nút không làm
 * gì vẫn nằm trong luồng Tab và vẫn hứa hẹn một hành động không tồn tại.
 */
export function SidebarSectionTitle({
  label,
  expanded,
  pinned = false,
  badgeCount = 0,
  badgeUrgent = false,
  onToggle,
}: SidebarSectionTitleProps) {
  const t = useTranslations('ManageCommon');

  if (pinned) {
    return <span className={styles.title}>{label}</span>;
  }

  const action = expanded
    ? t('shell.collapseSection', { name: label })
    : t('shell.expandSection', { name: label });
  const accessibleName =
    badgeCount > 0 ? `${action}, ${needsActionLabel(t, badgeCount, badgeUrgent)}` : action;

  return (
    <button
      type="button"
      className={cx(styles.title, styles.toggle)}
      aria-expanded={expanded}
      aria-label={accessibleName}
      onClick={onToggle}
    >
      <span className={styles.text}>{label}</span>
      <NavBadge count={badgeCount} urgent={badgeUrgent} />
      <DownOutlined className={cx(styles.chevron, !expanded && styles.chevronClosed)} aria-hidden />
    </button>
  );
}
