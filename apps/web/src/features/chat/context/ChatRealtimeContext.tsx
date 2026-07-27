'use client';

import type { Firestore } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { fetchFirebaseChatToken } from '../api';
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
export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user || !isFirebaseConfigured()) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchFirebaseChatToken();
        if (cancelled || !res.enabled || !res.token) return;
        await signInChat(res.token);
        if (!cancelled) setReady(true);
      } catch {
        // Realtime không sẵn sàng — bỏ qua, dùng REST.
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
