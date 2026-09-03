'use client';

import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { Logo } from '@/components/brand/Logo';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/store/slices/app.slice';
import { useManageNav } from './use-manage-nav';
import { ManageMenu } from './ManageMenu';
import { ManageUserCard } from './ManageUserCard';
import styles from './Sidebar.module.css';
import { useTranslations } from 'next-intl';

const NAV_ID = 'xp-sidebar-nav';

/**
 * Sidebar quản lý (desktop) — nền TỐI theo Figma Foundations `14:1424`.
 *
 * Hai trạng thái, một cây menu: mở rộng 232px (`14:1424`) và thu gọn 64px (`14:1532`). Trạng
 * thái ĐƯỢC NHỚ qua cookie `XP_NAV`, đọc phía server và nạp thẳng vào store lúc tạo
 * (`getServerNavPreferences` → `makeStore`), nên lần render đầu đã đúng và không có pha nhấp
 * nháy sau hydrate.
 *
 * Menu chia theo khối (Tổng quan · Quản lý · Kinh doanh · Gian hàng · Cấu hình · Hỗ trợ) —
 * cây và luật gập nằm ở `constants/nav` + `useManageNav`, ở đây chỉ là khung.
 *
 * Ẩn dưới 1024px (CSS) — mobile/tablet dùng Drawer + thanh tab dưới đáy.
 */
export function Sidebar() {
  const t = useTranslations('ManageCommon');
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.app.sidebarCollapsed);
  const { data: user } = useCurrentUser();
  const { items, selectedKey, openKeys, onOpenChange } = useManageNav({ collapsed });

  const tenantName = user?.tenant?.name;
  const toggleLabel = collapsed ? t('shell.expandMenu') : t('shell.collapseMenu');

  return (
    <aside className={cx(styles.sider, collapsed && styles.siderCollapsed)}>
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          {/* `mark` khi thu gọn: wordmark không vừa cột 64px và sẽ bị cắt giữa chữ. */}
          <Logo variant={collapsed ? 'mark' : 'full'} size="sm" />
        </div>

        {/* Thu gọn thì nút xuống dòng riêng và căn giữa cột — xem `.siderCollapsed .brand`. */}
        <Tooltip title={collapsed ? toggleLabel : null} placement="right">
          <Button
            type="text"
            size="small"
            className={styles.toggle}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls={NAV_ID}
            onClick={() => dispatch(toggleSidebar())}
          />
        </Tooltip>
      </div>

      {!collapsed && tenantName ? (
        // Figma `14:1430`: tên gian hàng làm dòng phụ dưới wordmark — đây là danh tính của gian
        // hàng trên marketplace, không phải một mục điều hướng.
        <span className={styles.tenant} title={tenantName}>
          {tenantName}
        </span>
      ) : null}

      {/* Vùng landmark có tên — trang có nhiều <nav> (sidebar, bottom nav), không tên thì
          trình đọc màn hình chỉ đọc "navigation" hai lần. */}
      <nav id={NAV_ID} className={styles.menu} aria-label={t('shell.navLabel')}>
        <ManageMenu
          items={items}
          selectedKey={selectedKey}
          openKeys={openKeys}
          onOpenChange={onOpenChange}
          tone="dark"
          collapsed={collapsed}
        />
      </nav>

      <ManageUserCard collapsed={collapsed} tone="dark" />
    </aside>
  );
}
