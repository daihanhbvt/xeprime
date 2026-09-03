import { APP_TIME_ZONE, dayjs as domainDayjs, toAppTz } from '@xeprime/domain';
import { FALLBACK_OFFSET_MINUTES, patchDayjsTimezone } from './dayjs-timezone-fix';

/*
 * Bản `.d.ts` của domain xuất `dayjs` với kiểu GỐC — phần augmentation của plugin `utc`/`timezone`
 * không đi qua ranh giới package, nên `.tz`/`.utc` vô hình với TypeScript dù có thật lúc chạy.
 * Đây đúng là thứ test này đo, nên phải khai kiểu tay thay vì `any` cho xong.
 */
interface Tzd {
  format: (pattern: string) => string;
  utcOffset: () => number;
  toISOString: () => string;
}
interface TzDayjs {
  (iso: string): { tz: (zone: string, keepLocalTime?: boolean) => Tzd };
  utc: (iso: string) => { tz: (zone: string, keepLocalTime?: boolean) => Tzd };
}
const dayjs = domainDayjs as unknown as TzDayjs;

/**
 * Bản vá thay `Dayjs.prototype.tz` cho CẢ tiến trình, kể cả những lời gọi nằm sâu trong
 * `@xeprime/domain`. Sai một chút là mọi mốc thời gian trong app lệch — và lệch âm thầm.
 *
 * Node phân tích được chuỗi `toLocaleString('en-US')` nên bản GỐC cũng cho ra đúng số ở đây; test
 * chỉ so kết quả sẽ xanh cả trước lẫn sau khi vá, tức vô dụng. Vì thế phải khoá theo **CÁCH LÀM**:
 * bản vá không được chạm vào `toLocaleString` — đó chính là đường Hermes làm hỏng.
 */
describe('patchDayjsTimezone', () => {
  beforeAll(() => {
    patchDayjsTimezone();
  });

  it('đổi đúng sang giờ Việt Nam ở cả hai phía nửa đêm UTC', () => {
    // 17:00Z ngày 30/08 = 00:00 ngày 31/08 giờ VN (UTC+7) — đúng quãng xe bận đã hiện sai.
    expect(dayjs('2026-08-30T17:00:00.000Z').tz(APP_TIME_ZONE).format('DD/MM HH:mm')).toBe(
      '31/08 00:00',
    );
    expect(dayjs('2026-08-31T01:00:00.000Z').tz(APP_TIME_ZONE).format('DD/MM HH:mm')).toBe(
      '31/08 08:00',
    );
  });

  it('offset luôn +420 phút — Việt Nam không có giờ mùa hè', () => {
    expect(dayjs('2026-06-15T12:00:00.000Z').tz(APP_TIME_ZONE).utcOffset()).toBe(420);
    expect(dayjs('2026-12-15T12:00:00.000Z').tz(APP_TIME_ZONE).utcOffset()).toBe(420);
  });

  it('`keepLocalTime` giữ mặt đồng hồ và đổi MỐC', () => {
    // 10:00 (UTC) đọc lại như 10:00 giờ VN ⇒ mốc lùi 7 tiếng, thành 03:00Z.
    const kept = dayjs.utc('2026-08-31T10:00:00.000Z').tz(APP_TIME_ZONE, true);
    expect(kept.format('DD/MM HH:mm')).toBe('31/08 10:00');
    expect(kept.toISOString()).toBe('2026-08-31T03:00:00.000Z');
  });

  it('hằng offset khớp với bảng múi giờ THẬT của Intl', () => {
    /*
     * Bản vá cộng một hằng thay vì tra bảng múi giờ — vì `Intl` native của Hermes từ chối tên
     * vùng `Asia/Ho_Chi_Minh`. Node thì có bảng đầy đủ, nên đây là chỗ DUY NHẤT đối chiếu được
     * con số đó với sự thật. Nó lệch là test đỏ, không phải người dùng phát hiện.
     */
    const probe = new Date('2026-08-30T17:00:00.000Z');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(probe);
    const at = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);

    const wallClockAsUtc = Date.UTC(
      at('year'),
      at('month') - 1,
      at('day'),
      at('hour'),
      at('minute'),
      at('second'),
    );
    expect((wallClockAsUtc - probe.getTime()) / 60_000).toBe(FALLBACK_OFFSET_MINUTES);
  });

  it('KHÔNG gọi `Date.prototype.toLocaleString` — đó là đường Hermes làm hỏng', () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleString');
    try {
      expect(dayjs('2026-08-30T17:00:00.000Z').tz(APP_TIME_ZONE).format('HH:mm')).toBe('00:00');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('chữa luôn các hàm của `@xeprime/domain` gọi `.tz()` bên trong', () => {
    /*
     * Đây là lý do phải vá ở tầng plugin thay vì viết một `toAppTz` riêng cho app: `toAppTz`,
     * `buildBusyDayIndex`, `holidaySyncWindow`… đều nằm trong package dùng chung và app gọi lại
     * nguyên chúng. Vá prototype thì chúng đúng theo, mà không một dòng nào của web/api bị đụng.
     */
    expect(toAppTz('2026-08-30T17:00:00.000Z').format('DD/MM HH:mm')).toBe('31/08 00:00');
  });
});
