'use client';

import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createElement, useState, type KeyboardEvent } from 'react';
import { LineIcon } from '@/components/icons/LineIcon';
import {
  flattenLeaves,
  leavesOfSection,
  matchSelectedKey,
  sectionKeyOf,
  type NavLeaf,
  type NavSection,
} from '@/constants/nav';
import { cx } from '@/lib/cx';
import { useManageNavTree } from './use-manage-nav-tree';
import { needsActionLabel } from './needs-action-label';
import { useNavLeafAccess, type NavLeafAccess } from './use-nav-leaf-access';
import styles from './PartnerTopNav.module.css';

/**
 * Menu NGANG của site partner — Figma Partner-XePrime Header `23649:27690`, SubMenu
 * `23661:27362`, trạng thái mục `23649:11528`.
 *
 * Mỗi khối của cây (`constants/nav` — `SHOP_NAV` / `OWNER_LITE_NAV`) là một mục cấp 1: biểu tượng +
 * nhãn + dấu "+" (mở thì thành "−", nền vàng nhạt). Khối `direct` ("Tổng quan") là liên kết thẳng.
 * Dropdown là danh sách PHẲNG các mục lá, mỗi dòng biểu tượng + nhãn + số "cần xử lý".
 *
 * Nhãn khối cũng là một LIÊN KẾT tới mục lá đầu tiên nó còn hiện (06/11/2026 — "Vận hành" → "Đơn
 * thuê xe"): rê chuột mở dropdown, bấm thì đi. Khối chứa trang đang mở được tô như lúc đang mở
 * (06/11/2026, người dùng chốt — design không tô), để biết mình đang ở khu nào khi dropdown đóng.
 *
 * Lọc quyền/sở hữu/cờ gói đi qua `useNavLeafAccess` — cùng vị từ với drawer mobile, nên một mục
 * không bao giờ hiện ở desktop mà biến mất ở mobile. Mục `hidden` không vẽ thành dòng; khối không
 * còn dòng nào thì vắng hẳn.
 *
 * Dropdown dựng bằng `Dropdown` + `menu` của AntD (không tự dựng popup) để có sẵn điều hướng bàn
 * phím, vai `menu`/`menuitem` và trả tiêu điểm. Mở bằng rê chuột; bàn phím mở bằng phím ↓ (Enter
 * thuộc về liên kết) — chỉ lối này mới đưa tiêu điểm vào dòng đầu.
 */
export function PartnerTopNav() {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const access = useNavLeafAccess();
  const { sections } = useManageNavTree();
  const selectedKey = matchSelectedKey(pathname, flattenLeaves(sections));
  const activeSectionKey = sectionKeyOf(sections, selectedKey);

  return (
    <nav className={styles.nav} aria-label={t('manage.menuLabel')}>
      {sections.map((section) => {
        const leaves = leavesOfSection(section).filter(access.isShown);
        const [first] = leaves;
        if (!first) return null;
        const label = t(section.labelKey);
        return section.direct ? (
          <Link
            key={section.key}
            href={access.hrefOf(first)}
            className={cx(styles.item, section.key === activeSectionKey && styles.itemActive)}
            aria-current={first.href === selectedKey ? 'page' : undefined}
          >
            <SectionIcon section={section} />
            <span className={styles.label}>{label}</span>
          </Link>
        ) : (
          <TopNavGroup
            key={section.key}
            section={section}
            label={label}
            leaves={leaves}
            first={first}
            active={section.key === activeSectionKey}
            selectedKey={selectedKey}
            access={access}
          />
        );
      })}
    </nav>
  );
}

function SectionIcon({ section }: { section: NavSection }) {
  return section.icon ? createElement(section.icon, { className: styles.icon }) : null;
}

