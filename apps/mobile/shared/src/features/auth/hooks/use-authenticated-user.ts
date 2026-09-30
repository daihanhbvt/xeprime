import { useCurrentUser } from './use-auth';
import type { CurrentUser } from '../api';

/**
 * Dùng trong màn đã nằm sau `<RequireSession>`.
 *
 * Ném lỗi thay vì trả `undefined`: nếu bằng cách nào đó một màn được bảo vệ render mà không
 * có người dùng thì đó là lỗi định tuyến, và nó phải nổ ra ở ErrorBoundary chứ không trở
 * thành màn trắng im lặng mà không ai truy được nguyên nhân.
 */
export function useAuthenticatedUser(): CurrentUser {
  const { data } = useCurrentUser();

  if (!data) {
    throw new Error('useAuthenticatedUser dùng ngoài RequireSession — không có phiên đăng nhập');
  }

  return data;
}
