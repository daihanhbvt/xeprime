import type { ThemeConfig } from 'antd';

/**
 * Nguồn chốt cho design token của XePrime — ADR 0003.
 *
 * Giá trị lấy từ **Figma section 01 “XePrime Foundations”** (`14:2`), đọc ở cấp node trong
 * Wave 1A. File Figma KHÔNG dùng Figma Variables — mỗi token là một swatch frame tự ghi mã màu.
 *
 * ⚠️ Trong cùng file Figma tồn tại HAI bộ giá trị (xem `docs/implementation/08_DECISION_BACKLOG.md`
 * P15): Foundations `14:*` và các component `XePrime/*` cấp page. Hợp đồng nguồn sự thật ở
 * `docs/implementation/00_IMPLEMENTATION_OVERVIEW.md` §9 quy định **Foundations thắng về GIÁ TRỊ
 * token**, component definition chỉ thắng về hợp đồng biến thể. Không tự đổi sang bộ kia.
 *
 * Mỗi key ở đây tương ứng đúng một CSS custom property `--xp-<key>` trong `tokens.css`.
 * `theme.test.ts` so sánh hai file: lệch một token là test đỏ, không phải đợi phát hiện
 * bằng mắt trên UI. Giá trị luôn là chuỗi CSS; chỗ AntD cần number thì đi qua `toPx()`.
 *
 * Token nào đánh dấu DEPRECATED ở cuối file là bí danh giữ cho code cũ — chúng trỏ bằng
 * `var()` về token canonical, nên KHÔNG có hai nguồn giá trị. Đích gỡ bỏ ghi ở
 * `docs/implementation/02_DESIGN_TOKEN_MAP.md`.
 */
