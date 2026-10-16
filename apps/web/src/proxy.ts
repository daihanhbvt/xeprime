import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_REALM_HEADER, resolveSessionCookieName } from '@xeprime/types';
import { HTTP_STATUS } from '@/constants/http-status';
import { ROUTES } from '@/constants/routes';
import {
  AUTH_INTENT,
  AUTH_MODE,
  isAdminPublicPage,
  isPartnerPublicPage,
} from '@/features/auth/post-auth-destination';
import { isSafeNextPath } from '@/features/auth/safe-next';
import {
  ZONE,
  ZONE_MODE,
  ZONE_REALM,
  internalPathOf,
  legacyOwnerPageTarget,
  legacyPartnerPageTarget,
  legacyPrefixedTarget,
  zoneForHost,
  zoneHref,
  zoneMode,
  zoneOfInternalPath,
  zonePath,
  type LegacyTarget,
  type Zone,
} from '@/zones';

/**
 * Định tuyến BA SITE trong một Next app (ADR 0051 điều 2) + cổng phiên theo realm (ADR 0053).
 *
 * Next 16 đổi tên `middleware` → `proxy` (chạy trước khi render). Proxy CHỈ điều hướng — không
 * verify JWT (không giữ secret), không quyết định quyền: quyền và tuyến do guard backend quyết, và
 * khung `AppShell`/`AdminShell` hỏi `/auth/me` thật.
 *
 * ## Chế độ `host` (staging/production — `NEXT_PUBLIC_XP_ZONE_MODE=host`)
 *  - host partner/admin: rewrite `/<x>` → thư mục nội bộ `/manage/<x>` · `/admin/<x>`; `usePathname`
 *    vẫn trả path HIỂN THỊ (Next giữ `req.url` gốc khi rewrite);
 *  - URL cũ mang tiền tố (`/manage/*`, `/manage/admin/*`) → 307 sang ĐÚNG host + path sạch;
 *  - tiền tố nội bộ gõ thẳng trên host không sở hữu nó → 404;
 *  - trang chủ xe cũ trên site khách (`/account/vehicles`…) → 307 sang site partner (B2);
 *  - host partner/admin gắn `X-Robots-Tag: noindex`.
 *
 * ## Chế độ `path` (máy dev — mặc định)
 *  Ba khu chung `localhost:3000` dưới tiền tố nội bộ, không rewrite. `/api/*` được chuyển sang API
 *  local kèm realm theo khu của TRANG đang gọi (Referer) — vai trò Caddy đóng ở môi trường thật;
 *  API chỉ tin header đó khi bật cờ dev `REALM_HEADER_FROM_CLIENT` (ADR 0053 điều 4).
 *
 * Mỗi site kiểm cookie phiên CỦA realm nó (`<SESSION_COOKIE_NAME>_<realm>`, host-only): cookie của
 * site này không bao giờ mở cổng site kia.
 */

/** Tên cookie đọc lúc CHẠY (không phải lúc build) — tiến trình `next start` phải có biến này. */
function sessionCookieOf(zone: Zone): string {
  return resolveSessionCookieName(
    { SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME },
    ZONE_REALM[zone],
  );
}

/** API local cho proxy dev — xem docblock đầu file. Không khai ở môi trường thật (Caddy lo `/api`). */
function apiProxyTarget(): string | null {
  const target = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, '');
  if (target) return target;
  return zoneMode() === ZONE_MODE.PATH ? 'http://localhost:4000' : null;
}

/** Header khoá proxy không bao giờ đi tiếp từ client: chỉ Caddy được gắn nó. */
const PROXY_SECRET_HEADER = 'x-xp-proxy-secret';

/** Đường dùng chung mọi site — không rewrite, không gác (văn bản pháp lý, file xác minh tên miền). */
const SHARED_PREFIXES = ['/legal', '/.well-known'];

/** Đích của "tiền tố nội bộ gõ thẳng trên host khác": một đường không tồn tại ⇒ trang 404. */
const NOT_FOUND_PATH = '/__xp_zone_not_found';

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function redirectTo(request: NextRequest, location: string): NextResponse {
  const url = new URL(location, request.url);
  // Giữ NGUYÊN query của URL cũ (B2): bộ lọc, `?c=` của hộp thư, `?token=`…
  if (!url.search) url.search = request.nextUrl.search;
  return NextResponse.redirect(url, HTTP_STATUS.TEMPORARY_REDIRECT);
}

