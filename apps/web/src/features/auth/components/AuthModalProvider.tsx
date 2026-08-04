'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CurrentUser } from '@/hooks/use-current-user';
import { AUTH_MODE, isAuthMode, type AuthMode } from '../post-auth-destination';
import { currentPathWithQuery, isSafeNextPath } from '../safe-next';

/** Tham số URL điều khiển modal. */
export const AUTH_PARAM = 'auth';
export const NEXT_PARAM = 'next';

export interface OpenAuthOptions {
  mode?: AuthMode;
  /** Điều hướng sau khi xong. Không truyền = ở lại trang hiện tại. */
  next?: string;
  /**
   * Chạy lại hành động đã bị chặn vì chưa đăng nhập (vd bấm "Nhắn shop").
   *
   * Chỉ sống trong bộ nhớ: F5 giữa chừng là mất, nên hành động nào quan trọng vẫn nên kèm
   * `next` (nằm trong URL) để ý định không biến mất.
   */
  onSuccess?: (user: CurrentUser) => void;
}

interface AuthModalContextValue {
  isOpen: boolean;
  mode: AuthMode;
  next: string | null;
  open: (options?: OpenAuthOptions) => void;
  close: () => void;
  setMode: (mode: AuthMode) => void;
  /** Lấy và xoá callback tiếp-nối-hành-động (chỉ chạy đúng một lần). */
  takePendingAction: () => ((user: CurrentUser) => void) | null;
  /** Chỉ dành cho `AuthUrlSync` — đồng bộ trạng thái từ URL vào provider. */
  syncFromUrl: (state: { mode: AuthMode; next: string | null } | null) => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

interface OpenState {
  mode: AuthMode;
  next: string | null;
}

/**
 * Trạng thái auth modal của khách. Nguồn sự thật là URL (`?auth=login|register&next=…`) — nút
 * Back đóng được modal, link gửi cho nhau mở đúng, và proxy chuyển `/login` cũ sang
 * `/?auth=login` mà không cần biết gì về React.
 *
 * ⚠️ Provider này CỐ TÌNH không gọi `useSearchParams`: nó bọc toàn bộ cây `(public)`, mà một
 * client component đọc searchParams sẽ kéo cả cây con vào Suspense và làm hỏng static render
 * của marketplace (SEO). Việc đọc URL nằm ở `AuthUrlSync` — một leaf riêng, tự bọc Suspense.
 * Chiều ghi (open/close) dùng `window.location.search` ngay trong event handler, chỉ chạy ở
 * client nên không gây hydration mismatch.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<OpenState | null>(null);
  const pendingAction = useRef<((user: CurrentUser) => void) | null>(null);

  const buildUrl = useCallback(
    (patch: { auth?: AuthMode | null; next?: string | null }) => {
      const params = new URLSearchParams(
        typeof window === 'undefined' ? '' : window.location.search,
      );
      if ('auth' in patch) {
        if (patch.auth) params.set(AUTH_PARAM, patch.auth);
        else params.delete(AUTH_PARAM);
      }
      if ('next' in patch) {
        if (patch.next && isSafeNextPath(patch.next)) params.set(NEXT_PARAM, patch.next);
        else params.delete(NEXT_PARAM);
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const open = useCallback(
    (options: OpenAuthOptions = {}) => {
      pendingAction.current = options.onSuccess ?? null;
      const mode = options.mode ?? AUTH_MODE.LOGIN;
      const next = options.next ?? null;
      // Mở ngay (không đợi router) để nút bấm phản hồi tức thì; `AuthUrlSync` sẽ xác nhận lại.
      setState({ mode, next });
      // `push` để nút Back đóng modal thay vì rời trang.
      router.push(buildUrl({ auth: mode, next }), { scroll: false });
    },
    [router, buildUrl],
  );

  const close = useCallback(() => {
    pendingAction.current = null;
    setState(null);
    // `replace` để không thêm một mục lịch sử "đã đóng modal".
    router.replace(buildUrl({ auth: null, next: null }), { scroll: false });
  }, [router, buildUrl]);

  const setMode = useCallback(
    (mode: AuthMode) => {
      setState((prev) => (prev ? { ...prev, mode } : { mode, next: null }));
      // `replace`: Back vẫn phải đóng modal, không phải quay về tab kia.
      router.replace(buildUrl({ auth: mode }), { scroll: false });
    },
    [router, buildUrl],
  );

  const takePendingAction = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    return action;
  }, []);

  const syncFromUrl = useCallback((urlState: OpenState | null) => {
    setState((prev) => {
      if (urlState === null) return prev === null ? prev : null;
      if (prev && prev.mode === urlState.mode && prev.next === urlState.next) return prev;
      return urlState;
    });
  }, []);

  const value = useMemo<AuthModalContextValue>(
    () => ({
      isOpen: state !== null,
      mode: state?.mode ?? AUTH_MODE.LOGIN,
      next: state?.next ?? null,
      open,
      close,
      setMode,
      takePendingAction,
      syncFromUrl,
    }),
    [state, open, close, setMode, takePendingAction, syncFromUrl],
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

/**
 * Đọc `?auth=`/`?next=` và đẩy vào provider. Là component RIÊNG (leaf, tự bọc Suspense ở chỗ
 * dùng) đúng vì lý do nêu trong docblock của provider: `useSearchParams` không được nằm trên
 * đường đi của `children`.
 */
export function AuthUrlSync() {
  const searchParams = useSearchParams();
  const { syncFromUrl } = useAuthModal();

  const rawMode = searchParams.get(AUTH_PARAM);
  const rawNext = searchParams.get(NEXT_PARAM);

  useEffect(() => {
    if (!isAuthMode(rawMode)) {
      syncFromUrl(null);
      return;
    }
    syncFromUrl({ mode: rawMode, next: isSafeNextPath(rawNext) ? rawNext : null });
  }, [rawMode, rawNext, syncFromUrl]);

  return null;
}

/**
 * Mở auth modal của khách từ bất kỳ nút nào trong khu công khai.
 * Ném lỗi nếu dùng ngoài `(public)` — sai chỗ sẽ lộ ngay chứ không im lặng không mở.
 */
export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error('useAuthModal phải nằm trong <AuthModalProvider> (route group (public)).');
  }
  return ctx;
}

/**
 * Hàm lấy `next` trỏ về đúng trang + query đang xem, dùng khi nút cần quay lại chỗ cũ sau khi
 * đăng nhập.
 *
 * Trả về HÀM chứ không phải giá trị: đọc `window.location.search` lúc render sẽ lệch giữa
 * server (rỗng) và client (có query) → hydration mismatch. Gọi trong event handler thì chỉ
 * chạy ở client.
 */
export function useNextFromCurrentPath(): () => string {
  const pathname = usePathname();
  return useCallback(
    () => currentPathWithQuery(pathname, window.location.search),
    [pathname],
  );
}
