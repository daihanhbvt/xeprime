'use client';

import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import styles from './ManageMenu.module.css';

/**
 * Menu quản lý trình bày sáng + gold, dùng chung Sidebar (desktop) và Drawer (mobile).
 * Items/selectedKey lấy từ `useManageNav` — component này chỉ lo phần hiển thị.
 */
export function ManageMenu({
  items,
  selectedKey,
}: {
  items: MenuProps['items'];
  selectedKey?: string;
}) {
  return (
    <div className={styles.wrap}>
      <Menu mode="inline" selectedKeys={selectedKey ? [selectedKey] : []} items={items} />
    </div>
  );
}
