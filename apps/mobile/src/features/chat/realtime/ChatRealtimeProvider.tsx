import type { Firestore } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chatApi } from '@/features/chat/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { chatDebug } from '@/lib/chat-debug';
import { getChatDb, isFirebaseConfigured, signInChat, signOutChat } from '@/lib/firebase-client';

interface ChatRealtime {
  /** Firestore db khi đã đăng nhập realtime; `null` → chat chạy trên REST + poll. */
  db: Firestore | null;
  ready: boolean;
}

const ChatRealtimeCtx = createContext<ChatRealtime>({ db: null, ready: false });

export function useChatRealtime(): ChatRealtime {
  return useContext(ChatRealtimeCtx);
}

/**
 * Đăng nhập Firebase bằng custom token để nghe projection Firestore (ADR 0009 §2/§4).
 *
 * Hỏng ở bất kỳ bước nào cũng **im lặng**: chưa cấu hình `EXPO_PUBLIC_FIREBASE_*`,
 * `FIRESTORE_ENABLED=false` ở backend, mint token lỗi, rules từ chối — tất cả đều chỉ dẫn tới
 * `ready: false`, và thread rơi về REST + poll nhanh. Đó là cả lý do Firestore chỉ là projection:
 * mất realtime không được phép là mất chat.
 *
 * Dấu vết đi qua `chatDebug` chứ không qua `logger` trần, vì đây đúng là đường hỏng ÂM THẦM —
 * và log chỉ mang bước + thời lượng + mã lỗi, không bao giờ mang token (xem `chat-debug.ts`).
 */
export function ChatRealtimeProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState(false);

  /*
   * Phụ thuộc `userId` chứ không phải object `user`: `useCurrentUser` trả object MỚI sau mỗi
   * lượt refetch (và `SessionBoundary` refetch mỗi lần app về tiền cảnh), nên dùng cả object
   * nghĩa là đăng xuất/đăng nhập lại Firebase vài lần mỗi phiên — mỗi lần là một `signOut` cắt
   * đứt mọi listener đang gắn.
   *
   * Đổi user và đăng xuất đi qua CÙNG nhánh này: `userId` đổi (hoặc về `null`) ⇒ cleanup chạy ⇒
   * `signOutChat()`. Không có bước đó thì uid cũ còn nguyên trong tiến trình và người kế tiếp
   * nghe Firestore bằng danh tính của người trước.
   */
  useEffect(() => {
    if (!userId) return undefined;

    const configured = isFirebaseConfigured();
    chatDebug.firebaseConfig(configured);
    if (!configured) return undefined;

    let cancelled = false;
    void (async () => {
      /*
       * HAI try/catch chứ không một: xin token là REST của XePrime, đăng nhập là Firebase, và
       * chúng hỏng vì những lý do khác hẳn nhau (phiên hết hạn / `FIRESTORE_ENABLED=false` ở
       * chặng một; khoá API sai / đồng hồ máy lệch ở chặng hai). Gộp lại thì log chỉ nói
       * "realtime hỏng", đúng câu vô dụng nhất khi đi tìm nguyên nhân.
       */
      const tokenStartedAt = Date.now();
      let token: string;
      try {
        const res = await chatApi.firebaseToken();
        if (cancelled) return;
        if (!res.enabled || !res.token) {
          chatDebug.customTokenDisabled();
          return;
        }
        token = res.token;
        chatDebug.customTokenOk(Date.now() - tokenStartedAt);
      } catch (error) {
        if (!cancelled) chatDebug.customTokenFailed(error, Date.now() - tokenStartedAt);
        return;
      }

      try {
        await signInChat(token);
        if (cancelled) return;
        chatDebug.authReady();
        setReady(true);
      } catch (error) {
        if (!cancelled) chatDebug.authFailed(error);
      }
    })();

    /*
     * MỘT lối ra cho cả ba tình huống: đăng xuất · đổi người dùng · rời cây.
     *
     * Log KHÔNG phân biệt ba thứ đó, và đó là chủ đích: cleanup đóng gói giá trị `userId` CŨ, còn
     * giá trị mới thì nó không thấy được — nên mọi cách "suy ra lý do" ở đây đều là đoán. Một
     * dòng log đoán sai đúng lúc đang tìm "vì sao realtime tắt" còn tệ hơn không có gì. Muốn biết
     * là đăng xuất hay đổi người: dòng ngay sau nó — có `firebase.customToken.ok` là đổi người,
     * im lặng là đăng xuất.
     */
    return () => {
      cancelled = true;
      setReady(false);
      chatDebug.authSignedOut();
      void signOutChat();
    };
  }, [userId]);

  const value = useMemo<ChatRealtime>(
    () => ({ db: ready ? getChatDb() : null, ready }),
    [ready],
  );

  return <ChatRealtimeCtx.Provider value={value}>{children}</ChatRealtimeCtx.Provider>;
}
