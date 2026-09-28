import { useQueryClient } from '@tanstack/react-query';
import type { ChatSide } from '@xeprime/types';
import {
  chatApi,
  type ChatMessage,
  type MessageCursor,
  type SendMessageInput,
} from '@/features/chat/api';
import {
  CHAT_SEND_STATE,
  markThreadMessageFailed,
  mergeThreadMessages,
  newClientMessageId,
  removeThreadMessage,
  type ThreadMessage,
  ownSenderType,
} from '@xeprime/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_DEBUG_SOURCE, chatDebug, type ChatDebugSource } from '@/lib/chat-debug';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import type { UploadedAttachment } from '@/lib/r2-image-upload';
import { useRefreshBadges } from '@/features/badges/hooks/use-badges';
import { queryKeys } from '@/queries/query-keys';
import { REALTIME_STATE } from '@/hooks/use-realtime-subscription';
import { useThreadRealtime } from '../realtime/use-thread-realtime';

export type ThreadEntry = ThreadMessage<ChatMessage>;

/**
 * Đính kèm đã sẵn sàng gắn vào một tin nhắn.
 *
 * Là ALIAS của thứ `uploadAttachmentToR2` trả về, không phải một khai báo thứ hai cùng hình dạng:
 * ô soạn tin đưa thẳng kết quả tải lên vào `send()`, nên hai kiểu đó buộc phải khớp nhau, và hai
 * bản khai báo là hai chỗ để chúng trôi khỏi nhau.
 */
export type SendAttachment = UploadedAttachment;

/**
 * Nhịp hỏi tin mới. Realtime chỉ làm nó THƯA ĐI, không bao giờ tắt hẳn — cùng hai con số web dùng.
 *
 * Mint được custom token chỉ chứng minh CREDENTIAL tồn tại, không chứng minh đường ống projection
 * còn sống. Hai thứ đó độc lập: worker outbox không chạy (hoặc `FIRESTORE_ENABLED=false` ở worker,
 * hoặc rules chặn) thì `onSnapshot` im lặng vĩnh viễn, và tắt poll nghĩa là bên A nhắn, bên B
 * phải kéo xuống làm mới. Nhịp thưa khi có realtime là lưới an toàn, không phải đường chính.
 */
const POLL_LIVE_MS = 25_000;
const POLL_FALLBACK_MS = 5_000;

interface ThreadData {
  key: string;
  entries: ThreadEntry[];
  cursor: MessageCursor | null;
  loading: boolean;
  loadingOlder: boolean;
  error: unknown;
}

const emptyThread = (key: string): ThreadData => ({
  key,
  entries: [],
  cursor: null,
  loading: true,
  loadingOlder: false,
  error: null,
});

export interface ThreadState {
  entries: ThreadEntry[];
  hasOlder: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: unknown;
  reload: () => void;
  loadOlder: () => void;
  send: (input: {
    text?: string;
    attachments?: SendAttachment[];
    /** Xe tin nhắn này nói về — thẻ ngữ cảnh, chỉ gắn ở câu đầu tiên mở từ tin đăng. */
    vehicleId?: string;
  }) => Promise<void>;
  retry: (clientMessageId: string) => Promise<void>;
  discard: (clientMessageId: string) => void;
}

/**
 * Thread chat trên native — CÙNG luật hoà giải với web.
 *
 * Việc gộp/khử trùng/sắp xếp KHÔNG viết lại ở đây: nó nằm ở `@xeprime/domain`
 * (`mergeThreadMessages`), đúng chỗ mà web cũng gọi. Chép lại luật đó sang native là mở đường cho
 * hai client bất đồng về việc "tin nào là trùng" — và cái sai đó chỉ lộ ra khi một người dùng mở
 * app và web cùng lúc.
 *
 * Ba nguồn tin chạy SONG SONG và đều đổ về đúng một hàm `refreshLatest`:
 *   1. lượt REST đầu tiên khi mở thread;
 *   2. `onSnapshot` của Firestore (ADR 0009 — chỉ báo "có gì đó đổi", không vẽ ra màn hình);
 *   3. đồng hồ poll.
 *
 * Dám chạy song song vì mọi lượt đều đi qua `mergeThreadMessages`: hai nguồn cùng mang về một tin
 * là chuyện vô hại. Snapshot lo ĐỘ TRỄ, đồng hồ lo ĐỘ TIN CẬY.
 *
 * Khác web đúng một chỗ, và là chuyện của nền tảng: poll phải TẮT khi app xuống nền, và hỏi ngay
 * một lượt lúc quay lại.
 */
