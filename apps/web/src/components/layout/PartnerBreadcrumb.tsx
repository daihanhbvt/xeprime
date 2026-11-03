'use client';

import { Breadcrumb } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createElement } from 'react';
import { LineIcon } from '@/components/icons/LineIcon';
import { flattenLeaves, leavesOfSection, matchSelectedKey } from '@/constants/nav';
import { useManageNavTree } from './use-manage-nav-tree';
import { useNavLeafAccess } from './use-nav-leaf-access';
import { usePageParent, usePageTitle } from './page-title-context';
import styles from './PartnerBreadcrumb.module.css';

/**
 * Dải breadcrumb dưới header site partner — biến thể "Details" của Header trong Figma
 * (`23661:22492` / Breadcrumbs `23659:21485`): biểu tượng khối › mục menu › tên trang đang xem.
 *
 * CHỈ hiện khi trang không tự là một mục menu, tức là:
 *  - trang con của một mục (`/vehicles/01H…`, `/booking-requests/…`): mục menu là liên kết quay về
 *    danh sách, mắt xích cuối là `<h1>` của trang (`usePageTitle`);
 *  - trang của một mục ẨN (`hidden` — "Công nợ", "Chờ giao xe"): menu không có dòng nào sáng, nên
 *    breadcrumb là chỗ duy nhất nói trang này thuộc khối nào.
 * Ở chính trang danh sách, mục đang mở đã nằm trong menu — một dải nhắc lại nó là nhiễu.
 *
 * Nhãn lấy từ CHÍNH cây menu (`matchSelectedKey`), cùng luật khớp với mục đang sáng; không có sổ tra
 * route → tiêu đề thứ hai.
 */
export function PartnerBreadcrumb() {
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon');
  const pathname = usePathname();
  const { sections } = useManageNavTree();
  const { hrefOf } = useNavLeafAccess();
  const pageTitle = usePageTitle();
  const parent = usePageParent();

  const leaves = flattenLeaves(sections);
  const selectedHref = matchSelectedKey(pathname, leaves);
  const leaf = leaves.find((item) => item.href === selectedHref);
  if (!leaf) return null;

  const isSubPage = pathname !== leaf.href;
  if (!isSubPage && leaf.hidden !== true) return null;

  const section = sections.find((item) => leavesOfSection(item).includes(leaf));
  const leafLabel = t(leaf.labelKey);
  const tail = isSubPage ? pageTitle : null;

  const items = [
    {
      key: 'section',
      title: (
        <span className={styles.sectionIcon} title={section ? t(section.labelKey) : undefined}>
          {section?.icon ? createElement(section.icon) : null}
        </span>
      ),
    },
    {
      key: 'leaf',
      title: isSubPage ? (
        <Link href={hrefOf(leaf)} className={styles.link}>
          {leafLabel}
        </Link>
      ) : (
        <span className={styles.current} aria-current="page">
          {leafLabel}
        </span>
      ),
    },
    ...(tail && parent
      ? [
          {
            key: 'parent',
            title: (
              <Link href={parent.href} className={styles.link}>
                {parent.label}
              </Link>
            ),
          },
        ]
      : []),
    ...(tail
      ? [
          {
            key: 'page',
            title: (
              <span className={styles.current} aria-current="page">
                {tail}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.row}>
      <Breadcrumb
        className={styles.crumb}
        aria-label={tShell('shell.breadcrumb')}
        separator={<LineIcon name="chevron-right" className={styles.separator} />}
        items={items}
      />
    </div>
  );
}
