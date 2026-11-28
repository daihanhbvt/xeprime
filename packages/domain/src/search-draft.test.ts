import { describe, expect, it } from 'vitest';

import { APP_TIME_ZONE, dayjs } from './datetime';
import { SERVICE_TYPE } from '@xeprime/types';
import { nearestPackageMonths } from './long-term';
import {
  DEFAULT_PICKUP_HOURS,
  defaultLongTermPick,
  defaultRentalRange,
  draftFromFilters,
  draftToFilterPatch,
  longTermAvailabilityWindow,
  longTermPickFromFilters,
  longTermReturnDate,
} from './search-draft';

/**
 * Khoảng thuê GỢI Ý — thứ khách nhìn thấy trong ô thời gian khi chưa tự chọn gì.
 *
 * Bài này khoá đúng hai điều: công thức (mốc giờ đẹp + đệm 4 giờ + đúng 24 giờ thuê) và việc nó
 * không có nhánh nào quên ở ranh giới ngày/tháng/năm. Múi giờ luôn là Việt Nam, kể cả khi máy
 * chạy test đặt ở đâu — đó là cả lý do hàm nhận `now` thay vì tự gọi `dayjs()`.
 */
const vn = (wallClock: string) => dayjs.tz(wallClock, APP_TIME_ZONE);
const stamp = (value: ReturnType<typeof vn>) => value.format('YYYY-MM-DD HH:mm');

describe('defaultRentalRange', () => {
  it('chọn mốc giờ đẹp đầu tiên còn cách hiện tại ít nhất 4 giờ', () => {
    const { pickupAt, returnAt } = defaultRentalRange(vn('2026-09-14T10:30'));

    expect(stamp(pickupAt)).toBe('2026-09-14 17:00');
    expect(stamp(returnAt)).toBe('2026-09-15 17:00');
  });

  it('hết mốc trong ngày thì sang mốc đầu tiên của ngày kế tiếp', () => {
    // 18:00 + 4 giờ = 22:00, đã qua mốc muộn nhất (21:00) của hôm nay.
    const { pickupAt, returnAt } = defaultRentalRange(vn('2026-09-14T18:00'));

    expect(stamp(pickupAt)).toBe('2026-09-15 09:00');
    expect(stamp(returnAt)).toBe('2026-09-16 09:00');
  });

  it('đúng sát giờ vẫn lấy mốc đó - 4 giờ là "ít nhất", không phải "hơn"', () => {
    const { pickupAt } = defaultRentalRange(vn('2026-09-14T05:00'));

    expect(stamp(pickupAt)).toBe('2026-09-14 09:00');
  });

  it('sát mốc một phút thì bỏ qua mốc đó', () => {
    const { pickupAt } = defaultRentalRange(vn('2026-09-14T05:01'));

    expect(stamp(pickupAt)).toBe('2026-09-14 13:00');
  });

  it('qua nửa đêm: đệm 4 giờ đẩy sang ngày hôm sau', () => {
    const { pickupAt, returnAt } = defaultRentalRange(vn('2026-09-14T23:30'));

    expect(stamp(pickupAt)).toBe('2026-09-15 09:00');
    expect(stamp(returnAt)).toBe('2026-09-16 09:00');
  });

  it('cuối năm: cộng ngày sang tháng 1 năm sau, không rơi về 31/12', () => {
    const { pickupAt, returnAt } = defaultRentalRange(vn('2026-12-31T22:00'));

    expect(stamp(pickupAt)).toBe('2027-01-01 09:00');
    expect(stamp(returnAt)).toBe('2027-01-02 09:00');
  });

  it('cuối tháng ngắn ngày: 28/02 năm không nhuận sang 01/03', () => {
    const { pickupAt } = defaultRentalRange(vn('2027-02-28T21:00'));

    expect(stamp(pickupAt)).toBe('2027-03-01 09:00');
  });

  it('luôn trả đúng 24 giờ và một mốc nằm trong bộ giờ đã khai', () => {
    // Quét cả ngày theo từng 15 phút: mọi thời điểm đều phải ra một gợi ý hợp lệ.
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
      const now = vn('2026-09-14T00:00').add(minutes, 'minute');
      const { pickupAt, returnAt } = defaultRentalRange(now);

      expect(returnAt.diff(pickupAt, 'hour')).toBe(24);
      expect(DEFAULT_PICKUP_HOURS).toContain(pickupAt.hour());
      expect(pickupAt.minute()).toBe(0);
      expect(pickupAt.diff(now, 'minute')).toBeGreaterThanOrEqual(4 * 60);
    }
  });
});

