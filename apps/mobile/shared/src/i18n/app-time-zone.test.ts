import { APP_TIME_ZONE, toAppTz } from '@xeprime/domain';
import { APP_TIME_ZONE_ID, appTimeZoneWorks } from './app-time-zone';

/**
 * Phép thử này quyết định app có thay `Intl.DateTimeFormat` hay không. Nó sai thì hoặc app giữ
 * một runtime hỏng (mọi mốc lệch 7 tiếng), hoặc thay một runtime đang chạy tốt — cả hai đều
 * không ném lỗi nào, nên phải khoá lại bằng test.
 */
describe('appTimeZoneWorks', () => {
  const real = Intl.DateTimeFormat;
  afterEach(() => {
    Intl.DateTimeFormat = real;
  });

  it('nhận ra runtime đổi được múi giờ Việt Nam', () => {
    // Node có ICU đầy đủ — cũng là runtime của trình duyệt và của iOS.
    expect(appTimeZoneWorks()).toBe(true);
  });

  it('bắt đúng ca hỏng: `timeZone` bị lờ đi ⇒ giờ ra theo UTC', () => {
    // Hermes-không-ICU: CÓ `Intl.DateTimeFormat`, nhận option, nhưng bỏ qua `timeZone`.
    Intl.DateTimeFormat = ((locales?: string, options?: Intl.DateTimeFormatOptions) =>
      new real(locales, { ...options, timeZone: 'UTC' })) as unknown as typeof Intl.DateTimeFormat;

    expect(appTimeZoneWorks()).toBe(false);
  });

  it('bắt ca múi giờ không được hỗ trợ (ném RangeError)', () => {
    Intl.DateTimeFormat = (() => {
      throw new RangeError('Unsupported time zone');
    }) as unknown as typeof Intl.DateTimeFormat;

    expect(appTimeZoneWorks()).toBe(false);
  });
});

describe('mốc thử khớp với múi giờ của sản phẩm', () => {
  /*
   * `app-time-zone.ts` viết thẳng chuỗi múi giờ vì nó là mã khởi động, không kéo package domain
   * vào. Đây là chỗ DUY NHẤT buộc hai giá trị đó bằng nhau.
   */
  it('dùng đúng múi giờ mà `@xeprime/domain` quy định', () => {
    expect(APP_TIME_ZONE_ID).toBe(APP_TIME_ZONE);
  });

  it('`2026-08-30T17:00Z` đúng là 00:00 ngày 31/08 theo giờ sản phẩm', () => {
    expect(toAppTz('2026-08-30T17:00:00.000Z').format('DD/MM HH:mm')).toBe('31/08 00:00');
  });
});
