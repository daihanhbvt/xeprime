import { XP_TOKENS, toPx, type XpTokenName } from '@xeprime/ui';

/** Hai chế độ giao diện — cùng mô hình Sáng · Tối với web (#203). */
export type ColorScheme = 'light' | 'dark';

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
/**
 * Bảng màu TỐI của app native — bản riêng của app, CÙNG giá trị với `XP_DARK_TOKENS` của web
 * (`apps/web/src/styles/theme.ts`, #203/#207). Web giữ bảng tối ở file riêng của nó (không ở
 * `@xeprime/ui`), nên app cũng giữ bản của mình; đổi một màu tối thì sửa CẢ HAI.
 *
 * Chỉ các token bề mặt · chữ · viền · nền nhạt được đảo; token không có ở đây giữ giá trị sáng — đúng
 * cách khối `[data-theme="dark"]` của `tokens.css` hoạt động. Giá trị `var(--xp-…)` đi qua cùng
 * bộ gỡ bí danh của `resolve()`.
 */
const DARK_TOKENS: Partial<Record<XpTokenName, string>> = {
  'color-bg': '#080c10',
  'color-bg-container': '#0f1620',
  'color-bg-elevated': '#161f2c',
  'color-bg-muted': '#1a2230',
  'color-bg-selected': 'rgba(233, 172, 41, 0.15)',
  'color-bg-hover': 'rgba(255, 255, 255, 0.06)',
  'color-bg-active': 'rgba(255, 255, 255, 0.1)',
  'color-primary-subtle': 'rgba(233, 172, 41, 0.12)',
  'color-primary-light': 'rgba(233, 172, 41, 0.16)',
  'color-primary-muted': '#946e1f',
  'color-success-bg': 'rgba(3, 152, 85, 0.16)',
  'color-success-subtle': 'rgba(3, 152, 85, 0.08)',
  'color-warning-bg': 'rgba(224, 123, 38, 0.16)',
  'color-error-bg': 'rgba(217, 45, 32, 0.16)',
  'color-info-bg': 'rgba(37, 99, 235, 0.18)',
  'color-processing-bg': 'rgba(14, 116, 144, 0.2)',
  'color-neutral': '#d5d7da',
  'color-neutral-bg': '#1a2230',
  'color-price': 'var(--xp-color-primary)',
  'color-primary-border': '#946e1f',
  'color-success-border': 'rgba(108, 233, 166, 0.45)',
  'color-warning-subtle': 'rgba(247, 144, 9, 0.1)',
  'color-text': '#ffffff',
  'color-text-secondary': '#d5d7da',
  'color-text-tertiary': '#a4a7ae',
  'color-text-placeholder': '#717680',
  'color-text-disabled': 'rgba(255, 255, 255, 0.25)',
  'color-text-inverse': '#0e0f12',
  'color-border': '#333741',
  'color-border-strong': '#414651',
  'color-border-subtle': '#1f242f',
};

/** Giá trị gốc của một token ở một chế độ — bản tối trước, thiếu thì rơi về bản sáng. */
function rawToken(name: XpTokenName, scheme: ColorScheme): string {
  return (scheme === 'dark' ? DARK_TOKENS[name] : undefined) ?? XP_TOKENS[name];
}

function resolve(name: XpTokenName, scheme: ColorScheme = 'light'): string {
  let value: string = rawToken(name, scheme);

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
    value = rawToken(target, scheme);
  }

  throw new Error(`Token '${name}' có chuỗi bí danh vòng lặp.`);
}

function px(name: XpTokenName): number {
  return toPx(resolve(name));
}

/**
 * Bảng màu của app native.
 *
 * Hai palette — sáng (`XP_TOKENS`) và tối (`DARK_TOKENS`) — dựng sẵn cả hai trong `PALETTES`;
 * component chọn bảng theo giao diện hiện hành qua `useColors()`. `app.json` để
 * `userInterfaceStyle: "automatic"` để hệ thống (thanh trạng thái, bàn phím) đi cùng.
 */
