'use client';

import { Logo } from '@/components/brand/Logo';
import { useManageNav } from './use-manage-nav';
import { ManageMenu } from './ManageMenu';
import { ManageUserCard } from './ManageUserCard';
import styles from './Sidebar.module.css';

/**
 * Sidebar quản lý (desktop). Nền sáng, gold accent — bám giao diện Firebase-code:
 * logo trên cùng · menu 2 cấp (nhãn nhóm + mục con) · thẻ người dùng dưới cùng.
 *
 * Ẩn dưới breakpoint `lg` (CSS) — mobile dùng Drawer + bottom nav ở AppShell.
 */
export function Sidebar() {
  const { items, selectedKey } = useManageNav();

  return (
    <aside className={styles.sider}>
      <div className={styles.logo}>
        <Logo size="sm" />
      </div>
      <div className={styles.menu}>
        <ManageMenu items={items} selectedKey={selectedKey} />
      </div>
      <ManageUserCard />
    </aside>
  );
}
