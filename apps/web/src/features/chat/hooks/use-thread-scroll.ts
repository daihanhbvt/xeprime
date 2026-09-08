'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Khoảng cách tính từ đáy mà vẫn coi là "đang ở đáy".
 *
 * Không phải 0: chiều cao dòng lẻ, ảnh vừa tải xong và cuộn mượt của trình duyệt luôn để lại vài
 * pixel dư, nên `scrollTop + clientHeight === scrollHeight` gần như không bao giờ đúng — và một
 * ngưỡng 0 nghĩa là tin mới không bao giờ tự cuộn.
 */
export const NEAR_BOTTOM_PX = 80;

export interface ThreadScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Người xem có đang ở gần đáy không — luật thuần, tách ra để test được không cần DOM. */
export function isNearBottom(box: ThreadScrollBox, threshold = NEAR_BOTTOM_PX): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= threshold;
}

/**
 * Vị trí cuộn MỚI sau khi chèn thêm tin CŨ lên đầu.
 *
 * Cả bài toán "giữ nguyên tin đang nhìn" gói gọn ở đây: nội dung mới mọc thêm phía TRÊN, nên
 * `scrollTop` phải cộng đúng phần chiều cao vừa mọc thêm. Không làm thì viewport tụt lên đầu
 * danh sách và người đọc mất chỗ.
 */
export function anchoredScrollTop(previousHeight: number, box: ThreadScrollBox): number {
  return box.scrollTop + (box.scrollHeight - previousHeight);
}

interface ThreadScrollOptions {
  /** Khoá của hội thoại đang mở — đổi khoá là reset toàn bộ trạng thái cuộn. */
  conversationId: string | null;
  /** Danh sách tin hiện tại; hook chỉ cần biết id cuối và số lượng, không cần nội dung. */
  lastMessageId: string | null;
  messageCount: number;
  /** Tin cuối có phải do CHÍNH người dùng vừa gửi không — tin của mình luôn được cuộn tới. */
  lastMessageIsMine: boolean;
  /** Đang tải xong lần đầu chưa: chỉ neo đáy sau khi có nội dung thật để neo. */
  ready: boolean;
}

export interface ThreadScrollState {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** `true` khi có tin mới đến trong lúc người dùng đang đọc tin cũ. */
  hasNewBelow: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Gọi NGAY TRƯỚC khi chèn tin cũ; trả hàm khôi phục vị trí sau khi DOM đã cập nhật. */
  captureAnchor: () => () => void;
}

/**
 * Điều khiển cuộn của khung tin nhắn.
 *
 * Tất cả thao tác đi qua `scrollTop` của CHÍNH container, không `scrollIntoView`. Bản trước dùng
 * `scrollIntoView` trên một `<div/>` mốc ở cuối danh sách, và trình duyệt cuộn **tổ tiên cuộn
 * được gần nhất** — trên màn hẹp đó là cả trang, nên mỗi tin mới lại kéo tụt cả header xuống.
 *
 * Và điều kiện cuộn KHÔNG phải `messages.length`: tải thêm 30 tin cũ cũng làm `length` đổi, nên
 * mỗi lần cuộn lên đọc lịch sử là một lần bị ném về đáy. Cái quyết định là *tin cuối có đổi
 * không* và *người dùng có đang ở gần đáy không*.
 */
