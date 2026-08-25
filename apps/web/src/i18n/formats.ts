import type { Formats } from 'next-intl';
import { APP_CURRENCY } from './config';

/**
 * Định dạng dùng chung cho `format.dateTime(...)` / `format.number(...)` của next-intl.
 *
 * Khai báo ở đây thay vì truyền options tại chỗ gọi: cùng một khái niệm ("giá tiền", "ngày
 * ngắn") phải trông giống nhau ở mọi màn hình, và khi cần chỉnh thì chỉnh một chỗ.
 *
 * Múi giờ KHÔNG đặt ở đây — nó là cấu hình toàn request (`i18n/request.ts`) và luôn là
 * `Asia/Ho_Chi_Minh` bất kể ngôn ngữ nào.
 */
export const formats = {
  dateTime: {
    /** `17/08/2026` (vi) · `08/17/2026` (en) — mốc ngày trong bảng, thẻ, chi tiết. */
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    /** Ngày có tên tháng, cho tiêu đề và câu văn. */
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    /** Ngày đầy đủ kèm THỨ — nhãn "hôm nay" ở dashboard, tiêu đề một ô lịch. */
    fullDate: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    /**
     * CỐ Ý không có preset ghép sẵn ngày + giờ.
     *
     * `{day, month, year, hour, minute}` để CLDR tự chọn thứ tự, và với `vi` nó cho
     * `14:30 17/08/2026` — GIỜ ĐỨNG TRƯỚC. Toàn bộ sản phẩm đọc ngược lại (`17/08/2026 14:30`),
     * nên `useAppFormat().dateTime()` ghép hai mảnh bằng message `Common.units.dateTime`
     * thay vì giao thứ tự cho dữ liệu vùng miền.
     *
     * `hour12: false`: 24 giờ là quy ước đã chốt của sản phẩm (ô chọn giờ, lịch, mốc thuê đều
     * `HH:mm`). Để CLDR quyết thì màn tiếng Anh hiện `02:30 PM` cạnh một ô nhập ghi `14:30`.
     */
    time: { hour: '2-digit', minute: '2-digit', hour12: false },
    /** Tháng + năm — dùng cho tiêu đề lịch và bộ lọc theo kỳ. */
    monthYear: { month: 'long', year: 'numeric' },
  },
  number: {
    /**
     * Tiền VND. `currencyDisplay: 'narrowSymbol'` cho `₫` thay vì `VND`; số tiền đồng không
     * bao giờ có phần lẻ trên giao diện.
     */
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
    /**
     * Quãng đường giao xe: một chữ số thập phân, KHÔNG ép tối thiểu (`5 km` chứ không `5,0 km`).
     *
     * Khác `integer` — vốn dành cho số KM trên đồng hồ, nơi phần lẻ là nhiễu. Ở đây phần lẻ là
     * thông tin: bậc phí giao nhận cắt ở đúng 3 km và 5 km, nên làm tròn 3,4 km thành "3 km"
     * sẽ hiện một quãng đường mâu thuẫn với mức phí ngay bên cạnh nó.
     */
    distance: { maximumFractionDigits: 1 },
    percent: { style: 'percent', maximumFractionDigits: 0 },
  },
} satisfies Formats;