describe('thuê dài hạn - ngày nhận + gói ở bước tìm (28/11/2026)', () => {
  const now = vn('2026-11-28T10:00');

  it('gợi ý sẵn: hôm nay + 7 ngày, gói 3 tháng', () => {
    expect(defaultLongTermPick(now)).toEqual({ fromDate: '2026-12-05', months: 3 });
  });

  it('URL hợp lệ thì giữ nguyên; ngày hỏng, ngày đã qua, gói lạ rơi về gợi ý', () => {
    expect(longTermPickFromFilters({ ltFrom: '2026-12-28', ltMonths: 2 }, now)).toEqual({
      fromDate: '2026-12-28',
      months: 2,
    });
    expect(longTermPickFromFilters({ ltFrom: '2026-11-28' }, now).fromDate).toBe('2026-11-28');
    expect(longTermPickFromFilters({ ltFrom: '2026-11-27' }, now).fromDate).toBe('2026-12-05');
    expect(longTermPickFromFilters({ ltFrom: '2026-02-30' }, now).fromDate).toBe('2026-12-05');
    expect(longTermPickFromFilters({ ltFrom: 'rác' }, now).fromDate).toBe('2026-12-05');
    expect(longTermPickFromFilters({ ltMonths: 4 }, now).months).toBe(3);
  });

  it('ngày trả dự kiến là N tháng LỊCH, kẹp cuối tháng (ADR 0011)', () => {
    expect(longTermReturnDate({ fromDate: '2026-10-13', months: 2 })).toBe('2026-12-13');
    expect(longTermReturnDate({ fromDate: '2027-01-31', months: 1 })).toBe('2027-02-28');
  });

  it('khoảng hỏi xe rảnh = phần LÕI: hết ngày nhận → đầu ngày trả, giờ Việt Nam', () => {
    const window = longTermAvailabilityWindow(
      { serviceType: SERVICE_TYPE.LONG_TERM, ltFrom: '2026-12-28', ltMonths: 2 },
      now,
    );
    expect(window).toEqual({
      pickupAt: '2026-12-28T17:00:00.000Z', // 00:00 ngày 29/12 giờ VN
      returnAt: '2027-02-27T17:00:00.000Z', // 00:00 ngày 28/02 giờ VN
    });
  });

  it('không phải dài hạn, hoặc URL chưa mang ngày nhận ⇒ không lọc lịch', () => {
    expect(
      longTermAvailabilityWindow(
        { serviceType: SERVICE_TYPE.SELF_DRIVE, ltFrom: '2026-12-28' },
        now,
      ),
    ).toBeNull();
    expect(longTermAvailabilityWindow({ serviceType: SERVICE_TYPE.LONG_TERM }, now)).toBeNull();
  });

  it('chỉ dài hạn phát ltFrom/ltMonths; tự lái xoá chúng khỏi URL', () => {
    const draft = draftFromFilters(
      { serviceType: SERVICE_TYPE.LONG_TERM, ltFrom: '2026-12-28', ltMonths: 6 },
      now,
    );
    expect(draftToFilterPatch(draft)).toMatchObject({ ltFrom: '2026-12-28', ltMonths: 6 });
    expect(draftToFilterPatch(draft).pickupAt).toBeUndefined();

    const selfDrive = draftToFilterPatch({ ...draft, serviceType: SERVICE_TYPE.SELF_DRIVE });
    expect(selfDrive.ltFrom).toBeUndefined();
    expect(selfDrive.ltMonths).toBeUndefined();
    expect(selfDrive.pickupAt).toBeDefined();
  });
});

describe('nearestPackageMonths - gói của xe gần nhất với gói khách chọn lúc tìm', () => {
  it('có đúng gói thì lấy, không có thì gói gần nhất, cách đều thì gói ngắn hơn', () => {
    expect(nearestPackageMonths([1, 3, 6], 3)).toBe(3);
    expect(nearestPackageMonths([1, 6, 12], 3)).toBe(1);
    expect(nearestPackageMonths([6, 12], 9)).toBe(6);
    expect(nearestPackageMonths([3, 6], null)).toBe(3);
    expect(nearestPackageMonths([], 3)).toBeNull();
  });
});
