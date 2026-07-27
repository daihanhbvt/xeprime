'use client';

import { Empty, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { useConversations } from '../hooks/use-conversations';
import { ConversationList } from './ConversationList';
import { ThreadPanel } from './ThreadPanel';
import styles from './ChatView.module.css';

/**
 * Màn chat 2 cột (danh sách + thread). Dùng chung khu quản lý (shop) và khu khách — scope theo
 * participant nên hiển thị mọi hội thoại của user. Trên mobile hiện một cột (list ↔ thread).
 * `initialConversationId` để deep-link (nút "Nhắn shop" → mở đúng thread).
 */
export function ChatView({ initialConversationId }: { initialConversationId?: string | null }) {
  const { data, isLoading, isError } = useConversations();
  const items = useMemo(() => data?.items ?? [], [data]);
  // Khởi tạo từ deep-link (`?c=`); `selected` suy từ danh sách khi tải xong. Người dùng bấm để đổi.
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const selected = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <div className={styles.wrap}>
      <aside className={cx(styles.listPane, selected && styles.listHiddenMobile)}>
        {isLoading ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : isError ? (
          <div className={styles.centerPane}>
            <span className={styles.error}>Không tải được hội thoại</span>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.centerPane}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có hội thoại" />
          </div>
        ) : (
          <ConversationList
            items={items}
            selectedId={selectedId}
            onSelect={(c) => setSelectedId(c.id)}
          />
        )}
      </aside>

      <section className={cx(styles.threadPane, !selected && styles.threadHiddenMobile)}>
        {selected ? (
          <ThreadPanel key={selected.id} conversation={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className={styles.centerPane}>
            <span className={styles.hint}>Chọn một hội thoại để xem.</span>
          </div>
        )}
      </section>
    </div>
  );
}