function TopNavGroup({
  section,
  label,
  leaves,
  first,
  active,
  selectedKey,
  access,
}: {
  section: NavSection;
  label: string;
  leaves: readonly NavLeaf[];
  /** Dòng đầu tiên còn hiện — đích của nhãn khối. */
  first: NavLeaf;
  /** Trang đang mở thuộc khối này. */
  active: boolean;
  selectedKey: string | undefined;
  access: NavLeafAccess;
}) {
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon');
  const [open, setOpen] = useState(false);
  /*
   * Chỉ đưa tiêu điểm vào dropdown khi mở bằng phím ↓. Mở bằng rê chuột mà vẫn `autoFocus` thì AntD
   * focus dòng ĐẦU TIÊN — dòng đó nhận viền focus + màu active dù trang đang mở là dòng khác
   * (09/11/2026: ở "Chính sách thuê" rê "Cấu hình" thì "Thông tin cửa hàng" bị viền vàng).
   */
  const [focusOnOpen, setFocusOnOpen] = useState(false);

  /*
   * Việc "cần xử lý" trong khối phải nhìn thấy được khi dropdown ĐÓNG — nếu không, yêu cầu đặt xe
   * đang chờ nằm khuất sau "Vận hành" và không ai thấy. Con số GIỮ NGUYÊN khi mở dropdown: gỡ nó
   * lúc mở làm nút co lại và cả hàng menu bên phải nhảy theo mỗi lần rê chuột. Đỏ khi BẤT KỲ mục
   * nào trong khối có việc trễ / sắp trễ.
   */
  const pending = access.badgeTotalOf(leaves);

  function openWithKeyboard(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    setFocusOnOpen(true);
    setOpen(true);
  }

  /** Rê chuột vào/ra (AntD báo) — không bao giờ kéo tiêu điểm khỏi chỗ người dùng đang đứng. */
  function changeOpen(next: boolean) {
    setFocusOnOpen(false);
    setOpen(next);
  }

  const items: MenuProps['items'] = leaves.map((leaf) => {
    const itemLabel = t(leaf.labelKey);
    const count = access.badgeCountOf(leaf);
    const urgent = access.badgeUrgentOf(leaf);
    return {
      key: leaf.href,
      icon: createElement(leaf.icon, { className: styles.menuIcon }),
      label: (
        <Link
          href={access.hrefOf(leaf)}
          aria-current={leaf.href === selectedKey ? 'page' : undefined}
          // Số đi kèm phải nói được thành lời: "Yêu cầu đặt xe, 3 việc cần xử lý".
          aria-label={
            count > 0 ? `${itemLabel}, ${needsActionLabel(tShell, count, urgent)}` : undefined
          }
        >
          {itemLabel}
        </Link>
      ),
      extra: count > 0 ? <CountBadge count={count} urgent={urgent} /> : undefined,
    };
  });

  return (
    <Dropdown
      trigger={['hover']}
      placement="bottomLeft"
      arrow
      autoFocus={focusOnOpen}
      open={open}
      onOpenChange={changeOpen}
      classNames={{ root: styles.dropdown }}
      menu={{
        items,
        selectedKeys: selectedKey ? [selectedKey] : [],
        onClick: () => changeOpen(false),
      }}
    >
      <Link
        href={access.hrefOf(first)}
        className={cx(styles.item, active && styles.itemActive, open && styles.itemOpen)}
        onKeyDown={openWithKeyboard}
        onClick={() => changeOpen(false)}
        // Đang ở ĐÚNG trang đích của nhãn khối thì là "page"; ở trang khác trong khối thì là "true".
        aria-current={first.href === selectedKey ? 'page' : active ? 'true' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          pending.count > 0
            ? `${label}, ${needsActionLabel(tShell, pending.count, pending.urgent)}`
            : undefined
        }
      >
        <SectionIcon section={section} />
        <span className={styles.label}>{label}</span>
        {pending.count > 0 ? <CountBadge count={pending.count} urgent={pending.urgent} /> : null}
        <LineIcon name={open ? 'minus' : 'plus'} className={styles.toggle} />
      </Link>
    </Dropdown>
  );
}

/** Trên ngưỡng này con số chính xác không còn đổi hành vi ai cả. */
const COUNT_OVERFLOW_AT = 99;

/**
 * Huy hiệu số theo khuôn `_Badge` `23661:27584` của design (viên bo tròn, viền, chữ 12px) nhưng
 * tô màu CẢNH BÁO (04/11/2026): bản xám của design chìm hẳn, không ai nhận ra có việc đang chờ.
 * Cam = chờ xử lý, đỏ = có việc trễ / sắp trễ — cùng bộ màu với `StatusBadge` warning/danger.
 */
function CountBadge({ count, urgent }: { count: number; urgent: boolean }) {
  return (
    <span className={cx(styles.count, urgent && styles.countUrgent)} aria-hidden="true">
      {count > COUNT_OVERFLOW_AT ? `${COUNT_OVERFLOW_AT}+` : count}
    </span>
  );
}
