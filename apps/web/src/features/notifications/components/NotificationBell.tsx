'use client';

import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, Popover, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDateTime } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { getErrorMessage } from '@/services/api-client';
import { useNotifications } from '../hooks/use-notifications';
import { useMarkAllRead, useMarkRead } from '../hooks/use-notification-mutations';
import { useUnreadCount } from '../hooks/use-unread-count';
import {
  notificationHref,
  notificationIcon,
  type NotificationContext,
} from '../lib/notification-display';
import type { NotificationItem } from '../types';
import styles from './NotificationBell.module.css';

/**
 * Chuông thông báo — badge số chưa đọc + popover danh sách. Dùng chung ở Topbar khu quản lý
 * (`context="manage"`) và MarketHeader khu khách (`context="customer"`) — link click-through
 * khác nhau theo ngữ cảnh.
 */
export function NotificationBell({ context }: { context: NotificationContext }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const { data: unread } = useUnreadCount();
  const list = useNotifications({ limit: 15 }, open);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const unreadCount = unread?.count ?? 0;

  const handleItem = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = notificationHref(n, context);
    setOpen(false);
    if (href) router.push(href);
  };

  const content = (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>Thông báo</span>
        <Button
          type="link"
          size="small"
          disabled={unreadCount === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      <div className={styles.body}>
        {list.isLoading ? (
          <div className={styles.center}>
            <Spin />
          </div>
        ) : list.isError ? (
          <div className={styles.center}>
            <span className={styles.error}>{getErrorMessage(list.error)}</span>
          </div>
        ) : !list.data || list.data.items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có thông báo"
            className={styles.empty}
          />
        ) : (
          <ul className={styles.list}>
            {list.data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cx(styles.item, !n.readAt && styles.itemUnread)}
                  onClick={() => handleItem(n)}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {notificationIcon(n.type)}
                  </span>
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    {n.body ? <span className={styles.itemText}>{n.body}</span> : null}
                    <span className={styles.itemTime}>{formatDateTime(n.createdAt)}</span>
                  </span>
                  {!n.readAt ? <span className={styles.dot} aria-label="Chưa đọc" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      styles={{ content: { padding: 0 } }}
    >
      <Badge count={unreadCount} size="small" overflowCount={99}>
        <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="Thông báo" />
      </Badge>
    </Popover>
  );
}
