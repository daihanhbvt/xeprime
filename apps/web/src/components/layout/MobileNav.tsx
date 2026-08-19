'use client';

import { useTranslations } from 'next-intl';
import { createElement, useRef } from 'react';
import { EllipsisOutlined } from '@ant-design/icons';
import { Drawer } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { mobileTabsForScope } from '@/constants/nav';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import { ManageMenu } from './ManageMenu';
import { ManageUserCard } from './ManageUserCard';
import { useManageNav } from './use-manage-nav';
import styles from './MobileNav.module.css';

function isTabActive(pathname: string, href: string): boolean {
  if (href === ROUTES.MANAGE.ROOT) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Điều hướng mobile của cổng quản lý: thanh tab cố định dưới đáy (Figma `14:1641`, 4 đích
 * chính + "Thêm") và Drawer menu đầy đủ (`14:1661`).
 *
 * **Đây là Drawer ĐIỀU HƯỚNG, cố ý KHÔNG dùng `DetailDrawer`.** `DetailDrawer` của Wave 1B mang
 * ngữ nghĩa "chi tiết một thực thể nghiệp vụ" — nó có tiêu đề thực thể, vùng hành động trên
 * thực thể đó, và người dùng hiểu là đang xem một bản ghi. Nhét menu vào đó là nói dối về ngữ
 * nghĩa và kéo theo cả bộ hành vi không liên quan. `Drawer` của AntD dùng thẳng vẫn là primitive
 * đúng ở đây (ghi lại như một ngoại lệ có chủ ý — 04_COMPONENT_DUPLICATES §D17).
 *
 * Ẩn trên desktop bằng CSS ở ranh chính tắc 1024px.
 */
export function MobileNav() {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.app.mobileNavOpen);
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  // Trả tiêu điểm về đúng nút đã mở Drawer — nếu không, đóng xong tiêu điểm rơi về <body> và
  // người dùng bàn phím phải Tab lại từ đầu trang.
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => dispatch(setMobileNavOpen(false));
  const tabs = mobileTabsForScope(Boolean(user?.platformRole)).filter((tab) => has(tab.permission));
  const { items, selectedKey } = useManageNav(close);

  // "Thêm" sáng khi trang hiện tại không thuộc tab chính nào (đang ở mục trong Drawer).
  const anyPrimaryActive = tabs.some((tab) => isTabActive(pathname, tab.href));

  return (
    <>
      <nav className={styles.bar} aria-label={t('public.quickNavLabel')}>
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cx(styles.tab, active && styles.active)}
              aria-current={active ? 'page' : undefined}
            >
              {decorativeIcon(createElement(tab.icon, { className: styles.icon }))}
              <span className={styles.label}>{t(tab.labelKey)}</span>
            </Link>
          );
        })}
        <button
          ref={triggerRef}
          type="button"
          className={cx(styles.tab, !anyPrimaryActive && styles.active)}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => dispatch(setMobileNavOpen(true))}
        >
          {decorativeIcon(<EllipsisOutlined className={styles.icon} />)}
          <span className={styles.label}>{t('manage.more')}</span>
        </button>
      </nav>

      <Drawer
        placement="left"
        open={open}
        onClose={close}
        // Escape và bấm ra ngoài đều đóng (mặc định AntD) — navigation-audit `134:3825`.
        keyboard
        mask={{ closable: true }}
        // Trả tiêu điểm về nút "Thêm" sau khi đóng.
        afterOpenChange={(nowOpen) => {
          if (!nowOpen) triggerRef.current?.focus();
        }}
        size="default"
        rootClassName={styles.drawer}
        title={<Logo size="sm" tone="light" />}
        aria-label={t('manage.menuLabel')}
      >
        {/* Vùng landmark có tên riêng: trang mobile có hai <nav> (thanh tab + menu đầy đủ). */}
        <nav className={styles.drawerMenu} aria-label={t('manage.fullMenu')}>
          <ManageMenu items={items} selectedKey={selectedKey} tone="dark" />
        </nav>
        <ManageUserCard tone="dark" />
      </Drawer>
    </>
  );
}
