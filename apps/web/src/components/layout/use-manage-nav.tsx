'use client';

import { useTranslations } from 'next-intl';
import { createElement, useState } from 'react';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  branchKeyOf,
  flattenLeaves,
  isNavBranch,
  leavesOfSection,
  matchSelectedKey,
  navForScope,
  sectionKeyOf,
  type NavBranch,
  type NavLeaf,
  type NavNode,
  type NavSection,
} from '@/constants/nav';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleNavSection } from '@/store/slices/app.slice';
import { NavBadge } from './NavBadge';
import { SidebarSectionTitle } from './SidebarSectionTitle';
import { useNavBadges, type NavBadgeCounts } from './use-nav-badges';
import styles from './ManageMenu.module.css';

type MenuItem = NonNullable<MenuProps['items']>[number];

/** Tiền tố key để một khối và một mục cha không bao giờ đụng key với nhau hay với một href. */
const SECTION_PREFIX = 'section:';
const BRANCH_PREFIX = 'branch:';

export interface UseManageNavOptions {
  /** Gọi sau khi người dùng chọn một mục — Drawer mobile dùng để tự đóng. */
  onNavigate?: () => void;
  /** Sidebar đang ở chế độ chỉ-icon: khối không gập được nữa và submenu mở dạng popup. */
  collapsed?: boolean;
}

export interface ManageNav {
  items: MenuItem[];
  selectedKey: string | undefined;
  /** `undefined` khi thu gọn — lúc đó AntD tự quản popup, ép `openKeys` sẽ khoá chết popup. */
  openKeys: string[] | undefined;
  onOpenChange: MenuProps['onOpenChange'];
}

/**
 * Nguồn menu dùng chung cho Sidebar (desktop) và Drawer (mobile).
 *
 * Ba tầng, đúng như cây dữ liệu ở `constants/nav`:
 *  - **khối** (`type: 'group'`) — nhãn nhỏ in hoa, gập được, trừ Tổng quan/Hỗ trợ luôn hiện;
 *  - **mục cha** (submenu) — gom vài route của cùng một nghiệp vụ (Xe của tôi, Đơn thuê,
 *    Tài chính) mà không đụng tới route nào;
 *  - **mục lá** — một trang, có thể mang huy hiệu "cần xử lý".
 *
 * Khối bị gập được dựng với `children: []` chứ không bị loại khỏi mảng: nhãn khối vẫn còn để
 * bấm mở lại. Khối CHỨA trang đang mở luôn được bung ra dù người dùng đã gập — nếu không sẽ có
 * một trang đang mở mà không nhìn thấy trong menu.
 *
 * Lọc theo quyền + theo scope; đây là lớp trải nghiệm, guard backend mới chặn thật
 * (CLAUDE.md mục 6).
 */
