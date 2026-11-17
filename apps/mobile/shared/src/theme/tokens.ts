import { XP_TOKENS, toPx, type XpTokenName } from '@xeprime/ui';
import Constants from 'expo-constants';
import { Dimensions } from 'react-native';
import { mixColor } from './color-mix';

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
  // Viên loại dịch vụ "Tự lái" / "Thuê xe dài hạn" (tokens.css khối tối, Partner-XePrime 02/11/2026).
  'color-info-border': 'rgba(132, 202, 255, 0.45)',
  'color-pink': '#f670c7',
  'color-pink-bg': 'rgba(221, 37, 144, 0.12)',
  'color-pink-border': 'rgba(250, 167, 224, 0.45)',
  'color-text': '#ffffff',
  'color-text-secondary': '#fafafa',
  'color-text-tertiary': '#e9eaeb',
  'color-text-placeholder': '#a4a7ae',
  'color-text-disabled': 'rgba(255, 255, 255, 0.25)',
  'color-text-inverse': '#0e0f12',
  'color-border': '#414651',
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
          `Token '${name}' là hàm CSS ('${value}') - React Native không hiểu. Dùng token khác hoặc thêm giá trị native tương ứng.`,
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

/**
 * App XePrime Partner = site partner ở KHỔ ĐIỆN THOẠI. Web hạ thang khoảng cách và cỡ tiêu đề ngay
 * ở tầng token trong `@media (max-width: 640px)` (`packages/ui/src/styles/tokens.css`); app Partner
 * luôn là khổ đó nên dùng thẳng bộ giá trị ấy - mọi `space.*` / `fontSize.h*` khớp web mà không
 * component nào phải tự đổi số. App khách giữ thang gốc (đã tinh chỉnh theo Figma khách).
 */
const PARTNER_APP = Constants.expoConfig?.slug === 'xeprime-partner';
const PHONE_TOKEN_PX: Partial<Record<XpTokenName, number>> = {
  'space-md': 12,
  'space-lg': 16,
  'space-xl': 24,
  'font-size-display': 32,
  'font-size-h1': 24,
  'font-size-h2': 20,
  'font-size-h3': 18,
};

function px(name: XpTokenName): number {
  if (PARTNER_APP) {
    const phone = PHONE_TOKEN_PX[name];
    if (phone !== undefined) return phone;
  }
  return toPx(resolve(name));
}

/**
 * Bậc màu trạng thái `*-strong` / `*-border` mà `packages/ui/src/styles/tokens.css` khai thêm
 * (luồng đặt xe v2 + design Account) nhưng `XP_TOKENS` (TS) chưa mang. Giá trị CHÉP NGUYÊN từ
 * tokens.css — khối `:root` cho sáng, khối giao diện tối cho tối; đổi bên đó thì đổi ở đây.
 */
const CSS_ONLY_STATUS_TOKENS = {
  light: {
    warningBorder: '#fec84b',
    /** `--xp-color-error-border` - viền viên đếm nhóm "Cần xử lý" (web `RentalStageHeading`). */
    dangerBorder: '#fda29b',
    warningStrong: '#ec4a0a',
    infoStrong: '#1570ef',
    // Viên vai "Quan sát viên" (`Status/purple-*`, Partner-XePrime 09/11/2026 — ADR 0086).
    purple: '#6938ef',
    purpleSurface: '#f4f3ff',
    purpleBorder: '#bdb4fe',
  },
  dark: {
    warningBorder: 'rgba(254, 200, 75, 0.45)',
    dangerBorder: 'rgba(253, 162, 155, 0.45)',
    warningStrong: '#fb6514',
    infoStrong: '#53b1fd',
    purple: '#9b8afb',
    purpleSurface: 'rgba(105, 56, 239, 0.14)',
    purpleBorder: 'rgba(189, 180, 254, 0.45)',
  },
} as const;

/**
 * Bậc màu v2 mà design "Overview MB" của app Partner (Figma `24175:52345`) dùng nhưng `XP_TOKENS`
 * chưa mang — tên theo biến Figma (`text/brand/primary-2`, `shape/primary`, `bg/primary-low`…).
 * Giá trị sáng CHÉP NGUYÊN từ Figma; bản tối giữ cùng sắc, hạ nền thành lớp mờ như các token tối khác.
 */
