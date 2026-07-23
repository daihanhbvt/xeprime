import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from '@/constants/routes';

/**
 * Chặn route theo phiên đăng nhập — ADR 0002.
 *
 * Next 16 đổi tên `middleware` → `proxy` (cùng cơ chế, chạy ở Edge trước khi render).
 * Cookie session là httpOnly nên JS client không đọc được, NHƯNG proxy chạy phía server
 * đọc được cookie trong request. Nhờ vậy redirect xảy ra trước khi render, không nhấp nháy
 * màn hình như cách kiểm tra ở client.
 *
 * Ở đây chỉ kiểm tra CÓ cookie hay không — đủ để điều hướng UX. Việc xác thực token và phân
 * quyền thật vẫn nằm ở API (guard) và ở khung /manage khi gọi `/auth/me`; proxy không giữ
 * secret để verify JWT, và cũng không nên là nơi quyết định quyền.
 */
const SESSION_COOKIE = 'xp_session';

export function proxy(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  const isManage = pathname === ROUTES.MANAGE.ROOT || pathname.startsWith(`${ROUTES.MANAGE.ROOT}/`);
  const isLogin = pathname === ROUTES.LOGIN;

  // Vào khu quản lý mà chưa đăng nhập → về trang login, giữ lại đích để quay lại sau.
  if (isManage && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.LOGIN;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Đã đăng nhập mà mở lại trang login → đưa thẳng vào khu quản lý.
  if (isLogin && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.MANAGE.ROOT;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Chỉ chạy trên các route cần bảo vệ/điều hướng, không đụng asset tĩnh.
  matcher: ['/manage/:path*', '/login'],
};