function buildColors(scheme: ColorScheme) {
  const r = (name: XpTokenName) => resolve(name, scheme);
  return {
    background: r('color-bg'),
    surface: r('color-bg-container'),
    surfaceMuted: r('color-bg-muted'),
    border: r('color-border'),
    borderInput: r('color-border-strong'),
    text: r('color-text'),
    textMuted: r('color-text-secondary'),
    placeholder: r('color-text-tertiary'),
    textDisabled: r('color-text-disabled'),
    primary: r('color-primary'),
    /** Chữ trên nền gold là ĐEN, không phải trắng — gold sáng không đỡ nổi chữ trắng. */
    onPrimary: r('color-primary-contrast'),
    danger: r('color-error'),
    dangerSurface: r('color-error-bg'),
    primaryHover: r('color-primary-hover'),
    primaryActive: r('color-primary-active'),
    primaryLight: r('color-primary-light'),
    /** Nền gold nhạt nhất (ô avatar, mảng nền) — v2 BG/primary-25. */
    primarySubtle: r('color-primary-subtle'),
    /** Chữ gold đậm trên nền nhạt (chữ cái avatar). */
    primaryStrong: r('color-primary-strong'),
    /** Nền gold nhạt (avatar người đánh giá) — v2 BG/primary-100. */
    primaryMuted: r('color-primary-muted'),
    surfaceElevated: r('color-bg-elevated'),
    surfaceSelected: r('color-bg-selected'),
    /** Lớp phủ sau modal/sheet. */
    overlay: r('color-bg-overlay'),
    borderSubtle: r('color-border-subtle'),
    textInverse: r('color-text-inverse'),
    link: r('color-link'),
    success: r('color-success'),
    successSurface: r('color-success-bg'),
    warning: r('color-warning'),
    warningSurface: r('color-warning-bg'),
    info: r('color-info'),
    infoSurface: r('color-info-bg'),
    /**
     * Bậc "đang chạy" — TÁCH khỏi `info`, không phải một sắc thái của nó.
     *
     * `STATUS_COLOR.PROCESSING` (đơn `active`) và `INFO` (đơn `confirmed`) là hai việc khác nhau
     * của cùng một chiếc xe. Bảng `statusTone()` của viên nhãn từng gộp cả hai vào xanh dương vì
     * nền sáng chưa có bậc thứ năm; nay `@xeprime/ui` đã có, và trên lưới lịch thì khác biệt đó là
     * thứ DUY NHẤT nhìn thấy được giữa "đã chốt lịch" và "khách đang cầm xe đi".
     */
    processing: r('color-processing'),
    processingSurface: r('color-processing-bg'),
    /** Giá thuê có token riêng — web tô giá bằng chính màu này, không phải màu chữ thường. */
    price: r('color-price'),
    /**
     * Hai vai màu của LỊCH — không phải màu trạng thái, và cố ý không mượn màu trạng thái.
     *
     * Bảo dưỡng mang `STATUS_COLOR.SPECIAL` và khoá xe mang `NEUTRAL` trong `@xeprime/types`; nếu
     * lưới đọc thẳng hai vai đó qua `statusTone()` thì bảo dưỡng ra GOLD (bản native chưa có token
     * tím nên `SPECIAL` rơi về nhấn thương hiệu) và trùng luôn với nền cột hôm nay, còn khoá xe ra
     * xám phẳng. Web không làm vậy: nó có hai token riêng cho đúng hai loại này, và đó là lý do một
     * thanh bảo dưỡng trên web tím còn trên app thì vàng.
     */
    eventMaintenance: r('color-event-maintenance'),
    eventBlocked: r('color-event-blocked'),
    discount: r('color-discount'),
    onDiscount: r('color-discount-contrast'),
  } as const;
}

/**
 * Màu BIỂU ĐỒ — cùng token với web (`chart-theme.ts` đọc `var(--xp-color-viz-*)`).
 *
 * Tách khỏi `colors` vì đây là bảng màu có VAI, không phải màu giao diện: doanh thu không phải
 * "thành công" và chi phí không phải "nguy hiểm". Bản đầu của app tô biểu đồ bằng
 * `colors.success`/`colors.danger`/`colors.primaryActive` — kết quả là cùng một báo cáo mà web
 * và app ra hai bộ màu khác hẳn, đúng ở bề mặt người dùng mở cả hai lên để đối chiếu; và một cột
 * chi phí bình thường bị mượn luôn sắc thái cảnh báo.
 */
function buildChartColors(scheme: ColorScheme) {
  const r = (name: XpTokenName) => resolve(name, scheme);
  return {
    revenue: r('color-viz-revenue'),
    cost: r('color-viz-cost'),
    profit: r('color-viz-profit'),
    grid: r('color-viz-grid'),
    axis: r('color-viz-axis'),
  } as const;
}

/**
 * HAI bảng màu dựng sẵn lúc nạp module — đổi giao diện chỉ là chọn bảng kia, không tính lại gì.
 * Component đọc qua `useColors()` / `useChartColors()` (`theme/ThemeProvider.tsx`) để đổi màu
 * TỨC THÌ khi khách bấm đổi giao diện, như web đổi `data-theme`.
 */
