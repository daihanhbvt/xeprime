import { describe, expect, it } from 'vitest';
import {
  isSameVnPhone,
  isVnMobilePhoneInput,
  isVnPhoneInput,
  normalizeVnPhone,
  normalizeVnPhoneInput,
  sanitizePhoneInput,
  toIntlVnPhone,
  VN_MOBILE_PHONE_PATTERN,
  VN_PHONE_PATTERN,
} from './phone';

/**
 * ADR 0082 — chỉ chữ số + `+` đầu; SĐT tài khoản chỉ di động 10 số; SĐT liên hệ thêm số bàn `02`;
 * mọi dạng lưu về `0…`.
 */

describe('sanitizePhoneInput — ô nhập tự lọc lúc gõ / dán', () => {
  it.each([
    ['099 222 2222', '0992222222'],
    ['099.222.2222', '0992222222'],
    ['099-222-2222', '0992222222'],
    ['(099) 222 2222', '0992222222'],
    ['+84 99 222 2222', '+84992222222'],
    ['  +84992222222', '+84992222222'],
    ['09a9b2', '0992'],
    ['+', '+'],
    ['84+99', '8499'], // `+` chỉ giữ ở ĐẦU
    ['++84', '+84'],
    ['', ''],
  ])('%j → %j', (raw, expected) => {
    expect(sanitizePhoneInput(raw)).toBe(expected);
  });
});

describe('SĐT TÀI KHOẢN — VN_MOBILE_PHONE_PATTERN / isVnMobilePhoneInput', () => {
  it.each([
    '0901000001',
    '0321234567',
    '0561234567',
    '0701234567',
    '0861234567',
    '84901000001',
    '+84901000001',
  ])('nhận %s', (raw) => {
    expect(isVnMobilePhoneInput(raw)).toBe(true);
    expect(VN_MOBILE_PHONE_PATTERN.test(raw)).toBe(true);
  });

  it.each([
    ['099 222 2222', 'có dấu cách'],
    ['099.222.2222', 'có dấu chấm'],
    ['099-222-2222', 'có dấu gạch'],
    ['+84 90 100 0001', 'có dấu cách'],
    ['090100000', '0 + 8 số'],
    ['09010000011', '0 + 10 số (di động gõ thừa)'],
    ['02438123456', 'số bàn — không nhận SMS'],
    ['0123456789', 'đầu 01 không còn'],
    ['0412345678', 'đầu 04 không phải di động'],
    ['8490100000', '84 + 8 số'],
    ['849010000011', '84 + 10 số'],
    ['84012345678', '84 rồi 0 + 8 số'],
    ['0012345678', 'hai số 0 đầu'],
    ['+840901000001', 'số 0 thừa sau +84'],
    ['840901000001', 'số 0 thừa sau 84'],
    ['0084901000001', 'mã quốc tế 00'],
    ['++84901000001', 'hai dấu +'],
    ['09a1234567', 'có chữ'],
    ['ban@congty.vn', 'email'],
  ])('chặn %s (%s)', (raw) => {
    expect(isVnMobilePhoneInput(raw)).toBe(false);
  });

  it('ô trống để `required` lo', () => {
    expect(isVnMobilePhoneInput('')).toBe(true);
    expect(isVnMobilePhoneInput(null)).toBe(true);
  });
});

describe('SĐT LIÊN HỆ — VN_PHONE_PATTERN / isVnPhoneInput', () => {
  it.each(['0901000001', '84901000001', '+84901000001', '02438123456', '842838123456', '+842363123456'])(
    'nhận %s',
    (raw) => {
      expect(isVnPhoneInput(raw)).toBe(true);
      expect(VN_PHONE_PATTERN.test(raw)).toBe(true);
    },
  );

  it.each([
    ['024 3812 3456', 'có dấu cách'],
    ['09010000011', 'di động gõ thừa — số 11 chữ số chỉ hợp lệ khi là số bàn 02'],
    ['024381234567', 'số bàn thừa số'],
    ['0243812345', 'số bàn 10 số'],
    ['0123456789', 'đầu 01'],
  ])('chặn %s (%s)', (raw) => {
    expect(isVnPhoneInput(raw)).toBe(false);
  });
});

describe('normalizeVnPhoneInput — mép DTO, KHÔNG tha ký tự lạ', () => {
  it.each([
    ['0901000001', '0901000001'],
    ['84901000001', '0901000001'],
    ['+84901000001', '0901000001'],
    ['842438123456', '02438123456'],
    ['  0901000001  ', '0901000001'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeVnPhoneInput(raw)).toBe(expected);
  });

  it('chuỗi có ký tự lạ đi nguyên (đã trim) để phép kiểm mẫu chặn', () => {
    expect(normalizeVnPhoneInput('099 222 2222')).toBe('099 222 2222');
    expect(normalizeVnPhoneInput('+84 90 100 0001')).toBe('+84 90 100 0001');
    expect(VN_MOBILE_PHONE_PATTERN.test(normalizeVnPhoneInput('099 222 2222'))).toBe(false);
  });

  it('mọi đầu vào hợp lệ chuẩn hoá xong vẫn qua lại mẫu (idempotent)', () => {
    for (const raw of ['84901000001', '+84901000001', '842438123456']) {
      const local = normalizeVnPhoneInput(raw);
      expect(local.startsWith('0')).toBe(true);
      expect(VN_PHONE_PATTERN.test(local)).toBe(true);
      expect(normalizeVnPhoneInput(local)).toBe(local);
    }
  });
});

describe('normalizeVnPhone — tra cứu / so sánh (tha dấu cách)', () => {
  it.each([
    ['090 100 0001', '0901000001'],
    ['+84 90 100 0001', '0901000001'],
    ['84901000001', '0901000001'],
    ['0841234567', '0841234567'], // đầu 084 KHÔNG bị nhầm là mã quốc gia
    ['8490', '8490'], // mảnh số gõ dở
  ])('%s → %s', (raw, expected) => {
    expect(normalizeVnPhone(raw)).toBe(expected);
  });
});

describe('toIntlVnPhone (chỉ ở mép gửi SMS)', () => {
  it.each([
    ['0901000001', '84901000001'],
    ['+84901000001', '84901000001'],
    ['84901000001', '84901000001'],
  ])('%s → %s', (raw, expected) => {
    expect(toIntlVnPhone(raw)).toBe(expected);
  });
});

describe('isSameVnPhone', () => {
  it('cùng số viết khác kiểu là một', () => {
    expect(isSameVnPhone('0901000001', '84901000001')).toBe(true);
    expect(isSameVnPhone('+84901000001', '0901000001')).toBe(true);
  });
  it('khác số / thiếu số là khác', () => {
    expect(isSameVnPhone('0901000001', '0901000002')).toBe(false);
    expect(isSameVnPhone(null, '0901000001')).toBe(false);
  });
});
