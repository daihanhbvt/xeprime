import type { ThemeConfig } from 'antd';
import { XP_TOKENS, toPx } from '@xeprime/ui';

/**
 * Lối vào token của WEB — token THẬT đã chuyển sang `@xeprime/ui` (24/08/2026) để app native
 * dùng chung một nguồn. File này giữ lại đúng hai việc:
 *
 *  1. re-export toàn bộ API cũ ở đúng đường dẫn cũ — mọi `import … from '@/styles/theme'`
 *     hiện có không phải sửa;
 *  2. `antdTheme` — bản ÁNH XẠ token sang AntD, thứ duy nhất ở đây buộc phải biết `antd`
 *     và vì thế không được vào package dùng chung.
 *
 * `tokens.css` cũng đã theo token sang package (nạp ở `app/layout.tsx` qua
 * `@xeprime/ui/styles.css`); `theme.test.ts` vẫn ở web và vẫn so hai file với nhau.
 */
export { XP_TOKENS, XP_METRICS, XP_BREAKPOINTS, cssVar, toPx, type XpTokenName } from '@xeprime/ui';

/**
 * Theme cho `ConfigProvider` — ánh xạ token ngữ nghĩa XePrime sang token AntD 6.
 *
 * Nguyên tắc: **chỉ set seed/alias token**, không set `components: {...}`. Bám tên token
 * nội bộ của từng component AntD là thứ vỡ qua mỗi lần nâng cấp.
 *
 * Token nào Figma KHÔNG định nghĩa thì để AntD tự dẫn xuất từ seed (`colorTextBase`,
 * `colorBgBase`, `colorPrimary`) — đó là lý do `colorLink`, `colorPrimaryActive` và
 * `colorTextDisabled` không có mặt ở đây.
 */
export const antdTheme: ThemeConfig = {
  token: {
    // Seed: gốc để AntD dẫn xuất các bậc chữ/nền còn lại.
    colorTextBase: XP_TOKENS['color-text'],
    colorBgBase: XP_TOKENS['color-bg-elevated'],

    // Thương hiệu
    colorPrimary: XP_TOKENS['color-primary'],
    colorPrimaryHover: XP_TOKENS['color-primary-hover'],
    // `colorPrimaryActive` KHÔNG set: v2 chưa vẽ trạng thái nhấn, và `color-primary-active` (bậc
    // nhấn của bộ cũ, giữ cho CSS Module + native) chỉ đạt 4.47:1 với chữ v2 trên nút. Bậc AntD
    // tự dẫn xuất từ gold mới đậm hơn hover và đạt ~5.7:1 (ADR 0062 điều 6).
    // Nền của mục đang chọn (option, hàng bảng, menu, khoảng ngày) và lúc rê chuột lên nó — chung
    // MỘT token với nền "đang chọn" của CSS Module, để hai nơi không trôi khỏi nhau.
    colorPrimaryBg: XP_TOKENS['color-bg-selected'],
    colorPrimaryBgHover: XP_TOKENS['color-primary-muted'],
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
    // v2 Text/Gray/very-low. `colorTextDisabled` thì KHÔNG set: AntD dùng nó cả cho giá trị ô
    // nhập bị khoá và ngày ngoài tháng (vẫn bấm được) — v2 Text/Gray/disable quá mờ cho các chỗ
    // đó, nên giữ bậc AntD dẫn xuất 25% từ `colorTextBase` (= token `color-text-disabled`).
    colorTextPlaceholder: XP_TOKENS['color-text-placeholder'],

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

    // Focus — vòng 2px gold 25% thay cho vòng mặc định của AntD.
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
   * Trên nền gold `#e9ac29` của XePrime, chữ trắng chỉ đạt **2.0:1** — trượt cả ngưỡng
   * 4.5:1 lẫn 3:1 của WCAG. Bảng nút v2 vẽ **chữ tối** trên nền gold, và hệ đã có sẵn token cho
   * đúng vai trò này (`color-primary-contrast`, 8.8:1).
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
