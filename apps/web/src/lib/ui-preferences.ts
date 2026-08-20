/**
 * Tuỳ chọn hiển thị của vỏ quản lý mà NGƯỜI DÙNG đã chọn — sidebar đang thu gọn hay không, và
 * những khối menu họ đã gập lại.
 *
 * Vì sao là cookie chứ không phải `localStorage`: giá trị phải có mặt NGAY TRONG LẦN RENDER
 * ĐẦU trên server. `localStorage` chỉ đọc được sau khi hydrate, nên sidebar sẽ hiện mở rộng
 * rồi giật về thu gọn ở mọi lần tải trang — đúng thứ mà "nhớ trạng thái" phải tránh.
 *
 * Cookie này CỐ Ý không httpOnly: nó không mang gì cần bảo vệ (không danh tính, không quyền,
 * không phạm vi dữ liệu) và client phải tự ghi khi người dùng bấm. Quyền và phiên vẫn nằm ở
 * `XP_SESSION` httpOnly, không liên quan (ADR 0002).
 */
export const UI_PREFERENCES_COOKIE = 'XP_NAV';

/** Một năm — đây là thói quen sử dụng, không phải dữ liệu phiên. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface NavPreferences {
  /** Sidebar desktop đang ở chế độ chỉ-icon. */
  readonly sidebarCollapsed: boolean;
  /** Key của các khối menu người dùng đã gập lại (`NavSection.key`). */
  readonly navSectionsCollapsed: readonly string[];
}

export const DEFAULT_NAV_PREFERENCES: NavPreferences = {
  sidebarCollapsed: false,
  navSectionsCollapsed: [],
};

/**
 * Dạng lưu: `sidebar=1&sections=business,settings`.
 *
 * Không dùng JSON: dấu `{`/`"` phải mã hoá phần trăm, làm cookie khó đọc lúc gỡ lỗi mà không
 * được lợi gì — ở đây chỉ có một cờ và một danh sách khoá kebab-case ASCII.
 */
export function serializeNavPreferences(preferences: NavPreferences): string {
  const sections = preferences.navSectionsCollapsed.join(',');
  return `sidebar=${preferences.sidebarCollapsed ? '1' : '0'}&sections=${sections}`;
}

/** Cookie hỏng/cũ/thiếu đều rơi về mặc định — tuỳ chọn giao diện không đáng để nổ. */
export function parseNavPreferences(raw: string | undefined | null): NavPreferences {
  if (!raw) return DEFAULT_NAV_PREFERENCES;

  let sidebarCollapsed = false;
  let navSectionsCollapsed: string[] = [];

  for (const part of raw.split('&')) {
    const [key, value = ''] = part.split('=');
    if (key === 'sidebar') sidebarCollapsed = value === '1';
    if (key === 'sections') {
      navSectionsCollapsed = value.split(',').filter(Boolean);
    }
  }

  return { sidebarCollapsed, navSectionsCollapsed };
}

/** Ghi tuỳ chọn xuống cookie. Chỉ gọi được ở client — server không có `document`. */
export function persistNavPreferences(preferences: NavPreferences): void {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(serializeNavPreferences(preferences));
  document.cookie = `${UI_PREFERENCES_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}
