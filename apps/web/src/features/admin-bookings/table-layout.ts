/**
 * Bố cục cột của bảng "Đơn thuê toàn hệ thống".
 *
 * Hai chế độ:
 *  - **Đầy đủ** (không mở đơn nào): bảy cột dữ liệu + cột thao tác, bảng có sàn
 *    `FULL_TABLE_MIN_WIDTH` và cuộn ngang trong vùng bảng khi hẹp hơn (Figma `127:2097` R1–R2).
 *  - **Cạnh panel** (đang xem một đơn): panel chi tiết chiếm ~46% màn hình, bảng chỉ còn phần
 *    bên trái. Hai cột tiền và cột thao tác đã có trong panel nên bị bỏ; năm cột còn lại được
 *    giữ theo thứ tự ưu tiên, và HẾT CHỖ thì ẩn bớt cột thay vì bắt người dùng cuộn ngang một
 *    bảng đang bị panel che một nửa.
 */
export const ADMIN_BOOKING_COLUMN = {
  CODE: 'code',
  CUSTOMER: 'customer',
  TENANT: 'tenant',
  PERIOD: 'period',
  STATUS: 'status',
  TOTAL: 'totalAmount',
  DEBT: 'debtAmount',
} as const;

/**
 * Sàn bề rộng ở chế độ đầy đủ — giữ nguyên giá trị trước đợt này (Figma `127:1725` ghi 920px cho
 * Platform Bookings; code có thêm hai cột tiền). Đây là SÀN, không phải tổng: mỗi cột có `width`
 * riêng và bảng `tableLayout="auto"` vẫn giãn theo nội dung khi cần.
 */
export const FULL_TABLE_MIN_WIDTH = 1180;

type PanelColumnKey =
  | typeof ADMIN_BOOKING_COLUMN.CODE
  | typeof ADMIN_BOOKING_COLUMN.CUSTOMER
  | typeof ADMIN_BOOKING_COLUMN.TENANT
  | typeof ADMIN_BOOKING_COLUMN.PERIOD
  | typeof ADMIN_BOOKING_COLUMN.STATUS;

/**
 * Bề rộng từng cột ở chế độ cạnh panel (px, gồm padding ô). Đo trên nội dung dài nhất thường
 * gặp: mốc thuê `10:00 · 21/09 → 10:00 · 22/09` một dòng, nhãn "Khách không đến" trong tag.
 */
export const PANEL_COLUMN_WIDTH: Readonly<Record<PanelColumnKey, number>> = {
  [ADMIN_BOOKING_COLUMN.CODE]: 132,
  [ADMIN_BOOKING_COLUMN.CUSTOMER]: 150,
  [ADMIN_BOOKING_COLUMN.TENANT]: 220,
  [ADMIN_BOOKING_COLUMN.PERIOD]: 224,
  [ADMIN_BOOKING_COLUMN.STATUS]: 132,
};

/**
 * Thứ tự HY SINH khi hết chỗ. Mã đơn và trạng thái không bao giờ ẩn — đó là thứ người dùng dò
 * theo để biết mình đang ở dòng nào. Gian hàng · xe rộng nhất và đã hiện đủ trong panel nên đi
 * trước; tên khách là thứ người ta nhận ra một đơn nhanh nhất nên ở lại lâu nhất.
 */
const PANEL_DROP_ORDER: readonly PanelColumnKey[] = [
  ADMIN_BOOKING_COLUMN.TENANT,
  ADMIN_BOOKING_COLUMN.PERIOD,
  ADMIN_BOOKING_COLUMN.CUSTOMER,
];

const ALL_PANEL_COLUMNS = Object.keys(PANEL_COLUMN_WIDTH) as PanelColumnKey[];

function totalWidth(keys: Iterable<PanelColumnKey>): number {
  let sum = 0;
  for (const key of keys) sum += PANEL_COLUMN_WIDTH[key];
  return sum;
}

/**
 * Số cột (theo `PANEL_DROP_ORDER`) phải bỏ để bảng vừa `available` px.
 *
 * Trả về một SỐ NGUYÊN chứ không phải tập cột: bảng đo bề rộng bằng `useElementWidth`, và một
 * giá trị nguyên thuỷ nghĩa là chỉ render lại khi thật sự phải ẩn/hiện cột — không phải mỗi
 * khung hình lúc kéo cửa sổ.
 *
 * `null` (chưa đo được — SSR, lần render đầu) ⇒ 0, tức đủ năm cột: bảng tự cuộn ngang trong vùng
 * của nó cho tới khi đo xong, không nhấp nháy từ ít cột lên nhiều cột.
 */
export function panelDropCount(available: number | null): number {
  if (available === null) return 0;
  let width = totalWidth(ALL_PANEL_COLUMNS);
  let dropped = 0;
  for (const key of PANEL_DROP_ORDER) {
    if (width <= available) break;
    width -= PANEL_COLUMN_WIDTH[key];
    dropped += 1;
  }
  return dropped;
}

/** Các cột còn hiện sau khi bỏ `dropCount` cột đầu của thứ tự hy sinh. */
export function panelColumnsAfterDrop(dropCount: number): ReadonlySet<PanelColumnKey> {
  const dropped = new Set<PanelColumnKey>(PANEL_DROP_ORDER.slice(0, dropCount));
  return new Set(ALL_PANEL_COLUMNS.filter((key) => !dropped.has(key)));
}

/** Các cột hiện được ở chế độ cạnh panel với bề rộng `available` (px). */
export function panelColumnKeys(available: number | null): ReadonlySet<PanelColumnKey> {
  return panelColumnsAfterDrop(panelDropCount(available));
}

/** Sàn bề rộng của bảng ở chế độ cạnh panel = tổng các cột còn hiện. */
export function panelTableMinWidth(visible: ReadonlySet<PanelColumnKey>): number {
  return totalWidth(visible);
}
