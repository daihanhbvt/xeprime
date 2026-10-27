/**
 * Design token của XePrime — nguồn DUY NHẤT cho mọi client (ADR 0003).
 *
 * File này thuần TypeScript, không import gì của trình duyệt hay React: web tiêu thụ qua
 * `antdTheme` + `tokens.css` (cùng package), app native (Expo/RN) đọc thẳng giá trị —
 * màu là chuỗi hex/rgba dùng được nguyên vẹn trong StyleSheet, kích thước `px` quy về số
 * bằng `toPx()` (đúng cách `XP_METRICS`/`XP_BREAKPOINTS` đang làm).
 *
 * Chuyển từ `apps/web/src/styles/theme.ts` ngày 24/08/2026 — nội dung giữ NGUYÊN VĂN để
 * không đổi một giá trị nào đang hiển thị. Docblock gốc bên dưới.
 */

/**
 * Nguồn chốt cho design token của XePrime — ADR 0003 (cơ chế) · ADR 0062 (giá trị).
 *
 * Giá trị lấy từ **design v2 — file Figma "Xe Prime"**, đọc bằng Figma Variables trên chính các
 * MÀN đã thiết kế (trang chủ, bảng nút, bảng màu) ngày 15/10/2026. Tên biến Figma ghi cạnh từng
 * token (`v2 BG/primary`…). Trang "Primary colors" của file là thư viện Untitled UI CHƯA chỉnh
 * theo dự án (thang Brand ở đó màu tím) — KHÔNG đọc giá trị từ trang đó (ADR 0062 điều 1).
 * Bộ "XePrime Foundations" `14:*` của file cũ đã nghỉ hưu.
 *
 * Token nào ghi "chưa có trong v2" / "chưa chuyển" là giá trị cũ giữ lại có chủ đích — lý do từng
 * nhóm ở ADR 0062 điều 5. App native đọc thẳng các giá trị này: đổi một token mà native dùng làm
 * NỀN, làm cỡ chữ meta, hay bị test native chốt cứng (bóng, sidebar) là việc làm cùng dev mobile.
 *
 * Mỗi key ở đây tương ứng đúng một CSS custom property `--xp-<key>` trong `tokens.css`.
 * `theme.test.ts` so sánh hai file: lệch một token là test đỏ, không phải đợi phát hiện
 * bằng mắt trên UI. Giá trị luôn là chuỗi CSS; chỗ AntD cần number thì đi qua `toPx()`.
 *
 * Token nào đánh dấu DEPRECATED ở cuối file là bí danh giữ cho code cũ — chúng trỏ bằng
 * `var()` về token canonical, nên KHÔNG có hai nguồn giá trị. Đích gỡ bỏ ghi ở
 * `docs/design-token-map.md`.
 */
