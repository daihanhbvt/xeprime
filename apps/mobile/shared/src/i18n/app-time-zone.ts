/**
 * Múi giờ hiển thị của sản phẩm, và phép thử "runtime này có đổi được múi giờ không".
 *
 * File RIÊNG, không có một `import` phụ tác nào: `intl-polyfill.ts` phải hỏi nó TRƯỚC khi quyết
 * định cài polyfill, mà bản thân nó thì phải test được mà không kéo cả chuỗi `@formatjs/*` vào.
 *
 * Chuỗi múi giờ viết thẳng thay vì import `APP_TIME_ZONE` từ `@xeprime/domain`: đây là mã KHỞI
 * ĐỘNG, chạy trước mọi thứ khác, và kéo cả package domain vào chỉ để lấy một hằng là đưa nửa app
 * vào đường khởi động. `app-time-zone.test.ts` khoá hai giá trị bằng nhau.
 */
export const APP_TIME_ZONE_ID = 'Asia/Ho_Chi_Minh';

/**
 * Runtime này có THỰC SỰ đổi được múi giờ không.
 *
 * Hỏi "nó có ra ĐÚNG SỐ không", chứ không hỏi "có `Intl.DateTimeFormat` không". Hai câu đó khác
 * nhau, và `@formatjs/intl-datetimeformat/polyfill` (bản dò tính năng) chỉ trả lời được câu sau:
 * thấy Hermes CÓ một `Intl.DateTimeFormat` là nó không cài gì cả. Mà `locale-data/*.js` và
 * `add-golden-tz.js` đều mở đầu bằng `if (… Intl.DateTimeFormat.__addLocaleData)` /
 * `if (… __addTZData)` — hai hàm đó chỉ tồn tại trên lớp CỦA formatjs. Không cài thì hai file dữ
 * liệu thành no-op và bảng múi giờ không bao giờ được nạp.
 *
 * **Đây KHÔNG phải nguyên nhân của vụ lệch 7 tiếng đã gặp.** Máy thử có `Intl` đủ tốt
 * (`appTimeZoneWorks()` trả `true`); thủ phạm là phương thức `.tz()` của plugin timezone Day.js —
 * xem `toAppTz` ở `packages/domain/src/datetime.ts`.
 *
 * Nhưng phép thử này càng cần thiết SAU khi sửa: `toAppTz` giờ đo offset bằng
 * `Intl.DateTimeFormat(...).formatToParts` với `timeZone`, tức nó ĐẶT CƯỢC vào đúng khả năng
 * đang được kiểm ở đây. Máy nào không có thì phải thay `Intl` trước khi màn hình đầu tiên render.
 *
 * Mốc thử `2026-08-30T17:00:00Z` = đúng `00:00 ngày 31/08` ở UTC+7. Phải so CẢ ngày lẫn giờ —
 * chỉ so giờ thì một runtime lệch tròn 24h vẫn lọt.
 */
export function appTimeZoneWorks(): boolean {
  try {
    /*
     * Bộ option ĐẦY ĐỦ, không phải bộ tối thiểu.
     *
     * Bản trước chỉ xin `day` + `hour`. `Intl` native của Hermes NHẬN bộ đó cho
     * `Asia/Ho_Chi_Minh` — nên phép thử báo "chạy được" và polyfill không được cài — rồi TỪ CHỐI
     * cùng tên vùng đó khi bị hỏi kèm `year/month/minute/second`:
     *
     *   RangeError: com.facebook.hermes.intl.JSRangeErrorException: Invalid timezone name!
     *
     * Một runtime nói hai câu khác nhau cho cùng một tên vùng, nên phép thử phải hỏi đúng bộ
     * option mà `use-intl` và Day.js thật sự dùng, nếu không nó chỉ chứng minh được một nửa.
     */
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIME_ZONE_ID,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date('2026-08-30T17:00:00.000Z'));

    const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;

    return valueOf('day') === '31' && valueOf('hour') === '00';
  } catch {
    // `RangeError: Invalid timezone name!` — cũng là "không dùng được".
    return false;
  }
}
