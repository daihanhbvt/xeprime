import { ACCOUNT_REALM, type AccountRealm } from '@xeprime/types';
import { isSafeNextPath } from '@xeprime/domain';

/**
 * BA SITE trong một Next app — ADR 0051 điều 2 · ADR 0053.
 *
 * | Khu       | Người dùng thấy          | Thư mục nội bộ        | Realm tài khoản |
 * | --------- | ------------------------ | --------------------- | --------------- |
 * | `market`  | `xeprime.vn/…`           | `app/(public)/…`      | `customer`      |
 * | `partner` | `partner.xeprime.vn/…`   | `app/(manage)/manage` | `partner`       |
 * | `admin`   | `admin.xeprime.vn/…`     | `app/(admin)/admin`   | `platform`      |
 *
 * Tiền tố `/manage` và `/admin` CHỈ là tên thư mục. Ngoài `zones/`, `proxy.ts` và thư mục `app/`,
 * không chỗ nào gõ chúng: mọi đường dẫn của khu partner/admin dựng qua `zonePath()`, nên CÙNG một
 * dòng code chạy đúng ở cả hai chế độ:
 *
 *  - `path` (mặc định, máy dev): ba khu chung `localhost:3000` dưới tiền tố nội bộ, không rewrite —
 *    `zonePath('partner', '/vehicles')` = `/manage/vehicles`;
 *  - `host` (staging/production): mỗi khu một host, `proxy.ts` rewrite theo host —
 *    `zonePath('partner', '/vehicles')` = `/vehicles`.
 *
 * Module này THUẦN (không React, không DOM): `proxy.ts` import được nó.
 *
 * `process.env.NEXT_PUBLIC_*` phải được viết TƯỜNG MINH từng biến: Next chỉ nhúng lúc build những
 * biểu thức đúng dạng đó, truy cập động (`process.env[name]`) sẽ là `undefined` trong bundle.
 */
export const ZONE = {
  MARKET: 'market',
  PARTNER: 'partner',
  ADMIN: 'admin',
} as const;

export type Zone = (typeof ZONE)[keyof typeof ZONE];
export const ZONE_VALUES = Object.values(ZONE) as Zone[];

export function isZone(value: unknown): value is Zone {
  return typeof value === 'string' && (ZONE_VALUES as string[]).includes(value);
}

/** Realm tài khoản của từng khu — mỗi site là một không gian tài khoản (ADR 0053 điều 1). */
export const ZONE_REALM: Readonly<Record<Zone, AccountRealm>> = {
  [ZONE.MARKET]: ACCOUNT_REALM.CUSTOMER,
  [ZONE.PARTNER]: ACCOUNT_REALM.PARTNER,
  [ZONE.ADMIN]: ACCOUNT_REALM.PLATFORM,
};

export const ZONE_MODE = {
  HOST: 'host',
  PATH: 'path',
} as const;

export type ZoneMode = (typeof ZONE_MODE)[keyof typeof ZONE_MODE];

/**
 * Tên thư mục nội bộ của từng khu. CHỈ `zones/` và `proxy.ts` đọc bảng này.
 *
 * `/manage/admin` là tiền tố CŨ của khu quản trị (trước ADR 0051) — chỉ còn trong bảng ánh xạ URL
 * cũ (`legacy-redirects.ts`).
 */
export const ZONE_INTERNAL_PREFIX: Readonly<Record<Zone, string>> = {
  [ZONE.MARKET]: '',
  [ZONE.PARTNER]: '/manage',
  [ZONE.ADMIN]: '/admin',
};

/** Chế độ định tuyến — mặc định `path`: thiếu biến thì máy dev vẫn chạy đúng. */
export function zoneMode(): ZoneMode {
  return process.env.NEXT_PUBLIC_XP_ZONE_MODE === ZONE_MODE.HOST ? ZONE_MODE.HOST : ZONE_MODE.PATH;
}

function trimSlash(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  return trimmed ? trimmed : null;
}

