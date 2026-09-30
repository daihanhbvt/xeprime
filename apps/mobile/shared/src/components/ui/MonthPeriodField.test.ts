import { dayjs } from '@xeprime/domain';
import { monthPeriodOptions, shiftMonthPeriod } from './MonthPeriodField';

const label = (month: dayjs.Dayjs) => month.format('MM/YYYY');

describe('shiftMonthPeriod', () => {
  it('lùi / tiến một kỳ, kể cả qua năm', () => {
    expect(shiftMonthPeriod('2026-09', -1)).toBe('2026-08');
    expect(shiftMonthPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthPeriod('2025-12', 1)).toBe('2026-01');
  });
});

describe('monthPeriodOptions', () => {
  const now = dayjs('2026-09-25T10:00:00');

  it('12 kỳ gần nhất, mới nhất đứng đầu', () => {
    const options = monthPeriodOptions('2026-09', now, label);
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ value: '2026-09', label: '09/2026' });
    expect(options[11]).toEqual({ value: '2025-10', label: '10/2025' });
  });

  /*
   * Kỳ cũ hơn tới được bằng nút ‹ (web chọn được mọi tháng) — ô chọn phải hiện ĐÚNG kỳ đó, không
   * hiện trống trong khi bảng bên dưới đang là kỳ đó.
   */
  it('kỳ đang chọn nằm NGOÀI 12 kỳ gần nhất thì được thêm lên đầu', () => {
    const options = monthPeriodOptions('2024-01', now, label);
    expect(options).toHaveLength(13);
    expect(options[0]).toEqual({ value: '2024-01', label: '01/2024' });
  });
});