export function useThreadScroll(options: ThreadScrollOptions): ThreadScrollState {
  const { conversationId, lastMessageId, messageCount, lastMessageIsMine, ready } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const nearBottomRef = useRef(true);
  const lastSeenIdRef = useRef<string | null>(null);
  const didInitialScrollRef = useRef(false);
  const openedIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = containerRef.current;
    if (!el) return;

    /*
     * Hội thoại ngắn hơn khung thì KHÔNG gọi cuộn.
     *
     * `scrollTo` trên phần tử không cuộn được là lệnh rỗng, nhưng gọi nó vẫn vô nghĩa và che mất
     * ý định. Quan trọng hơn: đây là chỗ duy nhất phát lệnh cuộn, nên chặn ở đây bảo đảm màn chat
     * không bao giờ là thứ làm TRANG dịch chuyển — phần đó thuộc về chiều cao khung (xem
     * `--xp-chat-offset`), không phải về hook này.
     */
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
    nearBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    nearBottomRef.current = near;
    if (near) setHasNewBelow(false);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll, conversationId]);

  /*
   * `useLayoutEffect`: chạy SAU khi DOM cập nhật nhưng TRƯỚC khi trình duyệt vẽ. Với `useEffect`
   * thì có đúng một khung hình danh sách hiện ra ở sai chỗ rồi mới nhảy — nhìn thấy được, và
   * chính là cái "giật" khi mở một thread dài.
   */
  useLayoutEffect(() => {
    /*
     * Reset khi ĐỔI HỘI THOẠI nằm NGAY ĐÂY, không ở một `useEffect` riêng.
     *
     * Tách ra là một cái bẫy thứ tự thật: `useLayoutEffect` chạy TRƯỚC mọi `useEffect`, nên lượt
     * neo đáy đầu tiên xảy ra rồi mới tới lượt reset — và reset đặt `scrollTop = 0`, xoá sạch cú
     * cuộn vừa làm. Thread mở ra ở đầu lịch sử thay vì ở tin mới nhất. Gộp vào cùng một effect
     * thì không còn hai thứ tự để sai.
     */
    if (openedIdRef.current !== conversationId) {
      openedIdRef.current = conversationId;
      nearBottomRef.current = true;
      lastSeenIdRef.current = null;
      didInitialScrollRef.current = false;
      setHasNewBelow(false);
    }

    if (!ready || messageCount === 0) return;

    // Lần đầu mở thread: xuống đáy, không animation (chưa có gì để "chuyển động từ").
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      lastSeenIdRef.current = lastMessageId;
      scrollToBottom('auto');
      return;
    }

    // Tin cuối KHÔNG đổi ⇒ thay đổi vừa rồi là tin cũ chèn lên đầu, hoặc chỉ là re-render.
    if (lastMessageId === lastSeenIdRef.current) return;
    lastSeenIdRef.current = lastMessageId;

    if (lastMessageIsMine || nearBottomRef.current) {
      scrollToBottom(lastMessageIsMine ? 'smooth' : 'auto');
      return;
    }

    // Đang đọc tin cũ: KHÔNG cưỡng ép cuộn — chỉ báo có tin mới ở dưới.
    setHasNewBelow(true);
  }, [conversationId, ready, messageCount, lastMessageId, lastMessageIsMine, scrollToBottom]);

  /*
   * Ảnh trong bong bóng tải xong SAU khi layout đã xong và làm khung cao thêm — nếu người dùng
   * đang ở đáy thì phải theo xuống, nếu không tin cuối trôi ra ngoài màn hình mà không ai chạm
   * vào thanh cuộn. `ResizeObserver` bắt được cả trường hợp cửa sổ đổi kích thước.
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [conversationId, messageCount]);

  /**
   * Neo vị trí khi chèn tin CŨ. Đo TRƯỚC, khôi phục SAU — nơi gọi giữ cặp này liền nhau.
   *
   * `requestAnimationFrame` không dùng ở đây: nó để trình duyệt vẽ một khung hình ở sai vị trí
   * trước khi sửa. Nơi gọi chạy hàm khôi phục ngay sau khi await xong và React đã flush.
   */
  const captureAnchor = useCallback(() => {
    const el = containerRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    return () => {
      const target = containerRef.current;
      if (!target) return;
      target.scrollTop = anchoredScrollTop(previousHeight, target);
    };
  }, []);

  return { containerRef, hasNewBelow, scrollToBottom, captureAnchor };
}
