/**
 * Polyfill `Intl` cho Hermes.
 *
 * Hermes trên Android chỉ có một phần `Intl`. Thiếu `Intl.PluralRules` là mọi message ICU dạng
 * `{count, plural, …}` ném lỗi trong `intl-messageformat`, và `use-intl` bắt lỗi rồi in ra
 * ĐƯỜNG DẪN KHOÁ — người dùng thấy `Marketplace.available.count` thay vì `(49 xe)`. Khoá không
 * plural vẫn hiện đúng, nên lỗi trông như "vài chỗ chưa dịch" chứ không như một API thiếu.
 *
 * **Thứ tự import là bắt buộc** và không được sắp lại cho "gọn": mỗi polyfill dựng trên cái
 * trước nó (`locale` cần `getCanonicalLocales`, `datetimeformat` cần `numberformat`).
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

import { appTimeZoneWorks } from './app-time-zone';

/*
 * Runtime nào đổi múi giờ đúng (trình duyệt, iOS) thì KHÔNG đụng vào `Intl` của nó.
 *
 * Chỉ khi phép thử ở trên trượt mới thay bằng bản của formatjs — và phải theo đúng thứ tự
 * **cài lớp trước, gắn dữ liệu sau**: hai file dữ liệu tự bỏ qua nếu lớp formatjs chưa được cài,
 * nên gắn trước thì chúng thành no-op và bản thay thế chạy không có múi giờ nào — đúng cái lỗi
 * "offset 0" mà lần thử `polyfill-force` trước đây vấp phải.
 *
 * `require` chứ không `import`: cần chạy CÓ ĐIỀU KIỆN. Metro vẫn gói tĩnh mọi `require` nên
 * không có chuyện tải động lúc chạy.
 */
if (!appTimeZoneWorks()) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('@formatjs/intl-datetimeformat/polyfill-force');
  require('@formatjs/intl-datetimeformat/locale-data/vi');
  require('@formatjs/intl-datetimeformat/locale-data/en');
  // Bảng múi giờ: KHÔNG có nó thì `timeZone: 'Asia/Ho_Chi_Minh'` ném RangeError. Bản `golden`
  // có đủ các vùng phổ biến (đã kiểm: chứa `Asia/Ho_Chi_Minh`) và nhẹ hơn `add-all-tz` nhiều.
  require('@formatjs/intl-datetimeformat/add-golden-tz');
  /* eslint-enable @typescript-eslint/no-require-imports */
}