export const XP_TOKENS = {
  // ─── Thương hiệu ──────────────────────────────────────────────────────────
  // Gold XePrime. `primary-active` tái dùng sắc gold đậm đã có trong hệ (không có
  // trong Foundations, và không tự chế màu mới).
  'color-primary': '#d6a02c', // 14:9
  'color-primary-hover': '#c4920f', // 14:13
  'color-primary-active': '#a9761a',
  'color-primary-light': '#fdf6e3', // 14:17 — nền gold rất nhạt
  'color-primary-contrast': '#2a2318', // 14:21 — chữ ĐEN trên nền gold, không phải trắng

  // ─── Bề mặt ───────────────────────────────────────────────────────────────
  'color-bg': '#faf9f7', // 14:26 — nền trang
  'color-bg-container': '#ffffff',
  'color-bg-elevated': '#ffffff', // 14:30
  'color-bg-muted': '#f5f3ef', // 14:34 — header bảng, ô disabled
  'color-bg-selected': '#fdf6e3',
  'color-bg-overlay': 'rgba(26, 26, 26, 0.45)', // lớp phủ sau modal/drawer

  // ─── Chữ ──────────────────────────────────────────────────────────────────
  'color-text': '#1a1a1a', // 14:46
  'color-text-secondary': '#6b6560', // 14:50
  'color-text-tertiary': '#9e9890', // 14:54
  // Foundations không định nghĩa màu chữ disabled. Dùng đúng tỉ lệ AntD áp cho
  // `colorTextBase` (25%) để CSS Module và AntD ra cùng một màu.
  'color-text-disabled': 'rgba(26, 26, 26, 0.25)',
  'color-text-inverse': '#e8e4dd', // 14:96 — chữ trên bề mặt tối
  // Figma Foundations KHÔNG định nghĩa màu link. Hai token này soi lại đúng giá trị AntD
  // đang dẫn xuất từ `colorInfo` — tức hành vi hiện tại, không phải quyết định thiết kế mới.
  // Vì vậy `antdTheme` cố tình KHÔNG set `colorLink`: AntD vẫn là nơi dẫn xuất. Xem P19.
  'color-link': '#2563eb',
  'color-link-hover': '#7aadff',

  // ─── Viền ─────────────────────────────────────────────────────────────────
  'color-border': '#e8e4dd', // 14:38
  'color-border-strong': '#d4cfc6', // 14:42
  // Foundations chỉ có 2 bậc viền. Bậc “mảnh hơn” tái dùng tông `color-bg-muted`
  // (14:34) thay vì chế giá trị mới — ghi ở 02_DESIGN_TOKEN_MAP.md §2.
  'color-border-subtle': '#f5f3ef',
  'color-border-focus': '#d6a02c',
  'color-border-disabled': '#e8e4dd',

  // ─── Tương tác ────────────────────────────────────────────────────────────
  'color-bg-hover': 'rgba(120, 90, 20, 0.05)',
  'color-bg-active': 'rgba(120, 90, 20, 0.1)',
  'disabled-opacity': '0.6', // 14:199 — “60% opacity + muted bg + no pointer events”

  // ─── Trạng thái nghiệp vụ ─────────────────────────────────────────────────
  // Bốn màu này TÁCH KHỎI gold thương hiệu: gold không bao giờ mang nghĩa
  // success/warning/error (CLAUDE.md §5, quy tắc Wave 1A §8).
  'color-success': '#16a34a', // 14:59
  'color-success-bg': '#f0fdf4', // 14:63
  'color-warning': '#e07b26', // 14:67
  'color-warning-bg': '#fff7ed', // 14:71
  'color-error': '#dc2626', // 14:75
  'color-error-bg': '#fef2f2', // 14:79
  'color-info': '#2563eb', // 14:83
  'color-info-bg': '#eff6ff', // 14:87
  'color-neutral': '#6b6560',
  'color-neutral-bg': '#f5f3ef',

  // ─── Vỏ portal ────────────────────────────────────────────────────────────
  // P1 đã chốt "TỐI" (07/08/2026) và Wave 1D-B đã áp dụng.
  'shell-sidebar-bg': '#1e1b16', // 14:92
  'shell-sidebar-text': '#e8e4dd', // 14:96
  'shell-sidebar-active': '#d6a02c', // 14:100
  // Dẫn xuất, KHÔNG phải màu mới: Foundations chỉ cho 3 màu sidebar, nền tối còn cần
  // hover / nền mục chọn / chữ mờ / đường kẻ. Giữ `color-mix` thay vì hex tính sẵn để
  // ba màu gốc vẫn là nguồn duy nhất. Tương phản của cả bốn đã đo trong `theme.test.ts`.
  'shell-sidebar-hover':
    'color-mix(in srgb, var(--xp-shell-sidebar-text) 8%, var(--xp-shell-sidebar-bg))',
  'shell-sidebar-selected-bg':
    'color-mix(in srgb, var(--xp-shell-sidebar-active) 14%, var(--xp-shell-sidebar-bg))',
  'shell-sidebar-muted':
    'color-mix(in srgb, var(--xp-shell-sidebar-text) 62%, var(--xp-shell-sidebar-bg))',
  'shell-sidebar-border':
    'color-mix(in srgb, var(--xp-shell-sidebar-text) 14%, var(--xp-shell-sidebar-bg))',
  'shell-topbar-bg': '#ffffff', // 14:104
  'shell-topbar-border': '#e8e4dd', // 14:108

  // ─── Màu riêng của thanh event trên lịch ──────────────────────────────────
  // Không có trong Foundations — giữ nguyên bộ đang chạy.
  'color-event-booking': '#2563eb',
  'color-event-request': '#d6a02c',
  'color-event-blocked': '#8c8069',
  'color-event-maintenance': '#7c3aed',

  // ─── Typography ───────────────────────────────────────────────────────────
  // Be Vietnam Pro + Playfair Display tự host qua next/font (biến đặt trên <html>).
  'font-family':
    "var(--font-be-vietnam), 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  'font-family-display': "var(--font-playfair), Georgia, 'Times New Roman', serif",

  // Thang chữ Figma `14:113`–`14:140`. Cặp size/line-height đi liền nhau.
  'font-size-display': '48px', // 14:113 · Bold · hero
  'line-height-display': '56px',
  'font-size-h1': '32px', // 14:116 · Bold · tiêu đề trang
  'line-height-h1': '40px',
  'font-size-h2': '24px', // 14:119 · SemiBold · tiêu đề section
  'line-height-h2': '32px',
  'font-size-h3': '20px', // 14:122 · SemiBold · tiêu đề card / modal
  'line-height-h3': '28px',
  'font-size-h4': '16px', // 14:125 · SemiBold · subsection, header bảng
  'line-height-h4': '24px',
  'font-size-body-lg': '16px', // 14:128 · Regular
  'line-height-body-lg': '24px',
  'font-size-body': '14px', // 14:131 · Regular · ô bảng, label form
  'line-height-body': '20px',
  'font-size-body-sm': '12px', // 14:134 · Regular · caption, help text
  'line-height-body-sm': '16px',
  'font-size-label': '12px', // 14:137 · Medium · badge, chip, tag
  'line-height-label': '16px',
  'font-size-overline': '11px', // 14:140 · Medium · section kicker
  'line-height-overline': '16px',

  'font-weight-regular': '400',
  'font-weight-medium': '500',
  'font-weight-semibold': '600',
  'font-weight-bold': '700',

  // Cỡ chữ mặc định của body + line-height toàn cục.
  // ⚠️ `line-height` (1.5714 → 22px) là giá trị AntD đang chạy, KHÁC `line-height-body`
  // (20px) của Figma. Đổi nó làm lệch chiều cao mọi hàng bảng và mọi form → hoãn sang
  // wave có QA thị giác. Nợ kỹ thuật ghi ở 02_DESIGN_TOKEN_MAP.md §5.
  'font-size': '14px',
  'font-size-sm': '12px',
  'line-height': '1.5714',

  // ─── Khoảng cách ──────────────────────────────────────────────────────────
  // Figma `14:143`: “4 · 8 · 16 · 24 · 32 px only”.
  'space-xs': '4px',
  'space-sm': '8px',
  'space-md': '16px',
  'space-lg': '24px',
  'space-xl': '32px',

  // ─── Bo góc ───────────────────────────────────────────────────────────────
  'border-radius-sm': '6px', // 14:160 · chip, badge, phần tử trong
  'border-radius': '10px', // 14:164 · card, input, modal
  'border-radius-lg': '10px',
  'border-radius-pill': '999px', // 14:168 · pill, avatar

  // ─── Đổ bóng ──────────────────────────────────────────────────────────────
  // Figma `14:173`/`14:176`/`14:179` — tông nâu ấm `rgba(41,31,15,…)`, không phải đen.
  'shadow-card': '0 2px 4px 0 rgba(41, 31, 15, 0.06)', // Elevation 1 · card nghỉ
  'shadow-raised': '0 4px 12px 0 rgba(41, 31, 15, 0.08)', // Elevation 2 · hover, dropdown
  'shadow-overlay': '0 8px 24px 0 rgba(41, 31, 15, 0.12)', // Elevation 3 · modal, drawer

  // ─── Focus ────────────────────────────────────────────────────────────────
  // Figma `14:197`: “2px gold border + 3px gold ring (25% α)”.
  'focus-outline-width': '2px',
  'focus-ring-width': '3px',
  'color-focus-ring': 'rgba(214, 160, 44, 0.25)',

  // ─── Breakpoint ───────────────────────────────────────────────────────────
  // Figma `14:183`–`14:192`. CSS custom property KHÔNG dùng được trong `@media`
  // (xem 08_DECISION_BACKLOG.md P8) — nguồn dùng cho JS là `XP_BREAKPOINTS` bên dưới;
  // các token này phục vụ `max-width`/container query và tài liệu.
  'bp-mobile': '640px', // ≤640 · 4 cột · gutter 16
  'bp-tablet': '1024px', // 641–1024 · 8 cột · gutter 24
  'bp-desktop': '1440px', // 1025–1440 · 12 cột · gutter 24; >1440 = wide

  // ─── Tầng z ───────────────────────────────────────────────────────────────
  // XePrime chỉ sở hữu tầng của vỏ app. Tầng overlay (modal/drawer/dropdown/toast)
  // do AntD sở hữu qua `zIndexPopupBase` — `z-popup-base` chỉ soi lại con số đó để
  // CSS Module định vị tương đối mà không phải đoán. KHÔNG tạo nguồn thứ hai.
  'z-sidebar': '110',
  'z-topbar': '100',
  'z-calendar-header': '30',
  'z-calendar-sticky-col': '20',
  'z-popup-base': '1000',

  // ─── Kích thước component dùng chung ──────────────────────────────────────
  // Wave 1A CHỈ khai báo. Áp vào component là việc của các wave sau.
  // `control-height` = 32px là chiều cao AntD đang chạy; Figma `125:1571`/`125:2691`
  // vẽ control 40px (= AntD size="large"). Chênh này ghi ở P16, chưa áp.
  'control-height-sm': '24px',
  'control-height': '32px',
  'control-height-lg': '40px',
  'touch-target-min': '44px',
  'modal-width-sm': '400px', // 125:1611 size=SM
  'modal-width': '560px', // 125:1611 size=MD
  'modal-width-lg': '720px', // 125:1611 size=LG
  'drawer-width': '560px',
  'drawer-width-lg': '720px',
  'container-max-width': '1200px', // 117:1203 (Pagination/Desktop) · 127:2060

  // ─── Khung app ────────────────────────────────────────────────────────────
  'shell-topbar-height': '56px', // 14:1498
  'shell-sidebar-width': '232px', // 14:1424 (Foundations sở hữu giá trị; 47:5 = 240 lệch nhịp)
  'shell-sidebar-collapsed-width': '64px', // 14:1532 = 47:77
  'shell-bottom-nav-height': '64px', // 14:1641
  'shell-drawer-width': '280px', // 14:1662
  'shell-form-max-width': '1136px', // 60:69 (FormColumn trong workspace 1200)

  // ─── Lịch resource timeline ───────────────────────────────────────────────
  'calendar-resource-col-width': '220px',
  'calendar-day-col-width': '56px',
  'calendar-row-height': '44px',
  'calendar-header-height': '56px',

  // ─── DEPRECATED — bí danh giữ cho code cũ ─────────────────────────────────
  // Mỗi cái trỏ `var()` về token canonical: không có giá trị nào bị nhân đôi.
  // Số consumer + wave gỡ bỏ: 02_DESIGN_TOKEN_MAP.md §14.
  /** @deprecated → `--xp-color-bg` */
  'color-bg-layout': 'var(--xp-color-bg)',
  /** @deprecated → `--xp-color-border-subtle` */
  'color-border-secondary': 'var(--xp-color-border-subtle)',
  /** @deprecated → `--xp-color-primary-active` */
  'gold-deep': 'var(--xp-color-primary-active)',
  /** @deprecated → `--xp-color-primary-light` */
  'gold-wash': 'var(--xp-color-primary-light)',
  /** @deprecated dùng cho thanh cuộn; chưa có token canonical tương ứng ở Figma */
  'gold-soft': '#f1dba4',
  /** @deprecated → `--xp-color-primary-light` */
  'color-bg-sand': 'var(--xp-color-primary-light)',
  /** @deprecated → `--xp-shadow-card` */
  'shadow-sm': 'var(--xp-shadow-card)',
  /** @deprecated → `--xp-shadow-raised` */
  'shadow-md': 'var(--xp-shadow-raised)',
  /** @deprecated → `--xp-shadow-overlay` */
  'shadow-lg': 'var(--xp-shadow-overlay)',
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
 * Thang breakpoint dùng cho JS (`useMediaQuery`).
 *
 * CSS custom property không dùng được trong `@media`, nên đây là nơi duy nhất giữ CON SỐ.
 * `.module.css` vẫn phải viết số trong `@media`, nhưng CHỈ được viết đúng ba số này —
 * `theme.test.ts` có test chặn giá trị lạ. Bộ breakpoint cũ (~20 giá trị rời rạc) được dời
 * dần khi chạm vào từng file, theo khuyến nghị design-brief 00 §9.4, không dời hàng loạt.
 */
export const XP_BREAKPOINTS = {
  mobile: toPx(XP_TOKENS['bp-mobile']),
  tablet: toPx(XP_TOKENS['bp-tablet']),
  desktop: toPx(XP_TOKENS['bp-desktop']),
} as const;

/**
 * Theme cho `ConfigProvider` — ánh xạ token ngữ nghĩa XePrime sang token AntD 6.
 *
 * Nguyên tắc: **chỉ set seed/alias token**, không set `components: {...}`. Bám tên token
 * nội bộ của từng component AntD là thứ vỡ qua mỗi lần nâng cấp.
 *
 * Token nào Figma KHÔNG định nghĩa thì để AntD tự dẫn xuất từ seed (`colorTextBase`,
 * `colorBgBase`) — đó là lý do `colorTextDisabled` không có mặt ở đây.
 */
export const antdTheme: ThemeConfig = {
  token: {
    // Seed: gốc để AntD dẫn xuất các bậc chữ/nền còn lại.
    colorTextBase: XP_TOKENS['color-text'],
    colorBgBase: XP_TOKENS['color-bg-elevated'],

    // Thương hiệu
    colorPrimary: XP_TOKENS['color-primary'],
    colorPrimaryHover: XP_TOKENS['color-primary-hover'],
    colorPrimaryActive: XP_TOKENS['color-primary-active'],
    // `colorLink` KHÔNG set: Figma chưa định nghĩa màu link, để AntD dẫn xuất từ `colorInfo`
    // như hiện tại. Đổi link sang gold là quyết định thiết kế, không phải ánh xạ token (P19).

    // Trạng thái
    colorSuccess: XP_TOKENS['color-success'],
    colorSuccessBg: XP_TOKENS['color-success-bg'],
    colorWarning: XP_TOKENS['color-warning'],
    colorWarningBg: XP_TOKENS['color-warning-bg'],
    colorError: XP_TOKENS['color-error'],
    colorErrorBg: XP_TOKENS['color-error-bg'],
    colorInfo: XP_TOKENS['color-info'],
    colorInfoBg: XP_TOKENS['color-info-bg'],

    // Chữ
    colorText: XP_TOKENS['color-text'],
    colorTextSecondary: XP_TOKENS['color-text-secondary'],
    colorTextTertiary: XP_TOKENS['color-text-tertiary'],

    // Bề mặt
    colorBgLayout: XP_TOKENS['color-bg'],
    colorBgContainer: XP_TOKENS['color-bg-container'],
    colorBgElevated: XP_TOKENS['color-bg-elevated'],
    colorBgMask: XP_TOKENS['color-bg-overlay'],

    // Viền
    colorBorder: XP_TOKENS['color-border'],
    colorBorderSecondary: XP_TOKENS['color-border-subtle'],

    // Hình khối
    borderRadius: toPx(XP_TOKENS['border-radius']),
    borderRadiusSM: toPx(XP_TOKENS['border-radius-sm']),
    borderRadiusLG: toPx(XP_TOKENS['border-radius-lg']),

    // Chữ
    fontFamily: XP_TOKENS['font-family'],
    fontSize: toPx(XP_TOKENS['font-size']),
    fontSizeSM: toPx(XP_TOKENS['font-size-body-sm']),
    fontSizeLG: toPx(XP_TOKENS['font-size-body-lg']),
    fontSizeHeading1: toPx(XP_TOKENS['font-size-h1']),
    fontSizeHeading2: toPx(XP_TOKENS['font-size-h2']),
    fontSizeHeading3: toPx(XP_TOKENS['font-size-h3']),
    fontSizeHeading4: toPx(XP_TOKENS['font-size-h4']),
    fontSizeHeading5: toPx(XP_TOKENS['font-size']),

    // Đổ bóng — Elevation 1/2/3 của Figma. Trước Wave 1A, bóng của AntD (xám trung tính)
    // và bóng của CSS Module (nâu ấm) là hai hệ khác nhau; ánh xạ ở đây gộp về một.
    boxShadow: XP_TOKENS['shadow-card'],
    boxShadowTertiary: XP_TOKENS['shadow-card'],
    boxShadowSecondary: XP_TOKENS['shadow-raised'],

    // Focus — vòng 3px gold 25% (Figma 14:197) thay cho vòng mặc định của AntD.
    controlOutline: XP_TOKENS['color-focus-ring'],
    controlOutlineWidth: toPx(XP_TOKENS['focus-ring-width']),

    // Kích thước control: giữ đúng chiều cao đang chạy (32px). Figma vẽ 40px —
    // đổi là việc của wave component, không phải wave token (P16).
    controlHeight: toPx(XP_TOKENS['control-height']),
    controlHeightSM: toPx(XP_TOKENS['control-height-sm']),
    controlHeightLG: toPx(XP_TOKENS['control-height-lg']),

    // Tầng overlay: AntD sở hữu. Set tường minh để `--xp-z-popup-base` soi đúng con số.
    zIndexPopupBase: Number(XP_TOKENS['z-popup-base']),
  },

  /**
   * Ngoại lệ DUY NHẤT của quy tắc "chỉ seed token" — có kiểm chứng, không phải tiện tay.
   *
   * Nút primary của AntD lấy màu chữ từ `colorTextLightSolid` (= `#fff`) cho mọi nền đặc.
   * Trên nền gold `#d6a02c` của XePrime, chữ trắng chỉ đạt **2.35:1** — trượt cả ngưỡng
   * 4.5:1 lẫn 3:1 của WCAG. Figma `125:1571` (Variant=Primary) vẽ **chữ tối** trên nền gold,
   * và Wave 1A đã có sẵn token cho đúng vai trò này (`color-primary-contrast`, 6.60:1).
   *
   * Không sửa được bằng seed token: `colorTextLightSolid` dùng chung cho Tag/Badge/Steps…,
   * đổi nó sẽ kéo theo những component không liên quan. Nên khoanh đúng vào Button.
   */
  components: {
    Button: {
      primaryColor: XP_TOKENS['color-primary-contrast'],
    },
  },
};
