'use client';

import { Badge } from 'antd';
import { cx } from '@/lib/cx';
import type { ConversationSummary } from '../types';
import styles from './ChatView.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

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
                <span className={styles.convTime}>{fmt.dateTime(c.lastMessageAt)}</span>
              ) : null}
            </div>
            <div className={styles.convBottom}>
              <span className={styles.convPreview}>
                {c.lastMessageText ??
                  (c.vehicleName ? t('about', { subject: c.vehicleName }) : t('startConversation'))}
              </span>
              {c.unread > 0 ? <Badge count={c.unread} size="small" /> : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
