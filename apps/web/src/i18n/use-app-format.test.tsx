import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dayjs } from '@/lib/datetime';
import { intlWrapper } from './test-utils';
import { useAppFormat } from './use-app-format';

/**
 * Cửa DUY NHẤT sinh chuỗi hiển thị từ dữ liệu. Test này khoá hai điều cùng lúc:
 *
 *   1. Đổi ngôn ngữ ĐỔI cách đọc (dấu phân tách, thứ tự ngày/tháng, chữ đơn vị).
 *   2. Đổi ngôn ngữ KHÔNG đổi GIÁ TRỊ — vẫn đồng, vẫn giờ Việt Nam, vẫn đúng con số đó.
 *
 * Điều thứ hai mới là điều dễ vỡ: một `Intl.NumberFormat` đặt sai chỗ là đủ để `12.750.000`
 * thành `12,750,000.00 US$`.
 */
function format(locale: 'vi' | 'en') {
  return renderHook(() => useAppFormat(), { wrapper: intlWrapper(locale) }).result.current;
}

describe('tiền', () => {
  it('đổi dấu phân tách theo ngôn ngữ, giữ nguyên đơn vị đồng', () => {
    expect(format('vi').money('12750000')).toBe('12.750.000 ₫');
    expect(format('en').money('12750000')).toBe('12,750,000 ₫');
  });

  it('không đi qua Number — số 14 chữ số vẫn nguyên vẹn từng chữ số', () => {
    // 2^53 ≈ 9,007e15; số này lớn hơn ngưỡng an toàn của float.
    expect(format('vi').money('99999999999999')).toBe('99.999.999.999.999 ₫');
    expect(format('en').money('99999999999999')).toBe('99,999,999,999,999 ₫');
  });

  it('rỗng/null ra dấu gạch, không ra "0 ₫"', () => {
    expect(format('vi').money(null)).toBe('—');
    expect(format('en').money('')).toBe('—');
  });

  it('rút gọn dùng bậc đọc của từng ngôn ngữ, cùng một ngưỡng', () => {
    expect(format('vi').moneyCompact('12750000')).toBe('12,7tr');
    expect(format('en').moneyCompact('12750000')).toBe('12.7M');
    expect(format('vi').moneyCompact('2500000000')).toBe('2,5tỷ');
    expect(format('en').moneyCompact('2500000000')).toBe('2.5B');
  });

  it('giá theo ngày: hậu tố dịch, con số giữ nguyên', () => {
    expect(format('vi').pricePerDay('800000')).toBe('800.000 ₫/ngày');
    expect(format('en').pricePerDay('800000')).toBe('800,000 ₫/day');
  });

  it('không có giá = MIỄN PHÍ, không phải "chưa có"', () => {
    expect(format('vi').pricePerHour(null)).toBe('Miễn phí');
    expect(format('en').pricePerHour(null)).toBe('Free');
  });
});

describe('ngày giờ', () => {
  // 01:00Z = 08:00 giờ Việt Nam.
  const iso = '2026-08-17T01:00:00.000Z';

  /**
   * Khẳng định TOÀN BỘ chuỗi, không `toContain`.
   *
   * Bản trước chỉ kiểm `toContain('08:00')` và vì thế mù với thứ tự — nó vẫn xanh khi CLDR `vi`
   * đảo thành `08:00 17/08/2026` (giờ đứng trước ngày), tức là mù đúng với hồi quy mà nó phải
   * canh. Ngày-trước-giờ và đồng hồ 24 giờ đều là quy ước đã chốt của sản phẩm.
   */
  it('ngày ĐỨNG TRƯỚC giờ, đồng hồ 24 giờ, và luôn là giờ Việt Nam', () => {
    expect(format('vi').dateTime(iso)).toBe('17/08/2026 08:00');
    expect(format('en').dateTime(iso)).toBe('08/17/2026 08:00');
  });

  it('khoảng ngày giờ dùng lại đúng cách đọc đó ở hai đầu', () => {
    const to = '2026-08-18T07:30:00.000Z';
    expect(format('vi').dateTimeRange(iso, to)).toBe('17/08/2026 08:00 → 18/08/2026 14:30');
    expect(format('en').dateTimeRange(iso, to)).toBe('08/17/2026 08:00 → 08/18/2026 14:30');
  });

  it('giờ đơn lẻ cũng 24 giờ — không có AM/PM lạc giữa các ô 24 giờ khác', () => {
    const afternoon = '2026-08-17T07:30:00.000Z';
    expect(format('vi').time(afternoon)).toBe('14:30');
    expect(format('en').time(afternoon)).toBe('14:30');
  });

  it('thứ tự ngày/tháng theo quy ước của ngôn ngữ', () => {
    expect(format('vi').date(iso)).toBe('17/08/2026');
    expect(format('en').date(iso)).toBe('08/17/2026');
  });

  it('ngày lịch YYYY-MM-DD không bị múi giờ kéo lùi một ngày', () => {
    expect(format('vi').dateKey('2026-01-01')).toBe('01/01/2026');
    expect(format('en').dateKey('2026-01-01')).toBe('01/01/2026');
  });

  it('thứ viết tắt theo ngôn ngữ', () => {
    // 2026-08-09 là Chủ nhật.
    expect(format('vi').weekdayShort(dayjs('2026-08-09T10:00:00'))).toBe('CN');
    expect(format('en').weekdayShort(dayjs('2026-08-09T10:00:00'))).toBe('Sun');
  });

  it('mốc thuê có THỨ và giờ, không có năm', () => {
    const point = format('vi').rentalPoint(dayjs('2026-08-08T10:00:00'));
    expect(point).toBe('T7, 08/08 · 10:00');
    expect(point).not.toContain('2026');
    expect(format('vi').rentalPoint(dayjs('2026-08-09T10:00:00'), { withTime: false })).toBe(
      'CN, 09/08',
    );
  });
});

