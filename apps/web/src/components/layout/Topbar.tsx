'use client';

import { DownOutlined, MenuOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown } from 'antd';
import { useTranslations } from 'next-intl';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { BranchScopeSelector } from '@/features/branches/components/BranchScopeSelector';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { CHAT_SIDE } from '@xeprime/types';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { initialOf } from '@/lib/initials';
import { useAppDispatch } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import type { CurrentUser } from '@/hooks/use-current-user';
import { ManageBreadcrumb } from './ManageBreadcrumb';
import styles from './Topbar.module.css';

/**
 * Thanh trên của cổng quản lý — Figma Foundations `14:1498` (cao 56px, nền sáng).
 *
 * Bố cục theo Figma: **trái** là ngữ cảnh trang (breadcrumb `14:1499`), **phải** là chuông/chat
 * rồi tới ngữ cảnh gian hàng (`14:1519`).
 *
 * Hai thứ trong Figma KHÔNG dựng ở đây, có lý do:
 *  - ô tìm kiếm `⌘K` (`14:1504`): chưa có API tìm kiếm nào — dựng ra là một điều khiển chết;
 *  - nút thu gọn sidebar: Figma đặt nó trong khối brand của sidebar (`47:12`/`47:82`), không
 *    phải trên topbar. Thêm bản thứ hai ở đây là nhân đôi điều khiển cho cùng một việc.
 */
export function Topbar({ user }: { user: CurrentUser }) {
  const t = useTranslations('Navigation');
  const dispatch = useAppDispatch();
  const logout = usePortalLogout();
  const localeGroup = useLocaleMenuGroup();

  const tenantName = user.tenant?.name;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Button
          type="text"
          className={styles.hamburger}
          icon={<MenuOutlined />}
          aria-label={t('manage.openMenu')}
          onClick={() => dispatch(setMobileNavOpen(true))}
        />
        <ManageBreadcrumb />
      </div>

      <div className={styles.right}>
        <ChatMenu side={CHAT_SIDE.SHOP} />
        <NotificationBell context="manage" />

        {tenantName ? (
          <>
            <span className={styles.divider} aria-hidden />
            {/*
              Bộ chọn CHI NHÁNH: từ wave chi nhánh nó có hành vi thật (thu hẹp danh sách xe/đơn/
              yêu cầu thuê/lịch theo chi nhánh), nên không còn là điều khiển chết. Tự ẩn khi gian
              hàng chỉ có một chi nhánh hoặc người dùng không có `branches.view`.

              Chỉ hiện trong ngữ cảnh GIAN HÀNG: admin nền tảng không đứng trong tenant nào thì
              `tenantName` rỗng và cả khối này không render.
            */}
            <BranchScopeSelector />
            {/* Gian hàng là THÔNG TIN NGỮ CẢNH (mỗi tài khoản thuộc một gian hàng), không phải bộ chọn. */}
            <span className={styles.tenant} title={tenantName}>
              <span className={styles.tenantMark} aria-hidden>
                {initialOf(tenantName)}
              </span>
              <span className={styles.tenantName}>{tenantName}</span>
            </span>
          </>
        ) : null}

        {/*
          Đổi ngôn ngữ nằm trong menu tài khoản, giống hệt header khu khách — thanh trên cùng chỉ
          giữ những thứ bấm hằng ngày, còn cài đặt cá nhân đi cùng một chỗ với chúng.
        */}
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'name', label: user.displayName, disabled: true },
              { type: 'divider' },
              localeGroup,
              { type: 'divider' },
              { key: 'logout', label: t('public.logout'), onClick: () => void logout() },
            ],
          }}
        >
          <button type="button" className={styles.avatarButton} aria-label={t('public.account')}>
            <Avatar
              className={styles.avatar}
              src={user.avatarUrl ?? undefined}
              icon={user.avatarUrl ? undefined : <UserOutlined aria-hidden />}
            >
              {user.avatarUrl ? null : initialOf(user.displayName || user.email)}
            </Avatar>
            <DownOutlined className={styles.avatarCaret} aria-hidden />
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
