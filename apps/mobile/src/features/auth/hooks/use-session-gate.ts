import { isUnauthenticated } from '@/lib/api-client';
import { useCurrentUser } from './use-auth';

export type SessionStatus = 'loading' | 'unauthenticated' | 'unreachable' | 'ready';

/**
 * Quyết định "được vào hay không" tách khỏi việc điều hướng.
 *
 * Layout chỉ còn là bảng ánh xạ trạng thái → màn hình, nên luật vào cổng kiểm thử được mà
 * không cần dựng cả router.
 */
export function useSessionGate(): {
  status: SessionStatus;
  error: unknown;
  retry: () => void;
} {
  const me = useCurrentUser();

  const status: SessionStatus = me.isPending
    ? 'loading'
    : !me.isError
      ? 'ready'
      : isUnauthenticated(me.error)
        ? 'unauthenticated'
        : 'unreachable';

  return { status, error: me.error, retry: () => void me.refetch() };
}
