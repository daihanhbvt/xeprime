import { dayjs } from '@xeprime/domain';
import { APP_TIME_ZONE_ID } from './app-time-zone';

/**
 * # VÁ `.tz()` CỦA DAY.JS — CHỈ CHO APP NATIVE
 *
 * ## App làm GIỐNG HỆT web, và đó chính là vấn đề
 *
 * Backend trả mốc thời gian dạng ISO-8601 UTC. Web và app cùng gọi đúng một hàm dùng chung
 * `toAppTz` ở `@xeprime/domain`, và hàm đó là `dayjs(value).tz('Asia/Ho_Chi_Minh')`. Không có
 * chỗ nào app tự nghĩ ra cách khác.
 *
 * Lỗi không nằm ở dữ liệu của backend, cũng không nằm ở logic của repo này. Nó nằm ở **động cơ
 * JavaScript**. Đây là thân thật của `.tz()` trong `dayjs/plugin/timezone`:
 *
 * ```js
 * u = a.toLocaleString('en-US', { timeZone: t })   // "8/31/2026, 12:00:00 AM"
 * f = Math.round((a - new Date(u)) / 1000 / 60)    // ← PHÂN TÍCH LẠI chuỗi vừa in ra
 * s = 15 * -Math.round(a.getTimezoneOffset() / 15) - f
 * if (!Number(s)) n = this.utcOffset(0, e)         // ← rơi về UTC
 * ```
 *
 * Nó in ra một chuỗi kiểu Mỹ rồi `new Date()` chuỗi đó. **V8 (trình duyệt) và Node phân tích
 * được; Hermes thì không** — bộ phân tích `Date` của Hermes chỉ hiểu ISO-8601. Nên `f` là `NaN`,
 * `s` là `NaN`, `!Number(NaN)` đúng, và offset rơi về 0. **Không một lỗi nào được ném ra.**
 *
 * Vì thế: cùng code, cùng dữ liệu backend, web đúng mà app lệch đúng 7 tiếng. Và mọi test chạy
 * trên Node đều xanh, kể cả test so kết quả — chúng chạy trên chính động cơ phân tích được chuỗi.
 *
 * ## Vì sao vá ở tầng PLUGIN, không phải viết một `toAppTz` riêng cho app
 *
 * Một `toAppTz` riêng chỉ chữa được những chỗ app tự gọi. Nhưng `buildBusyDayIndex`,
 * `holidaySyncWindow`, `buildPeriodRange`… trong `@xeprime/domain` cũng gọi `.tz()` bên trong, và
 * app dùng lại nguyên các hàm đó. Vá `Dayjs.prototype.tz` thì mọi lời gọi trong tiến trình này
 * đều đúng, kể cả lời gọi nằm sâu trong package dùng chung — mà **không một dòng nào của
 * `packages/domain`, `apps/web` hay `apps/api` bị đụng**. Bản vá của một runtime hỏng thuộc về
 * nơi runtime đó chạy.
 *
 * ## Cách đo offset
 *
 * `Intl.DateTimeFormat(...).formatToParts` — đọc thẳng con số đồng hồ treo tường ở múi giờ đích
 * rồi trừ mốc tuyệt đối. Không có bước phân tích chuỗi nào, nên nó không vấp chỗ Hermes vấp.
 * (Chính dayjs cũng dùng cách này cho hàm TĨNH `dayjs.tz(...)`; chỉ phương thức instance mới đi
 * đường `toLocaleString`.)
 *
 * **Đính chính:** có lúc tôi kết luận Hermes không nhận tên vùng `Asia/Ho_Chi_Minh`, dựa trên một
 * `RangeError: Invalid timezone name!`. Sai. Chẩn đoán trên máy thật cho thấy `Intl` native của
 * Hermes nhận tên vùng đó bình thường; lỗi kia là do một giá trị `true` lọt vào vị trí tên vùng
 * (xem ghi chú "khoan dung" trong thân hàm).
 *
 * `FALLBACK_OFFSET_MINUTES` chỉ là lưới an toàn cho máy có `Intl` thiếu bảng múi giờ: Việt Nam là
 * UTC+7 và không có giờ mùa hè, liên tục từ 13/06/1975. Nó KHÔNG phải đường chính, và
 * `dayjs-timezone-fix.test.ts` đối chiếu nó với `Intl` của Node để nó không lệch trong im lặng.
 *
 * Nạp NGAY sau `intl-polyfill` ở `app/_layout.tsx`, trước màn hình đầu tiên.
 */

/**
 * Offset dùng khi `Intl` không trả lời được.
 *
 * Sai với mốc trước 13/06/1975 (lúc đó Việt Nam là UTC+8). Sản phẩm không có nghiệp vụ nào chạm
 * tới những ngày đó — đơn thuê, lịch xe và ngày lễ đều ở hiện tại hoặc tương lai.
 */
export const FALLBACK_OFFSET_MINUTES = 420;

