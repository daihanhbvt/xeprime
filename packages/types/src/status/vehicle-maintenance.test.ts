import { describe, expect, it } from 'vitest';
import { isMaintenanceOnSchedule } from './vehicle-maintenance';

const NOW = new Date('2026-10-26T03:00:00.000Z');
const base = {
  currentKm: 12_000,
  lastServiceKm: 10_000,
  intervalKm: 5_000,
  lastServiceAt: '2026-08-01',
};

describe('isMaintenanceOnSchedule', () => {
  it('trong chu kỳ km và bảo dưỡng trong 6 tháng ⇒ đúng hạn', () => {
    expect(isMaintenanceOnSchedule(base, NOW)).toBe(true);
  });

  it('sắp đến hạn theo km vẫn là đúng hạn — chưa quá', () => {
    expect(isMaintenanceOnSchedule({ ...base, currentKm: 14_800, dueSoonKm: 500 }, NOW)).toBe(true);
  });

  it('quá chu kỳ km ⇒ không đúng hạn', () => {
    expect(isMaintenanceOnSchedule({ ...base, currentKm: 15_000 }, NOW)).toBe(false);
  });

  it('lần bảo dưỡng cuối quá 6 tháng ⇒ không đúng hạn dù còn km', () => {
    expect(isMaintenanceOnSchedule({ ...base, lastServiceAt: '2026-04-25' }, NOW)).toBe(false);
  });

  it('thiếu dữ liệu (chưa có ngày, chưa có km hiện tại) ⇒ không khen hộ', () => {
    expect(isMaintenanceOnSchedule({ ...base, lastServiceAt: null }, NOW)).toBe(false);
    expect(isMaintenanceOnSchedule({ ...base, currentKm: null }, NOW)).toBe(false);
  });
});
