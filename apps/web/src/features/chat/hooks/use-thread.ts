'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CHAT_SEND_STATE,
  markThreadMessageFailed,
  mergeThreadMessages,
  newClientMessageId,
  removeThreadMessage,
  type ThreadMessage,
} from '@xeprime/domain';
import { collection, limit as fbLimit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { queryKeys } from '@/services/query-keys';
import { chatApi } from '../api';
import { useChatRealtime } from '../context/ChatRealtimeContext';
import type { ChatMessage, MessageCursor, SendMessageInput } from '../types';

export type ThreadEntry = ThreadMessage<ChatMessage>;

export interface SendAttachment {
  url: string;
  fileType: string;
  fileName: string;
  fileSize: number;
}

export interface ThreadState {
  entries: ThreadEntry[];
  hasOlder: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  reload: () => void;
  loadOlder: () => Promise<void>;
  /** Gửi tin: chèn bản lạc quan NGAY, rồi hoà giải với bản server. */
  send: (input: {
    text?: string;
    attachments?: SendAttachment[];
    /** Xe tin nhắn này nói về — thẻ ngữ cảnh, chỉ gắn ở câu đầu tiên mở từ tin đăng. */
    vehicleId?: string;
  }) => Promise<void>;
  /** Gửi lại một tin `failed` — dùng lại đúng `clientMessageId` nên server nhận diện là một lần. */
  retry: (clientMessageId: string) => Promise<void>;
  /** Bỏ hẳn một tin gửi hỏng. */
  discard: (clientMessageId: string) => void;
}

/**
 * Nhịp hỏi tin mới. Realtime chỉ làm nó THƯA ĐI, không bao giờ tắt hẳn.
 *
 * Bản trước tắt poll khi đã đăng nhập được Firebase, và đó là một suy luận sai: mint được custom
 * token chỉ chứng minh CREDENTIAL tồn tại, không chứng minh đường ống projection còn sống. Hai
 * thứ đó độc lập — worker outbox không chạy (hoặc `FIRESTORE_ENABLED=false` ở worker, hoặc rules
 * chặn) thì `onSnapshot` im lặng vĩnh viễn, và tắt poll nghĩa là thread không bao giờ tự làm mới:
 * bên A nhắn, bên B phải F5. Đúng lỗi đã gặp.
 *
 * Nhịp thưa khi có realtime là lưới an toàn, không phải đường chính — nên nó không kéo theo chi
 * phí đáng kể, mà vẫn bảo đảm hộp thư KHÔNG BAO GIỜ đứng im quá nửa phút dù tầng nào hỏng.
 */
const POLL_LIVE_MS = 25_000;
const POLL_FALLBACK_MS = 5_000;

/**
 * MỘT state cho cả thread, mang theo `key` của hội thoại nó thuộc về.
 *
 * Gộp lại (thay vì sáu `useState` rời) là thứ làm cho việc chống "phản hồi lạc lối" thành một
 * phép so sánh duy nhất: mọi lời gọi bất đồng bộ ghi state qua hàm cập nhật và tự bỏ qua nếu
 * `key` đã đổi. Không cần ref thế hệ, và không có đường nào ghi nửa vời một nửa state của
 * hội thoại này lên nửa kia.
 */
interface ThreadData {
  key: string;
  entries: ThreadEntry[];
  cursor: MessageCursor | null;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
}

const threadKeyOf = (conversationId: string | null, nonce: number) => `${conversationId ?? ''}#${nonce}`;

const emptyThread = (key: string, conversationId: string | null): ThreadData => ({
  key,
  entries: [],
  cursor: null,
  loading: conversationId != null,
  loadingOlder: false,
  error: null,
});

/**
 * Thread chat: REST là nguồn hiển thị thống nhất (ADR 0009), realtime chỉ là tín hiệu "có tin
 * mới" để refetch. Snapshot và đồng hồ chạy SONG SONG — xem effect ở dưới.
 *
 * Ba thứ hook này tồn tại để giải quyết, và cả ba đều là lỗi ĐÃ có ở bản trước:
 *
 *  1. **Ba nguồn không đồng bộ** (REST đầu tiên, tin lạc quan, refetch do realtime) đến theo thứ
 *     tự bất kỳ. Việc gộp KHÔNG viết ở đây mà ở `@xeprime/domain` (`mergeThreadMessages`), nên
 *     nó có unit test và app native dùng đúng luật đó.
 *  2. **Phản hồi lạc lối**: đổi hội thoại A → B trong lúc request của A đang bay thì kết quả của
 *     A không được ghi vào B. Mọi lời gọi mang theo `key` của lúc nó khởi hành và so lại BÊN
 *     TRONG hàm cập nhật state — chỗ duy nhất React bảo đảm đang đọc giá trị mới nhất.
 *  3. **Tin lạc quan THẬT**. Bản trước chỉ chèn tin SAU khi API trả 200 (dù chú thích ghi
 *     "optimistic") — trên mạng chậm, người dùng gõ xong và nhìn một ô trống vài giây. Giờ tin
 *     hiện ngay ở trạng thái `pending`, và `clientMessageId` là thứ khớp nó với bản server; gửi
 *     lại sau timeout dùng lại chính khoá đó nên server trả về tin cũ chứ không tạo tin thứ hai.
 */
export function useThread(conversationId: string | null): ThreadState {
  const t = useTranslations('Chat');
  const { db, ready } = useChatRealtime();
  const queryClient = useQueryClient();

  const [reloadNonce, setReloadNonce] = useState(0);
  const key = threadKeyOf(conversationId, reloadNonce);
  const [data, setData] = useState<ThreadData>(() => emptyThread(key, conversationId));

  /*
   * Reset khi ĐỔI HỘI THOẠI xảy ra trong lúc render, không trong một effect.
   *
   * Đây là mẫu "điều chỉnh state khi prop đổi" của React, và nó là cách đúng ở đây: reset trong
   * `useEffect` nghĩa là có đúng một lượt render vẽ tin nhắn của hội thoại CŨ dưới tiêu đề của
   * hội thoại MỚI trước khi effect kịp dọn — cái "loé" khi bấm nhanh giữa hai cuộc trò chuyện.
   * React thấy `setState` ngay trong thân render thì bỏ luôn kết quả và render lại, chưa vẽ gì.
   */
  if (data.key !== key) {
    setData(emptyThread(key, conversationId));
  }

  /**
   * Bản sao mới nhất của danh sách, cho các lời gọi bất đồng bộ đọc mà KHÔNG phải nằm trong deps.
   *
   * Nếu `refreshLatest` phụ thuộc thẳng vào `data.entries`, nó đổi danh tính sau mỗi tin — và
   * effect dựng listener/đồng hồ sẽ tháo rồi dựng lại theo, tức là huỷ đăng ký Firestore mỗi lần
   * có tin nhắn.
   *
   * Đồng bộ trong EFFECT chứ không ghi thẳng lúc render (React Compiler chặn, và đúng là không
   * nên). Ref vì thế trễ một nhịp commit — chấp nhận được, vì nó chỉ dùng để quyết định có gọi
   * `markRead` hay không: sai một nhịp thì cùng lắm là gọi thừa một lần, không ảnh hưởng nội dung
   * hiển thị (phần đó do `mergeThreadMessages` lo, luôn đọc `prev` thật trong updater).
   */
  const entriesRef = useRef<ThreadEntry[]>(data.entries);
  useEffect(() => {
    entriesRef.current = data.entries;
  }, [data.entries]);

  /** Ghi state chỉ khi thread chưa đổi — nếu đổi rồi thì phản hồi này đã lạc hậu. */
  const applyIfCurrent = useCallback(
    (forKey: string, update: (prev: ThreadData) => ThreadData) => {
      setData((prev) => (prev.key === forKey ? update(prev) : prev));
    },
    [],
  );

  const invalidateInbox = useCallback(() => {
    // Không biết người xem đang ở bề mặt nào, và không cần biết: tiền tố `chat` phủ cả hai.
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
  }, [queryClient]);

  const markRead = useCallback(
    (id: string) => {
      chatApi
        .markRead(id)
        .then(invalidateInbox)
        .catch(() => undefined);
    },
    [invalidateInbox],
  );

  // Tải trang mới nhất. `key` trong deps phủ cả đổi hội thoại lẫn bấm "thử lại".
  useEffect(() => {
    if (!conversationId) return undefined;

    let cancelled = false;
    chatApi
      .messages(conversationId)
      .then((page) => {
        if (cancelled) return;
        applyIfCurrent(key, (prev) => ({
          ...prev,
          entries: mergeThreadMessages(prev.entries, page.data),
          cursor: page.next,
          loading: false,
        }));
        markRead(conversationId);
      })
      .catch(() => {
        if (cancelled) return;
        applyIfCurrent(key, (prev) => ({
          ...prev,
          loading: false,
          error: t('messagesLoadError'),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, key, applyIfCurrent, markRead, t]);

  /**
   * Nạp lại trang MỚI NHẤT và gộp vào. Không thay thế danh sách: người dùng có thể đã cuộn lên
   * và tải năm trang lịch sử — thay thế là ném hết công đó đi và giật màn hình về đáy.
   */
  const refreshLatest = useCallback(async () => {
    if (!conversationId) return;
    try {
      const page = await chatApi.messages(conversationId);

      /*
       * "Có tin mới không" đọc từ REF, không từ bên trong hàm cập nhật state.
       *
       * Bản trước gán một biến closure ngay trong updater của `setData` rồi đọc nó ở dòng sau.
       * React gọi updater khi RENDER, không phải lúc `setData` trả về — nên biến đó gần như luôn
       * còn là 0, và `markRead` gần như không bao giờ chạy: badge chưa đọc cứ sáng dù người dùng
       * đang mở đúng hội thoại đó. (StrictMode còn gọi updater hai lần, nên nó cũng không phải
       * chỗ được phép có tác dụng phụ.)
       */
      const known = new Set(entriesRef.current.map((e) => e.message.id));
      const hasNew = page.data.some((m) => !known.has(m.id));

      applyIfCurrent(key, (prev) => ({
        ...prev,
        entries: mergeThreadMessages(prev.entries, page.data),
      }));

      if (hasNew) markRead(conversationId);
    } catch {
      // Im lặng — đây là lượt làm mới nền, lỗi mạng thoáng qua không nên hiện lên màn hình.
    }
  }, [conversationId, key, applyIfCurrent, markRead]);

  /*
   * Realtime VÀ poll chạy SONG SONG, không phải chọn một.
   *
   * Cả hai đều chỉ gọi `refreshLatest`, và `refreshLatest` gộp theo danh tính tin
   * (`mergeThreadMessages`) nên hai nguồn cùng mang về một tin là chuyện vô hại — đó chính là
   * điều kiện để dám chạy song song. Snapshot lo độ trễ (tức thì khi đường ống sống), đồng hồ lo
   * độ tin cậy (vẫn về tin khi đường ống chết).
   */
  useEffect(() => {
    if (!conversationId) return undefined;

    const live = Boolean(db && ready);
    let unsubscribe: () => void = () => undefined;

    if (live && db) {
      const q = query(
        collection(db, `conversations/${conversationId}/messages`),
        orderBy('sentAt', 'desc'),
        fbLimit(30),
      );
      unsubscribe = onSnapshot(
        q,
        () => {
          void refreshLatest();
        },
        () => undefined,
      );
    }

    const timer = setInterval(
      () => {
        void refreshLatest();
      },
      live ? POLL_LIVE_MS : POLL_FALLBACK_MS,
    );

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [conversationId, db, ready, refreshLatest]);

  const loadOlder = useCallback(async () => {
    const cursor = data.cursor;
    if (!conversationId || !cursor || data.loadingOlder) return;

    applyIfCurrent(key, (prev) => ({ ...prev, loadingOlder: true }));
    try {
      const page = await chatApi.messages(conversationId, cursor);
      applyIfCurrent(key, (prev) => ({
        ...prev,
        entries: mergeThreadMessages(prev.entries, page.data),
        cursor: page.next,
        loadingOlder: false,
      }));
    } catch {
      // Giữ nguyên cursor: bấm lại là thử lại đúng trang đó.
      applyIfCurrent(key, (prev) => ({ ...prev, loadingOlder: false }));
    }
  }, [conversationId, key, data.cursor, data.loadingOlder, applyIfCurrent]);

  /**
   * Đưa một tin đi. Bản lạc quan mang `id` tạm nhưng `clientMessageId` THẬT — merge khớp theo
   * khoá đó, nên bản server về sau thay chỗ nó thay vì nằm cạnh nó.
   */
  const dispatchSend = useCallback(
    async (body: SendMessageInput, optimistic: ChatMessage) => {
      if (!conversationId) return;
      const clientMessageId = optimistic.clientMessageId;

      applyIfCurrent(key, (prev) => ({
        ...prev,
        entries: mergeThreadMessages(prev.entries, [optimistic], CHAT_SEND_STATE.PENDING),
      }));

      try {
        const saved = await chatApi.send(conversationId, body);
        applyIfCurrent(key, (prev) => ({
          ...prev,
          entries: mergeThreadMessages(prev.entries, [saved]),
        }));
        invalidateInbox();
      } catch (err) {
        if (clientMessageId) {
          applyIfCurrent(key, (prev) => ({
            ...prev,
            entries: markThreadMessageFailed(prev.entries, clientMessageId),
          }));
        }
        throw err;
      }
    },
    [conversationId, key, applyIfCurrent, invalidateInbox],
  );

  const send = useCallback(
    async (input: { text?: string; attachments?: SendAttachment[]; vehicleId?: string }) => {
      if (!conversationId) return;
      const clientMessageId = newClientMessageId();
      const attachments = input.attachments ?? [];
      const body: SendMessageInput = {
        clientMessageId,
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
        ...(input.text ? { text: input.text } : {}),
        ...(attachments.length ? { attachments } : {}),
      };

      await dispatchSend(body, {
        id: `local-${clientMessageId}`,
        conversationId,
        senderUserId: null,
        senderName: null,
        senderType: '',
        messageType: '',
        text: input.text ?? null,
        clientMessageId,
        attachments: attachments.map((a) => ({
          url: a.url,
          fileType: a.fileType,
          fileName: a.fileName,
          fileSize: a.fileSize,
        })),
        sentAt: new Date().toISOString(),
      });
    },
    [conversationId, dispatchSend],
  );

  const retry = useCallback(
    async (clientMessageId: string) => {
      const entry = data.entries.find((e) => e.message.clientMessageId === clientMessageId);
      if (!entry) return;
      const { message } = entry;

      await dispatchSend(
        {
          clientMessageId,
          ...(message.text ? { text: message.text } : {}),
          ...(message.attachments.length
            ? {
                attachments: message.attachments.map((a) => ({
                  url: a.url,
                  ...(a.fileType ? { fileType: a.fileType } : {}),
                  ...(a.fileName ? { fileName: a.fileName } : {}),
                  ...(a.fileSize != null ? { fileSize: a.fileSize } : {}),
                })),
              }
            : {}),
        },
        message,
      );
    },
    [data.entries, dispatchSend],
  );

  const discard = useCallback(
    (clientMessageId: string) => {
      applyIfCurrent(key, (prev) => ({
        ...prev,
        entries: removeThreadMessage(prev.entries, clientMessageId),
      }));
    },
    [key, applyIfCurrent],
  );

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  return {
    entries: data.entries,
    hasOlder: data.cursor !== null,
    loading: data.loading,
    loadingOlder: data.loadingOlder,
    error: data.error,
    reload,
    loadOlder,
    send,
    retry,
    discard,
  };
}
