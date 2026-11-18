import {
  nextVnMorning,
  tierSampleHours,
  vnYear,
} from '../src/modules/insurance/insurance-premium-sample';

/** Mốc thời gian dùng chung khi hỏi phí hãng (đối chiếu + đồng bộ biểu phí — ADR 0106). */
describe('Mốc thời gian hỏi phí hãng', () => {
  it('giờ nhận xe mẫu = 09:00 sáng mai giờ Việt Nam, kể cả khi UTC còn ở hôm trước', () => {
    // 23:30 ngày 18/11 giờ VN = 16:30 UTC ⇒ sáng mai VN là 19/11.
    expect(nextVnMorning(new Date('2026-11-18T16:30:00Z')).toISOString()).toBe(
      '2026-11-19T02:00:00.000Z',
    );
    // 00:30 ngày 19/11 giờ VN = 17:30 UTC ngày 18 ⇒ sáng mai VN là 20/11.
    expect(nextVnMorning(new Date('2026-11-18T17:30:00Z')).toISOString()).toBe(
      '2026-11-20T02:00:00.000Z',
    );
  });

  it('năm hiện tại theo giờ Việt Nam', () => {
    expect(vnYear(new Date('2026-12-31T17:30:00Z'))).toBe(2027);
    expect(vnYear(new Date('2026-12-31T16:30:00Z'))).toBe(2026);
  });

  it('thời lượng mẫu của bậc = trần bậc trừ 1 giờ', () => {
    expect(tierSampleHours(2)).toBe(47);
    expect(tierSampleHours(30)).toBe(719);
  });
});
