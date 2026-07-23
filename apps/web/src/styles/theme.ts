import type { ThemeConfig } from 'antd';

/**
 * Nguồn chốt cho design token của XePrime — ADR 0003.
 *
 * Mỗi key ở đây tương ứng đúng một CSS custom property `--xp-<key>` trong `tokens.css`.
 * `theme.test.ts` so sánh hai file: lệch một token là test đỏ, không phải đợi phát hiện
 * bằng mắt trên UI.
 *
 * Giá trị luôn là chuỗi CSS. Chỗ nào antd cần number (fontSize, borderRadius) thì đi qua
 * `toPx()`, để không phải khai báo cùng một con số ở hai dạng.
 */
export const XP_TOKENS = {
  // --- Màu thương hiệu ---
  'color-primary': '#1677ff',
  'color-success': '#52c41a',
  'color-warning': '#faad14',
  'color-error': '#ff4d4f',
  'color-info': '#1677ff',

  // --- Màu chữ / nền / viền ---
  'color-text': 'rgba(0, 0, 0, 0.88)',
  'color-text-secondary': 'rgba(0, 0, 0, 0.65)',
  'color-text-tertiary': 'rgba(0, 0, 0, 0.45)',
  'color-border': '#d9d9d9',
  'color-border-secondary': '#f0f0f0',
  'color-bg-layout': '#f5f5f5',
  'color-bg-container': '#ffffff',
  'color-bg-elevated': '#ffffff',
  'color-bg-hover': 'rgba(0, 0, 0, 0.04)',

  // --- Màu riêng của thanh event trên lịch ---
  'color-event-booking': '#1677ff',
  'color-event-request': '#faad14',
  'color-event-blocked': '#8c8c8c',
  'color-event-maintenance': '#722ed1',

  // --- Typography ---
  'font-family': 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
  'font-size': '14px',
  'font-size-sm': '12px',
  'line-height': '1.5714',

  // --- Hình khối ---
  'border-radius': '8px',
  'border-radius-sm': '4px',

  // --- Khoảng cách ---
  'space-xs': '4px',
  'space-sm': '8px',
  'space-md': '16px',
  'space-lg': '24px',
  'space-xl': '32px',

  // --- Khung app ---
  'shell-topbar-height': '56px',
  'shell-sidebar-width': '232px',
  'shell-sidebar-collapsed-width': '64px',

  // --- Lịch resource timeline ---
  'calendar-resource-col-width': '220px',
  'calendar-day-col-width': '56px',
  'calendar-row-height': '44px',
  'calendar-header-height': '56px',

  // --- Tầng z ---
  'z-sidebar': '110',
  'z-topbar': '100',
  'z-calendar-header': '30',
  'z-calendar-sticky-col': '20',
} as const;

export type XpTokenName = keyof typeof XP_TOKENS;

/** Dùng trong `.module.css` thì viết thẳng `var(--xp-...)`; hàm này cho chỗ cần dựng từ TS. */
export function cssVar(name: XpTokenName): string {
  return `var(--xp-${name})`;
}

function toPx(value: string): number {
  return Number.parseFloat(value);
}

/**
 * Kích thước lịch mà JS cần biết (virtualizer, tính vị trí event bar).
 *
 * Phải suy ra từ token thay vì gõ lại số, nếu không lưới CSS và toạ độ JS sẽ lệch nhau
 * đúng vào lúc ai đó chỉnh chiều cao hàng.
 */
export const XP_METRICS = {
  calendarRowHeight: toPx(XP_TOKENS['calendar-row-height']),
  calendarDayColWidth: toPx(XP_TOKENS['calendar-day-col-width']),
  calendarResourceColWidth: toPx(XP_TOKENS['calendar-resource-col-width']),
  calendarHeaderHeight: toPx(XP_TOKENS['calendar-header-height']),
} as const;

/**
 * Theme cho `ConfigProvider`. Chỉ set seed token — không ghi đè token của từng component,
 * để không phải bám theo tên token nội bộ của antd qua mỗi bản nâng cấp.
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: XP_TOKENS['color-primary'],
    colorSuccess: XP_TOKENS['color-success'],
    colorWarning: XP_TOKENS['color-warning'],
    colorError: XP_TOKENS['color-error'],
    colorInfo: XP_TOKENS['color-info'],
    colorText: XP_TOKENS['color-text'],
    colorTextSecondary: XP_TOKENS['color-text-secondary'],
    colorBorder: XP_TOKENS['color-border'],
    colorBgLayout: XP_TOKENS['color-bg-layout'],
    colorBgContainer: XP_TOKENS['color-bg-container'],
    colorBgElevated: XP_TOKENS['color-bg-elevated'],
    borderRadius: toPx(XP_TOKENS['border-radius']),
    fontFamily: XP_TOKENS['font-family'],
    fontSize: toPx(XP_TOKENS['font-size']),
  },
};
