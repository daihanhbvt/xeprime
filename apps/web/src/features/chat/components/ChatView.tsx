'use client';

import { Spin } from 'antd';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { resolveChatInbox } from '../chat-inbox';
import { CHAT_CONVERSATION_PARAM, CHAT_TRIP_PARAM, CHAT_VEHICLE_PARAM } from '../chat-links';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cx } from '@/lib/cx';
import {
  useConversationById,
  useConversationsInfinite,
} from '../hooks/use-conversations';
import type { ConversationSummary } from '../types';
import { ConversationList, type ConversationFilterKey } from './ConversationList';
import { ThreadPanel } from './ThreadPanel';
import styles from './ChatView.module.css';

/** Ngữ cảnh chờ gắn vào câu đầu tiên — sống trên URL cho tới khi đã gắn hoặc bị bỏ. */
const CONTEXT_PARAMS = [CHAT_VEHICLE_PARAM, CHAT_TRIP_PARAM] as const;

/**
 * Màn chat hai cột (danh sách + thread), một cột trên màn hẹp.
 *
 * `side` là BỀ MẶT — route nào đang dựng màn này — và nó là PROP BẮT BUỘC, không suy từ đường
 * dẫn. Nó quyết định BỐ CỤC: khu khách nằm trong một trang cuộn được, khu quản lý nằm trong một
 * vỏ đã khoá `100dvh`.
 *
 * DỮ LIỆU do `resolveChatInbox` quyết theo bề mặt (ADR 0053): site khách đọc hộp thư khách, site
 * partner đọc hộp thư gian hàng — bàn làm việc chung của cả gian hàng, không trộn hội thoại riêng.
 */
export function ChatView({
  side,
  initialConversationId,
}: {
  side: ChatSide;
  initialConversationId?: string | null;
}) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const inbox = resolveChatInbox(side);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilterKey>('all');
  // Lọc chạy ở server, nên mỗi ký tự là một request — chờ người dùng ngừng gõ đã.
  const debouncedSearch = useDebouncedValue(search, 350);

  /*
   * Hội thoại đang mở sống trong URL (`?c=`), không trong state.
   *
   * Ba thứ có được miễn phí nhờ vậy: dán link mở đúng thread, F5 không mất chỗ, và trên màn hẹp
   * nút Back của trình duyệt đóng thread về danh sách thay vì rời hẳn khỏi trang chat.
   */
  const selectedId = searchParams.get(CHAT_CONVERSATION_PARAM) ?? initialConversationId ?? null;
  const pendingVehicleId = searchParams.get(CHAT_VEHICLE_PARAM);
  const pendingTripId = searchParams.get(CHAT_TRIP_PARAM);

  const listQuery = useConversationsInfinite(inbox, {
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    ...(filter === 'unread' ? { unreadOnly: true } : {}),
  });

  const items = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );

  const fromList = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId],
  );

  /*
   * Deep link tới một thread KHÔNG nằm trong các trang đã tải.
   *
   * Bản trước suy `selected` từ danh sách, nên `?c=` của một hội thoại im lặng ba tuần (nằm ở
   * trang 4, hoặc bị bộ lọc "chưa đọc" loại ra) mở ra một màn trống. Query này chỉ chạy khi
   * danh sách đã tải xong mà vẫn không thấy id đó.
   */
  const detailQuery = useConversationById(
    inbox,
    selectedId,
    Boolean(selectedId) && !fromList && !listQuery.isPending,
  );

  const selected: ConversationSummary | null = fromList ?? detailQuery.data ?? null;
  const resolvingSelected = Boolean(selectedId) && !selected && detailQuery.isPending;

  const setSelectedId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(CHAT_CONVERSATION_PARAM, id);
      else params.delete(CHAT_CONVERSATION_PARAM);
      // Đổi hội thoại thì ngữ cảnh xe/chuyến cũ hết nghĩa — bỏ luôn, không mang sang thread khác.
      CONTEXT_PARAMS.forEach((p) => params.delete(p));
      const qs = params.toString();
      // `replace`, không `push`: mỗi lần bấm sang hội thoại khác mà thêm một mục lịch sử thì
      // người dùng phải bấm Back mười lần để rời khỏi màn chat.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /** Gỡ `?v=` / `?t=` sau khi thẻ ngữ cảnh đã đi kèm câu đầu tiên (hoặc người dùng bỏ nó). */
  const clearPendingContext = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!CONTEXT_PARAMS.some((p) => params.has(p))) return;
    CONTEXT_PARAMS.forEach((p) => params.delete(p));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  /*
   * `?c=` trỏ tới một hội thoại không đọc được (id sai, hoặc dán link của hộp thư kia sang khu
   * quản lý — server trả 403 theo `side`): dọn tham số đi thay vì để màn hình treo ở khung chờ.
   */
  useEffect(() => {
    if (detailQuery.isError && selectedId) setSelectedId(null);
  }, [detailQuery.isError, selectedId, setSelectedId]);

  return (
    /*
     * Hai bề mặt dựng khung theo hai cách KHÁC HẲN nhau, không phải hai con số khác nhau:
     * khu khách nằm trong một trang cuộn được nên tự tính chiều cao; khu quản lý nằm trong một
     * vỏ đã khoá `100dvh` nên chỉ việc lấp đầy. `side` đã nói đúng route, không cần đọc pathname.
     */
    <div
      className={cx(
        styles.wrap,
        side === CHAT_SIDE.CUSTOMER ? styles.wrapCustomer : styles.wrapShop,
      )}
    >
      <aside
        className={cx(styles.listPane, selected && styles.listHiddenMobile)}
        aria-label={t('conversationsLabel')}
      >
        <ConversationList
          items={items}
          // Mỗi hộp thư một vai (ADR 0053) — không còn danh sách trộn hai vai cần nhãn vai.
          showRole={false}
          selectedId={selectedId}
          onSelect={(c) => setSelectedId(c.id)}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          loading={listQuery.isPending}
          loadingMore={listQuery.isFetchingNextPage}
          hasMore={Boolean(listQuery.hasNextPage)}
          onLoadMore={() => void listQuery.fetchNextPage()}
          error={listQuery.isError}
          onRetry={() => void listQuery.refetch()}
        />
      </aside>

      <section className={cx(styles.threadPane, !selected && styles.threadHiddenMobile)}>
        {selected ? (
          <ThreadPanel
            conversation={selected}
            onBack={() => setSelectedId(null)}
            pendingVehicleId={pendingVehicleId}
            pendingTripId={pendingTripId}
            onClearPendingContext={clearPendingContext}
          />
        ) : resolvingSelected ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : (
          <div className={styles.emptyThreadPane}>
            <div className={styles.emptyMark} aria-hidden="true" />
            <h2 className={styles.emptyTitle}>{t('welcomeTitle')}</h2>
            <p className={styles.emptyText}>{t('pickConversation')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
