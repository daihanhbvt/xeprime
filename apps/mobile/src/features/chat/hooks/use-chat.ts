import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { chatApi, type ConversationListResult } from '@/features/chat/api';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import type { Href } from 'expo-router';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import { ROUTES } from '@/navigation/routes';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useOnBadgeChange } from '@/features/badges/hooks/use-on-badge-change';
import { queryKeys } from '@/queries/query-keys';

/**
 * Nhịp làm mới DANH SÁCH — chỉ còn là LƯỚI AN TOÀN.
 *
 * Đường chính là bản chiếu huy hiệu: nó bao trùm MỌI hội thoại của người này, nên nó là tín hiệu
 * đúng cho một danh sách. Listener của thread thì không — nó chỉ nghe đúng hội thoại đang mở, và
 * đó là lý do trước đây một tin đến ở hội thoại KHÁC chỉ làm đổi con số trên biểu tượng chat còn
 * dòng trong danh sách đứng im tới nhịp poll kế tiếp.
 *
 * Hai con số lấy nguyên của web (`use-conversations.ts`).
 */
const LIST_POLL_LIVE_MS = 60_000;
const LIST_POLL_FALLBACK_MS = 10_000;

export interface ConversationListFilters {
  q?: string;
  unreadOnly?: boolean;
}


/**
 * Hộp thư của MỘT bề mặt, tải dần theo cuộn.
 *
 * `side` là tham số BẮT BUỘC, không có mặc định — y như web. Một tài khoản vừa thuê xe của gian
 * hàng khác vừa là nhân viên gian hàng mình có HAI hộp thư, và `side` nằm trong queryKey chứ
 * không chỉ trong query string: khoá chung nghĩa là mở inbox gian hàng sẽ ghi đè cache của hộp
 * thư khách.
 *
 * Phân trang là tải-thêm-khi-cuộn thay cho bộ số trang của web, nhưng việc CẮT TRANG và LỌC vẫn
 * ở server — không có chỗ nào kéo cả hộp thư về rồi lọc tại chỗ.
 */
export function useConversationsInfinite(side: ChatSide, filters: ConversationListFilters = {}) {
  const params = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.unreadOnly ? { unreadOnly: true } : {}),
  };
  const { counts, live } = useBadgeRealtime();
  const queryClient = useQueryClient();
  const appActive = useAppActive();

  /*
   * Con số chưa đọc của CHÍNH bề mặt này đổi ⇒ có gì đó vừa xảy ra ở một hội thoại nào đó ⇒
   * tải lại danh sách. Đây là cầu nối mà trước đây thiếu: bản chiếu huy hiệu biết MỌI hội
   * thoại, còn listener của thread chỉ biết một.
   */
  useOnBadgeChange(side === CHAT_SIDE.CUSTOMER ? counts.chatCustomer : counts.chatShop, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations(side) });
  });

  const query = useInfiniteQuery({
    // KHÔNG có `page` trong khoá — page là `pageParam` của TanStack (quy ước `*Infinite`).
    queryKey: queryKeys.chat.conversations(side, params),
    queryFn: ({ pageParam }) => chatApi.list({ side, ...filters }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: ConversationListResult) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    // Giữ danh sách cũ khi đổi bộ lọc — nếu không, mỗi ký tự gõ vào ô tìm là một lần màn trắng.
    placeholderData: keepPreviousData,
    refetchInterval: appActive ? (live ? LIST_POLL_LIVE_MS : LIST_POLL_FALLBACK_MS) : false,
    /*
     * LUÔN hỏi lại khi đổi bộ lọc. Đây là một lỗi thật, không phải tinh chỉnh.
     *
     * "Tất cả" và "Chưa đọc" là HAI khoá cache riêng, và chỉ khoá đang hiển thị mới chạy
     * `refetchInterval`. Với `staleTime` mặc định 30 giây, dữ liệu của khoá kia vẫn được coi là
     * CÒN TƯƠI khi ta quay lại — TanStack hiện thẳng bản cũ và không hỏi gì. Hệ quả đúng như
     * người dùng mô tả: "Tất cả" đã có tin B, bấm sang "Chưa đọc" vẫn chỉ thấy tin A, phải chờ
     * nhịp poll kế tiếp (10–30 giây) mới khớp.
     *
     * `staleTime: 0` cho một query VỐN ĐÃ poll không thêm tải đáng kể: nó chỉ thay một lần chờ
     * tới nhịp sau bằng một lần hỏi ngay. Bản cũ vẫn hiện trong lúc chờ (`keepPreviousData`),
     * nên không có màn trắng nào.
     *
     * ⚠️ ĐÂY LÀ CHỖ DUY NHẤT LỆCH WEB, và là lệch có chủ đích. `useConversations` bên web không
     * khai `staleTime` nên nó ăn mặc định 30 giây của `QueryClient` — tức WEB CÓ ĐÚNG LỖI NÀY.
     * Giữ bản sửa ở đây vì nó là lỗi đã tái hiện được trên máy thật, không phải một khác biệt
     * về nghiệp vụ. Khi web được sửa thì xoá chú thích này, đừng xoá dòng `staleTime`.
     */
    staleTime: 0,
  });

  /*
   * `refetch` của TanStack đổi danh tính mỗi lần render, nên bọc lại: `useRefetchOnForeground`
   * giữ nó trong deps của một effect, và một hàm đổi danh tính ở đó sẽ bắn refetch liên tục.
   */
  const { refetch } = query;
  useRefetchOnForeground(useCallback(() => void refetch(), [refetch]));

  return query;
}

