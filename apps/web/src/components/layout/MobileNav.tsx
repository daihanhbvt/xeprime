'use client';

import { createElement } from 'react';
import { EllipsisOutlined } from '@ant-design/icons';
import { Drawer } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { mobileTabsForScope } from '@/constants/nav';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
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
 * Điều hướng mobile: thanh tab cố định dưới đáy (4 tab chính + "Thêm") và Drawer menu đầy đủ.
 * Tab "Thêm" mở Drawer; chọn mục trong Drawer thì đóng lại (onNavigate). Ẩn trên desktop (CSS).
 */
export function MobileNav() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.app.mobileNavOpen);
  const { data: user } = useCurrentUser();

  const close = () => dispatch(setMobileNavOpen(false));
  const tabs = mobileTabsForScope(Boolean(user?.platformRole));
  const { items, selectedKey } = useManageNav(close);

  // "Thêm" sáng khi trang hiện tại không thuộc tab chính nào (đang ở mục trong Drawer).
  const anyPrimaryActive = tabs.some((tab) => isTabActive(pathname, tab.href));

  return (
    <>
      <nav className={styles.bar}>
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cx(styles.tab, active && styles.active)}
            >
              {createElement(tab.icon, { className: styles.icon })}
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={cx(styles.tab, !anyPrimaryActive && styles.active)}
          onClick={() => dispatch(setMobileNavOpen(true))}
        >
          <EllipsisOutlined className={styles.icon} />
          <span>Thêm</span>
        </button>
      </nav>

      <Drawer
        placement="left"
        open={open}
        onClose={close}
        width={288}
        rootClassName={styles.drawer}
        title={<Logo size="sm" />}
      >
        <div className={styles.drawerMenu}>
          <ManageMenu items={items} selectedKey={selectedKey} />
        </div>
        <ManageUserCard />
      </Drawer>
    </>
  );
}