/** URL đích của một URL cũ — tuyệt đối khi khác host (chế độ `host`), tương đối khi cùng origin. */
function legacyLocation(target: LegacyTarget): string {
  return zoneMode() === ZONE_MODE.HOST
    ? zoneHref(target.zone, target.path)
    : zonePath(target.zone, target.path);
}

/** Chưa có phiên ở site này → trang đăng nhập CỦA site đó, giữ đích trong `next`. */
function loginRedirect(request: NextRequest, zone: Zone, displayPath: string): NextResponse {
  const login = zone === ZONE.ADMIN ? ROUTES.ADMIN.LOGIN : ROUTES.MANAGE.LOGIN;
  const url = new URL(login, request.url);
  url.searchParams.set('next', `${displayPath}${request.nextUrl.search}`);
  // Vào thẳng onboarding = ý định mở gian hàng; giữ ý định đó qua bước đăng nhập.
  if (zone === ZONE.PARTNER && displayPath === ROUTES.MANAGE.ONBOARDING) {
    url.searchParams.set('intent', AUTH_INTENT.OWNER);
  }
  return NextResponse.redirect(url);
}

function needsSession(zone: Zone, displayPath: string): boolean {
  if (zone === ZONE.PARTNER) return !isPartnerPublicPage(displayPath);
  if (zone === ZONE.ADMIN) return !isAdminPublicPage(displayPath);
  return false;
}

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

/** `/login` `/register` CŨ của site khách: đăng nhập khách là modal — về trang chủ, mở sẵn modal. */
function legacyCustomerAuth(request: NextRequest, hasSession: boolean): NextResponse | null {
  const { pathname } = request.nextUrl;
  const mode =
    pathname === ROUTES.LOGIN
      ? AUTH_MODE.LOGIN
      : pathname === ROUTES.REGISTER
        ? AUTH_MODE.REGISTER
        : null;
  if (!mode) return null;
  const rawNext = request.nextUrl.searchParams.get('next');
  const url = new URL(ROUTES.HOME, request.url);
  if (hasSession) {
    // Đã đăng nhập thì không có gì để đăng nhập nữa: về `next` an toàn hoặc trang chủ.
    if (isSafeNextPath(rawNext)) return NextResponse.redirect(new URL(rawNext, request.url));
    return NextResponse.redirect(url);
  }
  url.searchParams.set('auth', mode);
  if (isSafeNextPath(rawNext)) url.searchParams.set('next', rawNext);
  return NextResponse.redirect(url);
}

/** Chuyển `/api/*` sang API (máy dev / chạy `host` không Caddy) kèm realm của khu đang gọi. */
function proxyApi(request: NextRequest, realmZone: Zone, target: string): NextResponse {
  const { pathname, search } = request.nextUrl;
  const url = new URL(`${target}${pathname.slice('/api'.length) || '/'}${search}`);
  const headers = new Headers(request.headers);
  headers.delete(PROXY_SECRET_HEADER);
  headers.set(ACCOUNT_REALM_HEADER, ZONE_REALM[realmZone]);
  return NextResponse.rewrite(url, { request: { headers } });
}

