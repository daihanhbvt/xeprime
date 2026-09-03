import { XP_TOKENS, toPx, type XpTokenName } from '@xeprime/ui';

/**
 * Cầu nối giữa design token dùng chung (`@xeprime/ui`) và StyleSheet của React Native.
 *
 * `XP_TOKENS` là NGUỒN DUY NHẤT cho mọi client (ADR 0003) — web đọc qua CSS custom property, app
 * native đọc thẳng ở đây. Một bảng màu riêng cho native là hai client cùng thương hiệu mà khác
 * hẳn mặt.
 *
 * Hai việc file này phải làm vì token viết bằng ngôn ngữ CSS:
 *   1. Gỡ bí danh `var(--xp-...)` — một số token trỏ về token khác thay vì giữ giá trị.
 *   2. Đổi chuỗi `'16px'` thành số 16 — RN không nhận đơn vị.
 */

/** Token có giá trị là hàm CSS mà RN không hiểu — dùng ở native là ném ngay, không im lặng. */
const CSS_FUNCTION = /^(color-mix|linear-gradient|calc)\(/;

/**
 * Đi hết chuỗi bí danh `var(--xp-x)` để lấy giá trị thật.
 *
 * Vòng lặp có trần vì một bí danh trỏ vòng lại chính nó sẽ treo Metro lúc nạp module — hỏng
 * ở đây là hỏng trước khi màn hình đầu tiên kịp render, nên phải nói rõ đang hỏng cái gì.
 */
function resolve(name: XpTokenName): string {
  let value: string = XP_TOKENS[name];

  for (let depth = 0; depth < 8; depth += 1) {
    const alias = /^var\(--xp-([a-z0-9-]+)\)$/.exec(value);
    if (!alias) {
      if (CSS_FUNCTION.test(value)) {
        throw new Error(
          `Token '${name}' là hàm CSS ('${value}') — React Native không hiểu. Dùng token khác hoặc thêm giá trị native tương ứng.`,
        );
      }
      return value;
    }

    const target = alias[1] as XpTokenName;
    if (!(target in XP_TOKENS)) {
      throw new Error(`Token '${name}' trỏ tới '--xp-${target}' không tồn tại.`);
    }
    value = XP_TOKENS[target];
  }

  throw new Error(`Token '${name}' có chuỗi bí danh vòng lặp.`);
}

function px(name: XpTokenName): number {
  return toPx(resolve(name));
}

/**
 * Bảng màu của app native.
 *
 * CHỈ có palette sáng, nên `app.json` khoá `userInterfaceStyle: "light"`. Để "automatic" mà
 * không có palette tối thì máy đang ở dark mode sẽ render chữ tối trên nền tối. Mở lại
 * "automatic" cùng lúc với việc bổ sung palette tối ở `@xeprime/ui`, không sớm hơn.
 */
export const colors = {
  background: resolve('color-bg'),
  surface: resolve('color-bg-container'),
  surfaceMuted: resolve('color-bg-muted'),
  border: resolve('color-border'),
  borderInput: resolve('color-border-strong'),
  text: resolve('color-text'),
  textMuted: resolve('color-text-secondary'),
  placeholder: resolve('color-text-tertiary'),
  textDisabled: resolve('color-text-disabled'),
  primary: resolve('color-primary'),
  /** Chữ trên nền gold là ĐEN, không phải trắng — gold sáng không đỡ nổi chữ trắng. */
  onPrimary: resolve('color-primary-contrast'),
  danger: resolve('color-error'),
  dangerSurface: resolve('color-error-bg'),
  primaryHover: resolve('color-primary-hover'),
  primaryActive: resolve('color-primary-active'),
  primaryLight: resolve('color-primary-light'),
  surfaceElevated: resolve('color-bg-elevated'),
  surfaceSelected: resolve('color-bg-selected'),
  /** Lớp phủ sau modal/sheet. */
  overlay: resolve('color-bg-overlay'),
  borderSubtle: resolve('color-border-subtle'),
  textInverse: resolve('color-text-inverse'),
  link: resolve('color-link'),
  success: resolve('color-success'),
  successSurface: resolve('color-success-bg'),
  warning: resolve('color-warning'),
  warningSurface: resolve('color-warning-bg'),
  info: resolve('color-info'),
  infoSurface: resolve('color-info-bg'),
  /** Giá thuê có token riêng — web tô giá bằng chính màu này, không phải màu chữ thường. */
  price: resolve('color-price'),
  discount: resolve('color-discount'),
  onDiscount: resolve('color-discount-contrast'),
} as const;

/**
 * Bảng màu NỀN TỐI của vỏ khu quản lý — sidebar và thanh trên của nó.
 *
 * Là một bộ RIÊNG, không phải bảng sáng ở trên tô tối lại: trên `bg` thì `colors.textMuted`
 * chỉ đạt 2.99:1 và `primaryActive` 4.33:1 — cả hai trượt AA. Web đã đo và chốt bộ này ở
 * `packages/ui/src/tokens/index.ts` (`shell-sidebar-*`), đây là bản native của đúng nó.
 *
 * Bốn giá trị dẫn xuất phải TÍNH SẴN thành hex vì web khai chúng bằng `color-mix()`, thứ
 * React Native không hiểu (`resolve()` sẽ ném). Công thức và tương phản đo lại giữ nguyên:
 *
 * ```
 * hover      = 8%  text  trên bg
 * selectedBg = 14% active trên bg   → chữ `text` trên đó đạt 10.54
 * muted      = 62% text  trên bg    → 5.96
 * border     = 14% text  trên bg
 * ```
 *
 * Đổi một trong ba màu gốc thì phải tính lại bốn giá trị này — `sidebar.test.ts` khoá chúng.
 */
export const sidebar = {
  bg: resolve('shell-sidebar-bg'),
  text: resolve('shell-sidebar-text'),
  active: resolve('shell-sidebar-active'),
  hover: '#2e2b26',
  selectedBg: '#382e19',
  muted: '#9b9891',
  border: '#3a3732',
} as const;

/** Thang khoảng cách Figma: 4 · 8 · 16 · 24 · 32, không có giá trị nào khác. */
export const space = {
  xs: px('space-xs'),
  sm: px('space-sm'),
  md: px('space-md'),
  lg: px('space-lg'),
  xl: px('space-xl'),
} as const;

export const radius = {
  sm: px('border-radius-sm'),
  md: px('border-radius'),
  lg: px('border-radius-lg'),
  pill: px('border-radius-pill'),
} as const;

export const fontSize = {
  h1: px('font-size-h1'),
  h2: px('font-size-h2'),
  h3: px('font-size-h3'),
  h4: px('font-size-h4'),
  bodyLg: px('font-size-body-lg'),
  body: px('font-size-body'),
  bodySm: px('font-size-body-sm'),
  label: px('font-size-label'),
} as const;

/**
 * RN chỉ nhận chuỗi cho `fontWeight`; token giữ đúng cùng con số với web.
 * Ép kiểu vì `XP_TOKENS` khai giá trị là `string` chung, không phải union của RN.
 */
export const fontWeight = {
  regular: resolve('font-weight-regular') as '400',
  medium: resolve('font-weight-medium') as '500',
  semibold: resolve('font-weight-semibold') as '600',
  bold: resolve('font-weight-bold') as '700',
} as const;

export const iconSize = {
  xs: 13,
  sm: 16,
  md: 18,
  lg: 20,
} as const;

export const sizing = {
  /**
   * Vùng chạm tối thiểu của cả hai nền tảng (44pt iOS / 48dp Android) — token `touch-target-min`
   * là 44, lấy max với 48 để Android cũng đạt chuẩn. Đây là SÀN, không phải chiều cao thiết kế:
   * `control-height-lg` (40px) của web nhỏ hơn ngón tay.
   */
  touchTarget: Math.max(px('touch-target-min'), 48),
} as const;
