import { describe, expect, it } from 'vitest';
import { formatOtpCooldown } from './format-cooldown';
import { maskPhone, maskPhoneStars } from './mask';

describe('maskPhoneStars — kiểu che của hộp tài khoản design v2', () => {
  it('ba số đầu, ba số cuối', () => {
    expect(maskPhoneStars('0379123789')).toBe('037 *** *789');
  });

  it('quy +84 / 84 về 0 trước khi che', () => {
    expect(maskPhoneStars('+84379123789')).toBe('037 *** *789');
    expect(maskPhoneStars('84379123789')).toBe('037 *** *789');
  });

  it('chuỗi quá ngắn để che thì trả nguyên', () => {
    expect(maskPhoneStars('0901')).toBe('0901');
  });

  it('kiểu che cũ của site partner không đổi', () => {
    expect(maskPhone('0901234567')).toBe('09•• ••• 567');
  });
});

describe('formatOtpCooldown', () => {
  it('đồng hồ mm:ss như bản vẽ', () => {
    expect(formatOtpCooldown(58)).toBe('00:58');
    expect(formatOtpCooldown(60)).toBe('01:00');
    expect(formatOtpCooldown(5)).toBe('00:05');
  });

  it('không bao giờ âm hay lẻ', () => {
    expect(formatOtpCooldown(-3)).toBe('00:00');
    expect(formatOtpCooldown(9.7)).toBe('00:09');
  });
});