describe('thời lượng thuê', () => {
  const at = (iso: string) => dayjs(iso);

  it('số nhiều tiếng Anh đúng dạng, tiếng Việt không đổi', () => {
    expect(format('vi').rentalDuration(at('2026-08-08T10:00'), at('2026-08-09T10:00'))).toBe(
      '1 ngày',
    );
    expect(format('en').rentalDuration(at('2026-08-08T10:00'), at('2026-08-09T10:00'))).toBe(
      '1 day',
    );
    expect(format('en').rentalDuration(at('2026-08-08T10:00'), at('2026-08-10T10:00'))).toBe(
      '2 days',
    );
  });

  it('ngày lẻ giờ', () => {
    expect(format('vi').rentalDuration(at('2026-08-08T10:00'), at('2026-08-10T13:00'))).toBe(
      '2 ngày 3 giờ',
    );
    expect(format('en').rentalDuration(at('2026-08-08T10:00'), at('2026-08-10T13:00'))).toBe(
      '2 days 3 hours',
    );
  });
});

describe('quãng đường', () => {
  it('thiếu số thì nói CHƯA CÓ, không bịa 0 km', () => {
    expect(format('vi').km(null)).toBe('Chưa có');
    expect(format('en').km(null)).toBe('Not recorded');
    expect(format('vi').km(45230)).toBe('45.230 km');
    expect(format('en').km(45230)).toBe('45,230 km');
  });

  it('mốc bảo dưỡng nói rõ còn hay đã vượt', () => {
    expect(format('vi').remainingKm(2000)).toBe('Còn 2.000 km');
    expect(format('en').remainingKm(2000)).toBe('2,000 km left');
    expect(format('vi').remainingKm(-500)).toBe('Quá hạn 500 km');
    expect(format('en').remainingKm(-500)).toBe('500 km overdue');
    expect(format('vi').remainingKm(null)).toBe('Chưa đủ dữ liệu');
    expect(format('en').remainingKm(null)).toBe('Not enough data');
  });
});

describe('thuê dài hạn (ADR 0011)', () => {
  it('nhãn gói là SỐ THÁNG, không quy ra ngày', () => {
    expect(format('vi').packageLabel(9)).toBe('9 tháng');
    expect(format('en').packageLabel(9)).toBe('9 months');
    expect(format('en').packageLabel(1)).toBe('1 month');
    expect(format('vi').packageLabel(null)).toBeNull();
  });

  it('nguyện vọng nhận xe: ngày cụ thể', () => {
    const wish = { pickupPreference: 'specific_date', requestedPickupDate: '2026-09-01' };
    expect(format('vi').pickupWish(wish)).toBe('Chọn ngày cụ thể: 01/09/2026');
    expect(format('en').pickupWish(wish)).toBe('Pick a specific date: 09/01/2026');
  });

  it('nguyện vọng nhận xe: khoảng 7 ngày', () => {
    const wish = {
      pickupPreference: 'within_7_days',
      pickupWindowStartDate: '2026-09-01',
      pickupWindowEndDate: '2026-09-07',
    };
    expect(format('vi').pickupWish(wish)).toBe('Trong 7 ngày tới: 01/09 – 07/09/2026');
    expect(format('en').pickupWish(wish)).toBe('Within the next 7 days: 09/01 – 09/07/2026');
  });

  it('yêu cầu cũ thiếu nguyện vọng: nói gian hàng sẽ chốt, không bịa một ngày', () => {
    expect(format('vi').pickupWish({})).toBe('Gian hàng chốt ngày giờ nhận khi duyệt');
    expect(format('en').pickupWish({})).toBe(
      'The shop confirms the pickup date and time on approval',
    );
  });
});