export function useManageNav(options: UseManageNavOptions = {}): ManageNav {
  const { onNavigate, collapsed = false } = options;
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon');
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const collapsedSections = useAppSelector((s) => s.app.navSectionsCollapsed);
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  const badges = useNavBadges();

  const sections = navForScope(Boolean(user?.platformRole));
  const selectedKey = matchSelectedKey(pathname, flattenLeaves(sections));
  const activeSectionKey = sectionKeyOf(sections, selectedKey);
  const activeBranchKey = branchKeyOf(sections, selectedKey);

  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    activeBranchKey ? [`${BRANCH_PREFIX}${activeBranchKey}`] : [],
  );
  // Điều hướng sang một trang nằm trong mục cha KHÁC thì mục cha đó phải tự bung ra. Chỉnh
  // state ngay trong lúc render (thay vì useEffect) để menu không nháy một khung hình ở trạng
  // thái cũ — đúng khuôn "adjusting state when a prop changes" của React.
  const [lastActiveBranch, setLastActiveBranch] = useState(activeBranchKey);
  if (activeBranchKey !== lastActiveBranch) {
    setLastActiveBranch(activeBranchKey);
    const key = activeBranchKey ? `${BRANCH_PREFIX}${activeBranchKey}` : undefined;
    if (key && !openKeys.includes(key)) setOpenKeys([...openKeys, key]);
  }

  function badgeCountOf(leaf: NavLeaf): number {
    return leaf.badge ? (badges[leaf.badge as keyof NavBadgeCounts] ?? 0) : 0;
  }

  /**
   * Biểu tượng của một mục, có CHẤM BÁO khi menu thu gọn.
   *
   * Lúc thu gọn, AntD làm mờ hẳn (`opacity: 0`) phần chữ của mục — huy hiệu nằm trong đó nên
   * biến mất theo, và cột 64px hoá ra là cột duy nhất không báo được việc cần xử lý. Một phần
   * tử con KHÔNG thể "sáng lại" bên trong cha đã `opacity: 0`, nên tín hiệu phải chuyển sang
   * chỗ còn nhìn thấy: chính biểu tượng. Con số đầy đủ vẫn còn ở tên truy cập được.
   */
  function iconOf(node: NavLeaf | NavBranch, count: number) {
    const icon = createElement(node.icon);
    if (!collapsed || count <= 0) return icon;
    return <span className={styles.iconDotted}>{icon}</span>;
  }

  function buildLeaf(leaf: NavLeaf): MenuItem | null {
    if (!has(leaf.permission)) return null;
    const label = t(leaf.labelKey);
    const count = badgeCountOf(leaf);
    // Huy hiệu phải nói được thành lời: người dùng trình đọc màn hình nghe "Yêu cầu đặt xe, 3
    // việc cần xử lý" chứ không phải một con số trôi nổi cạnh tên mục.
    const accessibleName = count > 0 ? `${label}, ${tShell('shell.needsAction', { count })}` : label;
    return {
      key: leaf.href,
      icon: iconOf(leaf, count),
      // `title` là thứ AntD dùng làm tooltip khi menu thu gọn — không có nó, cột 64px chỉ còn
      // những biểu tượng không tên.
      title: label,
      label: (
        <Link
          href={leaf.href}
          onClick={onNavigate}
          className={styles.link}
          // Mục đang mở phải nói ra bằng ngữ nghĩa, không chỉ bằng màu.
          aria-current={leaf.href === selectedKey ? 'page' : undefined}
          // Tên truy cập được PHẢI sống sót khi sidebar thu gọn: lúc đó AntD ẩn phần chữ bằng
          // CSS, nếu chỉ dựa vào text con thì mục thu gọn thành nút không tên.
          aria-label={accessibleName}
        >
          <span className={styles.linkText}>{label}</span>
          <NavBadge count={count} />
        </Link>
      ),
    };
  }

  function buildBranch(branch: NavBranch): MenuItem | null {
    const children = branch.children
      .map(buildLeaf)
      .filter((item): item is MenuItem => item !== null);
    if (children.length === 0) return null;

    const key = `${BRANCH_PREFIX}${branch.key}`;
    const label = t(branch.labelKey);
    // Huy hiệu của mục con dồn lên mục cha KHI mục cha đang đóng — nếu không, việc cần xử lý
    // nằm khuất sau một submenu và không ai thấy.
    const isOpen = collapsed ? false : openKeys.includes(key);
    const hiddenCount = isOpen
      ? 0
      : branch.children
          .filter((leaf) => has(leaf.permission))
          .reduce((sum, leaf) => sum + badgeCountOf(leaf), 0);

    return {
      key,
      icon: iconOf(branch, hiddenCount),
      title: label,
      // Thu gọn thì AntD mở mục con thành bảng thả nổi, render qua portal NGOÀI cây của
      // `ManageMenu` — không gắn class ở đây thì bảng đó rơi về giao diện nền sáng mặc định.
      popupClassName: styles.popup,
      label: (
        <span className={styles.link}>
          <span className={styles.linkText}>{label}</span>
          <NavBadge count={hiddenCount} />
        </span>
      ),
      children,
    };
  }

  function buildNode(node: NavNode): MenuItem | null {
    return isNavBranch(node) ? buildBranch(node) : buildLeaf(node);
  }

  function buildSection(section: NavSection): MenuItem | null {
    const children = section.children
      .map(buildNode)
      .filter((item): item is MenuItem => item !== null);
    if (children.length === 0) return null;

    // Thu gọn còn icon thì không còn nhãn khối để bấm — mọi khối phải bung, nếu không có mục
    // biến mất mà không có cách nào mở lại.
    const expanded =
      collapsed ||
      Boolean(section.pinned) ||
      section.key === activeSectionKey ||
      !collapsedSections.includes(section.key);

    // Việc phải xử lý bị giấu bên trong một khối đã gập vẫn phải nhìn thấy được ở nhãn khối.
    const hiddenCount = expanded
      ? 0
      : leavesOfSection(section)
          .filter((leaf) => has(leaf.permission))
          .reduce((sum, leaf) => sum + badgeCountOf(leaf), 0);

    return {
      key: `${SECTION_PREFIX}${section.key}`,
      type: 'group',
      label: (
        <SidebarSectionTitle
          label={t(section.labelKey)}
          expanded={expanded}
          pinned={section.pinned}
          badgeCount={hiddenCount}
          onToggle={() => dispatch(toggleNavSection(section.key))}
        />
      ),
      children: expanded ? children : [],
    };
  }

  const items = sections.map(buildSection).filter((item): item is MenuItem => item !== null);

  return {
    items,
    selectedKey,
    openKeys: collapsed ? undefined : openKeys,
    onOpenChange: (keys) => setOpenKeys(keys as string[]),
  };
}
