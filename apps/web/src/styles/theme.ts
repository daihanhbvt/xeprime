import type { ThemeConfig } from 'antd';

/**
 * Nguồn chốt cho design token của XePrime — ADR 0003.
 *
 * Bảng màu thương hiệu: gold trên nền kem, chữ đen ấm — bám UI Firebase-code đang chạy
 * (`Vietrent/css/style.css`), đẩy accent sang gold tươi hơn theo logo mới.
 *
 * Mỗi key ở đây tương ứng đúng một CSS custom property `--xp-<key>` trong `tokens.css`.
 * `theme.test.ts` so sánh hai file: lệch một token là test đỏ, không phải đợi phát hiện
 * bằng mắt trên UI. Giá trị luôn là chuỗi CSS; chỗ AntD cần number thì đi qua `toPx()`.
 */
export const XP_TOKENS = {
  // --- Màu thương hiệu ---
  'color-primary': '#d6a02c', // gold — logo XePrime
  'color-success': '#16a34a',
  'color-warning': '#e07b26', // cam, tách khỏi gold để "cảnh báo" đọc được ngay
  'color-error': '#dc2626',
  'color-info': '#2563eb',

  // --- Màu chữ / nền / viền (nền ấm, không phải xám trung tính) ---
  'color-text': '#2a2318',
  'color-text-secondary': '#6f6450',
  'color-text-tertiary': '#9a8d74',
  'color-border': '#ebddbf',
  'color-border-secondary': '#f4ecd9',
  'color-bg-layout': '#fbf1dc', // kem — nền trang
  'color-bg-container': '#ffffff',
  'color-bg-elevated': '#ffffff',
  'color-bg-hover': 'rgba(120, 90, 20, 0.05)',

  // --- Màu riêng của thanh event trên lịch ---
  'color-event-booking': '#2563eb',
  'color-event-request': '#d6a02c',
  'color-event-blocked': '#8c8069',
  'color-event-maintenance': '#7c3aed',

  // --- Typography ---
  // Be Vietnam Pro tự host qua next/font (biến --font-be-vietnam đặt trên <html>).
  'font-family':
    "var(--font-be-vietnam), 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  'font-size': '14px',
  'font-size-sm': '12px',
  'line-height': '1.5714',

  // --- Hình khối ---
  'border-radius': '10px',
  'border-radius-sm': '6px',

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

  // --- Dẫn xuất: dùng trong CSS Modules, KHÔNG feed vào antdTheme ---
  'gold-deep': '#a9761a',
  'gold-soft': '#f1dba4',
  'color-bg-sand': '#f5ead2',
  'shadow-sm': '0 1px 2px rgba(120, 88, 20, 0.06), 0 1px 3px rgba(120, 88, 20, 0.08)',
  'shadow-md': '0 6px 16px -6px rgba(120, 88, 20, 0.18), 0 2px 6px rgba(120, 88, 20, 0.1)',
  'shadow-lg': '0 24px 50px -16px rgba(120, 88, 20, 0.28)',
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
    colorBorderSecondary: XP_TOKENS['color-border-secondary'],
    colorBgLayout: XP_TOKENS['color-bg-layout'],
    colorBgContainer: XP_TOKENS['color-bg-container'],
    colorBgElevated: XP_TOKENS['color-bg-elevated'],
    borderRadius: toPx(XP_TOKENS['border-radius']),
    fontFamily: XP_TOKENS['font-family'],
    fontSize: toPx(XP_TOKENS['font-size']),
  },
};
