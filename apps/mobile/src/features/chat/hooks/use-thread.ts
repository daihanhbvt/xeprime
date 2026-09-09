import { useQueryClient } from '@tanstack/react-query';
import {
  chatApi,
  type ChatMessage,
  type MessageCursor,
  type SendMessageInput,
} from '@/api/chat/api';
import {
  CHAT_SEND_STATE,
  markThreadMessageFailed,
  mergeThreadMessages,
  newClientMessageId,
  removeThreadMessage,
  type ThreadMessage,
} from '@xeprime/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { queryKeys } from '@/queries/query-keys';

export type ThreadEntry = ThreadMessage<ChatMessage>;

export interface SendAttachment {
  url: string;
  fileType: string;
  fileName: string;
  fileSize: number;
}

/**
 * Nhịp hỏi tin mới khi app đang ở TIỀN CẢNH.
 *
 * App native của khách chưa cắm Firestore (ADR 0009 mới chỉ hiện thực đường realtime ở web), nên
 * đây là đường duy nhất — và nó phải DỪNG khi app xuống nền: một `setInterval` chạy trong nền là
 * pin và dữ liệu di động tiêu cho một màn không ai nhìn.
 */
const POLL_INTERVAL_MS = 6_000;

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
 * (`mergeThreadMessages`), đúng chỗ mà web cũng gọi. Chép lại luật đó sang native là mở đường
 * cho hai client bất đồng về việc "tin nào là trùng" — và cái sai đó chỉ lộ ra khi một người
 * dùng mở app và web cùng lúc.
 *
 * Phần KHÁC web đúng hai chỗ, và cả hai là chuyện của nền tảng chứ không phải của nghiệp vụ:
 * không có Firestore (poll REST), và poll phải tắt khi app xuống nền.
 */
export function useThread(conversationId: string): ThreadState {
  const queryClient = useQueryClient();
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

  const invalidateInbox = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
  }, [queryClient]);

  const markRead = useCallback(() => {
    chatApi
      .markRead(conversationId)
      .then(invalidateInbox)
      .catch(() => undefined);
  }, [conversationId, invalidateInbox]);

  useEffect(() => {
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
        markRead();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        applyIfCurrent(key, (prev) => ({ ...prev, loading: false, error }));
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, key, applyIfCurrent, markRead]);

  const refreshLatest = useCallback(async () => {
    try {
      const page = await chatApi.messages(conversationId);

      /*
       * "Có tin mới không" đọc từ REF, không từ bên trong hàm cập nhật state: React gọi updater
       * lúc RENDER chứ không phải lúc `setData` trả về, nên một biến gán trong đó vẫn còn giá trị
       * cũ ở dòng sau — và `markRead` gần như không bao giờ chạy.
       */
      const known = new Set(entriesRef.current.map((e) => e.message.id));
      const hasNew = page.data.some((m) => !known.has(m.id));

      applyIfCurrent(key, (prev) => ({
        ...prev,
        entries: mergeThreadMessages(prev.entries, page.data),
      }));

      if (hasNew) markRead();
    } catch {
      // Lượt làm mới nền — mất sóng thoáng qua không nên biến màn đang đọc thành màn lỗi.
    }
  }, [conversationId, key, applyIfCurrent, markRead]);

  /*
   * Poll CHỈ khi app ở tiền cảnh, và hỏi ngay một lượt lúc quay lại.
   *
   * Quay lại app sau mười phút mà đợi hết một nhịp mới thấy tin là mười phút im lặng nhìn thấy
   * được. Và vì mọi lượt đều đi qua `mergeThreadMessages`, lượt hỏi thêm này không thể nhân đôi
   * tin — đó là cả lý do việc gộp theo danh tính nằm ở domain chứ không phải "nối vào đuôi".
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void refreshLatest();
      timer = setInterval(() => void refreshLatest(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') start();
      else stop();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [refreshLatest]);

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
      } catch (error) {
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
        },
      );
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
