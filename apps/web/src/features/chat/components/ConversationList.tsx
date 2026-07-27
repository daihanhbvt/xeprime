'use client';

import { Badge } from 'antd';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/datetime';
import type { ConversationSummary } from '../types';
import styles from './ChatView.module.css';

/** Danh sách hội thoại (presentational — dữ liệu do ChatView nạp). */
export function ConversationList({
  items,
  selectedId,
  onSelect,
}: {
  items: ConversationSummary[];
  selectedId: string | null;
  onSelect: (conversation: ConversationSummary) => void;
}) {
  return (
    <ul className={styles.convList}>
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className={cx(styles.convItem, c.id === selectedId && styles.convActive)}
            onClick={() => onSelect(c)}
          >
            <div className={styles.convTop}>
              <span className={styles.convParty}>{c.partyName}</span>
              {c.lastMessageAt ? (
                <span className={styles.convTime}>{formatDateTime(c.lastMessageAt)}</span>
              ) : null}
            </div>
            <div className={styles.convBottom}>
              <span className={styles.convPreview}>
                {c.lastMessageText ??
                  (c.vehicleName ? `Về ${c.vehicleName}` : 'Bắt đầu trò chuyện')}
              </span>
              {c.unread > 0 ? <Badge count={c.unread} size="small" /> : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
