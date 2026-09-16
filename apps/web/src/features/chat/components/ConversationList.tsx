'use client';

import { Avatar, Badge, Button, Empty, Input, Skeleton } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { CHAT_SIDE } from '@xeprime/types';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import { useAppFormat } from '@/i18n/use-app-format';
import { initialOf } from '@/lib/initials';
import type { ConversationSummary } from '../types';
import styles from './ChatView.module.css';

export type ConversationFilterKey = 'all' | 'unread';

interface ConversationListProps {
  items: ConversationSummary[];
  /**
   * Danh sách đang trộn HAI VAI (hộp thư hợp nhất) ⇒ mỗi dòng mang một nhãn vai.
   *
   * Prop chứ không suy từ dữ liệu: một hộp thư khách mà tình cờ chỉ có hội thoại khách vẫn là
   * hộp thư một-vai, và ở đó nhãn là nhiễu vì mọi dòng mang cùng một chữ.
   */
  showRole: boolean;
  selectedId: string | null;
  onSelect: (conversation: ConversationSummary) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filter: ConversationFilterKey;
  onFilterChange: (filter: ConversationFilterKey) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: boolean;
  onRetry: () => void;
}

/**
 * Cột trái: tìm kiếm + lọc + danh sách tải dần theo cuộn.
 *
 * Lọc và tìm kiếm chạy Ở SERVER (`?q=`, `?unreadOnly=`), không phải `filter()` trên trang đầu:
 * một hộp thư vài trăm hội thoại thì lọc phía client chỉ lọc trong 20 dòng đã tải, và người dùng
 * kết luận rằng cuộc trò chuyện của họ biến mất.
 */
export function ConversationList({
  items,
  showRole,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  error,
  onRetry,
}: ConversationListProps) {
  const t = useTranslations('Chat');
  const sentinelRef = useRef<HTMLDivElement>(null);

  /*
   * Tải trang kế bằng `IntersectionObserver` chứ không bằng sự kiện `scroll`: sự kiện cuộn bắn
   * hàng chục lần mỗi giây và phải tự tính `scrollTop + clientHeight >= scrollHeight`, thứ sai
   * ngay khi có `padding` hay `border` ở dưới.
   */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: '160px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  /** Mũi tên lên/xuống đi giữa các hội thoại — bàn phím phải đi được hết màn này. */
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const index = items.findIndex((c) => c.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    const target = items[next];
    if (!target) return;
    event.preventDefault();
    onSelect(target);
  };

  return (
    <div className={styles.listInner}>
      <div className={styles.listHeader}>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          prefix={<SearchOutlined />}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          allowClear
        />
        <div className={styles.filterRow} role="group" aria-label={t('filterLabel')}>
          {(['all', 'unread'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={cx(styles.filterChip, filter === key && styles.filterChipActive)}
              aria-pressed={filter === key}
              onClick={() => onFilterChange(key)}
            >
              {key === 'all' ? t('filterAll') : t('filterUnread')}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.listScroll}>
        {loading ? (
          <div className={styles.listSkeleton}>
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} avatar active paragraph={{ rows: 1 }} title={{ width: '60%' }} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.centerPane}>
            <span className={styles.error}>{t('loadError')}</span>
            <Button size="small" onClick={onRetry}>
              {t('retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.centerPane}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={search || filter === 'unread' ? t('noMatches') : t('empty')}
            />
          </div>
        ) : (
          <>
            <ul
              className={styles.convList}
              role="listbox"
              aria-label={t('conversationsLabel')}
              onKeyDown={onKeyDown}
            >
              {items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  selected={c.id === selectedId}
                  onSelect={onSelect}
                  showRole={showRole}
                />
              ))}
            </ul>
            <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
            {loadingMore ? (
              <div className={styles.listSkeleton}>
                <Skeleton avatar active paragraph={{ rows: 1 }} title={{ width: '60%' }} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
  showRole,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  onSelect: (conversation: ConversationSummary) => void;
  /** Danh sách đang trộn hai vai — xem `ConversationListProps.showRole`. */
  showRole: boolean;
}) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const preview =
    conversation.lastMessageText ??
    (conversation.vehicleName
      ? t('about', { subject: conversation.vehicleName })
      : t('startConversation'));

  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        className={cx(styles.convItem, selected && styles.convActive)}
        onClick={() => onSelect(conversation)}
        // `tabIndex` -1 cho dòng không được chọn: một hộp thư 200 dòng mà mỗi dòng là một điểm
        // dừng Tab thì bàn phím không bao giờ ra khỏi cột trái. Mũi tên đi trong danh sách.
        tabIndex={selected ? 0 : -1}
      >
        <Avatar
          size={40}
          src={conversation.partyAvatarUrl ?? undefined}
          className={styles.convAvatar}
        >
          {initialOf(conversation.partyName)}
        </Avatar>

        <span className={styles.convBody}>
          <span className={styles.convTop}>
            <span className={styles.convParty}>{conversation.partyName}</span>
            {/*
              Nhãn VAI, chỉ ở hộp thư hợp nhất.

              Ở đó hai dòng cạnh nhau có thể là hai việc khác hẳn: một chủ xe mà tôi đang thuê,
              và một khách đang hỏi xe của tôi. Tên phía bên kia không nói ra điều đó — cả hai đều
              chỉ là một cái tên — nên người đọc phải tự nhớ, và họ sẽ trả lời nhầm giọng.

              Ở hai hộp thư một-vai thì nhãn này là nhiễu: mọi dòng đều mang cùng một chữ.
            */}
            {showRole ? (
              <span className={styles.convRole}>
                {t(conversation.side === CHAT_SIDE.SHOP ? 'roleAsHost' : 'roleAsRenter')}
              </span>
            ) : null}
            {conversation.lastMessageAt ? (
              <time className={styles.convTime} dateTime={conversation.lastMessageAt}>
                {fmt.dateTime(conversation.lastMessageAt)}
              </time>
            ) : null}
          </span>

          {conversation.vehicleName ? (
            <span className={styles.convVehicle}>{conversation.vehicleName}</span>
          ) : null}

          <span className={styles.convBottom}>
            <span className={cx(styles.convPreview, conversation.unread > 0 && styles.convPreviewUnread)}>
              {preview}
            </span>
            {conversation.unread > 0 ? (
              <Badge
                count={conversation.unread}
                overflowCount={99}
                size="small"
                title={t('unreadCount', { count: conversation.unread })}
              />
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}