const FIGMA_V2_TOKENS = {
  light: {
    /** `text/brand/primary-2` #f0b212 — link "Xem tất cả →", tab đang chọn. */
    brandLink: '#f0b212',
    /** `shape/primary` · `stroke/primary` #f5c33b — cột biểu đồ, gạch tab, giờ lịch giao nhận. */
    brandShape: '#f5c33b',
    /** `text/brand/high` #996f0e — chữ viên đếm vàng. */
    brandHigh: '#996f0e',
    /** `bg/primary-low` #fff9e5 — nền viên đếm vàng. */
    brandLow: '#fff9e5',
    /** `stroke/primary-300` #fbdf85 — viền viên đếm vàng. */
    brandBorder: '#fbdf85',
    /** `status/error-high700` #b42318 — chữ viên đỏ ("7 quá hạn", "Trễ 3 ngày"). */
    dangerStrong: '#b42318',
    /** `status/warning-25` #fffcf5 — nền ô "Doanh thu" của thẻ thu chi. */
    warningWash: '#fffcf5',
    /** `status/warning-500` #f79009 — đoạn "Chờ duyệt" của thanh xe trên chợ. */
    warningVivid: '#f79009',
    /** `status/warning-high` #dc6803. */
    warningHigh: '#dc6803',
    /** `status/success-500` #12b76a — thanh tiến độ uy tín. */
    successVivid: '#12b76a',
    /** `status/information-low` #ebf6ff — nền ô icon / viên "Giao xe". */
    infoLow: '#ebf6ff',
    /** `status/purple-high` #5925dc — chữ viên "Thuê xe dài hạn" của thẻ đơn (Rental Request MB). */
    purpleStrong: '#5925dc',
  },
  dark: {
    brandLink: '#f5c33b',
    brandShape: '#f5c33b',
    brandHigh: '#fbdf85',
    brandLow: 'rgba(245, 195, 59, 0.14)',
    brandBorder: 'rgba(251, 223, 133, 0.45)',
    dangerStrong: '#fda29b',
    warningWash: 'rgba(247, 144, 9, 0.08)',
    warningVivid: '#fdb022',
    warningHigh: '#fdb022',
    successVivid: '#32d583',
    infoLow: 'rgba(21, 112, 239, 0.16)',
    purpleStrong: '#bdb4fe',
  },
} as const;

/**
 * Bảng màu của app native.
 *
 * Hai palette — sáng (`XP_TOKENS`) và tối (`DARK_TOKENS`) — dựng sẵn cả hai trong `PALETTES`;
 * component chọn bảng theo giao diện hiện hành qua `useColors()`. `app.json` để
 * `userInterfaceStyle: "automatic"` để hệ thống (thanh trạng thái, bàn phím) đi cùng.
 */
