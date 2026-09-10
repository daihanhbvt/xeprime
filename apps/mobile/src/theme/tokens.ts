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
  /**
   * Bậc "đang chạy" — TÁCH khỏi `info`, không phải một sắc thái của nó.
   *
   * `STATUS_COLOR.PROCESSING` (đơn `active`) và `INFO` (đơn `confirmed`) là hai việc khác nhau
   * của cùng một chiếc xe. Bảng `statusTone()` của viên nhãn từng gộp cả hai vào xanh dương vì
   * nền sáng chưa có bậc thứ năm; nay `@xeprime/ui` đã có, và trên lưới lịch thì khác biệt đó là
   * thứ DUY NHẤT nhìn thấy được giữa "đã chốt lịch" và "khách đang cầm xe đi".
   */
  processing: resolve('color-processing'),
  processingSurface: resolve('color-processing-bg'),
  /** Giá thuê có token riêng — web tô giá bằng chính màu này, không phải màu chữ thường. */
  price: resolve('color-price'),
  /**
   * Hai vai màu của LỊCH — không phải màu trạng thái, và cố ý không mượn màu trạng thái.
   *
   * Bảo dưỡng mang `STATUS_COLOR.SPECIAL` và khoá xe mang `NEUTRAL` trong `@xeprime/types`; nếu
   * lưới đọc thẳng hai vai đó qua `statusTone()` thì bảo dưỡng ra GOLD (bản native chưa có token
   * tím nên `SPECIAL` rơi về nhấn thương hiệu) và trùng luôn với nền cột hôm nay, còn khoá xe ra
   * xám phẳng. Web không làm vậy: nó có hai token riêng cho đúng hai loại này, và đó là lý do một
   * thanh bảo dưỡng trên web tím còn trên app thì vàng.
   */
  eventMaintenance: resolve('color-event-maintenance'),
  eventBlocked: resolve('color-event-blocked'),
  discount: resolve('color-discount'),
  onDiscount: resolve('color-discount-contrast'),
} as const;

/**
 * Màu BIỂU ĐỒ — cùng token với web (`chart-theme.ts` đọc `var(--xp-color-viz-*)`).
 *
 * Tách khỏi `colors` vì đây là bảng màu có VAI, không phải màu giao diện: doanh thu không phải
 * "thành công" và chi phí không phải "nguy hiểm". Bản đầu của app tô biểu đồ bằng
 * `colors.success`/`colors.danger`/`colors.primaryActive` — kết quả là cùng một báo cáo mà web
 * và app ra hai bộ màu khác hẳn, đúng ở bề mặt người dùng mở cả hai lên để đối chiếu; và một cột
 * chi phí bình thường bị mượn luôn sắc thái cảnh báo.
 */
export const chartColors = {
  revenue: resolve('color-viz-revenue'),
  cost: resolve('color-viz-cost'),
  profit: resolve('color-viz-profit'),
  grid: resolve('color-viz-grid'),
  axis: resolve('color-viz-axis'),
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
  /**
   * 11px — bậc CUỐI của thang, dành cho dòng SIÊU PHỤ nằm dưới một dòng chính.
   *
   * Dùng cho meta gộp nhiều mẩu bằng dấu ` · ` trong danh sách dày ("Toyota Vios · 08/09 14:00 →
   * 10/09 14:00", "PT0012 · BK001 · 14:30"): ở 12px những dòng đó bị cắt bằng "…" trên máy 360dp,
   * và cắt một dòng meta là bỏ đi đúng mẩu cuối — thường là cái giờ.
   *
   * KHÔNG dùng cho chữ đứng một mình. Nó đọc được vì luôn có một dòng 12px ngay trên làm mốc; tách
   * ra khỏi cặp đó thì đây chỉ là chữ nhỏ khó đọc. Web đặt tên token này là `overline` (section
   * kicker) — cùng một bậc trên thang, khác vai ở native, và đó là lý do nó có tên riêng ở đây.
   */
  meta: px('font-size-overline'),
} as const;

/**
 * Cỡ chữ BÊN TRONG một ô nhập liệu — nguồn duy nhất cho mọi field của app.
 *
 * Tách khỏi `fontSize` vì thang chữ ở `@xeprime/ui` là thang của WEB: bậc `body` (14px) là cỡ
 * nội dung mặc định của desktop, nên ô nhập bên đó dùng nó là đúng. Native thì không — gần ba
 * phần tư chữ trong app này chạy ở bậc 12px, nên một ô dùng thẳng `fontSize.body` hiện ra to
 * hơn chính NHÃN của nó và to hơn mọi thứ quanh nó.
 *
 * Bốn khe hiện cùng một giá trị nhưng giữ TÊN riêng, vì chúng là bốn vai khác nhau: đổi cỡ chữ
 * gõ vào mà không muốn nhãn to theo là việc sẽ xảy ra, và lúc đó chỉ sửa một dòng ở đây thay vì
 * đi dò lại từng field.
 */
export const fieldFontSize = {
  /** Chữ người dùng gõ, và giá trị đã chọn hiện trong ô (ngày, tháng, lựa chọn). */
  value: fontSize.bodySm,
  /** Nhãn phía trên ô. */
  label: fontSize.bodySm,
  /** Chú thích và thông báo lỗi dưới ô. */
  message: fontSize.bodySm,
  /** Chữ phụ NẰM TRONG ô: đơn vị, hậu tố tiền tệ, bộ đếm ký tự, nhãn của một đầu khoảng. */
  affix: fontSize.label,
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
