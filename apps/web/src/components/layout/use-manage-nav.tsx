'use client';

import { createElement } from 'react';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  flattenLeaves,
  isNavGroup,
  matchSelectedKey,
  navForScope,
  type NavGroup,
  type NavLeaf,
  type NavNode,
} from '@/constants/nav';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';

type MenuItem = NonNullable<MenuProps['items']>[number];

/**
 * Nguồn menu dùng chung cho Sidebar (desktop) và Drawer (mobile).
 *
 * Bám bố cục Firebase-code: nhóm là NHÃN section không thu gọn (`type: 'group'` —
 * TỔNG QUAN / QUẢN LÝ / CÀI ĐẶT), mục con luôn hiện. Lọc theo quyền + theo scope; đây là
 * lớp trải nghiệm, guard backend mới chặn thật (CLAUDE.md mục 6).
 */
export function useManageNav(onNavigate?: () => void): {
  items: MenuItem[];
  selectedKey: string | undefined;
} {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();

  const nodes = navForScope(Boolean(user?.platformRole));

  function buildLeaf(leaf: NavLeaf): MenuItem | null {
    if (!has(leaf.permission)) return null;
    return {
      key: leaf.href,
      icon: createElement(leaf.icon),
      label: (
        <Link href={leaf.href} onClick={onNavigate}>
          {leaf.label}
        </Link>
      ),
    };
  }

  function buildGroup(group: NavGroup): MenuItem | null {
    const children = group.children
      .map(buildLeaf)
      .filter((item): item is MenuItem => item !== null);
    if (children.length === 0) return null;
    return { key: group.key, type: 'group', label: group.label, children };
  }

  function buildNode(node: NavNode): MenuItem | null {
    return isNavGroup(node) ? buildGroup(node) : buildLeaf(node);
  }

  const items = nodes.map(buildNode).filter((item): item is MenuItem => item !== null);
  const selectedKey = matchSelectedKey(pathname, flattenLeaves(nodes));

  return { items, selectedKey };
}
