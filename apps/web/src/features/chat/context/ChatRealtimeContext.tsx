'use client';

import type { Firestore } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { chatApi } from '../api';
import { getChatDb, isFirebaseConfigured, signInChat } from '../lib/firebase-client';

interface ChatRealtime {
  /** Firestore db khi đã đăng nhập realtime; null → chat rơi về REST. */
  db: Firestore | null;
  ready: boolean;
}

const ChatRealtimeCtx = createContext<ChatRealtime>({ db: null, ready: false });

export function useChatRealtime(): ChatRealtime {
  return useContext(ChatRealtimeCtx);
}

/**
 * Đăng nhập Firebase bằng custom token khi có user + Firebase được cấu hình. Thất bại (chưa bật
 * chat realtime / hết token) thì im lặng — ChatView vẫn chạy trên REST, chỉ mất phần realtime.
 */
/**
 * Nói ra vì sao realtime không bật — CHỈ ở dev.
 *
 * Chat và huy hiệu đều có đường lùi về REST, nên hỏng ở đây không tạo ra lỗi nào nhìn thấy được:
 * triệu chứng duy nhất là app hỏi lại dày hơn hẳn. Không có dòng log này thì việc phân biệt
 * "chưa cấu hình Firebase", "backend tắt cờ" và "signInWithCustomToken bị từ chối" phải làm bằng
 * cách đọc Network tab.
 */
function warnRealtimeOff(reason: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  console.warn('[XePrime] Chat realtime KHÔNG bật — chat và huy hiệu chạy trên REST:', reason);
}

export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user || !isFirebaseConfigured()) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const res = await chatApi.firebaseToken();
        if (cancelled || !res.enabled || !res.token) {
          /*
           * Im lặng ở production là ĐÚNG — người dùng không cần biết, và chat vẫn chạy trên REST.
           * Nhưng im lặng ở dev thì "vì sao app poll dày thế" trở thành một câu hỏi không có
           * manh mối nào: mọi tầng đều trông như đang chạy bình thường.
           */
          if (!cancelled) warnRealtimeOff('backend trả enabled=false (FIRESTORE_ENABLED?)');
          return;
        }
        await signInChat(res.token);
        if (!cancelled) setReady(true);
      } catch (err) {
        warnRealtimeOff(err);
      }
    })();
    // Đăng xuất / đổi user → reset realtime (cleanup chạy khi dep đổi, không phải body effect).
    return () => {
      cancelled = true;
      setReady(false);
    };
  }, [user]);

  const value = useMemo<ChatRealtime>(
    () => ({ db: ready ? getChatDb() : null, ready }),
    [ready],
  );

  return <ChatRealtimeCtx.Provider value={value}>{children}</ChatRealtimeCtx.Provider>;
}
