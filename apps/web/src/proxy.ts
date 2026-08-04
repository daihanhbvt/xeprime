import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from '@/constants/routes';
import { AUTH_INTENT, AUTH_MODE } from '@/features/auth/post-auth-destination';
import { isSafeNextPath } from '@/features/auth/safe-next';

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
 * secret để verify JWT, và cũng không nên là nơi quyết định quyền. Cụ thể: proxy KHÔNG biết
 * user có phải nhân sự nền tảng không, nên nó chỉ giữ nguyên đích `/manage/admin/...` trong
 * `next` — việc từ chối (403) do layout admin + guard backend làm.
 */
const SESSION_COOKIE = 'xp_session';

export function proxy(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;
  const target = `${pathname}${search}`;

  // Trang đăng nhập cổng quản lý là CÔNG KHAI. Không chặn, và cũng không đá người đã có cookie
  // về /manage: cookie có thể đã hết hạn, đá đi rồi shell lại đá về đây là vòng lặp.
  if (pathname === ROUTES.MANAGE.LOGIN) {
    return NextResponse.next();
  }

  if (isManagePath(pathname) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.MANAGE.LOGIN;
    url.search = '';
    // Giữ nguyên đường đang muốn vào (kể cả route con của /manage/admin và query của nó).
    url.searchParams.set('next', target);
    // Vào thẳng onboarding = ý định làm chủ xe; giữ ý định đó qua bước đăng nhập.
    if (pathname === ROUTES.MANAGE.ONBOARDING) {
      url.searchParams.set('intent', AUTH_INTENT.OWNER);
    }
    return NextResponse.redirect(url);
  }

  // `/login` và `/register` là route CŨ (link/bookmark đã phát ra ngoài). Giờ đăng nhập của
  // khách là modal ngay trên marketplace, nên chuyển về trang chủ và mở sẵn modal đúng chế độ.
  // KHÔNG đưa về /manage như trước — đó chính là lỗi khiến khách bị đẩy vào khu quản lý.
  const legacyMode = legacyAuthMode(pathname);
  if (legacyMode) {
    const rawNext = request.nextUrl.searchParams.get('next');
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.HOME;
    url.search = '';

    if (hasSession) {
      // Đã đăng nhập thì không có gì để đăng nhập nữa: về `next` an toàn hoặc trang chủ.
      if (isSafeNextPath(rawNext)) return NextResponse.redirect(new URL(rawNext, request.url));
      return NextResponse.redirect(url);
    }

    url.searchParams.set('auth', legacyMode);
    if (isSafeNextPath(rawNext)) url.searchParams.set('next', rawNext);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function isManagePath(pathname: string): boolean {
  return pathname === ROUTES.MANAGE.ROOT || pathname.startsWith(`${ROUTES.MANAGE.ROOT}/`);
}

function legacyAuthMode(pathname: string): string | null {
  if (pathname === ROUTES.LOGIN) return AUTH_MODE.LOGIN;
  if (pathname === ROUTES.REGISTER) return AUTH_MODE.REGISTER;
  return null;
}

export const config = {
  // Chỉ chạy trên các route cần bảo vệ/điều hướng, không đụng asset tĩnh.
  matcher: ['/manage/:path*', '/login', '/register'],
};
