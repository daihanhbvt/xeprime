'use client';

import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { Logo } from '@/components/brand/Logo';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/store/slices/app.slice';
import { useManageNav } from './use-manage-nav';
import { ManageMenu } from './ManageMenu';
import { ManageUserCard } from './ManageUserCard';
import styles from './Sidebar.module.css';

const NAV_ID = 'xp-sidebar-nav';

/**
 * Sidebar quản lý (desktop) — nền TỐI theo Figma Foundations `14:1424` (quyết định P1).
 *
 * Hai trạng thái, một cây menu: mở rộng 232px (`14:1424`) và thu gọn 64px (`14:1532`).
 * Thu gọn là **tuỳ chọn giao diện trong phiên**, không lưu lâu dài — repo chưa có hạ tầng
 * persistence nào và chỉ thị 1D-B cấm dựng cơ chế thứ hai. Đổi lại: state khởi tạo là hằng
 * `false` ở cả server lẫn client nên không có hydration mismatch.
 *
 * Ẩn dưới breakpoint hiện tại (CSS) — mobile dùng Drawer + bottom nav. Ranh 992→1024 là việc
 * của Batch 1D-C.
 */
export function Sidebar() {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.app.sidebarCollapsed);
  const { data: user } = useCurrentUser();
  const { items, selectedKey } = useManageNav();

  const tenantName = user?.tenant?.name;

  return (
    <aside className={cx(styles.sider, collapsed && styles.siderCollapsed)}>
      <div className={styles.brand}>
        {/* `mark` khi thu gọn: wordmark không vừa cột 64px và sẽ bị cắt giữa chữ. */}
        <Logo variant={collapsed ? 'mark' : 'full'} size="sm" tone="light" />
        {!collapsed && tenantName ? (
          // Figma `14:1430`: tên gian hàng làm dòng phụ dưới wordmark.
          <span className={styles.tenant} title={tenantName}>
            {tenantName}
          </span>
        ) : null}
      </div>

      <Button
        type="text"
        size="small"
        className={styles.toggle}
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        aria-expanded={!collapsed}
        aria-controls={NAV_ID}
        onClick={() => dispatch(toggleSidebar())}
      />

      {/* Vùng landmark có tên — trang có nhiều <nav> (sidebar, bottom nav), không tên thì
          trình đọc màn hình chỉ đọc "navigation" hai lần. */}
      <nav id={NAV_ID} className={styles.menu} aria-label="Điều hướng cổng quản lý">
        <ManageMenu items={items} selectedKey={selectedKey} tone="dark" collapsed={collapsed} />
      </nav>

      <ManageUserCard collapsed={collapsed} tone="dark" />
    </aside>
  );
}
