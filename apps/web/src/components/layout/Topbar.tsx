'use client';

import { MenuOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown } from 'antd';
import { useRouter } from 'next/navigation';
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
          aria-label="Mở menu"
          onClick={() => dispatch(setMobileNavOpen(true))}
        />
        <ManageBreadcrumb />
      </div>

      <div className={styles.right}>
        <Badge count={chatUnread?.count ?? 0} size="small" overflowCount={99}>
          <Button
            type="text"
            shape="circle"
            icon={<MessageOutlined aria-hidden />}
            aria-label="Trò chuyện"
            onClick={() => router.push(ROUTES.MANAGE.CHAT)}
          />
        </Badge>
        <NotificationBell context="manage" />

        {tenantName ? (
          <>
            <span className={styles.divider} aria-hidden />
            {/* Figma `14:1519` vẽ ô này kèm mũi tên xổ xuống, nhưng MVP mỗi tài khoản chỉ
                thuộc một gian hàng — dựng dropdown một mục là điều khiển chết. Ở đây là
                THÔNG TIN NGỮ CẢNH, không phải bộ chọn. */}
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
              { key: 'logout', label: 'Đăng xuất', onClick: () => void logout() },
            ],
          }}
        >
          <button type="button" className={styles.avatarButton} aria-label="Tài khoản">
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
