import { collection, limit as fbLimit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect } from 'react';
import { MESSAGES_DEFAULT_LIMIT } from '@/features/chat/api';
import { useRealtimeSubscription, type RealtimeState } from '@/hooks/use-realtime-subscription';
import { LISTENER_SKIP_REASON, chatDebug } from '@/lib/chat-debug';
import { useChatRealtime } from './ChatRealtimeProvider';

/**
 * Nghe projection Firestore của MỘT thread và báo "có gì đó đổi" — không hơn.
 *
 * Đây là chỗ ADR 0009 §1 sống trong code: snapshot KHÔNG được vẽ ra màn hình. Doc Firestore là
 * bản chiếu rút gọn (không có `clientMessageId`, không có thẻ xe, `sentAt` là epoch số chứ không
 * phải ISO), nên dựng bong bóng từ nó là có hai định dạng tin nhắn trong cùng một danh sách và
 * `mergeThreadMessages` mất khả năng nhận ra tin trùng. Snapshot chỉ kích hoạt một lượt đọc REST,
 * và REST là nguồn hiển thị duy nhất.
 *
 * Cùng truy vấn với web (`orderBy('sentAt','desc') + limit`) để hai client tốn đúng một lượng đọc
 * như nhau — chi phí Firestore tính theo document đọc, và trần đó là cả lý do projection chỉ giữ
 * tin gần nhất.
 *
 * ## Trả về TRẠNG THÁI, không phải `void`
 *
 * Nơi gọi chọn nhịp poll theo giá trị này. Bản trước chọn theo `ready` của
 * `ChatRealtimeProvider`, mà `ready` chỉ chứng minh `signInWithCustomToken` thành công — rules
 * chưa đẩy hay subscription chết giữa chừng đều để nó `true` trong khi không snapshot nào bao giờ
 * tới. Client tin mình đang realtime nên hạ nhịp xuống 25 giây, và người nhận đợi trọn nhịp đó.
 * Đây đúng là lỗi web đã sửa ngày 11/09/2026 (`use-realtime-subscription.ts`).
 *
 * `onChange` phải ỔN ĐỊNH (bọc `useCallback`): `useRealtimeSubscription` giữ `subscribe` trong
 * ref nên danh tính của nó không tháo listener, nhưng một `onChange` đổi liên tục vẫn là một
 * closure mới đọc state cũ.
 */
export function useThreadRealtime(
  conversationId: string | null,
  onChange: () => void,
): RealtimeState {
  const { db, ready } = useChatRealtime();

  /*
   * Nói ra LÝ DO khi KHÔNG gắn được listener.
   *
   * `useRealtimeSubscription` chỉ nhận một cờ `enabled`, nên nếu không có dòng này thì một bản
   * log chỉ còn `thread.transport {source:"poll"}` — và nó không phân biệt được "realtime hỏng
   * giữa chừng" với "realtime chưa từng bật được". Không có thread nào đang mở (rời màn, app
   * xuống nền) là chuyện bình thường, không log.
   */
  useEffect(() => {
    if (!conversationId) return;
    if (!db) chatDebug.listenerSkipped(conversationId, LISTENER_SKIP_REASON.NO_CONFIG);
    else if (!ready) chatDebug.listenerSkipped(conversationId, LISTENER_SKIP_REASON.NOT_SIGNED_IN);
  }, [conversationId, db, ready]);

  return useRealtimeSubscription({
    enabled: Boolean(db && ready && conversationId),
    key: conversationId ?? '',
    label: 'chat thread',
    subscribe: ({ live, failed }) => {
      // `enabled` đã bảo đảm hai giá trị này tồn tại; nhánh này chỉ để hợp kiểu.
      if (!db || !conversationId) return () => undefined;

      const q = query(
        collection(db, `conversations/${conversationId}/messages`),
        orderBy('sentAt', 'desc'),
        fbLimit(MESSAGES_DEFAULT_LIMIT),
      );

      chatDebug.listenerAttached(conversationId);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          /*
           * Snapshot phát lại TỪ CACHE không chứng minh đường ống còn sống — nó chỉ chứng minh
           * máy còn nhớ dữ liệu cũ. Tin nó là quay lại đúng cái bẫy vừa gỡ: client hạ nhịp poll
           * dựa trên một bằng chứng không nói lên điều gì về backend.
           *
           * Vẫn gọi `onChange()`: một lượt đọc REST thừa thì vô hại, còn bỏ qua nó thì tin nhắn
           * đến trong lúc mạng chập chờn sẽ phải đợi nhịp poll.
           */
          if (!snapshot.metadata.fromCache) live();
          chatDebug.listenerSnapshot(conversationId, snapshot.size);
          onChange();
        },
        (error) => {
          /*
           * Rules từ chối hay mạng chết chỉ TẮT realtime, không làm hỏng thread: đồng hồ poll vẫn
           * chạy song song (xem `useThread`) nên tin vẫn về. Không đẩy lỗi này lên giao diện —
           * người dùng không làm gì được với "permission-denied" của Firestore.
           *
           * `failed` hạ trạng thái xuống `error` NGAY (nơi gọi siết nhịp poll lại) rồi hẹn thử
           * lại với backoff + jitter.
           */
          chatDebug.listenerError(conversationId, error);
          failed(error);
        },
      );

      return () => {
        unsubscribe();
        chatDebug.listenerDetached(conversationId);
      };
    },
  });
}
