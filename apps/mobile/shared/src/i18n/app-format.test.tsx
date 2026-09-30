import { renderHook } from '@testing-library/react-native';
import { dayjs, nowInAppTz, toAppTz } from '@xeprime/domain';
import { withIntl } from './test-utils';
import { useAppFormat } from './use-app-format';

/**
 * Canh phần hiển thị MỐC THUÊ.
 *
 * Có test này vì lỗi đã xảy ra thật hai lần, và cả hai lần đều im lặng — không exception, chỉ
 * là con số sai:
 *
 *   1. Dùng nhầm `shortDateTime` (`10:00 · 26/08`) trong khi web dùng `rentalPoint`
 *      (`T4, 26/08 · 10:00`) cho đúng ô này — thiếu THỨ và đảo thứ tự ngày/giờ.
 *   2. `polyfill-force` của `@formatjs` thay cả `Intl` gốc, làm plugin timezone của Day.js đọc
 *      ra offset 0 nên mọi mốc lệch 7 tiếng.
 *
 * Giá trị kỳ vọng lấy từ chính web: `RentalDateTimeRangeField` gọi `fmt.rentalPoint(d)`.
 */
// RNTL v14: `renderHook` là async — thiếu `await` thì `result` chưa tồn tại.
async function format() {
  const { result } = await renderHook(() => useAppFormat(), {
    wrapper: ({ children }) => withIntl(children),
  });
  return result.current;
}

describe('useAppFormat — mốc thuê', () => {
  it('rentalPoint cho ra "T4, 26/08 · 10:00" như web', async () => {
    // 26/08/2026 là thứ Tư; Day.js `day()` trả 3 → khoá `Common.weekdayShort.3` = "T4".
    const point = dayjs('2026-08-26T10:00:00+07:00');
    expect((await format()).rentalPoint(point)).toBe('T4, 26/08 · 10:00');
  });

  it('bỏ phần giờ khi withTime = false — dùng cho thanh tìm kiếm thu gọn', async () => {
    const point = dayjs('2026-08-29T10:00:00+07:00');
    expect((await format()).rentalPoint(point, { withTime: false })).toBe('T7, 29/08');
  });

  it('toAppTz quy chuỗi UTC về giờ Việt Nam, không giữ nguyên giờ UTC', async () => {
    // Đây là mốc mà app gửi lên API cho khoảng thuê mặc định (10:00 giờ VN).
    const converted = toAppTz('2026-08-26T03:00:00.000Z');

    expect(converted.format('HH:mm')).toBe('10:00');
    expect((await format()).shortDateTime('2026-08-26T03:00:00.000Z')).toBe('10:00 · 26/08');
  });
});

/**
 * Nhãn mốc của biểu đồ.
 *
 * Bản đầy đủ `Tháng 9 năm 2026` dài gấp ba bề rộng một dải trên màn 390dp và bị cắt thành
 * `Tháng…` — nhãn mất đúng phần nói ra nó là tháng nào. Hai hàm, hai vai: trục lấy bản ngắn, thẻ
 * chi tiết giữ bản đầy đủ của web.
 */
describe('useAppFormat — nhãn mốc biểu đồ', () => {
  it('monthYearShort cho ra 09/2026, không phải "Tháng 9 năm 2026"', async () => {
    expect((await format()).monthYearShort(new Date('2026-09-01T12:00:00Z'))).toBe('09/2026');
  });

  it('bản đầy đủ vẫn là chuỗi của web, cho thẻ chi tiết', async () => {
    expect((await format()).monthYear(new Date('2026-09-01T12:00:00Z'))).toBe('Tháng 9 năm 2026');
  });

  it('lấy trưa UTC nên mốc không rơi sang tháng khác vì lệch múi giờ', async () => {
    // 31/12 trưa UTC = 31/12 19:00 giờ VN — vẫn tháng 12, không nhảy sang tháng 1 năm sau.
    expect((await format()).monthYearShort(new Date('2026-12-31T12:00:00Z'))).toBe('12/2026');
  });
});

/**
 * Dòng tóm tắt khoảng thuê — canh đúng thứ web đổi: GIỜ NHẬN phải nằm trong dòng.
 *
 * Bản cũ in hai ngày lịch rồi đếm ngày bằng phép trừ, nên hai chuyến rất khác nhau đọc ra giống
 * nhau. Giá trị kỳ vọng lấy từ chính web (`fmt.rentalRangeSummary`).
 *
 * Hai mốc dựng theo NĂM HIỆN TẠI, không gõ cứng: hàm chỉ in năm khi khoảng thuê nằm ngoài năm
 * đang chạy, nên một cặp ngày gõ cứng 2026 sẽ tự đỏ vào ngày 01/01/2027 — đúng cái bẫy mà
 * `rental-range-memory.test.ts` đã dính một lần.
 */
const YEAR = nowInAppTz().year();

describe('useAppFormat — tóm tắt khoảng thuê', () => {
  it('in NGÀY + GIỜ cả hai đầu kèm thời lượng', async () => {
    const from = dayjs(`${YEAR}-09-14T17:00:00+07:00`);
    const to = dayjs(`${YEAR}-09-15T17:00:00+07:00`);

    expect((await format()).rentalRangeSummary(from, to)).toBe(
      '14/09 17:00 → 15/09 17:00 (1 ngày)',
    );
  });

  it('thuê trong CÙNG một ngày vẫn phân biệt được nhờ giờ', async () => {
    const from = dayjs(`${YEAR}-09-14T09:00:00+07:00`);
    const to = dayjs(`${YEAR}-09-14T23:00:00+07:00`);

    expect((await format()).rentalRangeSummary(from, to)).toBe(
      '14/09 09:00 → 14/09 23:00 (14 giờ)',
    );
  });

  it('mốc gọn bỏ THỨ, khác rentalPoint', async () => {
    const point = dayjs('2026-08-26T10:00:00+07:00');
    expect((await format()).rentalPointCompact(point)).toBe('26/08 10:00');
    expect((await format()).rentalPointCompact(point, { withYear: true })).toBe('26/08/2026 10:00');
  });
});
