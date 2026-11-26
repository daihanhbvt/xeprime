'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { ApiClientError } from '@/services/api-client';
import { destroySession } from '@/services/auth.service';

/**
 * Server TỪ CHỐI phiên (401: cookie hỏng, hết hạn, đã thu hồi) - khác hẳn "không hỏi được server".
 * Chỉ lượt này mới được dọn cookie và đẩy ra trang đăng nhập.
 */
export function isSessionRejected(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export type ShellSessionState =
  | { status: 'loading' }
  /** Phiên bị từ chối: đang dọn cookie rồi chuyển sang trang đăng nhập. */
  | { status: 'redirecting' }
  /** Không hỏi được `/auth/me` (API sập/khởi động lại, 429, 5xx, mất mạng) - phiên CÒN NGUYÊN. */
  | { status: 'unreachable'; retry: () => void; retrying: boolean }
  | { status: 'ready'; user: CurrentUser };

/**
 * Cổng phiên của khung site partner (`AppShell`) và site quản trị (`AdminShell`).
 *
 * Proxy chỉ thấy cookie CÓ hay KHÔNG, nên phiên hỏng vẫn vào tới đây rồi `/auth/me` trả 401: lúc đó
 * xoá cookie hỏng (DELETE /auth/session) rồi ra trang đăng nhập - không xoá thì proxy cứ đá trang
 * đăng nhập ngược lại (loop).
 *
 * ⚠️ CHỈ 401. Bản trước coi MỌI lỗi là "chưa đăng nhập" (26/11/2026): API khởi động lại, một lượt
 * 429 hay 502 là khung gọi DELETE /auth/session - thu hồi một phiên đang sống ở server - và người
 * dùng bị đá ra đăng nhập rồi kẹt ở đó trong khi API còn chưa lên. Lỗi tạm thời giữ phiên, hiện
 * màn "thử lại"; đã có dữ liệu người dùng mà lượt làm mới lỗi thì cứ dùng dữ liệu đó.
 */
export function useShellSession({
  isPublicPage,
  loginHref,
}: {
  isPublicPage: boolean;
  loginHref: string;
}): ShellSessionState {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading, error, refetch, isFetching } = useCurrentUser();

  const rejected = !isPublicPage && !isLoading && isSessionRejected(error);
  // Query thành công nhưng không có người dùng - cũng là "chưa đăng nhập".
  const anonymous = !isPublicPage && !isLoading && !error && !user;
  const mustSignIn = rejected || anonymous;

  useEffect(() => {
    if (!mustSignIn) return;
    let cancelled = false;
    void (async () => {
      try {
        await destroySession();
      } catch {
        // Lỗi mạng khi xoá phiên vẫn không cản việc điều hướng ra trang đăng nhập.
      }
      if (cancelled) return;
      queryClient.clear();
      router.replace(loginHref);
    })();
    return () => {
      cancelled = true;
    };
  }, [mustSignIn, loginHref, router, queryClient]);

  if (isLoading) return { status: 'loading' };
  if (mustSignIn) return { status: 'redirecting' };
  if (user) return { status: 'ready', user };
  return { status: 'unreachable', retry: () => void refetch(), retrying: isFetching };
}