/** Bộ định dạng đo offset, dựng một lần — `new Intl.DateTimeFormat` là hàm đắt nhất của `Intl`. */
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (formatters.has(timeZone)) return formatters.get(timeZone) ?? null;

  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    // Máy không có bảng múi giờ ⇒ nhớ lại là "không dùng được", đừng thử lại mỗi lần gọi.
    formatter = null;
  }

  formatters.set(timeZone, formatter);
  return formatter;
}

/** Chênh lệch (phút) giữa `timeZone` và UTC tại một mốc. */
function offsetMinutes(instant: number, timeZone: string): number {
  const formatter = formatterFor(timeZone);
  if (!formatter) return FALLBACK_OFFSET_MINUTES;

  const parts = formatter.formatToParts(new Date(instant));
  const num = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  const wallClockAsUtc = Date.UTC(
    num('year'),
    num('month') - 1,
    num('day'),
    num('hour'),
    num('minute'),
    num('second'),
  );
  if (Number.isNaN(wallClockAsUtc)) return FALLBACK_OFFSET_MINUTES;

  // Bỏ mili-giây ở vế kia: `formatToParts` chỉ tới giây, giữ ms lại làm phép chia lệch.
  return Math.round((wallClockAsUtc - (instant - (instant % 1000))) / 60_000);
}

/**
 * Kêu MỘT lần cho mỗi giá trị vùng lạ, kèm stack của nơi gọi.
 *
 * Một lần là đủ để lần ra thủ phạm; kêu mỗi lần thì `isBefore` trong một vòng lặp sẽ đổ hàng
 * nghìn dòng và che mất mọi log khác. Chỉ chạy ở bản dev.
 */
const warnedZones = new Set<string>();

function warnUnknownZone(timeZone: unknown): void {
  if (!__DEV__) return;
  const key = String(timeZone);
  if (warnedZones.has(key)) return;
  warnedZones.add(key);
  console.warn(
    `[dayjs.tz] vùng lạ: ${key} (${typeof timeZone}) — dùng ${APP_TIME_ZONE_ID} thay thế.`,
    new Error('nơi gọi').stack,
  );
}

/** Hình dạng tối thiểu của một `Dayjs` mà bản vá cần đụng tới. */
interface PatchableDayjs {
  valueOf: () => number;
  utcOffset: ((offset: number) => PatchableDayjs) & (() => number);
  add: (value: number, unit: 'minute') => PatchableDayjs;
  $x?: { $timezone?: string };
}

/**
 * Thay `Dayjs.prototype.tz` bằng bản đo offset qua `formatToParts`.
 *
 * Giữ nguyên hợp đồng của bản gốc, gồm cả `keepLocalTime`: `d.tz(zone)` giữ MỐC và đổi cách đọc
 * đồng hồ; `d.tz(zone, true)` giữ cách đọc đồng hồ và đổi MỐC. Vẫn gắn `$x.$timezone` vì `startOf`
 * của chính plugin đó đọc trường này — bỏ đi thì `startOf('day')` trên một mốc đã quy đổi sẽ cắt
 * theo nửa đêm của MÁY chứ không phải nửa đêm Việt Nam.
 */
export function patchDayjsTimezone(): void {
  const proto = (dayjs as unknown as { prototype: Record<string, unknown> }).prototype;

  proto.tz = function tz(
    this: PatchableDayjs,
    timeZone?: unknown,
    keepLocalTime?: boolean,
  ): PatchableDayjs {
    /*
     * KHOAN DUNG với đối số vùng, KHÔNG ném lỗi.
     *
     * Trên máy thật, `.tz()` có lúc nhận `true` ở vị trí tên vùng — không phải từ code của repo
     * này (mọi lời gọi ở `packages/domain` và `apps/mobile` đều truyền `APP_TIME_ZONE`), mà từ
     * chính plugin: `isBefore` → `endOf` → `startOf`, và `startOf` chuyển tiếp `$x.$timezone`.
     *
     * Bản trước ném lỗi ở đây, biến một đối số lạ thành MÀN HÌNH TRẮNG giữa luồng đặt xe — tệ hơn
     * hẳn bệnh nó định chữa. Bản gốc của plugin vốn khoan dung (`void 0 === t && (t = r)`); giữ
     * đúng tinh thần đó: thứ gì không phải chuỗi thì coi như "không truyền vùng". App chỉ có MỘT
     * vùng hiển thị nên đó luôn là câu trả lời đúng.
     *
     * Vẫn kêu một tiếng trong dev: nuốt im lặng là cách chắc chắn để nó quay lại.
     */
    const zone = typeof timeZone === 'string' ? timeZone : APP_TIME_ZONE_ID;
    if (typeof timeZone !== 'string' && timeZone !== undefined) warnUnknownZone(timeZone);

    const previousOffset = this.utcOffset();
    let next = this.utcOffset(offsetMinutes(this.valueOf(), zone));

    if (keepLocalTime) {
      next = next.add(previousOffset - next.utcOffset(), 'minute');
    }

    next.$x = { ...next.$x, $timezone: zone };
    return next;
  };
}
