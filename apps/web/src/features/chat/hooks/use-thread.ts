'use client';

import { useQueryClient } from '@tanstack/react-query';
import { collection, limit as fbLimit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { queryKeys } from '@/services/query-keys';
import { fetchMessages, markConversationRead } from '../api';
import { useChatRealtime } from '../context/ChatRealtimeContext';
import type { ChatMessage } from '../types';

export interface ThreadState {
  messages: ChatMessage[];
  nextBefore: string | null;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  loadOlder: () => void;
  /** Chèn tin vừa gửi ngay lập tức (optimistic), không đợi realtime/poll. */
  pushLocal: (message: ChatMessage) => void;
}

/**
 * Thread chat: hiển thị từ REST (nguồn thống nhất về shape), realtime chỉ là tín hiệu "có tin mới"
 * để refetch — nên đổi được: có Firestore thì `onSnapshot`, không thì poll nhẹ. Lịch sử cũ phân
 * trang cursor từ Postgres (ADR 0009). Là stateful nên dùng custom hook thay vì React Query.
 */
export function useThread(conversationId: string | null): ThreadState {
  const { db, ready } = useChatRealtime();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(conversationId != null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  const markRead = useCallback(
    (id: string) => {
      markConversationRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() }))
        .catch(() => undefined);
    },
    [queryClient],
  );

  const mergeNewer = useCallback((incoming: ChatMessage[]): number => {
    const fresh = incoming.filter((m) => !knownIds.current.has(m.id));
    if (fresh.length === 0) return 0;
    fresh.forEach((m) => knownIds.current.add(m.id));
    setMessages((prev) => [...prev, ...fresh]);
    return fresh.length;
  }, []);

  // Tải trang mới nhất. ThreadPanel remount theo `key={conversationId}` nên mỗi hội thoại là một
  // mount mới với state khởi tạo sạch — không reset thủ công (tránh setState trong body effect).
  useEffect(() => {
    if (!conversationId) return undefined;
    let cancelled = false;
    fetchMessages(conversationId)
      .then((page) => {
        if (cancelled) return;
        const asc = [...page.data].reverse();
        asc.forEach((m) => knownIds.current.add(m.id));
        setMessages(asc);
        setNextBefore(page.nextBefore);
        markRead(conversationId);
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được tin nhắn');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, markRead]);

  const refreshLatest = useCallback(async () => {
    if (!conversationId) return;
    try {
      const page = await fetchMessages(conversationId);
      const added = mergeNewer([...page.data].reverse());
      if (added > 0) markRead(conversationId);
    } catch {
      // im lặng — thử lại lượt sau
    }
  }, [conversationId, markRead, mergeNewer]);

  // Realtime hoặc poll: đều gọi refreshLatest.
  useEffect(() => {
    if (!conversationId) return undefined;
    if (db && ready) {
      const q = query(
        collection(db, `conversations/${conversationId}/messages`),
        orderBy('sentAt', 'desc'),
        fbLimit(30),
      );
      const unsub = onSnapshot(
        q,
        () => {
          void refreshLatest();
        },
        () => undefined,
      );
      return () => unsub();
    }
    const timer = setInterval(() => {
      void refreshLatest();
    }, 4_000);
    return () => clearInterval(timer);
  }, [conversationId, db, ready, refreshLatest]);

  const loadOlder = useCallback(() => {
    if (!conversationId || !nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    fetchMessages(conversationId, nextBefore)
      .then((page) => {
        const older = [...page.data].reverse().filter((m) => !knownIds.current.has(m.id));
        older.forEach((m) => knownIds.current.add(m.id));
        setMessages((prev) => [...older, ...prev]);
        setNextBefore(page.nextBefore);
      })
      .catch(() => undefined)
      .finally(() => setLoadingOlder(false));
  }, [conversationId, nextBefore, loadingOlder]);

  const pushLocal = useCallback(
    (message: ChatMessage) => {
      mergeNewer([message]);
    },
    [mergeNewer],
  );

  return { messages, nextBefore, loading, loadingOlder, error, loadOlder, pushLocal };
}
