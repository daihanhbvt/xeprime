import { describe, expect, it } from 'vitest';

import { isLateReturn, rentalProgress } from './rental-progress';

describe('rentalProgress', () => {
  const START = '2026-10-29T06:00:00.000Z';
  const END = '2026-10-29T16:00:00.000Z'; // 10 giờ

  it('giữa chuyến ⇒ phần trăm làm tròn xuống, số phút còn lại tới giờ trả', () => {
    expect(rentalProgress(START, END, '2026-10-29T12:00:00.000Z')).toEqual({
      percent: 60,
      remainingMinutes: 240,
      overdueMinutes: 0,
    });
  });

  it('chưa tới giờ bắt đầu ⇒ 0%, không âm', () => {
    expect(rentalProgress(START, END, '2026-10-29T05:00:00.000Z').percent).toBe(0);
  });

  it('quá giờ trả ⇒ kẹp 100% và đếm phút quá giờ', () => {
    expect(rentalProgress(START, END, '2026-10-29T17:30:00.000Z')).toEqual({
      percent: 100,
      remainingMinutes: 0,
      overdueMinutes: 90,
    });
  });

  it('khoảng rỗng/ngược không chia cho 0', () => {
    expect(rentalProgress(END, START, '2026-10-29T10:00:00.000Z').percent).toBe(100);
  });
});

describe('isLateReturn', () => {
  const RETURN = '2026-10-29T16:00:00.000Z';

  it('về đúng giờ hoặc sớm ⇒ không trễ', () => {
    expect(isLateReturn(RETURN, RETURN)).toBe(false);
    expect(isLateReturn(RETURN, '2026-10-29T15:00:00.000Z')).toBe(false);
  });

  it('về sau giờ hẹn dù một phút ⇒ trễ', () => {
    expect(isLateReturn(RETURN, '2026-10-29T16:01:00.000Z')).toBe(true);
  });

  it('chưa có giờ trả thật ⇒ chưa nói được là trễ', () => {
    expect(isLateReturn(RETURN, null)).toBe(false);
  });
});