export const XP_TOKENS = {
  // ─── Thương hiệu ──────────────────────────────────────────────────────────
  // Gold XePrime theo design v2. Thứ tự đậm dần: subtle → light → muted → primary → hover →
  // active → strong. Nút chính của v2 là GRADIENT (`Gradient/Brand/600 -> 500`) — MCP chỉ trả
  // tên, chưa có điểm màu, nên gradient sẽ thành token khi ráp nút (ADR 0062 "Còn mở").
  'color-primary': '#e9ac29', // v2 BG/primary · Text/Brand/primary · Stroke/primary
  'color-primary-hover': '#cb9115', // v2 Text/Brand/primary 2 — hover ĐẬM hơn, như trước
  /**
   * Gold đậm cho trạng thái NHẤN — chưa có trong v2, giữ giá trị bộ cũ (ADR 0062 điều 5).
   *
   * Không đổi vì token này đang làm NỀN dưới chữ/icon tối ở cả hai client (nút CTA lúc rê chuột
   * trên web; chấm thông báo chưa đọc, nút gửi đang nhấn trên app native — 69 file web, ~130 file
   * native). Đổi sang bậc tối hơn là làm tệ đi đúng những chỗ đó. `antdTheme` không ánh xạ
   * nó: với chữ v2 `#101828` nó chỉ đạt 4.47:1, còn bậc AntD tự dẫn xuất từ gold mới đạt ~5.7:1.
   */
  'color-primary-active': '#a9761a',
  /**
   * Gold ĐỌC ĐƯỢC làm chữ trên nền sáng — v2 Brand/high đạt 7.4:1 trên trắng, trong khi gold
   * chính chỉ 2.0:1 và hover 2.8:1. Dùng cho chữ, giá, icon gold khi design không vẽ rõ gold chính
   * (`color-price` trỏ về đây). KHÔNG dùng làm nền dưới chữ tối (2.4:1).
   */
  'color-primary-strong': '#6e5117', // v2 BG/primary-high · Text/Brand/high
  'color-primary-light': '#fff5e5', // v2 BG/primary-low — nền gold nhạt (mục chọn, nút phụ)
  'color-primary-subtle': '#fff9f0', // v2 BG/primary-25 — nền gold nhạt nhất (ô icon, mảng nền)
  'color-primary-muted': '#f6ebd5', // v2 BG/primary-100 · Stroke/primary-100 — hover nền gold nhạt, viền gold nhạt
  'color-primary-contrast': '#0e0f12', // v2 Text/Gray/high — chữ ĐEN trên nền gold, không phải trắng

  // ─── Bề mặt ───────────────────────────────────────────────────────────────
  'color-bg': '#fafafa', // v2 BG/gray-50 — nền trang
  'color-bg-container': '#ffffff', // v2 BG/white
  'color-bg-elevated': '#ffffff', // v2 BG/white
  'color-bg-muted': '#f5f5f5', // v2 BG/gray-100 — header bảng, ô disabled
  'color-bg-selected': '#fff5e5', // = primary-light (v2 BG/primary-low)
  'color-bg-overlay': 'rgba(26, 26, 26, 0.45)', // lớp phủ sau modal/drawer — chưa có trong v2

  // ─── Chữ ──────────────────────────────────────────────────────────────────
  'color-text': '#0e0f12', // v2 Text/Gray/high
  'color-text-secondary': '#414651', // v2 Text/Gray/medium
  'color-text-tertiary': '#717680', // v2 Text/Gray/low
  'color-text-placeholder': '#a4a7ae', // v2 Text/Gray/very-low — placeholder, icon mờ trong ô nhập
  /*
   * Giữ CÔNG THỨC cũ — đúng tỉ lệ AntD áp cho `colorTextBase` (25%), nay trên chữ v2 — để CSS
   * Module và AntD ra cùng một màu. v2 có `Text/Gray/disable` #d5d7da, nhưng AntD dùng màu này cả
   * cho GIÁ TRỊ ô nhập bị khoá, ngày ngoài tháng của DatePicker (vẫn bấm được) và bước chờ của
   * Steps: #d5d7da chỉ 1.46:1 trên trắng, mờ hơn bộ cũ. Chờ designer nói rõ phạm vi (ADR 0062 Q8).
   */
  'color-text-disabled': 'rgba(14, 15, 18, 0.25)',
  'color-text-inverse': '#e8e4dd', // chữ trên bề mặt tối (= sidebar-text) — chưa có trong v2
  // v2 chưa định nghĩa màu link. Hai token này soi lại đúng giá trị AntD đang dẫn xuất từ
  // `colorInfo` — tức hành vi hiện tại, không phải quyết định thiết kế mới.
  // Vì vậy `antdTheme` cố tình KHÔNG set `colorLink`: AntD vẫn là nơi dẫn xuất. Xem P19.
  'color-link': '#2563eb',
  'color-link-hover': '#7aadff',

  // ─── Viền ─────────────────────────────────────────────────────────────────
  'color-border': '#e9eaeb', // v2 Stroke/gray-low200
  'color-border-strong': '#d5d7da', // v2 Stroke/gray-low300
  // v2 không có bậc viền mảnh hơn `gray-low200` trên nền trắng (`Stroke/gray-50` = #fafafa thì
  // gần như vô hình). Bậc này tiếp tục tái dùng tông `color-bg-muted` (Gray/100), không chế màu.
  'color-border-subtle': '#f5f5f5',
  'color-border-focus': '#e9ac29', // v2 Stroke/primary
  'color-border-disabled': '#e9eaeb', // = border

  // ─── Tương tác ────────────────────────────────────────────────────────────
  'color-bg-hover': 'rgba(120, 90, 20, 0.05)',
  'color-bg-active': 'rgba(120, 90, 20, 0.1)',
  'disabled-opacity': '0.6', // 14:199 — “60% opacity + muted bg + no pointer events”

  // ─── Trạng thái nghiệp vụ ─────────────────────────────────────────────────
  // Bốn màu này TÁCH KHỎI gold thương hiệu: gold không bao giờ mang nghĩa
  // success/warning/error (CLAUDE.md §5, quy tắc Wave 1A §8).
  'color-success': '#039855', // v2 Status/success-high
  'color-success-bg': '#ecfdf3', // v2 Status/success-low
  'color-success-subtle': '#f6fef9', // v2 Status/success-25 — vành ngoài icon thành công (popup đặt lại mật khẩu)
  // Ba frame v2 đã đọc chỉ có warning-300/500 (chấm, icon), chưa có bậc chữ/nền như success và
  // error. `#f79009` làm chữ trên nền nhạt chỉ đạt ~2.2:1 nên không lấy — giữ cặp cũ tới khi đọc
  // được màn có cảnh báo (ADR 0062 điều 5).
  'color-warning': '#e07b26',
  'color-warning-bg': '#fff7ed',
  'color-error': '#d92d20', // v2 Status/error-high · BG/destructive
  'color-error-bg': '#fef3f2', // v2 BG/destructive-low
  'color-info': '#2563eb', // chưa có trong v2
  'color-info-bg': '#eff6ff', // chưa có trong v2
  /*
   * "Đang chạy" — bậc thứ năm, cho `STATUS_COLOR.PROCESSING` (đơn `active`, phiếu đang xử lý).
   *
   * KHÔNG có trong Foundations, và vẫn phải tồn tại: bảng màu ngữ nghĩa của `@xeprime/types`
   * phân biệt `INFO` (đã xác nhận) với `PROCESSING` (đang diễn ra), nhưng nền sáng chỉ có
   * `color-info` — nên hai trạng thái KHÁC NHAU của cùng một đơn thuê từng tô cùng một màu
   * xanh dương trên lịch. Chọn tông lam ngọc đậm (không phải cyan tươi) để đạt 5.1:1 trên nền
   * của chính nó: chữ 12px trên thanh event phải đọc được.
   */
  'color-processing': '#0e7490',
  'color-processing-bg': '#ecfeff',
  // Trung tính = cặp chữ phụ / nền muted, đi theo dải xám v2 như hai token đó.
  'color-neutral': '#414651',
  'color-neutral-bg': '#f5f5f5',
  // Cam san hô dành riêng cho tag khuyến mãi — giảm giá không mang nghĩa error/warning.
  'color-discount': '#ff5a2c',
  'color-discount-contrast': '#ffffff',
  /**
   * Màu của SỐ TIỀN khách phải trả — một màu duy nhất cho mọi giá cuối cùng trong app
   * (tổng dự kiến, giá niêm yết của xe, tổng đơn…).
   *
   * Trước đây mỗi màn tự chọn: bảng breakdown tô tổng bằng `color-success` (xanh = "thành
   * công", không phải "tiền"), overlay đặt xe để tổng màu chữ thường, còn thẻ xe lại dùng
   * gold. Cùng một con số mang ba nghĩa màu khác nhau.
   *
   * Dẫn xuất từ `color-primary-strong` chứ không phải `color-primary`: gold chính #e9ac29 chỉ
   * đạt 2.0:1 trên nền trắng — không đọc nổi ở cỡ chữ tiền. Gold đậm (v2 Brand/high) đạt 7.4:1,
   * qua AA ở mọi cỡ chữ, mà vẫn là sắc thương hiệu. (Trước v2 trỏ `color-primary-active`, 3.9:1.)
   *
   * KHÔNG dùng cho: giá gạch ngang (khuyến mãi), số tiền phụ/tham chiếu, và tiền mang nghĩa
   * thu/chi ở tuyến tài chính — những chỗ đó màu đang nói một điều khác.
   */
  'color-price': 'var(--xp-color-primary-strong)',

  // ─── Màu dữ liệu (data-viz) ───────────────────────────────────────────────
  /**
   * Dải màu cho BIỂU ĐỒ, tách hẳn khỏi màu ngữ nghĩa — nợ thiết kế X-02, brand guide §3.3.
   *
   * Vì sao không mượn `color-error`/`color-success`: một cột "Chi phí" màu đỏ bị đọc thành
   * "có lỗi", và cột "Doanh thu" màu xanh lá bị đọc thành "đạt chỉ tiêu". Màu ở biểu đồ nói
   * *cái này là series nào*, không nói *tốt hay xấu*.
   *
   * **NĂM bậc, không phải sáu** như brand guide phác ra. Năm bậc này qua trọn bộ kiểm màu
   * (dải sáng · sàn chroma · tách được dưới mù màu deutan/tritan · tách được với mắt thường ·
   * tương phản ≥ 3:1 trên nền trắng) ở chế độ **so mọi cặp**, không chỉ cặp liền kề. Không
   * tìm được bậc thứ sáu nào giữ nguyên được điều đó: thêm nó vào là bán một lời hứa
   * "sáu series phân biệt được" mà người mù màu không nhận được.
   *
   * Dùng THEO THỨ TỰ 1→5, không bao giờ xoay vòng. Cần quá 5 nhóm thì gộp "Khác", tách
   * biểu đồ nhỏ, hoặc bỏ hẳn màu định danh và dán nhãn thẳng lên từng dòng — đó chính là
   * cách bảng cơ cấu danh mục đang làm.
   *
   * ⚠️ Dark theme cần bộ giá trị RIÊNG, không phải lật sáng-tối: trên nền `shell-sidebar-bg`
   * thì `viz-4`/`viz-5` tụt dưới 3:1. Chọn lại và chạy lại bộ kiểm khi increment dark tới.
   */
  'color-viz-1': '#00998c',
  'color-viz-2': '#7c3aed',
  'color-viz-3': '#b45309',
  'color-viz-4': '#0369a1',
  'color-viz-5': '#9d174d',
  /**
   * Ba VAI của biểu đồ tài chính, trỏ về dải trên.
   *
   * Component không gọi thẳng `viz-1`: "doanh thu" là một khái niệm nghiệp vụ, và nếu ba màn
   * cùng tự chọn số thứ tự thì doanh thu sẽ đổi màu giữa các màn. Ánh xạ ở đây một lần.
   */
  'color-viz-revenue': 'var(--xp-color-viz-1)',
  'color-viz-cost': 'var(--xp-color-viz-3)',
  'color-viz-profit': 'var(--xp-color-viz-2)',
  /**
   * Lưới và trục của biểu đồ — phải LÙI lại phía sau dữ liệu, không cạnh tranh với nó. Theo dải
   * xám v2 ở cùng độ sáng với bộ cũ (Gray/200, Gray/400), không lấy chữ phụ đậm hơn.
   */
  'color-viz-grid': '#e9eaeb',
  'color-viz-axis': '#a4a7ae',

  // ─── Vỏ portal ────────────────────────────────────────────────────────────
  // P1 đã chốt "TỐI" (07/08/2026) và Wave 1D-B đã áp dụng. Ba màu sidebar CHƯA chuyển sang v2:
  // chưa đọc màn partner/admin nào, và `sidebar.test.ts` của app native chốt cứng ba giá trị này
  // — đổi cùng lúc với dev mobile (ADR 0062 điều 5).
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
  'shell-topbar-bg': '#ffffff', // v2 BG/white
  'shell-topbar-border': '#e9eaeb', // = border (v2 Stroke/gray-low200)

  // ─── Màu riêng của thanh event trên lịch ──────────────────────────────────
  // Chưa có trong v2 — giữ nguyên bộ đang chạy; riêng "yêu cầu" vốn LÀ gold thương hiệu.
  'color-event-booking': '#2563eb',
  'color-event-request': '#e9ac29',
  'color-event-blocked': '#8c8069',
  'color-event-maintenance': '#7c3aed',

  // ─── Typography ───────────────────────────────────────────────────────────
  // v2 dùng MỘT họ chữ: Google Sans Flex (biến Figma `font-googlesan`), tự host qua next/font
  // (biến `--font-google-sans` đặt trên <html>), có subset tiếng Việt. Playfair đã bỏ — bí danh
  // `font-family-display` ở cuối file trỏ về đây.
  'font-family':
    "var(--font-google-sans), 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",

  // Thang chữ v2 — tên style Figma dạng `<size>px/<weight>`. Cặp size/line-height đi liền nhau.
  // v2 có 8 bậc: 12/18 · 14/20 · 16/24 · 18/28 · 24/32 · 30/38 · 36/44 · 48/60.
  'font-size-display': '48px', // v2 48px/Semibold · hero
  'line-height-display': '60px',
  'font-size-display-sm': '36px', // v2 36px/Medium · 36px/Bold
  'line-height-display-sm': '44px',
  // Figma ghi -2% (48px/Semibold, 36px/Medium) — em để đi theo cỡ chữ.
  'letter-spacing-display': '-0.02em',
  'font-size-h1': '30px', // v2 30px/Semibold · 30px/Bold · tiêu đề trang
  'line-height-h1': '38px',
  'font-size-h2': '24px', // v2 24px/Semibold · 24px/Medium · tiêu đề section
  'line-height-h2': '32px',
  'font-size-lead': '20px', // v2 20px/Medium · 20px/Semibold · chữ trên nền ảnh (cột trái hộp đăng nhập)
  'line-height-lead': '30px',
  'font-size-h3': '18px', // v2 18px/Semibold · tiêu đề card / modal
  'line-height-h3': '28px',
  'font-size-h4': '16px', // v2 16px/Semibold · subsection, header bảng
  'line-height-h4': '24px',
  'font-size-body-lg': '16px', // v2 16px/Regular
  'line-height-body-lg': '24px',
  'font-size-body': '14px', // v2 14px/Regular · ô bảng, label form
  'line-height-body': '20px',
  'line-height-body-relaxed': '22px', // thân 14px của design v2 (Figma `14px/Regular`: line-height 22)
  'font-size-body-sm': '12px', // v2 12px/Regular · caption, help text
  'line-height-body-sm': '18px',
  'font-size-label': '12px', // v2 12px/Medium · badge, chip, tag
  'line-height-label': '18px',
  // Chưa chuyển: v2 không có bậc 11px (kicker v2 là 12px/Medium = bậc `label`), nhưng app native
  // đọc bậc này làm cỡ chữ dòng meta dày đặc — 12px là bị cắt "…" trên máy 360dp. Đổi cùng dev
  // mobile (ADR 0062 điều 5); kicker web dùng `font-size-label` khi ráp màn.
  'font-size-overline': '11px',
  'line-height-overline': '16px',

  'font-weight-regular': '400',
  'font-weight-medium': '500',
  'font-weight-semibold': '600',
  'font-weight-bold': '700',

  // Cỡ chữ mặc định của body + line-height toàn cục.
  // ⚠️ `line-height` (1.5714 → 22px) là giá trị AntD đang chạy, KHÁC `line-height-body`
  // (20px) của Figma. Đổi nó làm lệch chiều cao mọi hàng bảng và mọi form → hoãn sang
  // wave có QA thị giác. Nợ kỹ thuật ghi ở docs/design-token-map.md §5.
  'font-size': '14px',
  'font-size-sm': '12px',
  'line-height': '1.5714',

  // ─── Khoảng cách ──────────────────────────────────────────────────────────
  // Thang 4 · 8 · 16 · 24 · 32 của bộ cũ. v2 dùng thang mịn hơn (`Num/*`: 2 · 4 · 6 · 8 · 12 · 16 ·
  // 20 · 24 · 32 · 36 · 40 · 48 · 56 · 64 · 80) — bậc mới thêm khi màn đầu tiên cần tới (ADR 0062
  // điều 4).
  // ⚠️ Tên khoảng cách của Figma KHÁC nghĩa: `spacing-md` ở Figma = 8px, còn `--xp-space-md` =
  // 16px. Đọc Figma theo CON SỐ px, không theo tên.
  'space-xs': '4px',
  'space-sm': '8px',
  'space-md': '16px',
  'space-lg': '24px',
  'space-xl': '32px',

  // ─── Bo góc ───────────────────────────────────────────────────────────────
  // Bộ cũ. Bo góc v2 gắn theo từng component (nút, ô nhập, thẻ) — chốt khi ráp component đó.
  'border-radius-sm': '6px', // 14:160 · chip, badge, phần tử trong
  'border-radius': '10px', // 14:164 · card, input, modal
  'border-radius-lg': '10px',
  'border-radius-pill': '999px', // 14:168 · pill, avatar

  // ─── Đổ bóng ──────────────────────────────────────────────────────────────
  // Bộ cũ (Figma `14:173`/`14:176`/`14:179`, tông nâu ấm). CHƯA chuyển sang v2: bóng v2 tông đen
  // lạnh `#0A0D12` và nhiều bậc có HAI lớp, trong khi bộ parse bóng của app native chỉ nhận một
  // lớp và test của nó chốt cứng `shadow-card` — đổi cùng dev mobile (ADR 0062 điều 5).
  'shadow-card': '0 2px 4px 0 rgba(41, 31, 15, 0.06)', // Elevation 1 · card nghỉ
  'shadow-raised': '0 4px 12px 0 rgba(41, 31, 15, 0.08)', // Elevation 2 · hover, dropdown
  'shadow-overlay': '0 8px 24px 0 rgba(41, 31, 15, 0.12)', // Elevation 3 · modal, drawer

  /**
   * Nền tối phía sau khu hero của trang chủ — hiện khi banner chưa tải xong hoặc không có
   * banner nào đang bật. KHÔNG có node Figma riêng (Figma chỉ vẽ trạng thái CÓ banner); giá
   * trị là sắc nâu tối cùng họ với `color-primary-contrast`. Trước đây gõ tay giống hệt nhau ở
   * cả `HomeHero.module.css` lẫn `BannerCarousel.module.css` — hai khối nằm CHỒNG nhau trên
   * cùng một chỗ của trang, nên lệch một mã màu là thấy đường nối ngay khi banner tải xong.
   */
  'hero-backdrop': 'linear-gradient(120deg, #241d12, #3a2f1a)',

  // ─── Design v2 — bề mặt chợ (trang chủ, header, footer) ───────────────────
  // Đọc từ các frame trang chủ v2 ngày 15/10/2026 (ADR 0062). App native KHÔNG đọc nhóm này (bộ
  // chuyển đổi native chỉ gỡ đúng các khoá nó liệt kê), nên gradient/bóng nhiều lớp an toàn ở đây.
  'color-bg-inverse': '#0e0f12', // v2 BG/gray-high — header chợ, nhãn trên ảnh
  'color-text-on-dark': '#ffffff', // v2 Text/Gray/white
  'color-text-on-dark-muted': '#d5d7da', // v2 Text/Gray/disable trên nền tối (footer, banner)
  'color-primary-bright': '#edbb4f', // v2 Text/Brand/low — tiêu đề cột footer trên nền tối
  'color-primary-pale': '#f0ddb7', // v2 Text/Brand/disable — chữ thương hiệu mờ trên nền tối
  'color-primary-accent': '#d3a94d', // gạch tab đang chọn, viền thẻ khi rê chuột (điểm đầu gradient chữ)
  'color-primary-glow': '#e9c336', // vành avatar gian hàng — điểm đầu gradient nút chính
  'color-primary-highlight': '#fddb5d', // viền thẻ nổi bật ("Gian hàng Chuyên nghiệp" — Figma `20037:6949`)
  'color-destination-border': '#e9bb68', // viền thẻ điểm đến
  // Luồng đặt xe v2 (Figma `RHDyFsURFZQ9BC5JCLQzeE`, đọc 19/10/2026) — bốn bậc màn đó đặt tên rõ.
  'color-primary-border': '#e8ca8d', // v2 Stroke/primary-300 — viền thẻ tiền, phương thức đang mở
  'color-success-accent': '#12b76a', // v2 Status/success-500 — viền nét đứt thẻ "đã xác nhận"
  'color-success-border': '#6ce9a6', // v2 Status/success-300 — viền nhãn trạng thái xanh
  'color-warning-subtle': '#fffaeb', // v2 Status/warning-low — nền hộp lưu ý trang thanh toán
  'color-warning-border': '#fec84b', // v2 Status/warning-300 — viền nhãn trạng thái cam
  'color-warning-strong': '#ec4a0a', // v2 Status/warning-600 — chữ nhãn trạng thái cam
  'color-info-strong': '#1570ef', // v2 Status/info-600 — chữ nhãn trạng thái xanh dương
  'market-footer-bg': '#060403', // nền footer chợ — đen ấm, đi cùng lớp ánh vàng phía trên
  // Nút chính v2 ("Tìm kiếm", "Trở thành chủ xe", "Đăng ký ngay"…) — ADR 0062 Q1 đã có điểm màu.
  'gradient-primary': 'linear-gradient(90deg, #e9c336 0%, #e8c664 48.077%, #e3b012 100%)',
  // Chữ nhấn gradient: hero ("Trong tầm tay bạn!"), vàng đậm (VF3+, "ĐỐI TÁC ĐỘC QUYỀN"),
  // vàng nhạt (badge "% off", "20%"), tên điểm đến.
  'gradient-text-hero': 'linear-gradient(90deg, #eeb924 0%, #ba8b26 100%)',
  'gradient-text-gold': 'linear-gradient(90deg, #d3a94d 0%, #cb9c03 100%)',
  'gradient-gold-soft': 'linear-gradient(90deg, #edd3a4 0.89%, #d6a439 100.89%)',
  'gradient-text-destination': 'linear-gradient(90deg, #fded9d 0%, #f7dd91 52.404%, #f1a940 100%)',
  'gradient-instant-badge': 'linear-gradient(90deg, #a4dded 0.89%, #dfe7f1 100.89%)',
  // Lớp vàng rất nhạt phủ lên thẻ khi rê chuột (thẻ xe, thẻ gian hàng).
  'gradient-card-highlight':
    'linear-gradient(145deg, rgba(220, 192, 148, 0.2) 24.208%, rgba(237, 233, 219, 0.2) 88.612%)',
  // Nền thẻ danh sách khi hover/focus (Figma "Vehicle Card" hover, `21788:63094`): vàng 20% trên trắng.
  'gradient-card-hover':
    'linear-gradient(174.5deg, rgba(243, 229, 205, 0.2) 24.208%, rgba(243, 239, 226, 0.2) 88.612%), linear-gradient(90deg, #ffffff 0%, #ffffff 100%)',
  // Bóng v2 (tông đen lạnh) — tên `elevation-*` để không đụng ba bóng cũ mà native chốt cứng.
  'elevation-xs': '0 1px 2px 0 rgba(10, 13, 18, 0.05)',
  'elevation-sm': '0 1px 3px 0 rgba(10, 13, 18, 0.1), 0 1px 2px 0 rgba(10, 13, 18, 0.06)',
  'elevation-lg': '0 12px 16px -4px rgba(10, 13, 18, 0.08), 0 4px 6px -2px rgba(10, 13, 18, 0.03)',
  'elevation-soft': '0 4px 9px 0 rgba(125, 125, 125, 0.15), 0 1px 1px 0 rgba(0, 0, 0, 0.03)',
  'elevation-panel': '0 12px 29px 0 rgba(125, 125, 125, 0.15), 0 1px 1px 0 rgba(0, 0, 0, 0.03)',
  'elevation-glow': '0 4px 12px 0 rgba(253, 178, 38, 0.16)',
  'elevation-ambient': '0 0 8px 0 rgba(10, 13, 18, 0.04)',
  'elevation-header': '0 0 0 1px rgba(0, 0, 0, 0.05), 0 25px 50px -12px rgba(0, 0, 0, 0.05)',
  // v2 Shadow/xl — popup nổi trên một hộp thoại khác (xác minh OTP, đặt lại mật khẩu thành công).
  'elevation-xl': '0 20px 24px -4px rgba(10, 13, 18, 0.08), 0 8px 8px -4px rgba(10, 13, 18, 0.03)',
  // Bo góc v2: badge 8 · ô nhập/nút 12 · thẻ/khung 16.
  'border-radius-chip': '8px',
  'border-radius-control': '12px',
  'border-radius-card': '16px',
  // Bậc khoảng cách v2 chưa có tên trong thang cũ — đặt theo CON SỐ để không lẫn với tên Figma.
  'space-2': '2px',
  'space-6': '6px',
  'space-12': '12px',
  'space-20': '20px',
  'space-40': '40px',
  'space-48': '48px',
  'space-64': '64px',
  'space-80': '80px',
  // Lề hai bên của khung nội dung chợ v2 (1440 − 1200) / 2.
  'market-gutter': '120px',
  'market-container-max-width': '1200px',
  'letter-spacing-snug': '-0.01em',
  // Lớp sương trắng phía trái hero — giữ tiêu đề đọc được trên mọi ảnh nền.
  'hero-fog':
    'linear-gradient(to left, rgba(204, 218, 231, 0) 0%, rgba(251, 251, 252, 0.4) 67.093%)',
  // Kính mờ: chip điểm nổi bật ở hero, huy hiệu cửa hàng ứng dụng, dấu tích đối tác.
  'color-glass': 'rgba(255, 255, 255, 0.1)',
  'color-glass-strong': 'rgba(255, 255, 255, 0.32)',
  'color-glass-faint': 'rgba(255, 255, 255, 0.05)',
  'color-glass-gold': 'rgba(254, 237, 210, 0.2)',
  // Nút tròn nổi trên ảnh xe (yêu thích) — lớp tối rất nhẹ cho icon trắng.
  'color-scrim-light': 'rgba(16, 24, 40, 0.1)',
  // Lớp phủ trái của hai banner ưu đãi: tối (chữ trắng) và sáng (chữ tối).
  'gradient-promo-dark': 'linear-gradient(to left, rgba(0, 0, 0, 0) 0%, #000000 100%)',
  'gradient-promo-light': 'linear-gradient(to left, rgba(255, 255, 255, 0) 0%, #ffffff 100%)',
  // Lớp tối phía trên thẻ điểm đến — tên thành phố gradient vàng đọc được trên tranh minh hoạ.
  'gradient-destination-shade':
    'linear-gradient(180deg, rgb(26, 21, 14) 0%, rgba(36, 26, 15, 0) 40.385%, rgba(23, 20, 13, 0) 65.385%, rgba(34, 24, 13, 0) 100%), linear-gradient(180deg, rgb(26, 21, 14) 31.784%, rgba(50, 35, 0, 0) 100%)',

  // ─── Chuyển động (chợ v2 — `apps/web/src/components/motion`) ──────────────
  // Thông số đo từ trang mẫu GoRental (index-three, 26/10/2026): transition `all .3s`, WOW
  // `fadeInUp` 1s, SplitText trượt 50px với `Back.easeOut`, nền hero `zoomEffect` 40s.
  'motion-duration-fast': '0.3s', // rê chuột: nhấc thẻ, phóng ảnh, đổi viền/bóng
  'motion-duration-reveal': '1s', // khối/chữ hiện ra khi tải trang hoặc cuộn tới
  'motion-duration-ambient': '40s', // một nhịp "thở" của ảnh nền hero
  'motion-ease-standard': 'ease',
  // Penner `easeOutBack` (s = 1.70158) — đúng `Back.easeOut` của GSAP: vượt đích nhẹ rồi về.
  'motion-ease-overshoot': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  'motion-distance-reveal': '40px', // khối trượt lên từ dưới
  'motion-distance-char': '50px', // từng ký tự tiêu đề trượt vào từ phải
  'motion-lift-hover': '-4px', // thẻ nhấc lên khi rê chuột (khung băng chuyền chừa đúng 4px)
  'motion-scale-media-hover': '1.05',
  'motion-scale-ambient': '1.08', // đỉnh nhịp thở hero

  // ─── Focus ────────────────────────────────────────────────────────────────
  // Figma `14:197` vẽ ring 3px; hạ xuống 2px theo góp ý review UI 12/08/2026 (ring 3px
  // trên control 32px trông quá dày). Border focus vẫn 2px.
  'focus-outline-width': '2px',
  'focus-ring-width': '2px',
  // Gold chính (#e9ac29) ở 25% — cùng công thức với bản cũ, đổi theo gold v2.
  'color-focus-ring': 'rgba(233, 172, 41, 0.25)',

  // ─── Breakpoint ───────────────────────────────────────────────────────────
  // Figma `14:183`–`14:192`. CSS custom property KHÔNG dùng được trong `@media`
  // (xem docs/design-token-map.md §21 P8) — nguồn dùng cho JS là `XP_BREAKPOINTS` bên dưới;
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
  // Popover neo trong canvas lịch — phải trên mọi lớp dính của lịch (chúng là anh em cùng
  // stacking context), vẫn dưới topbar/sidebar.
  'z-calendar-popover': '40',
  'z-calendar-header': '30',
  'z-calendar-sticky-col': '20',
  'z-popup-base': '1000',

  // ─── Kích thước component dùng chung ──────────────────────────────────────
  // Wave 1A CHỈ khai báo. Áp vào component là việc của các wave sau.
  // `control-height` = 32px là chiều cao AntD đang chạy; Figma `125:1571`/`125:2691`
  // vẽ control 40px (= AntD size="large"). Chênh này ghi ở P16. Review UI 12/08/2026 chốt:
  // form field dùng cỡ MẶC ĐỊNH 32px (bỏ size="large"), 40px chỉ còn cho nút CTA.
  'control-height-sm': '24px',
  'control-height': '32px',
  'control-height-lg': '40px',
  'touch-target-min': '44px',
  'modal-width-sm': '400px', // 125:1611 size=SM
  'modal-width': '560px', // 125:1611 size=MD
  'modal-width-lg': '720px', // 125:1611 size=LG
  // Overlay hai cột (yêu cầu thuê xe): cột trái hồ sơ xe + cột phải luồng thao tác. Vượt 720px
  // là có chủ đích — nhồi hai cột vào LG làm cả hai cột hẹp tới mức không đọc được.
  'modal-width-xl': '1180px',
  'drawer-width': '560px',
  'drawer-width-lg': '720px',
  // Panel chi tiết RỘNG (màn duyệt xe): ~75% màn lớn, trần 1400px; màn desktop nhỏ phủ gần hết
  // vùng nội dung (trừ sidebar), không bao giờ hẹp hơn 1000px khi còn chỗ. Tablet/mobile do
  // `DetailDrawer` chuyển sang toàn màn hình. Dùng được trực tiếp làm `width` inline.
  'drawer-width-xl':
    'clamp(min(calc(100vw - var(--xp-shell-sidebar-width)), 1000px), 75vw, 1400px)',
  // Panel chi tiết ĐỨNG CẠNH danh sách (không mask — màn "Đơn thuê toàn hệ thống"): 46% màn
  // hình, sàn 560px để nội dung hai cột không bị bó, trần 780px để phần bảng còn lại vẫn đọc
  // được. Ở 1280–1600px nó chiếm ~52–56% vùng nội dung, ở 1920px ~46%. Trang dùng cùng token
  // này để chừa chỗ cho bảng; tablet/mobile do `DetailDrawer` chuyển sang toàn màn hình.
  'drawer-width-split': 'clamp(560px, 46vw, 780px)',
  // Figma `117:1203` (Pagination/Desktop) · `127:2060` vẽ vùng nội dung 1200. Chốt 14/08/2026:
  // nới lên 1280 cho MỌI trang (marketplace lẫn portal) — 1200/1120 để lại quá nhiều lề chết
  // trên màn 1440. Đây là nguồn duy nhất của bề rộng trang; không gõ số ở CSS Module.
  'container-max-width': '1280px',

  // ─── Khung app ────────────────────────────────────────────────────────────
  'shell-topbar-height': '56px', // 14:1498
  // Header marketplace công khai (MarketHeader). Thanh tìm kiếm thu gọn của trang chủ neo ngay
  // dưới nó, và IntersectionObserver lấy đúng số này làm rootMargin — một nguồn cho CSS lẫn JS.
  'market-header-height': '68px', // v2 Header (68px)
  // Bề rộng tối đa của không gian làm việc trọn bề ngang (sửa xe, quản lý xe) — rộng hơn
  // `container-max-width` vì các màn đó có menu trái + nội dung + cột xem nhanh.
  'shell-workspace-max-width': '1680px',
  'shell-sidebar-width': '232px', // 14:1424 (Foundations sở hữu giá trị; 47:5 = 240 lệch nhịp)
  'shell-sidebar-collapsed-width': '64px', // 14:1532 = 47:77
  'shell-bottom-nav-height': '64px', // 14:1641
  'shell-drawer-width': '280px', // 14:1662
  // 60:69 (FormColumn thụt 64px so với workspace). Đi theo `container-max-width`: 1280 − 64.
  'shell-form-max-width': '1216px',

  // ─── Lịch resource timeline ───────────────────────────────────────────────
  'calendar-resource-col-width': '220px',
  'calendar-day-col-width': '56px',
  'calendar-row-height': '44px',
  'calendar-header-height': '56px',

  // ─── DEPRECATED — bí danh giữ cho code cũ ─────────────────────────────────
  // Mỗi cái trỏ `var()` về token canonical: không có giá trị nào bị nhân đôi.
  // Số consumer + wave gỡ bỏ: docs/design-token-map.md §14.
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
  /** @deprecated → `--xp-font-family` (v2 một họ chữ, Playfair đã bỏ — ADR 0062) */
  'font-family-display': 'var(--xp-font-family)',
} as const;

export type XpTokenName = keyof typeof XP_TOKENS;

/** Dùng trong `.module.css` thì viết thẳng `var(--xp-...)`; hàm này cho chỗ cần dựng từ TS. */
export function cssVar(name: XpTokenName): string {
  return `var(--xp-${name})`;
}

export function toPx(value: string): number {
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
