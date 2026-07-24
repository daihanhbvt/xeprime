'use client';

import { createElement, useMemo } from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/store/slices/app.slice';
import {
  flattenLeaves,
  groupKeyOf,
  isNavGroup,
  matchSelectedKey,
  navForScope,
  type NavGroup,
  type NavLeaf,
  type NavNode,
} from '@/constants/nav';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './Sidebar.module.css';

type MenuItem = NonNullable<MenuProps['items']>[number];

/**
 * Menu quản lý 2 cấp, lọc theo quyền và theo scope.
 *
 * Đây là lớp trải nghiệm, KHÔNG phải lớp bảo vệ: ẩn mục menu không ngăn ai gọi thẳng API.
 * Mỗi mục gắn một permission key, và endpoint tương ứng phải có `@RequirePermissions` cùng
 * key đó ở backend (CLAUDE.md mục 6). Cây menu chọn theo scope — platform vs gian hàng.
 */
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useAppSelector((s) => s.app.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const { data: user } = useCurrentUser();
  const { has, isLoading } = usePermissions();

  const nodes = navForScope(Boolean(user?.platformRole));

  function buildLeaf(leaf: NavLeaf): MenuItem | null {
    if (!has(leaf.permission)) return null;
    return {
      key: leaf.href,
      icon: createElement(leaf.icon),
      label: <Link href={leaf.href}>{leaf.label}</Link>,
    };
  }

  function buildGroup(group: NavGroup): MenuItem | null {
    const children = group.children.map(buildLeaf).filter((item): item is MenuItem => item !== null);
    if (children.length === 0) return null;
    return {
      key: group.key,
      icon: createElement(group.icon),
      label: group.label,
      children,
    };
  }

  function buildNode(node: NavNode): MenuItem | null {
    return isNavGroup(node) ? buildGroup(node) : buildLeaf(node);
  }

  const items = nodes.map(buildNode).filter((item): item is MenuItem => item !== null);

  const selectedKey = matchSelectedKey(pathname, flattenLeaves(nodes));

  // Mở sẵn mọi nhóm để menu đọc như bản Firebase-code (mọi mục hiện ngay), vẫn thu gọn được.
  const defaultOpenKeys = useMemo(() => nodes.filter(isNavGroup).map((g) => g.key), [nodes]);
  // Nhóm chứa mục đang chọn luôn được tính vào openKeys ban đầu (khi vào sâu bằng URL trực tiếp).
  const openKeys = useMemo(
    () => Array.from(new Set([...defaultOpenKeys, ...groupKeyOf(nodes, selectedKey)])),
    [defaultOpenKeys, nodes, selectedKey],
  );

  return (
    <Layout.Sider
      collapsible
      collapsed={collapsed}
      onCollapse={() => dispatch(toggleSidebar())}
      breakpoint="lg"
      className={styles.sider}
      width={232}
    >
      <div className={styles.brand}>{collapsed ? 'XP' : 'XePrime'}</div>
      {isLoading ? null : (
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKey ? [selectedKey] : []}
          defaultOpenKeys={openKeys}
          items={items}
        />
      )}
    </Layout.Sider>
  );
}
