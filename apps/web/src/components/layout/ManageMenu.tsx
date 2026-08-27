'use client';

import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { cx } from '@/lib/cx';
import styles from './ManageMenu.module.css';

export interface ManageMenuProps {
  items: MenuProps['items'];
  selectedKey?: string;
  /** Mục cha đang bung. `undefined` = để AntD tự quản (bắt buộc ở chế độ thu gọn/popup). */
  openKeys?: string[];
  onOpenChange?: MenuProps['onOpenChange'];
  /**
   * `dark` = đặt trên nền `--xp-shell-sidebar-bg` (Sidebar desktop và Drawer mobile).
   * `light` = đặt trên nền trắng.
   */
  tone?: 'light' | 'dark';
  /** Thu gọn còn icon. Cùng một `items`, không có cây thứ hai cho chế độ thu gọn. */
  collapsed?: boolean;
}

/**
 * Menu quản lý — dùng chung Sidebar (desktop) và Drawer (mobile).
 *
 * Component này CHỈ lo hiển thị: `items`/`selectedKey`/`openKeys` do `useManageNav` dựng (lọc
 * quyền, chọn scope, gập khối, bung mục cha đang chứa trang hiện tại). Thu gọn giao cho
 * `inlineCollapsed` của AntD chứ không dựng cây mục thứ hai — hai bản định nghĩa menu là chỗ
 * để chúng lệch nhau.
 */
export function ManageMenu({
  items,
  selectedKey,
  openKeys,
  onOpenChange,
  tone = 'light',
  collapsed = false,
}: ManageMenuProps) {
  return (
    <div className={cx(styles.wrap, tone === 'dark' && styles.dark, collapsed && styles.collapsed)}>
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        // 24px mặc định của AntD đẩy mục con vào tận 48px trên cột 232px — nhãn hết chỗ và
        // phải cắt. 12px giữ được bậc thang nhìn thấy được mà chữ vẫn đủ rộng.
        inlineIndent={12}
        selectedKeys={selectedKey ? [selectedKey] : []}
        openKeys={openKeys}
        onOpenChange={onOpenChange}
        items={items}
      />
    </div>
  );
}
