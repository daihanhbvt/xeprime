'use client';

import { Breadcrumb } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { flattenLeaves, matchSelectedKey } from '@/constants/nav';
import { useWorkspace } from '@/hooks/use-workspace';
import { useManageNavTree } from './use-manage-nav-tree';
import styles from './ManageBreadcrumb.module.css';

/**
 * Ngữ cảnh trang ở góc trái topbar — Figma `14:1499` ("Trang chủ / Bảng điều khiển").
 *
 * Nhãn cấp hai lấy từ CHÍNH cây menu (`matchSelectedKey`), không dựng thêm sổ tra cứu
 * route → tiêu đề. Nhờ vậy:
 *  - không có bản thứ hai của tên trang để trôi khỏi tên trong sidebar;
 *  - quy tắc khớp route giống hệt mục menu đang sáng, nên hai chỗ không bao giờ nói khác nhau;
 *  - route con (`/manage/vehicles/01H`) vẫn ra đúng ngữ cảnh cha ("Xe").
 *
 * Route không nằm trong cây (ví dụ `/manage/contracts/:id`) chỉ hiện cấp một — thà thiếu một
 * cấp còn hơn bịa ra một tiêu đề.
 */
export function ManageBreadcrumb() {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const { sections: nodes } = useManageNavTree();
  // Gốc của khu đang đứng — trong phiên hỗ trợ là trang đầu của PHIÊN, không phải `/manage` của
  // tài khoản nhân sự (ADR 0050 §12).
  const { paths } = useWorkspace();
  const home = paths.home;
  const selectedKey = matchSelectedKey(pathname, flattenLeaves(nodes));
  const current = flattenLeaves(nodes).find((leaf) => leaf.href === selectedKey);

  const items = [
    {
      key: 'root',
      title: pathname === home ? t('manage.home') : <Link href={home}>{t('manage.home')}</Link>,
    },
    ...(current && current.href !== home
      ? [{ key: current.href, title: t(current.labelKey) }]
      : []),
  ];

  return <Breadcrumb className={styles.crumb} items={items} />;
}
