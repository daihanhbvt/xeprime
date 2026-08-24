import { describe, expect, it } from 'vitest';

import { APP_TIME_ZONE, dayjs, rentalDurationParts, startOfAppDay, toAppTz } from './datetime';

/**
 * Phần KHÔNG phụ thuộc ngôn ngữ của ngày giờ: quy đổi múi giờ và phép đếm thời lượng thuê.
 *
 * Cách HIỂN THỊ (thứ viết tắt, "3 ngày 4 giờ", mốc `T6, 08/08 · 10:00`) đã chuyển sang
 * `useAppFormat` vì nó đổi theo ngôn ngữ — test của nó ở `src/i18n/use-app-format.test.tsx`.
 * Ở đây chỉ khoá con số, và con số thì giống nhau ở mọi ngôn ngữ.
 */
describe('toAppTz', () => {
  it('quy về giờ Việt Nam bất kể mốc gốc ghi bằng UTC', () => {
    // 01:00Z = 08:00 giờ Việt Nam (UTC+7, không DST).
    expect(toAppTz('2026-08-17T01:00:00.000Z').format('HH:mm')).toBe('08:00');
    expect(toAppTz('2026-08-17T01:00:00.000Z').format('DD/MM/YYYY')).toBe('17/08/2026');
  });

  it('mốc sau 17:00Z đã sang ngày hôm sau theo giờ Việt Nam', () => {
    expect(toAppTz('2026-08-17T17:30:00.000Z').format('DD/MM HH:mm')).toBe('18/08 00:30');
  });
});

describe('startOfAppDay', () => {
  it('00:00 giờ Việt Nam của một ngày = 17:00Z hôm trước', () => {
    expect(startOfAppDay('2026-08-17').toISOString()).toBe('2026-08-16T17:00:00.000Z');
  });

  it('múi giờ ứng dụng không đổi theo ngôn ngữ', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('rentalDurationParts', () => {
  const at = (iso: string) => dayjs(iso);

  it('tròn ngày', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-10T10:00:00'))).toEqual({
      days: 2,
      hours: 0,
    });
  });

  it('ngày lẻ giờ', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-10T13:00:00'))).toEqual({
      days: 2,
      hours: 3,
    });
  });

  it('dưới một ngày đếm theo giờ', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-08T15:00:00'))).toEqual({
      days: 0,
      hours: 5,
    });
  });

  it('23h59 không tụt về 0 — tối thiểu là 1 giờ', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-08T10:20:00'))).toEqual({
      days: 0,
      hours: 1,
    });
  });

  it('khoảng âm (dữ liệu hỏng) kẹp về 0 chứ không ra số âm', () => {
    expect(rentalDurationParts(at('2026-08-10T10:00:00'), at('2026-08-08T10:00:00'))).toEqual({
      days: 0,
      hours: 1,
    });
  });
});