/**
 * URL GỐC của site một khu, gồm cả tiền tố ở chế độ `path` (vd `http://localhost:3000/manage`) —
 * cùng nghĩa với `APP_WEB_URL` / `WEB_PARTNER_URL` / `WEB_ADMIN_URL` của API. `null` khi chưa khai:
 * nơi gọi lùi về đường dẫn tương đối (đúng ở chế độ `path`, nơi ba khu chung một origin).
 */
export function zoneUrl(zone: Zone): string | null {
  switch (zone) {
    case ZONE.MARKET:
      return trimSlash(process.env.NEXT_PUBLIC_WEB_MARKET_URL);
    case ZONE.PARTNER:
      return trimSlash(process.env.NEXT_PUBLIC_WEB_PARTNER_URL);
    case ZONE.ADMIN:
      return trimSlash(process.env.NEXT_PUBLIC_WEB_ADMIN_URL);
  }
}

/** Gốc đường dẫn TƯƠNG ĐỐI trong một khu: tiền tố nội bộ ở chế độ `path`, rỗng ở chế độ `host`. */
export function zoneBase(zone: Zone, mode: ZoneMode = zoneMode()): string {
  return mode === ZONE_MODE.PATH ? ZONE_INTERNAL_PREFIX[zone] : '';
}

/**
 * Đường dẫn hiển thị của `path` (bắt đầu bằng `/`) trong một khu — dùng cho `<Link>` và so khớp
 * `usePathname()` TRONG CÙNG khu. Gốc khu (`/`) ở chế độ `path` là chính tiền tố (`/manage`).
 */
export function zonePath(zone: Zone, path: string, mode: ZoneMode = zoneMode()): string {
  const base = zoneBase(zone, mode);
  if (path === '/' || path === '') return base || '/';
  return `${base}${path}`;
}

/**
 * URL TUYỆT ĐỐI của `path` ở một khu — điều hướng KHÁC site (`location.assign`). Chưa khai URL của
 * khu thì trả đường dẫn tương đối: đúng ở chế độ `path`, nơi mọi khu chung một origin.
 *
 * Ở chế độ `path`, URL của khu đã gồm tiền tố, nên ghép thẳng `path` vào sau.
 */
export function zoneHref(zone: Zone, path: string, mode: ZoneMode = zoneMode()): string {
  const root = zoneUrl(zone);
  if (!root) return zonePath(zone, path, mode);
  return path === '/' || path === '' ? `${root}/` : `${root}${path}`;
}

/**
 * Link từ khu `from` tới `path` của khu `to`: tương đối khi cùng origin (cùng khu, hoặc chế độ
 * `path`), tuyệt đối khi khác host. Dùng cho `<a href>`/`<Link>` băng qua hai site.
 */
export function crossZoneHref(
  from: Zone,
  to: Zone,
  path: string,
  mode: ZoneMode = zoneMode(),
): string {
  if (from === to || mode === ZONE_MODE.PATH) return zonePath(to, path, mode);
  return zoneHref(to, path, mode);
}

/**
 * Link tới `path` của khu `zone` từ BẤT KỲ khu nào: tương đối ở chế độ `path` (một origin), tuyệt
 * đối ở chế độ `host`. Dùng khi nơi gọi không biết (hoặc không cần biết) mình đang ở khu nào —
 * vd hằng đường dẫn dùng chung, nút "Đăng xe cho thuê" của site khách dẫn sang site partner.
 * Đi được cả khi trùng khu: URL tuyệt đối về chính host đó vẫn đúng, chỉ là tải lại trang.
 */
export function siteHref(zone: Zone, path: string, mode: ZoneMode = zoneMode()): string {
  return mode === ZONE_MODE.PATH ? zonePath(zone, path, mode) : zoneHref(zone, path, mode);
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Đích điều hướng an toàn: đường dẫn nội bộ (`isSafeNextPath`), hoặc URL tuyệt đối có ORIGIN đúng
 * bằng origin của một trong ba site đã khai. Mọi thứ khác (host lạ, `javascript:`, `//evil`) là
 * `false` — một `next` từ URL không bao giờ đưa người dùng ra ngoài XePrime.
 */
export function isSafeTarget(target: string | null | undefined): target is string {
  if (!target) return false;
  if (isSafeNextPath(target)) return true;
  let origin: string;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    origin = parsed.origin;
  } catch {
    return false;
  }
  return ZONE_VALUES.some((zone) => originOf(zoneUrl(zone)) === origin);
}