export function useThread(conversationId: string, viewerSide: ChatSide): ThreadState {
  const queryClient = useQueryClient();
  const appActive = useAppActive();

  const [reloadNonce, setReloadNonce] = useState(0);
  const key = `${conversationId}#${reloadNonce}`;
  const [data, setData] = useState<ThreadData>(() => emptyThread(key));

  // Reset khi đổi hội thoại xảy ra lúc RENDER (mẫu "điều chỉnh state khi prop đổi" của React):
  // làm trong effect thì có một khung hình vẽ tin của thread cũ dưới tiêu đề thread mới.
  if (data.key !== key) {
    setData(emptyThread(key));
  }

  /**
   * Bản mới nhất của danh sách cho lời gọi bất đồng bộ đọc, mà không phải nằm trong deps.
   *
   * Đồng bộ trong effect chứ không ghi lúc render: ref chỉ dùng để quyết định có gọi `markRead`
   * hay không, nên trễ một nhịp commit là vô hại — còn ghi ref khi render thì không.
   */
  const entriesRef = useRef<ThreadEntry[]>(data.entries);
  useEffect(() => {
    entriesRef.current = data.entries;
  }, [data.entries]);

  /** Ghi state chỉ khi thread chưa đổi — phản hồi của thread cũ không được rơi vào thread mới. */
  const applyIfCurrent = useCallback(
    (forKey: string, update: (prev: ThreadData) => ThreadData) => {
      setData((prev) => (prev.key === forKey ? update(prev) : prev));
    },
    [],
  );

  const refreshBadges = useRefreshBadges();

  const invalidateInbox = useCallback(() => {
    // Không biết người xem đang ở bề mặt nào, và không cần biết: tiền tố `chat` phủ cả hai.
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    /*
     * Huy hiệu KHÔNG nằm dưới nhánh `chat` (nó gộp cả chuông thông báo), nên nó phải được gọi tên
     * riêng. Thiếu dòng này thì mở một hội thoại ra đọc mà con số trên tab Tin nhắn vẫn đứng
     * nguyên cho tới nhịp làm mới kế tiếp — đúng thứ người dùng để ý đầu tiên.
     */
    refreshBadges();
  }, [queryClient, refreshBadges]);

  const markRead = useCallback(() => {
    chatApi
      .markRead(conversationId)
      .then(invalidateInbox)
      .catch(() => undefined);
  }, [conversationId, invalidateInbox]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    chatApi
      .messages(conversationId)
      .then((page) => {
        if (cancelled) return;
        chatDebug.refreshOk(
          conversationId,
          CHAT_DEBUG_SOURCE.REST,
          page.data.length,
          Date.now() - startedAt,
        );
        applyIfCurrent(key, (prev) => ({
          ...prev,
          entries: mergeThreadMessages(prev.entries, page.data),
          cursor: page.next,
          loading: false,
        }));
        markRead();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        chatDebug.refreshFailed(
          conversationId,
          CHAT_DEBUG_SOURCE.REST,
          error,
          Date.now() - startedAt,
        );
        applyIfCurrent(key, (prev) => ({ ...prev, loading: false, error }));
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, key, applyIfCurrent, markRead]);

  /**
   * Nạp lại trang MỚI NHẤT và gộp vào — helper DÙNG CHUNG cho cả snapshot lẫn đồng hồ.
   *
   * Không thay thế danh sách: người dùng có thể đã cuộn lên và tải năm trang lịch sử; thay thế là
   * ném hết công đó đi và giật màn hình về đáy.
   */
  const refreshLatest = useCallback(
    async (source: ChatDebugSource) => {
      const startedAt = Date.now();
      try {
        const page = await chatApi.messages(conversationId);

        /*
         * "Có tin mới không" đọc từ REF, không từ bên trong hàm cập nhật state: React gọi updater
         * lúc RENDER chứ không phải lúc `setData` trả về, nên một biến gán trong đó vẫn còn giá
         * trị cũ ở dòng sau — và `markRead` gần như không bao giờ chạy.
         */
        const known = new Set(entriesRef.current.map((e) => e.message.id));
        const fresh = page.data.filter((m) => !known.has(m.id));

        chatDebug.refreshOk(conversationId, source, fresh.length, Date.now() - startedAt);

        applyIfCurrent(key, (prev) => ({
          ...prev,
          entries: mergeThreadMessages(prev.entries, page.data),
        }));

        if (fresh.length > 0) markRead();
      } catch (error) {
        // Lượt làm mới NỀN — mất sóng thoáng qua không được biến màn đang đọc thành màn lỗi.
        chatDebug.refreshFailed(conversationId, source, error, Date.now() - startedAt);
      }
    },
    [conversationId, key, applyIfCurrent, markRead],
  );

  /*
   * Snapshot chỉ KÍCH HOẠT một lượt đọc REST — nó không mang nội dung vào danh sách (ADR 0009).
   * Danh tính hàm phải ổn định, nếu không listener bị tháo/gắn lại theo mỗi lần render.
   */
  const onRealtimeChange = useCallback(() => {
    void refreshLatest(CHAT_DEBUG_SOURCE.REALTIME);
  }, [refreshLatest]);

  /*
   * Trạng thái của CHÍNH listener này quyết định nhịp poll — không phải `ready` của phiên
   * Firebase. Đăng nhập được Firebase và LẮNG NGHE được là hai chuyện khác nhau: rules chưa
   * đẩy hay subscription chết giữa chừng đều để `ready = true` trong khi không snapshot nào
   * bao giờ tới, và người nhận đợi trọn 25 giây.
   */
  const listenerState = useThreadRealtime(appActive ? conversationId : null, onRealtimeChange);
  const listenerLive = listenerState === REALTIME_STATE.LIVE;

  /*
   * Quay lại app sau mười phút mà đợi hết một nhịp mới thấy tin là mười phút im lặng nhìn thấy
   * được — nên hỏi ngay một lượt ở đúng lúc CHUYỂN TIẾP nền → tiền cảnh.
   *
   * Không gọi thẳng trong effect dựng đồng hồ bên dưới: ở đó nó sẽ chạy cả lúc MỞ màn, ngay sau
   * lượt REST đầu tiên — một request thừa cho cùng một trang tin.
   */
  useRefetchOnForeground(
    useCallback(() => void refreshLatest(CHAT_DEBUG_SOURCE.POLL), [refreshLatest]),
  );

  /*
   * Đồng hồ chạy SONG SONG với snapshot, và DỪNG khi app xuống nền: một `setInterval` chạy trong
   * nền là pin và dữ liệu di động tiêu cho một màn không ai nhìn.
   */
  useEffect(() => {
    if (!appActive) return undefined;

    const intervalMs = listenerLive ? POLL_LIVE_MS : POLL_FALLBACK_MS;
    chatDebug.threadTransport(
      conversationId,
      listenerLive ? CHAT_DEBUG_SOURCE.REALTIME : CHAT_DEBUG_SOURCE.POLL,
      intervalMs,
    );

    const timer = setInterval(() => void refreshLatest(CHAT_DEBUG_SOURCE.POLL), intervalMs);
    return () => clearInterval(timer);
  }, [appActive, listenerLive, conversationId, refreshLatest]);

  const loadOlder = useCallback(() => {
    const cursor = data.cursor;
    if (!cursor || data.loadingOlder) return;

    applyIfCurrent(key, (prev) => ({ ...prev, loadingOlder: true }));
    chatApi
      .messages(conversationId, cursor)
      .then((page) => {
        applyIfCurrent(key, (prev) => ({
          ...prev,
          entries: mergeThreadMessages(prev.entries, page.data),
          cursor: page.next,
          loadingOlder: false,
        }));
      })
      .catch(() => {
        // Giữ nguyên cursor: cuộn lên lần nữa là thử lại đúng trang đó.
        applyIfCurrent(key, (prev) => ({ ...prev, loadingOlder: false }));
      });
  }, [conversationId, key, data.cursor, data.loadingOlder, applyIfCurrent]);

  const dispatchSend = useCallback(
    async (body: SendMessageInput, optimistic: ChatMessage) => {
      const clientMessageId = optimistic.clientMessageId;
      const startedAt = Date.now();

      applyIfCurrent(key, (prev) => ({
        ...prev,
        entries: mergeThreadMessages(prev.entries, [optimistic], CHAT_SEND_STATE.PENDING),
      }));

      try {
        const saved = await chatApi.send(conversationId, body);
        chatDebug.sendOk(conversationId, Date.now() - startedAt, body.attachments?.length ?? 0);
        applyIfCurrent(key, (prev) => ({
          ...prev,
          entries: mergeThreadMessages(prev.entries, [saved]),
        }));
        invalidateInbox();
      } catch (error) {
        chatDebug.sendFailed(conversationId, error, Date.now() - startedAt);
        if (clientMessageId) {
          applyIfCurrent(key, (prev) => ({
            ...prev,
            entries: markThreadMessageFailed(prev.entries, clientMessageId),
          }));
        }
        throw error;
      }
    },
    [conversationId, key, applyIfCurrent, invalidateInbox],
  );

  const send = useCallback(
    async (input: { text?: string; attachments?: SendAttachment[]; vehicleId?: string }) => {
      const clientMessageId = newClientMessageId();
      const attachments = input.attachments ?? [];

      await dispatchSend(
        {
          clientMessageId,
          ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
          ...(input.text ? { text: input.text } : {}),
          ...(attachments.length ? { attachments } : {}),
        },
        {
          id: `local-${clientMessageId}`,
          conversationId,
          senderUserId: null,
          senderName: null,
          /*
           * KHÔNG để trống. Bong bóng trái/phải quyết bằng `isOwnSideMessage(senderType, side)`,
           * và chuỗi rỗng rơi vào nhánh "không thuộc phía nào" — tin mình vừa gõ hiện ở phía ĐỐI
           * PHƯƠNG rồi mới nhảy sang phải khi lượt REST kế tiếp về.
           */
          senderType: ownSenderType(viewerSide),
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
        },
      );
    },
    [conversationId, dispatchSend, viewerSide],
  );

  const retry = useCallback(
    async (clientMessageId: string) => {
      const entry = data.entries.find((e) => e.message.clientMessageId === clientMessageId);
      if (!entry) return;
      const { message } = entry;

      await dispatchSend(
        {
          // ĐÚNG khoá cũ: server nhận ra đây là lần gửi lại và trả về tin đã lưu, không tạo tin
          // thứ hai (unique `(conversation_id, client_message_id)`).
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
