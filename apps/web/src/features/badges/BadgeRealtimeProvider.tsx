'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  USER_BADGES_COLLECTION,
  type UserBadgeCounts,
  type UserBadgeDoc,
} from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useChatRealtime } from '@/features/chat/context/ChatRealtimeContext';
import { REALTIME_STATE, useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { fetchBadges, type BadgesSnapshot } from './api';

/**
 * Nhịp hỏi lại khi ĐANG nghe được Firestore: hai phút một lần, và nó chỉ còn là lưới an toàn —
 * bắt đúng trường hợp worker chết hoặc bản chiếu lệch. Không có nó thì một sự cố thầm lặng ở
 * worker sẽ đóng băng badge của mọi người cho tới lần tải lại trang.
 */
const POLL_LIVE_MS = 120_000;

/**
 * Nhịp khi KHÔNG nghe được (chưa bật Firestore, rules chưa đẩy, mất quyền, rớt mạng). Ba mươi
 * giây chứ không phải tám: badge là con số phụ trợ, và `refetchOnWindowFocus` đã lo phần "quay
 * lại tab là thấy số mới ngay" — thứ mà người dùng thật sự cảm nhận được.
 */
const POLL_FALLBACK_MS = 30_000;

const EMPTY: UserBadgeCounts = { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 };

interface BadgeRealtime {
  /** Con số hiện tại — nguồn duy nhất cho chuông, biểu tượng chat và huy hiệu menu. */
  counts: UserBadgeCounts;
  /**
   * Đang NGHE được con số thay vì phải hỏi lại — tức là listener của CHÍNH document này đã nhận
   * một snapshot từ server. KHÔNG suy từ "đã đăng nhập Firebase": hai điều đó độc lập, và tin
   * vào điều thứ hai là lý do badge từng đứng im trong khi mọi tầng trông như đang chạy.
   */
  live: boolean;
}

const BadgeRealtimeCtx = createContext<BadgeRealtime | null>(null);

export function useBadgeRealtime(): BadgeRealtime {
  const ctx = useContext(BadgeRealtimeCtx);
  if (!ctx) throw new Error('useBadgeRealtime phải nằm trong <BadgeRealtimeProvider>');
  return ctx;
}

/**
 * Nghe huy hiệu của chính mình từ Firestore và ghi thẳng vào cache của TanStack Query.
 *
 * Đây là đường CHÍNH để badge cập nhật; REST (`GET /me/badges`) tụt xuống vai bootstrap + lưới an
 * toàn. Khác biệt không nằm ở độ trễ mà ở chỗ chi phí bám vào đâu: hỏi lại theo nhịp thì mỗi tab
 * đang mở là một dòng tải đều đặn lên API và Postgres, dù con số hàng giờ không đổi; nghe thì chi
 * phí chỉ phát sinh khi có việc thật.
 *
 * ## Ai thắng khi hai nguồn nói khác nhau
 *
 * Cả hai nguồn đều mang `asOf` theo ĐỒNG HỒ MÁY CHỦ (`UserBadgeDoc.updatedAt` do worker ghi,
 * `asOf` do API ghi sau khi đếm), nên "bản nào mới hơn" là một phép so sánh đúng chứ không phải
 * một phỏng đoán theo thứ tự đến. Bản có `asOf` lớn hơn thắng, và điều đó đóng CẢ HAI chiều đua:
 *
 *  - document Firestore CŨ — ví dụ còn lại sau một quãng `FIRESTORE_ENABLED=false` — không đè
 *    được lên lượt đọc REST mới hơn, và không phải chờ hết nhịp lưới an toàn mới sửa lại;
 *  - một response REST khởi hành TRƯỚC nhưng về SAU không đè được lên bản chiếu mới hơn.
 *
 * Dùng chung phiên Firebase của chat (`useChatRealtime`) một cách có chủ ý: cùng một Firebase
 * app, cùng một lần `signInWithCustomToken`. Mở phiên thứ hai chỉ để nghe một document là trả
 * tiền hai lần cho đúng một kết nối.
 *
 * Đăng ký MỘT lần ở gốc ứng dụng thay vì trong từng hook: chuông, biểu tượng chat và menu đều
 * cần con số này, và ba listener trên cùng một document là ba lần trả phí cho một dữ liệu.
 */
export function BadgeRealtimeProvider({ children }: { children: ReactNode }) {
  const { db, ready } = useChatRealtime();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const userId = user?.id;

  const state = useRealtimeSubscription({
    /*
     * `key` là user id, nên đổi tài khoản tự động tháo listener cũ và dựng listener mới. Không
     * có trạng thái realtime nào sống sót qua ranh giới đó — `useRealtimeSubscription` vứt mọi
     * trạng thái không thuộc khoá hiện tại. Cache badge thì `resetQueries()` lúc đăng xuất dọn.
     */
    enabled: Boolean(db && ready && userId),
    key: userId ?? '',
    label: 'badge',
    subscribe: ({ live, failed }) => {
      if (!db || !userId) return () => undefined;

      return onSnapshot(
        doc(db, USER_BADGES_COLLECTION, userId),
        (snapshot) => {
          /*
           * Snapshot từ CACHE cục bộ không chứng minh backend realtime còn khoẻ — nó chỉ chứng
           * minh trình duyệt còn nhớ. Không tính là `live`, và cũng không áp vào cache.
           */
          if (snapshot.metadata.fromCache) return;
          live();

          const data = snapshot.data() as UserBadgeDoc | undefined;
          // Document chưa tồn tại = người này chưa có sự kiện nào ⇒ đúng là 0, và REST đã nói vậy.
          if (!data) return;

          const cached = queryClient.getQueryData<BadgesSnapshot>(queryKeys.badges.me());
          if (cached && data.updatedAt <= cached.asOf) return;

          queryClient.setQueryData<BadgesSnapshot>(queryKeys.badges.me(), {
            chatCustomer: data.chatCustomer,
            chatShop: data.chatShop,
            notificationsUnread: data.notificationsUnread,
            asOf: data.updatedAt,
          });
        },
        failed,
      );
    },
  });

  const live = state === REALTIME_STATE.LIVE;

  /*
   * MỘT observer duy nhất trong toàn ứng dụng — xem docblock của `useBadges`. Đây cũng là lý do
   * query nằm ở provider chứ không ở hook: `refetchInterval` là đồng hồ của từng observer.
   */
  const { data } = useQuery({
    queryKey: queryKeys.badges.me(),
    queryFn: async (): Promise<BadgesSnapshot> => {
      const fetched = await fetchBadges();

      /*
       * Cuộc đua giữa hai nguồn: một snapshot realtime tới TRONG LÚC request này đang bay. Nó có
       * thể mới hơn, và vì lưới an toàn chỉ chạy hai phút một lần nên một lần ghi đè sai sẽ đứng
       * đó tới hai phút.
       *
       * So bằng `asOf` — mốc do MÁY CHỦ đặt ở cả hai nguồn — thay vì theo thứ tự đến: bản nào
       * phản ánh trạng thái muộn hơn thì thắng, bất kể bản nào về trước.
       */
      const cached = queryClient.getQueryData<BadgesSnapshot>(queryKeys.badges.me());
      return cached && cached.asOf > fetched.asOf ? cached : fetched;
    },
    enabled: Boolean(userId),
    refetchInterval: live ? POLL_LIVE_MS : POLL_FALLBACK_MS,
    refetchOnWindowFocus: true,
  });

  /*
   * `data` giữ nguyên danh tính giữa các lần render khi giá trị không đổi (structural sharing của
   * TanStack Query), và `EMPTY` là hằng số module — nên `counts` đủ ổn định để làm dependency.
   */
  const counts = data ?? EMPTY;
  const value = useMemo<BadgeRealtime>(() => ({ counts, live }), [counts, live]);

  return <BadgeRealtimeCtx.Provider value={value}>{children}</BadgeRealtimeCtx.Provider>;
}