/**
 * Khu của một HOST (chế độ `host`). So cả cổng: máy dev chạy `partner.xeprime.test:3000`. `null`
 * khi host không thuộc site nào (vd `api.xeprime.vn` lọt tới web) — proxy để nguyên request đó.
 */
export function zoneForHost(host: string | null | undefined): Zone | null {
  if (!host) return null;
  const normalized = host.trim().toLowerCase();
  for (const zone of ZONE_VALUES) {
    const root = zoneUrl(zone);
    if (!root) continue;
    try {
      if (new URL(root).host.toLowerCase() === normalized) return zone;
    } catch {
      // URL khai sai: bỏ qua khu đó thay vì làm hỏng mọi request.
    }
  }
  return null;
}

/**
 * Khu của một ĐƯỜNG DẪN NỘI BỘ (tiền tố thư mục) — chỉ đúng ở chế độ `path`, và chỉ `zones/` +
 * `proxy.ts` được dùng. Component KHÔNG đoán khu từ đường dẫn: chúng đọc `useZone()`.
 */
export function zoneOfInternalPath(pathname: string): Zone {
  for (const zone of [ZONE.ADMIN, ZONE.PARTNER] as const) {
    const prefix = ZONE_INTERNAL_PREFIX[zone];
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return zone;
  }
  return ZONE.MARKET;
}

/**
 * Đường dẫn hiển thị `path` (đã gồm `zoneBase`) có thuộc khu `zone` không — để kiểm một `next`
 * trước khi đưa người dùng tới đó. Chế độ `host`: mọi đường dẫn tương đối nằm trên host hiện tại,
 * nên thuộc đúng khu của trang đang xử lý nó; chế độ `path`: so tiền tố thư mục.
 */
export function isPathInZone(zone: Zone, path: string, mode: ZoneMode = zoneMode()): boolean {
  if (mode === ZONE_MODE.HOST) return path.startsWith('/') && !path.startsWith('//');
  const pathname = path.split(/[?#]/)[0] ?? path;
  return zoneOfInternalPath(pathname) === zone;
}

/**
 * Ngược của `zonePath`: bỏ `zoneBase` khỏi một đường dẫn hiển thị để được đường dẫn TRONG khu —
 * đầu vào của `zoneHref`/`siteHref` khi nơi gọi đang cầm một hằng `ROUTES.*` (đã gồm tiền tố).
 */
export function zoneRelativePath(zone: Zone, path: string, mode: ZoneMode = zoneMode()): string {
  const base = zoneBase(zone, mode);
  if (!base) return path;
  if (path === base) return '/';
  if (!path.startsWith(`${base}/`) && !path.startsWith(`${base}?`)) return path;
  const rest = path.slice(base.length);
  return rest.startsWith('?') ? `/${rest}` : rest;
}

/** Đường dẫn nội bộ (thư mục `app/`) của một đường dẫn hiển thị trong khu — cho rewrite ở `proxy.ts`. */
export function internalPathOf(zone: Zone, displayPath: string): string {
  return zonePath(zone, displayPath, ZONE_MODE.PATH);
}

/**
 * Đường dẫn trong khu partner mà API trả về theo dạng CŨ `/manage/...` (vd `actionHref` của cảnh
 * báo xe, dùng chung với app Partner) → đường dẫn hiển thị của khu partner ở chế độ đang chạy.
 * Không phải dạng đó thì trả nguyên (link ngoài khu, `null`…).
 */
export function partnerPathFromApi(href: string): string {
  const prefix = ZONE_INTERNAL_PREFIX[ZONE.PARTNER];
  if (href === prefix) return zonePath(ZONE.PARTNER, '/');
  if (!href.startsWith(`${prefix}/`) && !href.startsWith(`${prefix}?`)) return href;
  const rest = href.slice(prefix.length);
  return rest.startsWith('?') ? `${zonePath(ZONE.PARTNER, '/')}${rest}` : zonePath(ZONE.PARTNER, rest);
}
