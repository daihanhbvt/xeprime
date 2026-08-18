import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsVn,
  discountTierFromStored,
  isLongTermPackageMonths,
  legacyDiscountTierFromStored,
  LONG_TERM_PACKAGE_MONTHS,
  longTermPackageAmounts,
  longTermPickupWindow,
  longTermReturnAt,
  longTermTierFor,
  PICKUP_PREFERENCE,
  vnDateKey,
  type DiscountTier,
} from './long-term';

/** `YYYY-MM-DDTHH:mm` giờ Việt Nam → Date (UTC+7 cố định, không DST). */
const vn = (local: string) => new Date(`${local}:00.000+07:00`);

describe('gói thuê dài hạn — hằng số', () => {
  it('đúng sáu gói được phép', () => {
    expect([...LONG_TERM_PACKAGE_MONTHS]).toEqual([1, 2, 3, 6, 9, 12]);
  });

  it('nhận 1/2/3/6/9/12 và từ chối mọi giá trị khác', () => {
    for (const ok of [1, 2, 3, 6, 9, 12]) expect(isLongTermPackageMonths(ok)).toBe(true);
    for (const bad of [0, 4, 5, 7, 8, 10, 11, 13, -1, 1.5]) {
      expect(isLongTermPackageMonths(bad)).toBe(false);
    }
    expect(isLongTermPackageMonths('3')).toBe(false);
    expect(isLongTermPackageMonths(null)).toBe(false);
  });
});

describe('cộng tháng lịch theo giờ Việt Nam', () => {
  it('19/08 + 9 tháng = 19/05 năm sau, giữ nguyên giờ', () => {
    expect(vnDateKey(longTermReturnAt(vn('2026-08-19T10:30'), 9))).toBe('2027-05-19');
    expect(longTermReturnAt(vn('2026-08-19T10:30'), 9).toISOString()).toBe(
      vn('2027-05-19T10:30').toISOString(),
    );
  });

  it('31/01 + 1 tháng kẹp về ngày cuối tháng 2 (thường và nhuận)', () => {
    expect(vnDateKey(addCalendarMonthsVn(vn('2027-01-31T09:00'), 1))).toBe('2027-02-28');
    expect(vnDateKey(addCalendarMonthsVn(vn('2028-01-31T09:00'), 1))).toBe('2028-02-29');
  });

  it('29/02 năm nhuận + 12 tháng kẹp về 28/02 năm thường', () => {
    expect(vnDateKey(addCalendarMonthsVn(vn('2028-02-29T08:00'), 12))).toBe('2029-02-28');
  });

  it('mốc sát nửa đêm giờ VN vẫn tính theo NGÀY LỊCH Việt Nam, không theo UTC', () => {
    // 00:30 giờ VN = 17:30 UTC ngày HÔM TRƯỚC — cộng tháng theo UTC sẽ cho 30/09, sai một ngày.
    const pickup = vn('2026-08-31T00:30');
    expect(vnDateKey(pickup)).toBe('2026-08-31');
    expect(vnDateKey(addCalendarMonthsVn(pickup, 1))).toBe('2026-09-30');
  });

  it('cộng qua mốc năm', () => {
    expect(vnDateKey(addCalendarMonthsVn(vn('2026-12-15T07:00'), 3))).toBe('2027-03-15');
  });
});

describe('khoảng nhận xe linh hoạt', () => {
  it('từ NGÀY MAI tới hết ngày thứ 7 kể từ ngày gửi', () => {
    expect(longTermPickupWindow(vn('2026-08-18T22:15'))).toEqual({
      start: '2026-08-19',
      end: '2026-08-25',
    });
  });

  it('tính theo ngày lịch Việt Nam kể cả khi gửi lúc nửa đêm', () => {
    // 23:30 giờ VN ngày 18 = 16:30 UTC ngày 18 — nếu lấy ngày theo UTC vẫn ra 18, nhưng
    // 00:30 giờ VN ngày 19 = 17:30 UTC ngày 18 và phải cho khoảng bắt đầu từ 20.
    expect(longTermPickupWindow(vn('2026-08-19T00:30')).start).toBe('2026-08-20');
  });
});

