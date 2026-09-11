'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Trạng thái của MỘT listener realtime — và lý do nó phải là bốn giá trị chứ không phải một cờ.
 *
 * Lỗi đã gặp thật: chat và huy hiệu đều lấy "có realtime không" từ `ChatRealtimeContext.ready`,
 * mà `ready` chỉ chứng minh `signInWithCustomToken` thành công. Đăng nhập được Firebase và LẮNG
 * NGHE được một document là hai điều khác nhau: rules chưa đẩy, rules sai, hoặc subscription
 * chết giữa chừng đều để `ready = true` trong khi không có snapshot nào bao giờ tới. Client tin
 * mình đang realtime nên hạ nhịp hỏi lại xuống mức "lưới an toàn" — và người nhận phải đợi trọn
 * một nhịp đó mới thấy tin nhắn.
 *
 * Nhịp `live` CHỈ được dùng khi trạng thái là `live`, tức là listener đó đã thật sự nhận một
 * snapshot TỪ SERVER. Không suy từ tầng nào khác.
 */
export const REALTIME_STATE = {
  /** Chưa cấu hình Firebase, chưa đăng nhập, hoặc nơi gọi chưa bật. */
  DISABLED: 'disabled',
  /** Đã đăng ký listener, chưa nhận snapshot nào từ server. */
  CONNECTING: 'connecting',
  /** Đã nhận snapshot từ SERVER — đây là điều kiện DUY NHẤT để tin là realtime đang chạy. */
  LIVE: 'live',
  /** Listener bị từ chối hoặc rớt. Đang đợi thử lại; nơi gọi phải quay về đường dự phòng NGAY. */
  ERROR: 'error',
} as const;

export type RealtimeState = (typeof REALTIME_STATE)[keyof typeof REALTIME_STATE];

export interface RealtimeHandlers {
  /**
   * Gọi khi nhận snapshot TỪ SERVER.
   *
   * Firestore phát lại từ cache cục bộ khi mạng chập chờn, và một snapshot như vậy KHÔNG chứng
   * minh đường ống phía sau còn sống — nó chỉ chứng minh trình duyệt còn nhớ dữ liệu cũ. Nơi
   * gọi phải tự lọc bằng `snapshot.metadata.fromCache` trước khi gọi hàm này.
   */
  live(): void;
  /** Gọi khi listener lỗi. Hook hạ trạng thái xuống `error` và hẹn thử lại. */
  failed(error: unknown): void;
}

/** Lùi theo cấp số nhân, trần 30 giây. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/**
 * Nhiễu ±25%. Không có nó thì mọi tab đang mở cùng rớt kết nối sẽ cùng thử lại đúng một khoảnh
 * khắc, và Firestore nhận một đợt dồn thay vì một dòng đều.
 */
function retryDelay(attempt: number): number {
  const base = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

interface Status {
  /** Trạng thái thuộc về ĐÚNG subscription nào — đổi khoá là mọi thứ cũ hết giá trị. */
  key: string;
  live: boolean;
  errored: boolean;
}

export interface RealtimeSubscriptionOptions {
  /** Tắt hẳn: chưa đăng nhập, chưa cấu hình, hoặc màn hình chưa cần. */
  enabled: boolean;
  /**
   * Danh tính của subscription. Đổi khoá (đổi hội thoại, đổi tài khoản) ⇒ tháo listener cũ,
   * dựng listener mới, và VỨT trạng thái cũ — không để một thread báo "live" nhờ thread trước đó.
   */
  key: string;
  /** Nhãn cho log ở development. Không bao giờ chứa dữ liệu người dùng. */
  label: string;
  /** Dựng listener, trả về hàm huỷ đăng ký. */
  subscribe: (handlers: RealtimeHandlers) => () => void;
}

/**
 * Một listener, một trạng thái, có thử lại.
 *
 * Vòng đời: `enabled` hoặc `key` đổi ⇒ huỷ đăng ký cũ và dựng lại. Lỗi ⇒ `error` ngay (nơi gọi
 * rơi về đường dự phòng lập tức) rồi hẹn thử lại với backoff + jitter. Thành công ⇒ `live` và
 * backoff reset về 0.
 */
export function useRealtimeSubscription(options: RealtimeSubscriptionOptions): RealtimeState {
  const { enabled, key, label } = options;

  const [status, setStatus] = useState<Status | null>(null);
  const [attempt, setAttempt] = useState(0);
  const backoff = useRef(0);

  /*
   * `subscribe` gần như luôn là một closure mới mỗi lần render. Để nó trong deps nghĩa là tháo
   * và dựng lại listener sau MỌI lần render — vừa tốn, vừa làm trạng thái nhấp nháy. Giữ bản mới
   * nhất trong ref, và effect đồng bộ ref được khai TRƯỚC effect đăng ký nên nó luôn chạy trước.
   */
  const subscribeRef = useRef(options.subscribe);
  useEffect(() => {
    subscribeRef.current = options.subscribe;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = subscribeRef.current({
      live: () => {
        if (cancelled) return;
        backoff.current = 0;
        setStatus({ key, live: true, errored: false });
      },
      failed: (error) => {
        if (cancelled) return;
        setStatus({ key, live: false, errored: true });
        warnRealtime(label, error);

        const delay = retryDelay(backoff.current++);
        retryTimer = setTimeout(() => {
          if (!cancelled) setAttempt((n) => n + 1);
        }, delay);
      },
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe();
      /*
       * Vứt trạng thái của subscription vừa tháo, ngay trong cleanup.
       *
       * So theo `key` thôi thì chưa đủ: `enabled` có thể nháy false→true với CÙNG một `key` —
       * `ChatRealtimeContext` đặt `ready = false` ở cleanup mỗi khi danh tính `user` đổi rồi
       * đăng nhập lại. Giữ lại `live` cũ nghĩa là hook báo "đang nghe được" cho một listener vừa
       * dựng lại và chưa nhận snapshot nào — đúng cái bẫy mà cả hook này sinh ra để gỡ.
       *
       * Backoff cũng reset: một khoá vừa lỗi không được để khoá kế tiếp bắt đầu ở mức chờ 30 giây.
       */
      setStatus(null);
      backoff.current = 0;
    };
    // `attempt` có mặt để một lần thử lại dựng lại listener; `subscribe` cố ý KHÔNG có mặt.
  }, [enabled, key, label, attempt]);

  if (!enabled) return REALTIME_STATE.DISABLED;

  // Trạng thái của một khoá KHÁC không nói gì về khoá hiện tại — coi như đang kết nối lại.
  const current = status && status.key === key ? status : null;
  if (current?.errored) return REALTIME_STATE.ERROR;
  if (current?.live) return REALTIME_STATE.LIVE;
  return REALTIME_STATE.CONNECTING;
}

/**
 * Nói ra lý do — CHỈ ở development.
 *
 * Ở production im lặng là đúng: đường dự phòng đã lo phần chức năng, và người dùng không cần
 * biết. Nhưng im lặng ở dev chính là thứ khiến lỗi này sống sót lâu đến vậy — mọi tầng đều trông
 * như đang chạy, chỉ có độ trễ là sai.
 *
 * Không bao giờ log token, dữ liệu người dùng hay nội dung snapshot: chỉ nhãn và thông điệp lỗi.
 */
function warnRealtime(label: string, error: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  const message = String((error as Error)?.message ?? error).slice(0, 200);
  console.warn(`[XePrime] realtime "${label}" lỗi → dùng đường dự phòng REST: ${message}`);
}
