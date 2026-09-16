'use client';

import { Spin } from 'antd';
import { CHAT_INBOX, CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { resolveChatInbox } from '../chat-inbox';
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

/** Tham số URL giữ hội thoại đang mở — chia sẻ được, sống sót F5, và nút Back hoạt động. */
const CONVERSATION_PARAM = 'c';
/** Xe người dùng vừa bấm "Nhắn shop" từ tin đăng — ngữ cảnh chờ gắn vào câu đầu tiên. */
const VEHICLE_PARAM = 'v';

/**
 * Màn chat hai cột (danh sách + thread), một cột trên màn hẹp.
 *
 * `side` là BỀ MẶT — route nào đang dựng màn này — và nó là PROP BẮT BUỘC, không suy từ đường
 * dẫn. Nó quyết định BỐ CỤC: khu khách nằm trong một trang cuộn được, khu quản lý nằm trong một
 * vỏ đã khoá `100dvh`.
 *
 * DỮ LIỆU thì do `resolveChatInbox` quyết, và hai thứ đó KHÔNG phải một (16/09/2026). Chủ xe
 * tuyến hoa hồng đứng ở bề mặt khách nhưng đọc hộp thư HỢP NHẤT: họ không có `/manage/chat` để
 * đặt hộp thư công việc, nên với họ "tin nhắn" là một khái niệm chứ không phải hai.
 *
 * Bản trước dựng cùng một danh sách cho hai route nên chủ shop mở khu quản lý thấy lẫn cả hội
 * thoại riêng của mình. Ranh giới đó vẫn còn: bề mặt `shop` không bao giờ hợp nhất, vì
 * `/manage/chat` là bàn làm việc chung của cả gian hàng.
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

  const { data: user } = useCurrentUser();
  /*
   * Chưa biết mình là ai ⇒ `resolveChatInbox` trả hộp thư của bề mặt. Đó là phía AN TOÀN của
   * phép đoán: hộp thư khách là tập con, nên lúc `/auth/me` trả về, danh sách chỉ RỘNG ra chứ
   * không bao giờ phải thu lại một hội thoại đã hiện.
   */
  const inbox = resolveChatInbox(side, user);

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
  const selectedId = searchParams.get(CONVERSATION_PARAM) ?? initialConversationId ?? null;
  const pendingVehicleId = searchParams.get(VEHICLE_PARAM);

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
      if (id) params.set(CONVERSATION_PARAM, id);
      else params.delete(CONVERSATION_PARAM);
      // Đổi hội thoại thì ngữ cảnh xe cũ hết nghĩa — bỏ luôn, không mang sang thread khác.
      params.delete(VEHICLE_PARAM);
      const qs = params.toString();
      // `replace`, không `push`: mỗi lần bấm sang hội thoại khác mà thêm một mục lịch sử thì
      // người dùng phải bấm Back mười lần để rời khỏi màn chat.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /** Gỡ `?v=` sau khi thẻ ngữ cảnh đã đi kèm câu đầu tiên (hoặc người dùng bỏ nó). */
  const clearPendingVehicle = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has(VEHICLE_PARAM)) return;
    params.delete(VEHICLE_PARAM);
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
          showRole={inbox === CHAT_INBOX.UNIFIED}
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
            onClearPendingVehicle={clearPendingVehicle}
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