/** Khu của TRANG đã gửi request `/api` — chế độ `path`: suy từ Referer cùng origin. */
function zoneOfReferer(request: NextRequest): Zone {
  const referer = request.headers.get('referer');
  if (!referer) return ZONE.MARKET;
  try {
    const url = new URL(referer);
    return url.origin === request.nextUrl.origin ? zoneOfInternalPath(url.pathname) : ZONE.MARKET;
  } catch {
    return ZONE.MARKET;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const mode = zoneMode();

  // ── /api: Caddy lo ở môi trường thật; proxy dev khi có đích ─────────────────────────────────
  if (isUnder(pathname, '/api')) {
    // `/api/stg/*` là route handler riêng (proxy sang staging) — để nguyên.
    if (isUnder(pathname, '/api/stg')) return NextResponse.next();
    const target = apiProxyTarget();
    if (!target) return NextResponse.next();
    const zone =
      mode === ZONE_MODE.HOST
        ? (zoneForHost(request.headers.get('host')) ?? ZONE.MARKET)
        : zoneOfReferer(request);
    return proxyApi(request, zone, target);
  }

  if (SHARED_PREFIXES.some((prefix) => isUnder(pathname, prefix))) return NextResponse.next();

  return mode === ZONE_MODE.HOST ? routeHostMode(request) : routePathMode(request);
}

function routePathMode(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // `/manage/admin/*` là khu quản trị CŨ → `/admin/*` (chế độ path giữ tiền tố nội bộ); trang cũ
  // của cổng quản lý mà nghĩa đã sang site khách → site khách. `/manage/*` còn lại là chính nó.
  const legacy = legacyPrefixedTarget(pathname);
  if (legacy && legacy.zone !== ZONE.PARTNER) return redirectTo(request, legacyLocation(legacy));

  const zone = zoneOfInternalPath(pathname);

  if (zone === ZONE.MARKET) {
    const owner = legacyOwnerPageTarget(pathname);
    if (owner) return redirectTo(request, legacyLocation(owner));
    return (
      legacyCustomerAuth(request, request.cookies.has(sessionCookieOf(ZONE.MARKET))) ??
      NextResponse.next()
    );
  }

  if (needsSession(zone, pathname) && !request.cookies.has(sessionCookieOf(zone))) {
    return loginRedirect(request, zone, pathname);
  }
  return withNoIndex(NextResponse.next());
}

function routeHostMode(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const zone = zoneForHost(request.headers.get('host'));
  // Host lạ (vd `api.xeprime.vn` lọt tới web): không đoán khu.
  if (!zone) return NextResponse.next();

  // URL cũ mang tiền tố `/manage` (kể cả `/manage/admin`) → đúng host + path sạch.
  const legacy = legacyPrefixedTarget(pathname);
  if (legacy) return redirectTo(request, legacyLocation(legacy));

  if (zone === ZONE.MARKET) {
    // Tiền tố nội bộ của khu quản trị gõ thẳng trên site khách: không có trang nào ở đây.
    if (isUnder(pathname, internalPathOf(ZONE.ADMIN, '/'))) {
      return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
    }
    const owner = legacyOwnerPageTarget(pathname);
    if (owner) return redirectTo(request, legacyLocation(owner));
    return (
      legacyCustomerAuth(request, request.cookies.has(sessionCookieOf(ZONE.MARKET))) ??
      NextResponse.next()
    );
  }

  const ownPrefix = internalPathOf(zone, '/');
  // Tiền tố nội bộ của CHÍNH khu này gõ thẳng (`admin.…/admin/x`) → path sạch; của khu khác → 404.
  if (isUnder(pathname, ownPrefix)) {
    return redirectTo(request, pathname.slice(ownPrefix.length) || '/');
  }
  const otherPrefix = internalPathOf(zone === ZONE.ADMIN ? ZONE.PARTNER : ZONE.ADMIN, '/');
  if (isUnder(pathname, otherPrefix)) {
    return withNoIndex(NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url)));
  }

  // Trang cũ của site partner mà nghĩa đã sang site khách — TRƯỚC cổng phiên (người bấm là khách).
  const moved = zone === ZONE.PARTNER ? legacyPartnerPageTarget(pathname) : null;
  if (moved) return redirectTo(request, legacyLocation(moved));

  if (needsSession(zone, pathname) && !request.cookies.has(sessionCookieOf(zone))) {
    return withNoIndex(loginRedirect(request, zone, pathname));
  }

  const internal = new URL(internalPathOf(zone, pathname), request.url);
  internal.search = request.nextUrl.search;
  return withNoIndex(NextResponse.rewrite(internal));
}

export const config = {
  // Mọi đường TRỪ asset tĩnh — ở chế độ `host` mọi trang đều cần rewrite theo host.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|manifest\\.webmanifest|owner-resources/|illustrations/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|pdf|txt|xml|woff2?|map)$).*)',
  ],
};
