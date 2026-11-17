import { describe, expect, it } from 'vitest';
import { formatOtpCooldown } from './format-cooldown';
import { maskEmailHead, maskPhone, maskPhoneStars, maskPhoneTail } from './mask';

describe('maskPhoneStars - kiểu che của hộp tài khoản design v2', () => {
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

describe('maskPhoneTail / maskEmailHead - hộp đổi SĐT/email (design 24131:72204)', () => {
  it('SĐT: chỉ giữ ba số cuối, quy +84 về 0', () => {
    expect(maskPhoneTail('0987789688')).toBe('***688');
    expect(maskPhoneTail('+84987789688')).toBe('***688');
  });

  it('email: che ba ký tự đầu của phần tên, giữ tên miền', () => {
    expect(maskEmailHead('partner.xeprime@gmail.com')).toBe('***tner.xeprime@gmail.com');
    expect(maskEmailHead('ab@x.vn')).toBe('***@x.vn');
    expect(maskEmailHead('khong-phai-email')).toBe('khong-phai-email');
  });
});
