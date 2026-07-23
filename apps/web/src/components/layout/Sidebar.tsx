'use client';

import { createElement } from 'react';
import { Layout, Menu } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/store/slices/app.slice';
import { MANAGE_NAV } from '@/constants/nav';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './Sidebar.module.css';

/**
 * Menu lọc theo quyền.
 *
 * Đây là lớp trải nghiệm, KHÔNG phải lớp bảo vệ: ẩn mục menu không ngăn ai gọi thẳng API.
 * Mỗi mục ở `MANAGE_NAV` gắn một permission key, và endpoint tương ứng phải có
 * `@RequirePermissions` cùng key đó ở backend (CLAUDE.md mục 3).
 */
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAppSelector((s) => s.app.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const { has, isLoading } = usePermissions();

  const items = MANAGE_NAV.filter((item) => !item.permission || has(item.permission)).map(
    (item) => ({
      key: item.href,
      icon: createElement(item.icon),
      label: <Link href={item.href}>{item.label}</Link>,
    }),
  );

  return (
    <Layout.Sider
      collapsible
      collapsed={collapsed}
      onCollapse={() => dispatch(toggleSidebar())}
      breakpoint="lg"
      className={styles.sider}
      width={220}
    >
      <div className={styles.brand}>{collapsed ? 'XP' : 'XePrime'}</div>
      {isLoading ? null : (
        <Menu mode="inline" theme="dark" selectedKeys={[pathname]} items={items} />
      )}
    </Layout.Sider>
  );
}