/**
 * Một hội thoại theo id — đường vào của DEEP LINK.
 *
 * Màn thread nhận id qua route param chứ không nhận cả object hội thoại: `xeprime://chat/<id>`
 * mở thẳng từ ngoài app, và ở đó không có danh sách nào để lấy tiêu đề ra. Cũng là lý do không
 * suy từ trang đầu danh sách: một thread im lặng ba tuần nằm ở trang 4.
 */
export function useConversation(side: ChatSide, id: string) {
  return useQuery({
    queryKey: queryKeys.chat.conversation(side, id),
    queryFn: () => chatApi.detail(id, side),
    enabled: Boolean(id),
    // 403 vì dán id của hộp thư kia sang bề mặt này — thử lại vẫn 403.
    retry: false,
  });
}



/*
 * ĐÃ GỠ: `useChatUnreadCount(side)` và `useChatUnreadSummary()`.
 *
 * Mọi con số chưa đọc nay đến từ `GET /me/badges` qua `useBadges` — MỘT query cho cả khung
 * ứng dụng, và cùng một bản chiếu Firestore cập nhật cả ba con số một lúc. Hai endpoint cũ
 * (`/conversations/unread-count`, `/conversations/unread-summary`) VẪN CÒN ở backend cho các
 * bản app cũ — tài liệu chuyển tiếp §A ghi rõ là không gỡ trong đợt này — app chỉ ngừng gọi.
 */
export interface ChatBadge {
  /** Con số hiện trên biểu tượng — tổng CẢ HAI vai. */
  count: number;
  /** Hộp thư nên mở khi bấm vào biểu tượng. */
  href: Href;
}

/**
 * Biểu tượng chat trên thanh trên cùng — con số và đích đến. Bản native của `useChatBadge` web.
 *
 * Bài toán nó giải: một chủ gian hàng đang lướt chợ xe KHÔNG hề biết khách vừa nhắn vào shop, vì
 * badge ở khu khách chỉ đếm hộp thư khách. Người dùng chỉ có một khái niệm "tin nhắn chưa đọc";
 * việc nó nằm ở vai nào là chuyện nội bộ của hệ thống.
 *
 * Nên badge đếm TỔNG, còn đích đến thì chọn theo nơi thật sự có tin: ưu tiên hộp thư của bề mặt
 * đang đứng, và chỉ nhảy sang bề mặt kia khi bên này không còn gì. Thiếu bước đó thì con số và
 * màn hình mở ra nói hai điều khác nhau — badge báo 3, mở ra trống trơn.
 */
export function useChatBadge(surface: ChatSide): ChatBadge {
  /*
   * Con số đến từ `/me/badges` (một query cho cả khung ứng dụng), KHÔNG còn từ
   * `/conversations/unread-summary`. Provider tự tắt khi chưa đăng nhập nên nơi gọi không
   * phải truyền `enabled` nữa.
   *
   * ⚠️ Tên trường khác bộ cũ: `chatCustomer`/`chatShop` thay cho `customer`/`shop`.
   */
  const { chatCustomer, chatShop } = useBadges();

  const here = surface === CHAT_SIDE.CUSTOMER ? chatCustomer : chatShop;
  const there = surface === CHAT_SIDE.CUSTOMER ? chatShop : chatCustomer;

  const stay = surface === CHAT_SIDE.CUSTOMER ? ROUTES.chat.list() : ROUTES.manage.chat();
  const away = surface === CHAT_SIDE.CUSTOMER ? ROUTES.manage.chat() : ROUTES.chat.list();

  return {
    count: chatCustomer + chatShop,
    href: here === 0 && there > 0 ? away : stay,
  };
}
