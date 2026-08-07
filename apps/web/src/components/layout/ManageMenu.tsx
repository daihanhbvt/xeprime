'use client';

import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { cx } from '@/lib/cx';
import styles from './ManageMenu.module.css';

export interface ManageMenuProps {
  items: MenuProps['items'];
  selectedKey?: string;
  /**
   * `dark` = đặt trên nền `--xp-shell-sidebar-bg` (Sidebar desktop).
   * `light` = đặt trên nền trắng (Drawer mobile, tới Batch 1D-C mới đổi sang tối theo
   * `14:1661`). Mặc định `light` để không đổi giao diện mobile ở batch này.
   */
  tone?: 'light' | 'dark';
  /** Thu gọn còn icon. Cùng một `items`, không có cây thứ hai cho chế độ thu gọn. */
  collapsed?: boolean;
}

/**
 * Menu quản lý — dùng chung Sidebar (desktop) và Drawer (mobile).
 *
 * Component này CHỈ lo hiển thị: `items`/`selectedKey` do `useManageNav` dựng (lọc quyền,
 * chọn scope). Thu gọn giao cho `inlineCollapsed` của AntD chứ không dựng cây mục thứ hai —
 * hai bản định nghĩa menu là chỗ để chúng lệch nhau.
 */
export function ManageMenu({
  items,
  selectedKey,
  tone = 'light',
  collapsed = false,
}: ManageMenuProps) {
  return (
    <div className={cx(styles.wrap, tone === 'dark' && styles.dark, collapsed && styles.collapsed)}>
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={selectedKey ? [selectedKey] : []}
        items={items}
      />
    </div>
  );
}
