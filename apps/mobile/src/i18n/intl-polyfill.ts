/**
 * Polyfill `Intl` cho Hermes.
 *
 * Hermes trên Android chỉ có một phần `Intl`. Thiếu `Intl.PluralRules` là mọi message ICU dạng
 * `{count, plural, …}` ném lỗi trong `intl-messageformat`, và `use-intl` bắt lỗi rồi in ra
 * ĐƯỜNG DẪN KHOÁ — người dùng thấy `Marketplace.available.count` thay vì `(49 xe)`. Khoá không
 * plural vẫn hiện đúng, nên lỗi trông như "vài chỗ chưa dịch" chứ không như một API thiếu.
 *
 * `Intl.DateTimeFormat` của Hermes cũng không nhận `timeZone: 'Asia/Ho_Chi_Minh'` — mà ADR 0012
 * bắt buộc mọi mốc thời gian hiển thị theo giờ Việt Nam, không theo múi giờ của máy.
 *
 * **Thứ tự import là bắt buộc** và không được sắp lại cho "gọn": mỗi polyfill dựng trên cái
 * trước nó (`locale` cần `getCanonicalLocales`, `datetimeformat` cần `numberformat`).
 *
 * Dùng bản `/polyfill` (CÓ kiểm tra tính năng), KHÔNG dùng `/polyfill-force`: bản force thay
 * thế cả `Intl` gốc đang chạy tốt, và bản thay thế đó trả `formatToParts` mà plugin timezone
 * của Day.js đọc ra offset 0 — mọi mốc thời gian hiện theo UTC thay vì giờ Việt Nam, sai 7 tiếng
 * mà không có lỗi nào được ném ra.
 *
 * Chỉ nạp dữ liệu của `vi` và `en` — đó là hai ngôn ngữ app hỗ trợ (ADR 0012). Nạp tất cả
 * locale làm bundle phình lên vài MB cho thứ không ai dùng.
 */
import '@formatjs/intl-getcanonicallocales/polyfill';
import '@formatjs/intl-locale/polyfill';

import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-pluralrules/locale-data/vi';
import '@formatjs/intl-pluralrules/locale-data/en';

import '@formatjs/intl-numberformat/polyfill';
import '@formatjs/intl-numberformat/locale-data/vi';
import '@formatjs/intl-numberformat/locale-data/en';

import '@formatjs/intl-datetimeformat/polyfill';
import '@formatjs/intl-datetimeformat/locale-data/vi';
import '@formatjs/intl-datetimeformat/locale-data/en';
// Bảng múi giờ: KHÔNG có nó thì `timeZone: 'Asia/Ho_Chi_Minh'` ném RangeError. Bản `golden`
// đủ các vùng phổ biến và nhẹ hơn `add-all-tz` đáng kể.
import '@formatjs/intl-datetimeformat/add-golden-tz';