function buildColors(scheme: ColorScheme) {
  const r = (name: XpTokenName) => resolve(name, scheme);
  const cssOnly = CSS_ONLY_STATUS_TOKENS[scheme];
  const v2 = FIGMA_V2_TOKENS[scheme];
  return {
    ...v2,
    background: r('color-bg'),
    surface: r('color-bg-container'),
    surfaceMuted: r('color-bg-muted'),
    border: r('color-border'),
    borderInput: r('color-border-strong'),
    text: r('color-text'),
    textMuted: r('color-text-secondary'),
    placeholder: r('color-text-tertiary'),
    /** `--xp-color-text-placeholder` — mũi tên mở/đóng, icon mờ trong ô nhập (Text/Gray/very-low). */
    textPlaceholder: r('color-text-placeholder'),
    textDisabled: r('color-text-disabled'),
    primary: r('color-primary'),
    /** Chữ trên nền gold là ĐEN, không phải trắng — gold sáng không đỡ nổi chữ trắng. */
    onPrimary: r('color-primary-contrast'),
    danger: r('color-error'),
    dangerSurface: r('color-error-bg'),
    /**
     * Vòng ngoài của biểu tượng cảnh báo trong hộp huỷ — đúng công thức web
     * `color-mix(in srgb, var(--xp-color-error-bg) 40%, white)` (`CancelTripDialog.module.css`),
     * tính trên `color-error-bg` của CHÍNH palette (tối là `rgba`, nên dùng `mixColor`).
     */
    dangerRing: mixColor(r('color-error-bg'), '#ffffff', 0.4),
    primaryHover: r('color-primary-hover'),
    primaryActive: r('color-primary-active'),
    primaryLight: r('color-primary-light'),
    /** `--xp-color-primary-bright` #edbb4f - viền chip "Điều kiện đang chọn" (Figma 19707:80634). */
    primaryBright: r('color-primary-bright'),
    /** Nền gold nhạt nhất (ô avatar, mảng nền) — v2 BG/primary-25. */
    primarySubtle: r('color-primary-subtle'),
    /** Chữ gold đậm trên nền nhạt (chữ cái avatar). */
    primaryStrong: r('color-primary-strong'),
    /** Nền gold nhạt (avatar người đánh giá) — v2 BG/primary-100. */
    primaryMuted: r('color-primary-muted'),
    /** `--xp-color-primary-glow` — vành vàng thẻ hồ sơ / avatar GIAN HÀNG (web `ShopHeader` #222). */
    primaryGlow: r('color-primary-glow'),
    /** `--xp-color-primary-border` — viền vàng nhạt của thẻ hoá đơn chuyến (luồng đặt xe v2). */
    primaryBorder: r('color-primary-border'),
    /**
     * Chữ/biểu tượng NHẤN thương hiệu (link, tab đang chọn, số tiền nhấn). Sáng: gold đậm `primary-active`
     * cho đủ tương phản trên nền trắng; tối: gold chính `primary` — gold đậm trên
     * nền tối thành màu bùn (Figma "Homepage - Dark Mode" 19879:66136).
     */
    accentText: scheme === 'dark' ? r('color-primary') : r('color-primary-active'),
    /** Như `accentText`, bản sáng là `primary-strong` (chữ avatar, nhãn trên nền gold nhạt). */
    accentStrongText: scheme === 'dark' ? r('color-primary') : r('color-primary-strong'),
    /** Tên gian hàng: sáng `primary-hover`, tối vàng chuẩn `primary` (người dùng chốt 04/11/2026). */
    shopName: scheme === 'dark' ? r('color-primary') : r('color-primary-hover'),
    /** Chữ mô tả/thân bài: sáng `text-secondary` (= textMuted), tối `text-on-dark-muted` #d5d7da. */
    /** Chữ gold nhấn mức vừa (link, số tiền, tab đang chọn): sáng `primary-hover`, tối `primary`. */
    brandText: scheme === 'dark' ? r('color-primary') : r('color-primary-hover'),
    textBody: scheme === 'dark' ? r('color-text-on-dark-muted') : r('color-text-secondary'),
    surfaceElevated: r('color-bg-elevated'),
    surfaceSelected: r('color-bg-selected'),
    /** Lớp phủ sau modal/sheet. */
    overlay: r('color-bg-overlay'),
    borderSubtle: r('color-border-subtle'),
    textInverse: r('color-text-inverse'),
    link: r('color-link'),
    success: r('color-success'),
    successSurface: r('color-success-bg'),
    /** `--xp-color-success-accent` — chữ "Bạn đã xác nhận chuyến đi này!" ở chân thẻ chuyến lái. */
    successAccent: r('color-success-accent'),
    /** `--xp-color-success-subtle` — vành ngoài dấu tích của hộp thành công. */
    successSubtle: r('color-success-subtle'),
    warning: r('color-warning'),
    warningSurface: r('color-warning-bg'),
    info: r('color-info'),
    infoSurface: r('color-info-bg'),
    /** `--xp-color-info-strong` — chữ/biểu tượng xanh đậm trên nền `infoSurface` (ghi chú đăng nhập). */
    infoStrong: cssOnly.infoStrong,
    /** `--xp-color-pink` — chữ/icon viên "Đặt ngay" trên thẻ xe (Figma `22185:87230`). */
    pink: r('color-pink'),
    /** `--xp-color-pink-bg` / `--xp-color-pink-border` — viên "Thuê xe dài hạn" (`ServiceTypeChip`). */
    pinkSurface: r('color-pink-bg'),
    pinkBorder: r('color-pink-border'),
    /** `--xp-color-success-border` — viền viên nhãn xanh (đã xác minh). */
    successBorder: r('color-success-border'),
    /** `--xp-color-warning-border` / `--xp-color-warning-strong` — viên nhãn cam (chưa xác minh). */
    warningBorder: cssOnly.warningBorder,
    dangerBorder: cssOnly.dangerBorder,
    warningStrong: cssOnly.warningStrong,
    /** `--xp-color-purple*` — viên vai "Quan sát viên" ở màn Nhân viên & phân quyền (ADR 0086). */
    purple: cssOnly.purple,
    purpleSurface: cssOnly.purpleSurface,
    purpleBorder: cssOnly.purpleBorder,
    /** `--xp-color-info-border` — viền viên vai "Quản lý gian hàng". */
    infoBorder: r('color-info-border'),
    /** `--xp-color-warning-subtle` — nền viên vai "Nhân viên". */
    warningSubtle: r('color-warning-subtle'),
    /** `--xp-color-gold-on-dark` — chữ vàng trên viên vai đen "Chủ gian hàng". */
    goldOnDark: r('color-gold-on-dark'),
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
    /** `--xp-color-neutral-bg` — nền viên trạng thái trung tính (`ToneBadge` neutral). */
    neutralSurface: r('color-neutral-bg'),
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
    /** Dải định danh cho chuỗi KHÔNG có vai tiền (web `CHART_SERIES_COLORS`), theo thứ tự. */
    series1: r('color-viz-1'),
    series2: r('color-viz-2'),
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
  /**
   * Nền chữ nằm TRÊN ẢNH (bộ đếm "n/N" của ảnh xe) — đen 55%, cố định ở cả hai giao diện vì nó
   * đứng trên ảnh chứ không trên nền trang. Web viết cứng cùng con số ở `.counter`
   * (`ListingGallery.module.css`): `color-bg-overlay` (xám 45%) chỉ cho chữ trắng ~2.9:1.
   */
  photoScrim: 'rgba(0, 0, 0, 0.55)',
  /**
   * Viên chữ SÁNG đặt trên một dải nền tối cố định (dải gói "Gói Doanh nghiệp · Còn 41 ngày",
   * Figma `24175:52535`) — nền `bg/gray-50`, chữ `text/gray/medium`, giữ nguyên ở cả hai giao diện
   * vì nó đứng trên ảnh tối chứ không trên nền trang.
   */
  onDarkChip: resolve('color-bg'),
  onDarkChipText: resolve('color-text-secondary'),
  /** Ô icon kính mờ trên dải tối (`rgba(255,255,255,0.2)`, Figma `24175:52529`). */
  onDarkGlass: 'rgba(255, 255, 255, 0.2)',
  /** Sao đánh giá — MỘT màu cho mọi chỗ rate sao của app (web `/home/star-*.svg`, người dùng chốt 27/10/2026). */
  star: XP_TOKENS['color-star'],
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
  /**
   * Nút "Rút về ngân hàng" của thẻ ví Tổng quan Partner (Figma `24175:52402`:
   * `bg-gradient-to-r from-#efc423 to-#f3c84a`) — chưa là token ở `@xeprime/ui`, giữ ở đây.
   */
  walletCta: { colors: ['#efc423', '#f3c84a'], locations: [0, 1] } as NativeGradient,
} as const;

/**
 * Thang chữ v2 theo TÊN STYLE Figma (`10px/Regular`, `14px/Semibold`…): cặp cỡ chữ + dòng ĐI LIỀN
 * nhau, đọc thẳng từ `XP_TOKENS` — KHÔNG qua bộ hạ cỡ khổ điện thoại của Partner (`PHONE_TOKEN_PX`)
 * hay bộ co máy hẹp, vì design Partner mới (Overview MB) đã vẽ đúng cho điện thoại.
 */
const raw = (name: XpTokenName) => toPx(resolve(name));
export const typeScale = {
  /** 10/14 — nhãn VIẾT HOA ô việc, ngày dưới giờ, so sánh KPI. */
  caption: { fontSize: raw('font-size-caption'), lineHeight: raw('line-height-caption') },
  /** 12/18 — chú thích, viên đếm. */
  label: { fontSize: raw('font-size-label'), lineHeight: raw('line-height-label') },
  /** 14/20 — chữ thân, tab, link. */
  body: { fontSize: raw('font-size-body'), lineHeight: raw('line-height-body') },
  /** 16/24 — tiêu đề "Nhóm thông tin", giá trị KPI. */
  title: { fontSize: raw('font-size-h4'), lineHeight: raw('line-height-h4') },
  /** 18/28 — tiêu đề thanh trang ("Page Header" Figma) và tiêu đề tấm trượt v2. */
  heading: { fontSize: raw('font-size-h3'), lineHeight: raw('line-height-h3') },
  /** 24/32 — số lớn (ô việc, số dư rút được). */
  display: { fontSize: raw('font-size-h2'), lineHeight: raw('line-height-h2') },
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
  /** `--xp-border-radius-control` (12) — khung phiếu/ô điều khiển của các hộp thoại Figma mới. */
  control: px('border-radius-control'),
  /** `--xp-border-radius-card` (16) — thẻ/khung lớn v2. */
  card: px('border-radius-card'),
  /** `--xp-border-radius-banner` (20) — banner khuyến mãi trang chủ. */
  banner: px('border-radius-banner'),
  pill: px('border-radius-pill'),
  /** 14 — ô việc cần làm Tổng quan partner (web `ActionTile .tile` viết cứng 14px). */
  partnerTile: 14,
  /** 9 — ô icon vuông trong ô việc cần làm (web `ActionTile .iconTile`). */
  partnerIconTile: 9,
  /** 8 — ảnh xe nhỏ của thẻ danh sách xe (Figma `num/8` "Vehicle Image"). */
  thumb: 8,
} as const;

/**
 * Máy HẸP (bề ngang < 380dp — 360dp phổ thông Android, iPhone SE/mini): chữ to + lề 16 làm vỡ dòng
 * và cắt "…" (người dùng chốt 28/10/2026, nặng nhất ở chi tiết chuyến). Đọc MỘT lần lúc nạp app —
 * bề ngang máy không đổi trong lúc chạy (app khoá dọc). Chỉ tiêu đề và chữ thân co lại; chữ 13/12/11
 * giữ nguyên vì nhỏ hơn nữa là khó đọc.
 */
export const NARROW_SCREEN = Dimensions.get('window').width < 380;
const HEADING_SCALE = NARROW_SCREEN ? 0.88 : 1;
const BODY_SCALE = NARROW_SCREEN ? 0.93 : 1;
const scaled = (name: XpTokenName, scale: number): number => Math.round(px(name) * scale);

export const fontSize = {
  h1: scaled('font-size-h1', HEADING_SCALE),
  h2: scaled('font-size-h2', HEADING_SCALE),
  h3: scaled('font-size-h3', HEADING_SCALE),
  h4: scaled('font-size-h4', HEADING_SCALE),
  /** `--xp-font-size-lead` (20) — tiêu đề khối của trang gian hàng web ("Chi nhánh", "Xe đang cho thuê"). */
  lead: scaled('font-size-lead', HEADING_SCALE),
  bodyLg: scaled('font-size-body-lg', BODY_SCALE),
  body: scaled('font-size-body', BODY_SCALE),
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
  /**
   * 13px — nhãn ô số liệu site partner (web `ActionTile .label`, `StatCard .tinted .label`,
   * `DashboardHeader .subtitle` viết cứng 13px ngoài thang). Chỉ dùng cho các khối partner sao
   * đúng web; nhãn thường vẫn là `label` 12.
   */
  /**
   * Tiêu đề trang (`<h1>` của web `ManagePageHeader`, cỡ token h2): Partner 20 như web khổ ≤640;
   * app khách giữ 18 (màn Chuyến đi dùng chung khung tiêu đề).
   */
  pageTitle: PARTNER_APP ? px('font-size-h2') : scaled('font-size-h3', HEADING_SCALE),
  partnerLabel: 13,
  /** 12.5px — nhãn thẻ KPI Tổng quan partner (web `StatCard .label`). */
  partnerStatLabel: 12.5,
  /** 11.5px — gợi ý + dòng so sánh thẻ KPI (web `StatCard .hint`, `ChangeBadge`). */
  partnerStatHint: 11.5,
  /** 15px — số đếm dòng "Xe trên chợ" (web `SidePanels .rowValue`). */
  partnerValue: 15,
  /** 22px — số tiền nổi của ô thu nhập (web `SidePanels .moneyValue`). */
  partnerMoney: 22,
  /** 13.5px — dòng "Hôm nay: …" đầu Tổng quan partner khổ điện thoại (web `.answer`). */
  partnerAnswer: 13.5,
  /** 26px — số đếm ô việc cần làm khổ điện thoại (`--xp-font-size-partner-mb-lead`). */
  partnerCount: px('font-size-partner-mb-lead'),
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
  // +2 so với nhãn (người dùng chốt 29/10/2026): placeholder dễ đọc hơn. RN không tách cỡ
  // placeholder khỏi chữ gõ, nên giá trị gõ vào cũng lên theo.
  value: fontSize.bodySm + 2,
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
  /** 11 - mũi tên nhỏ góc ô việc cần làm partner (web `ActionTile .chevron`). */
  xxs: 11,
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
/** Nút cỡ mặc định (`md`) cao 44 = nút "Chọn thuê" — chuẩn nút chung (người dùng chốt 28/10/2026). */
export const buttonHeight = { sm: px('control-height'), md: px('touch-target-min'), lg: px('touch-target-min') } as const;

/** `hitSlop` dọc bù cho nút thấp hơn `touchTarget`, để vùng chạm luôn ≥ sàn chạm. */
export function buttonHitSlop(height: number): number {
  return Math.max(0, Math.ceil((sizing.touchTarget - height) / 2));
}
