import { ROUTES, adminTenantSupportPath, tenantSupportContextIdFromPath } from './routes';

/**
 * Ánh xạ route của KHU LÀM VIỆC gian hàng (`/manage/...`, Owner Lite `/account/...`, `/trips`) sang
 * route của một phiên hỗ trợ (`/manage/admin/tenant-support/<id>/...`) — ADR 0050 §12.
 *
 * Đây là nơi DUY NHẤT biết một route có tồn tại trong phiên hay không. Menu, breadcrumb, lớp chặn
 * `router.push` và lớp chặn click `<Link>` đều đi qua đây — không component nào tự ghép chuỗi
 * `/manage/admin/tenant-support/${id}/...`, và một link trong card/bảng/dialog của trang dùng lại
 * không thể "thoát" khỏi phiên về `/manage` của tài khoản nhân sự (nơi request mất header phiên).
 *
 * Ba kết quả:
 *  - `mapped`  — có trang tương ứng trong phiên; điều hướng tới đó.
 *  - `outside` — không phải route của khu làm việc (trang công khai, màn nền tảng `/manage/admin`,
 *                tài khoản của CHÍNH nhân sự đang đăng nhập): để nguyên — rời phiên có chủ đích
 *                (vd. nút "Thoát chế độ hỗ trợ", "Bảo mật tài khoản" ở thẻ người dùng).
 *  - `blocked` — route của khu làm việc KHÔNG mở trong phiên (tài chính, ví, chat, tài khoản…):
 *                không điều hướng.
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
 * Route của TÀI KHOẢN người đang đăng nhập nằm dưới `/manage` — thẻ người dùng ở menu dựng chúng.
 * Trong phiên chúng vẫn là của nhân sự nền tảng, không của gian hàng: rời phiên mà đi tới, không chặn.
 */
const OPERATOR_ROUTES: readonly string[] = [ROUTES.MANAGE.SECURITY, ROUTES.MANAGE.ACCOUNT_TRIPS];

/** Owner Lite → đường tương đối trong phiên. Chỉ công việc cho thuê; mọi thứ khác bị chặn. */
const OWNER_LITE_ALIASES: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^\/account\/vehicles(\/.*)?$/, (m) => `vehicles${m[1] ?? ''}`],
  [/^\/account\/calendar$/, () => 'calendar'],
  [/^\/account\/support$/, () => 'support/cases'],
];

function splitHref(href: string): { path: string; rest: string } {
  const cut = href.search(/[?#]/);
  return cut < 0 ? { path: href, rest: '' } : { path: href.slice(0, cut), rest: href.slice(cut) };
}

function isSupportPage(relative: string): boolean {
  return SUPPORT_PAGES.some((pattern) => pattern.test(relative));
}

export function toTenantSupportRoute(contextId: string, href: string): TenantSupportRoute {
  // Link tuyệt đối (http…), mailto, tel, neo trong trang: không phải route của khu làm việc.
  if (!href.startsWith('/') || href.startsWith('//')) return { kind: 'outside', href };
  const { path: rawPath, rest } = splitHref(href);
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;

  // Đã ở trong phiên — của CHÍNH phiên này thì giữ, của phiên khác thì chặn (không nhảy phiên).
  const inSession = tenantSupportContextIdFromPath(path);
  if (inSession) return inSession === contextId ? { kind: 'mapped', href } : { kind: 'blocked' };

  const base = adminTenantSupportPath.root(contextId);
  const target = (relative: string): TenantSupportRoute =>
    isSupportPage(relative) ? { kind: 'mapped', href: `${base}/${relative}${rest}` } : { kind: 'blocked' };

  if (path === ROUTES.MANAGE.ROOT) return target('dashboard');
  if (OPERATOR_ROUTES.includes(path)) return { kind: 'outside', href };
  // Màn NỀN TẢNG (`/manage/admin/...`): rời phiên có chủ đích — vd. "Thoát chế độ hỗ trợ".
  if (path === ROUTES.MANAGE.ADMIN || path.startsWith(`${ROUTES.MANAGE.ADMIN}/`)) {
    return { kind: 'outside', href };
  }
  if (path.startsWith(`${ROUTES.MANAGE.ROOT}/`)) {
    return target(path.slice(ROUTES.MANAGE.ROOT.length + 1));
  }

  for (const [pattern, toRelative] of OWNER_LITE_ALIASES) {
    const match = pattern.exec(path);
    if (match) return target(toRelative(match));
  }
  // Mọi route còn lại của khu tài khoản cá nhân (hồ sơ, mật khẩu, ví, thuế, chuyến đi thuê…).
  if (path === ROUTES.ACCOUNT.ROOT || path.startsWith(`${ROUTES.ACCOUNT.ROOT}/`)) {
    return { kind: 'blocked' };
  }
  /*
   * `/trips` đọc theo NGƯỜI ĐĂNG NHẬP (`user.id`), không theo gian hàng — trong phiên nó sẽ hiện
   * chuyến của chính nhân sự nền tảng. Chuyến phía chủ xe của Owner Lite đi qua hai màn
   * tenant-scoped "Yêu cầu thuê" / "Đơn thuê".
   */
  if (path === ROUTES.TRIPS || path.startsWith(`${ROUTES.TRIPS}/`)) return { kind: 'blocked' };
  if (path === ROUTES.CHAT || path.startsWith(`${ROUTES.CHAT}/`)) return { kind: 'blocked' };

  return { kind: 'outside', href };
}

/** Tiện ích cho menu: href trong phiên, hoặc `null` khi trang không mở trong phiên. */
export function tenantSupportHref(contextId: string, href: string): string | null {
  const route = toTenantSupportRoute(contextId, href);
  return route.kind === 'mapped' ? route.href : null;
}
