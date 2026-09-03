import { isUnauthenticated } from '@/lib/api-client';
import { useCurrentUser } from './use-auth';

export const SESSION_STATUS = {
  LOADING: 'loading',
  UNAUTHENTICATED: 'unauthenticated',
  UNREACHABLE: 'unreachable',
  READY: 'ready',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export interface SessionGate {
  status: SessionStatus;
  error: unknown;
  retry: () => void;
}

/**
 * `READY` nghĩa là **ĐÃ CÓ người dùng trong tay**, không phải "truy vấn không lỗi".
 *
 * Phân biệt này là hợp đồng mà `useAuthenticatedUser()` dựa vào để được phép NÉM khi thiếu dữ
 * liệu. Chỉ hỏi `!me.isError` là để hở một cửa sổ: `resetQueries` (đăng xuất · refresh token bị
 * từ chối · `SessionBoundary`) đưa `auth.me` về `data: undefined`, cổng vẫn đọc ra `READY`, và
 * màn được bảo vệ gọi `useAuthenticatedUser()` rồi nổ.
 *
 * Chưa có dữ liệu thì đó là ĐANG TẢI, không phải sẵn sàng — cả `RequireSession` lẫn `ScopeGuard`
 * đều nhận cách hiểu đó từ đây.
 */
export function useSessionGate(): SessionGate {
  const me = useCurrentUser();

  const status: SessionStatus = me.isError
    ? isUnauthenticated(me.error)
      ? SESSION_STATUS.UNAUTHENTICATED
      : SESSION_STATUS.UNREACHABLE
    : me.data
      ? SESSION_STATUS.READY
      : SESSION_STATUS.LOADING;

  return { status, error: me.error, retry: () => void me.refetch() };
}
