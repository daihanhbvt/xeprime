'use client';

import {
  DownOutlined,
  MenuOutlined,
  MessageOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown } from 'antd';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { ROUTES } from '@/constants/routes';
import { useAppDispatch } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import { destroySession } from '@/services/auth.service';
import type { CurrentUser } from '@/hooks/use-current-user';
import styles from './Topbar.module.css';

export function Topbar({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { data: chatUnread } = useChatUnreadCount();

  const handleLogout = async () => {
    await destroySession();
    // Xoá cache: dữ liệu người vừa thoát không hiện lại cho người đăng nhập kế trên cùng máy.
    queryClient.clear();
    router.replace(ROUTES.LOGIN);
  };

  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();

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
        {/* Chọn chi nhánh — hiện là placeholder, đa chi nhánh mở ở phase sau. */}
        <Dropdown
          trigger={['click']}
          menu={{ items: [{ key: 'all', label: 'Tất cả chi nhánh' }], selectable: true, selectedKeys: ['all'] }}
        >
          <button type="button" className={styles.branch}>
            <ShopOutlined />
            <span className={styles.branchLabel}>Tất cả chi nhánh</span>
            <DownOutlined className={styles.branchCaret} />
          </button>
        </Dropdown>
      </div>

      <div className={styles.right}>
        <Badge count={chatUnread?.count ?? 0} size="small" overflowCount={99}>
          <Button
            type="text"
            shape="circle"
            icon={<MessageOutlined />}
            aria-label="Trò chuyện"
            onClick={() => router.push(ROUTES.MANAGE.CHAT)}
          />
        </Badge>
        <NotificationBell context="manage" />
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'name', label: user.displayName, disabled: true },
              { type: 'divider' },
              { key: 'logout', label: 'Đăng xuất', onClick: () => void handleLogout() },
            ],
          }}
        >
          <Avatar className={styles.avatar} src={user.avatarUrl ?? undefined} icon={<UserOutlined />}>
            {user.avatarUrl ? null : initial}
          </Avatar>
        </Dropdown>
      </div>
    </header>
  );
}