export const PALETTES = {
  light: { colors: buildColors('light'), chartColors: buildChartColors('light') },
  dark: { colors: buildColors('dark'), chartColors: buildChartColors('dark') },
} as const;

export type AppColors = ReturnType<typeof buildColors>;
export type AppChartColors = ReturnType<typeof buildChartColors>;

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

/**
 * Màu của BỀ MẶT CHỢ v2 (trang chủ) — nhóm "Design v2" của `@xeprime/ui` (ADR 0062).
 *
 * Tách khỏi `colors` vì đây là màu của một bề mặt marketing (dải đối tác nền đen, thẻ điểm đến
 * viền vàng), không phải màu giao diện chung của app: đưa vào `colors` là mời màn khác mượn.
 */
export const market = {
  inverse: resolve('color-bg-inverse'),
  onDark: resolve('color-text-on-dark'),
  onDarkMuted: resolve('color-text-on-dark-muted'),
  accent: resolve('color-primary-accent'),
  /** Vành avatar gian hàng đã xác thực trên thẻ trang chủ. */
  glow: resolve('color-primary-glow'),
  destinationBorder: resolve('color-destination-border'),
} as const;

/** Một gradient CSS `linear-gradient(<deg>, <màu> <vị trí>%, …)` dịch sang `expo-linear-gradient`. */
export interface NativeGradient {
  colors: [string, string, ...string[]];
  locations: [number, number, ...number[]];
}

/**
 * Đọc điểm màu của một token gradient — `resolve()` cố ý ném với hàm CSS, nên gradient có cửa
 * riêng thay vì một bảng hex chép tay: đổi điểm màu ở `@xeprime/ui` là app đổi theo.
 *
 * Chỉ đọc MÀU và VỊ TRÍ; hướng là việc của nơi vẽ (mọi gradient v2 dùng ở app là 90deg ⇒
 * trái → phải).
 */
export function gradient(name: XpTokenName): NativeGradient {
  const value: string = XP_TOKENS[name];
  const stops = [...value.matchAll(/(#[0-9a-f]{3,8}|rgba?\([^)]+\))\s+(-?[\d.]+)%/gi)].map(
    (match) => ({ color: match[1] as string, at: Number(match[2]) / 100 }),
  );
  if (stops.length < 2) throw new Error(`Token '${name}' không phải linear-gradient đọc được.`);
  return {
    colors: stops.map((stop) => stop.color) as NativeGradient['colors'],
    locations: stops.map((stop) =>
      Math.min(Math.max(stop.at, 0), 1),
    ) as NativeGradient['locations'],
  };
}

export const gradients = {
  /** Nút chính v2 ("Đăng ký ngay", "Khám phá"). */
  primary: gradient('gradient-primary'),
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

  /**
   * Cỡ VẼ RA của biến thể GỌN — nút icon trên một thanh trên chật.
   *
   * Nhỏ hơn `touchTarget` là CÓ CHỦ ĐÍCH, và không vi phạm sàn chạm: nơi dùng bù lại bằng
   * `hitSlop`, nên vùng chạm vẫn đủ 48dp còn chỗ CHIẾM trên màn chỉ 32. Thanh trên khu quản lý
   * phải chứa nút menu, tên gian hàng, chuông, biểu tượng chat và nút đổi khu trên 320dp —
   * năm ô 48dp không vừa.
   *
   * Ở đây chứ không khai lại ở từng component: đã có ba bản chép tay (`IconButton`,
   * `ChatBadgeButton`, `NotificationBell`), mỗi bản một docblock trỏ sang bản kia. Ba lần là lúc
   * nó thôi còn là trùng hợp.
   */
  compactBox: 32,
} as const;

/**
 * Chiều cao VẼ RA của `Button` theo cỡ — khớp web: `sm` = AntD `controlHeight` (32),
 * `md` = `controlHeightLG` (40, ~ `CtaButton` md 42), `lg` = `CtaButton` lg (44).
 * Vùng chạm vẫn đủ `touchTarget` nhờ `hitSlop` (xem `buttonHitSlop`).
 */
export const buttonHeight = { sm: px('control-height'), md: px('control-height-lg'), lg: px('touch-target-min') } as const;

/** `hitSlop` dọc bù cho nút thấp hơn `touchTarget`, để vùng chạm luôn ≥ sàn chạm. */
export function buttonHitSlop(height: number): number {
  return Math.max(0, Math.ceil((sizing.touchTarget - height) / 2));
}
