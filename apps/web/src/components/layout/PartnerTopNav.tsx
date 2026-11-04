'use client';

import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createElement, useState } from 'react';
import { LineIcon } from '@/components/icons/LineIcon';
import {
  flattenLeaves,
  leavesOfSection,
  matchSelectedKey,
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
 * Lọc quyền/sở hữu/cờ gói đi qua `useNavLeafAccess` — cùng vị từ với drawer mobile, nên một mục
 * không bao giờ hiện ở desktop mà biến mất ở mobile. Mục `hidden` không vẽ thành dòng; khối không
 * còn dòng nào thì vắng hẳn.
 *
 * Dropdown dựng bằng `Dropdown` + `menu` của AntD (không tự dựng popup) để có sẵn điều hướng bàn
 * phím, vai `menu`/`menuitem` và trả tiêu điểm. Mở bằng rê chuột hoặc bấm.
 */
export function PartnerTopNav() {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const access = useNavLeafAccess();
  const { sections } = useManageNavTree();
  const selectedKey = matchSelectedKey(pathname, flattenLeaves(sections));

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
            className={styles.item}
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
  selectedKey,
  access,
}: {
  section: NavSection;
  label: string;
  leaves: readonly NavLeaf[];
  selectedKey: string | undefined;
  access: NavLeafAccess;
}) {
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon');
  const [open, setOpen] = useState(false);

  /*
   * Việc "cần xử lý" trong khối phải nhìn thấy được khi dropdown ĐÓNG — nếu không, yêu cầu đặt xe
   * đang chờ nằm khuất sau "Vận hành" và không ai thấy. Con số GIỮ NGUYÊN khi mở dropdown: gỡ nó
   * lúc mở làm nút co lại và cả hàng menu bên phải nhảy theo mỗi lần rê chuột. Đỏ khi BẤT KỲ mục
   * nào trong khối có việc trễ / sắp trễ.
   */
  const pending = access.badgeTotalOf(leaves);

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
      trigger={['hover', 'click']}
      placement="bottomLeft"
      arrow
      open={open}
      onOpenChange={setOpen}
      classNames={{ root: styles.dropdown }}
      menu={{
        items,
        selectedKeys: selectedKey ? [selectedKey] : [],
        onClick: () => setOpen(false),
      }}
    >
      <button
        type="button"
        className={cx(styles.item, open && styles.itemOpen)}
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
      </button>
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
