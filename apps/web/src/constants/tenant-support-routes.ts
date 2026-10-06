import { ZONE, ZONE_MODE, isPathInZone, zoneMode, zoneRelativePath } from '@/zones';

import { ROUTES, adminTenantSupportPath, tenantSupportContextIdFromPath } from './routes';

/**
 * Ánh xạ route của SITE PARTNER (`ROUTES.MANAGE.*` — Full Manage và Owner Lite dùng chung cây URL)
 * sang route của một phiên hỗ trợ trong site quản trị (`/tenant-support/<id>/...`) — ADR 0050 §12.
 *
 * Đây là nơi DUY NHẤT biết một route có tồn tại trong phiên hay không. Menu, breadcrumb, lớp chặn
 * `router.push` và lớp chặn click `<Link>` đều đi qua đây — không component nào tự ghép chuỗi phiên,
 * và một link trong card/bảng/dialog của view partner dùng lại không thể "thoát" khỏi phiên (nơi
 * request mất header phiên).
 *
 * Ba kết quả:
 *  - `mapped`  — có trang tương ứng trong phiên; điều hướng tới đó.
 *  - `outside` — không phải route của site partner (màn nền tảng, tài khoản của CHÍNH nhân sự đang
 *                đăng nhập, trang công khai): để nguyên — rời phiên có chủ đích (vd "Thoát chế độ hỗ
 *                trợ", "Bảo mật tài khoản").
 *  - `blocked` — route của site partner KHÔNG mở trong phiên (tài chính, ví, chat…): không điều hướng.
 *
 * ## Vì sao thứ tự kiểm quan trọng (ADR 0051)
 *
 * Ở chế độ `host` hai site không còn tiền tố phân biệt: `/vehicles` vừa là danh sách xe của gian hàng
 * vừa là danh sách xe toàn sàn của khu quản trị. Bên trong phiên, link do VIEW PARTNER dựng (thứ
 * phiên này tồn tại để hiển thị) thắng: trang có trong phiên → `mapped` TRƯỚC; sau đó mới đến route
 * quản trị (`outside`), rồi route partner còn lại (`blocked`). Ở chế độ `path` cùng thứ tự đó cho
 * cùng kết quả, vì tiền tố `/manage` ↔ `/admin` đã tự phân biệt.
 */
export type TenantSupportRoute =
  | { readonly kind: 'mapped'; readonly href: string }
  | { readonly kind: 'outside'; readonly href: string }
  | { readonly kind: 'blocked' };

const ID = '[^/]+';

/**
 * Trang CÓ trong phiên — đường dẫn tương đối sau gốc phiên. Thêm một trang vào phiên là thêm một
 * dòng ở đây VÀ một `@SupportAction` ở backend; thiếu vế nào cũng là trang hỏng.
 */
const SUPPORT_PAGES: readonly RegExp[] = [
  /^dashboard$/,
  /^vehicles$/,
  new RegExp(`^vehicles/${ID}$`),
  new RegExp(`^vehicles/${ID}/edit$`),
  new RegExp(`^vehicles/${ID}/manage(/.+)?$`),
  /^maintenance$/,
  /^calendar$/,
  /^booking-requests$/,
  /^bookings$/,
  /^bookings\/awaiting-pickup$/,
  new RegExp(`^bookings/${ID}$`),
  /^customers$/,
  new RegExp(`^customers/${ID}$`),
  /^shop$/,
  /^shop\/branches$/,
  /^shop\/policies$/,
  /^drivers$/,
  /^members$/,
  /^support\/cases$/,
];

/**
 * Route của TÀI KHOẢN người đang đăng nhập — thẻ người dùng ở menu dựng chúng. Trong phiên chúng
 * vẫn là của nhân sự nền tảng, không của gian hàng: rời phiên mà đi tới, không chặn.
 */
const OPERATOR_ROUTES: readonly string[] = [ROUTES.ADMIN.SECURITY];

/** Mọi route của khu quản trị (khớp tiền tố; gốc khu chỉ khớp tuyệt đối). */
const ADMIN_ROUTES: readonly string[] = Object.values(ROUTES.ADMIN);

function splitHref(href: string): { path: string; rest: string } {
  const cut = href.search(/[?#]/);
  return cut < 0 ? { path: href, rest: '' } : { path: href.slice(0, cut), rest: href.slice(cut) };
}

function isSupportPage(relative: string): boolean {
  return SUPPORT_PAGES.some((pattern) => pattern.test(relative));
}

function isAdminRoute(path: string): boolean {
  if (zoneMode() === ZONE_MODE.PATH) return isPathInZone(ZONE.ADMIN, path);
  return ADMIN_ROUTES.some((route) =>
    route === ROUTES.ADMIN.ROOT ? path === route : path === route || path.startsWith(`${route}/`),
  );
}

export function toTenantSupportRoute(contextId: string, href: string): TenantSupportRoute {
  // Link tuyệt đối (http…), mailto, tel, neo trong trang: không phải route của site partner.
  if (!href.startsWith('/') || href.startsWith('//')) return { kind: 'outside', href };
  const { path: rawPath, rest } = splitHref(href);
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;

  // Đã ở trong phiên — của CHÍNH phiên này thì giữ, của phiên khác thì chặn (không nhảy phiên).
  const inSession = tenantSupportContextIdFromPath(path);
  if (inSession) return inSession === contextId ? { kind: 'mapped', href } : { kind: 'blocked' };

  if (OPERATOR_ROUTES.includes(path)) return { kind: 'outside', href };

  const partnerCandidate = isPathInZone(ZONE.PARTNER, path);
  if (partnerCandidate) {
    const relativePath = zoneRelativePath(ZONE.PARTNER, path);
    const relative = relativePath === '/' ? 'dashboard' : relativePath.slice(1);
    if (isSupportPage(relative)) {
      return {
        kind: 'mapped',
        href: `${adminTenantSupportPath.root(contextId)}/${relative}${rest}`,
      };
    }
  }

  // Màn NỀN TẢNG: rời phiên có chủ đích — vd "Thoát chế độ hỗ trợ" về danh sách đối tác.
  if (isAdminRoute(path)) return { kind: 'outside', href };

  // Còn lại của site partner (tài chính, ví, chat, tài khoản…) không mở trong phiên.
  if (partnerCandidate) return { kind: 'blocked' };

  /*
   * Chuyến/hộp thư/tài khoản cá nhân của site khách đọc theo NGƯỜI ĐĂNG NHẬP — trong phiên nó sẽ là
   * của chính nhân sự nền tảng (vốn không có phiên ở site khách). Chặn thay vì để rời phiên.
   */
  const personal = [ROUTES.TRIPS, ROUTES.CHAT, ROUTES.ACCOUNT.ROOT];
  if (personal.some((route) => path === route || path.startsWith(`${route}/`))) {
    return { kind: 'blocked' };
  }

  return { kind: 'outside', href };
}

/** Tiện ích cho menu: href trong phiên, hoặc `null` khi trang không mở trong phiên. */
export function tenantSupportHref(contextId: string, href: string): string | null {
  const route = toTenantSupportRoute(contextId, href);
  return route.kind === 'mapped' ? route.href : null;
}
