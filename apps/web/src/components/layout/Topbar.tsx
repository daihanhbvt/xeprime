'use client';

import { MenuOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { BranchScopeSelector } from '@/features/branches/components/BranchScopeSelector';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { ROUTES } from '@/constants/routes';
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
  const router = useRouter();
  const dispatch = useAppDispatch();
  const logout = usePortalLogout();
  const { data: chatUnread } = useChatUnreadCount();

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
        {/* Đứng TRƯỚC tin nhắn/thông báo, đúng vị trí như ở header marketplace. */}
        <LocaleSwitcher />
        <Badge count={chatUnread?.count ?? 0} size="small" overflowCount={99}>
          <Button
            type="text"
            shape="circle"
            icon={<MessageOutlined aria-hidden />}
            aria-label={t('manage.chat')}
            onClick={() => router.push(ROUTES.MANAGE.CHAT)}
          />
        </Badge>
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

        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'name', label: user.displayName, disabled: true },
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
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
