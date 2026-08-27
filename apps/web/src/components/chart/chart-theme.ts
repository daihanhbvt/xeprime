/**
 * Tham số hình hoạ dùng chung cho mọi biểu đồ — không component nào tự chọn.
 *
 * Màu lấy từ CSS custom property (`var(--xp-color-viz-*)`) chứ không phải hex: recharts vẽ bằng
 * SVG nên `fill`/`stroke` đọc được biến CSS, và nhờ vậy biểu đồ đi theo design token thay vì
 * giữ một bản sao bảng màu thứ hai. Đây cũng là lý do chọn recharts thay vì thư viện canvas.
 */

/** Ba vai của biểu đồ tài chính. Mã vai, không phải số thứ tự — xem `XP_TOKENS` color-viz-*. */
export const CHART_COLOR = {
  revenue: 'var(--xp-color-viz-revenue)',
  cost: 'var(--xp-color-viz-cost)',
  profit: 'var(--xp-color-viz-profit)',
} as const;

export type ChartRole = keyof typeof CHART_COLOR;

/** Dải màu định danh cho các nhóm KHÔNG có vai cố định. Dùng theo thứ tự, không xoay vòng. */
export const CHART_SERIES_COLORS = [
  'var(--xp-color-viz-1)',
  'var(--xp-color-viz-2)',
  'var(--xp-color-viz-3)',
  'var(--xp-color-viz-4)',
  'var(--xp-color-viz-5)',
] as const;

/** Lưới và trục phải LÙI phía sau dữ liệu — nét mảnh, màu nhạt, không có đường trục đậm. */
export const CHART_GRID = {
  stroke: 'var(--xp-color-viz-grid)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

export const CHART_AXIS = {
  stroke: 'var(--xp-color-viz-axis)',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** Cột: bo 4px ở ĐẦU DỮ LIỆU, chân cột vuông vì nó neo vào đường 0. */
export const CHART_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/** Nét đường 2px, điểm mốc ≥ 8px để chạm được bằng ngón tay. */
export const CHART_LINE_WIDTH = 2;
export const CHART_DOT_RADIUS = 4;
