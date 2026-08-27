import type { Formats } from 'use-intl';
import { APP_CURRENCY } from './config';

/**
 * Định dạng dùng chung cho `format.dateTime(...)` / `format.number(...)`.
 *
 * BẢN SAO của `apps/web/src/i18n/formats.ts`, cố ý giống từng khoá: cùng một khái niệm ("giá
 * tiền", "ngày ngắn") phải trông giống nhau ở cả hai client. Sửa bên nào cũng phải sửa bên kia
 * cho tới khi cả cụm định dạng được đưa về `@xeprime/domain`.
 *
 * Múi giờ KHÔNG đặt ở đây — nó là cấu hình của provider và luôn là `Asia/Ho_Chi_Minh`.
 */
export const formats = {
  dateTime: {
    /** `17/08/2026` (vi) · `08/17/2026` (en) — mốc ngày trong bảng, thẻ, chi tiết. */
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    /** Ngày có tên tháng, cho tiêu đề và câu văn. */
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    /** Ngày đầy đủ kèm THỨ. */
    fullDate: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    /**
     * `hour12: false`: 24 giờ là quy ước đã chốt của sản phẩm. Để CLDR quyết thì màn tiếng Anh
     * hiện `02:30 PM` cạnh một ô nhập ghi `14:30`.
     */
    time: { hour: '2-digit', minute: '2-digit', hour12: false },
    monthYear: { month: 'long', year: 'numeric' },
  },
  number: {
    currency: {
      style: 'currency',
      currency: APP_CURRENCY,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    },
    /** Số nguyên có phân tách nhóm (số km, số chuyến, số xe). */
    integer: { maximumFractionDigits: 0 },
    /** Điểm đánh giá `4,8` / `4.8`. */
    rating: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
    /** Quãng đường giao xe: một chữ số thập phân, KHÔNG ép tối thiểu (`5 km`, không `5,0 km`). */
    distance: { maximumFractionDigits: 1 },
    percent: { style: 'percent', maximumFractionDigits: 0 },
  },
} satisfies Formats;