describe('mốc ưu đãi cam kết thời hạn', () => {
  const tiers: DiscountTier[] = [
    { minMonths: 1, percent: 5 },
    { minMonths: 3, percent: 15 },
    { minMonths: 6, percent: 20 },
  ];

  it('lấy mốc cao nhất gói đạt tới, không cộng dồn', () => {
    expect(longTermTierFor(tiers, 1)?.percent).toBe(5);
    expect(longTermTierFor(tiers, 2)?.percent).toBe(5);
    expect(longTermTierFor(tiers, 3)?.percent).toBe(15);
    expect(longTermTierFor(tiers, 6)?.percent).toBe(20);
    expect(longTermTierFor(tiers, 9)?.percent).toBe(20);
    expect(longTermTierFor(tiers, 12)?.percent).toBe(20);
  });

  it('không mốc nào áp → null, không tự bịa 0%', () => {
    expect(longTermTierFor([{ minMonths: 6, percent: 20 }], 3)).toBeNull();
    expect(longTermTierFor([], 12)).toBeNull();
    expect(longTermTierFor(null, 12)).toBeNull();
  });

  it('gói 9 tháng, 12tr/tháng, mốc 20%: 108tr − 21,6tr = 86,4tr (9,6tr/tháng)', () => {
    expect(longTermPackageAmounts({ monthlyPrice: '12000000', packageMonths: 9, tiers })).toEqual({
      packageMonths: 9,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '108000000',
      durationDiscountPercent: 20,
      durationDiscountAmount: '21600000',
      finalPackageAmount: '86400000',
      effectiveMonthlyAmount: '9600000',
    });
  });

  it('tắt ưu đãi → giá gói bằng đúng giá cơ sở', () => {
    const amounts = longTermPackageAmounts({
      monthlyPrice: '12000000',
      packageMonths: 9,
      tiers,
      discountEnabled: false,
    });
    expect(amounts.durationDiscountPercent).toBeNull();
    expect(amounts.finalPackageAmount).toBe('108000000');
  });
});

describe('đọc mốc ưu đãi từ jsonb (tương thích dữ liệu cũ)', () => {
  it('shape canonical theo tháng đọc thẳng', () => {
    expect(discountTierFromStored({ minMonths: 3, percent: 15, note: 'x' })).toEqual({
      minMonths: 3,
      percent: 15,
      note: 'x',
    });
  });

  it('mốc ngày khớp CHÍNH XÁC một gói mới quy đổi (90 → 3 tháng)', () => {
    expect(discountTierFromStored({ minDays: 90, percent: 15 })).toEqual({
      minMonths: 3,
      percent: 15,
    });
    expect(discountTierFromStored({ minDays: 360, percent: 6 })?.minMonths).toBe(12);
  });

  it('mốc ngày không tương ứng gói nào KHÔNG bị remap ngầm — giữ dạng legacy', () => {
    for (const minDays of [7, 14, 45, 120, 150]) {
      expect(discountTierFromStored({ minDays, percent: 5 })).toBeNull();
      expect(legacyDiscountTierFromStored({ minDays, percent: 5 })).toEqual({
        minDays,
        percent: 5,
        legacy: true,
      });
    }
  });

  it('mốc canonical không bị coi là legacy', () => {
    expect(legacyDiscountTierFromStored({ minMonths: 3, percent: 15 })).toBeNull();
  });
});

describe('nguyện vọng nhận xe', () => {
  it('chỉ hai giá trị hợp lệ', () => {
    expect(Object.values(PICKUP_PREFERENCE)).toEqual(['within_7_days', 'specific_date']);
  });
});
