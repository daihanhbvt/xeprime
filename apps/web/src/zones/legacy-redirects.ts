import { ZONE, ZONE_INTERNAL_PREFIX, type Zone } from './zone-config';

/**
 * URL CŨ còn nằm trong bookmark, email, tin nhắn và thông báo đã phát — đi đâu bây giờ.
 *
 * Hai họ URL cũ:
 *
 *  1. **Tiền tố nội bộ** (`/manage/…`, `/manage/admin/…`) — mọi link của cổng quản lý và khu quản
 *     trị trước ADR 0051. Chúng thành path SẠCH trên đúng host.
 *  2. **Khu chủ xe trên `xeprime.vn`** (B2 — ADR 0051 điều 3): Owner Lite từng sống trong
 *     `/account/**` của khu khách và wizard đăng xe ở `/list-your-vehicle/register`. Chúng sang
 *     trang tương ứng ở site partner. Trang của KHÁCH trong `/account/**` (hồ sơ, ví, thanh toán,
 *     tài khoản nhận tiền, giấy tờ…) giữ nguyên — không có trong bảng này.
 *
 * Bảng dưới là NGUỒN DUY NHẤT; `proxy.ts` chỉ đọc nó. Đích là đường dẫn HIỂN THỊ trong khu đích —
 * `proxy.ts` tự dựng URL đúng chế độ (`zoneHref`/`zonePath`) và GIỮ NGUYÊN query.
 */
export interface LegacyTarget {
  readonly zone: Zone;
  readonly path: string;
}

/** Mảnh id (ULID, mã…) — không ăn sang đoạn kế tiếp. */
const SEG = '([^/]+)';

/**
 * Owner Lite cũ ở `/account/**` + wizard đăng xe → site partner. Thứ tự quan trọng: mẫu cụ thể
 * trước, mẫu tổng quát sau.
 */
const OWNER_PAGES: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^\/account\/registration\/?$/, () => '/registration'],
  [new RegExp(`^/account/vehicles/${SEG}/manage(/.*)?$`), (m) => `/vehicles/${m[1]}/manage${m[2] ?? ''}`],
  [new RegExp(`^/account/vehicles/${SEG}/?$`), (m) => `/vehicles/${m[1]}`],
  [/^\/account\/vehicles\/?$/, () => '/vehicles'],
  [/^\/account\/calendar\/?$/, () => '/calendar'],
  // "Tiền cho thuê xe" là ví của GIAN HÀNG — ở site partner nó là trang Ví điểm.
  [/^\/account\/earnings\/?$/, () => '/balance'],
  [/^\/account\/subscription\/?$/, () => '/subscription'],
  [/^\/account\/host-guide\/?$/, () => '/host-guide'],
  [/^\/account\/tax\/?$/, () => '/tax'],
  [/^\/account\/contracts-documents\/?$/, () => '/contracts-documents'],
  [/^\/account\/data-protection\/?$/, () => '/data-protection'],
  // Hộp thư phía chủ xe (bản trước đã chuyển tạm về `/chat` hợp nhất của khu khách).
  [/^\/account\/messages\/?$/, () => '/chat'],
  [/^\/list-your-vehicle\/register\/?$/, () => '/vehicles/register'],
  // Lời mời vào gian hàng: email phát trước ADR 0053 trỏ vào khu khách.
  [new RegExp(`^/invites/${SEG}/?$`), (m) => `/invites/${m[1]}`],
];

/** Trang chủ xe cũ trên site khách → trang ở site partner; `null` = không phải trang chủ xe. */
export function legacyOwnerPageTarget(pathname: string): LegacyTarget | null {
  for (const [pattern, toPath] of OWNER_PAGES) {
    const match = pattern.exec(pathname);
    if (match) return { zone: ZONE.PARTNER, path: toPath(match) };
  }
  return null;
}

/**
 * URL mang tiền tố nội bộ CŨ → khu + path sạch. `/manage/admin/x` là khu quản trị cũ; `/manage/x`
 * là cổng quản lý (nay khu partner). `null` khi không mang tiền tố `/manage`.
 */
export function legacyPrefixedTarget(pathname: string): LegacyTarget | null {
  const partner = ZONE_INTERNAL_PREFIX[ZONE.PARTNER];
  const oldAdmin = `${partner}/admin`;
  if (pathname === oldAdmin || pathname.startsWith(`${oldAdmin}/`)) {
    return { zone: ZONE.ADMIN, path: pathname.slice(oldAdmin.length) || '/' };
  }
  if (pathname === partner || pathname.startsWith(`${partner}/`)) {
    const path = pathname.slice(partner.length) || '/';
    return legacyPartnerPageTarget(path) ?? { zone: ZONE.PARTNER, path };
  }
  return null;
}

/**
 * Trang CŨ của cổng quản lý mà nghĩa đã sang site KHÁCH (ADR 0053): lối chuyển tiếp "chuyến tôi đi
 * thuê". Tài khoản đối tác không bao giờ đứng tên một chuyến đi thuê, nên link trong email cũ đi
 * thẳng tới `/trips` của site khách — TRƯỚC cổng phiên của site partner (người bấm là khách).
 *
 * Nhận đường dẫn TRONG khu partner (không tiền tố).
 */
const PARTNER_TO_MARKET: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^\/account\/trips\/?$/, () => '/trips'],
  [new RegExp(`^/account/trips/${SEG}/?$`), (m) => `/trips/${m[1]}`],
];

export function legacyPartnerPageTarget(partnerPath: string): LegacyTarget | null {
  for (const [pattern, toPath] of PARTNER_TO_MARKET) {
    const match = pattern.exec(partnerPath);
    if (match) return { zone: ZONE.MARKET, path: toPath(match) };
  }
  return null;
}
