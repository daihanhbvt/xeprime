import { describe, expect, it } from 'vitest';
import {
  detectLoginIdentifierKind,
  isValidLoginIdentifier,
  LOGIN_IDENTIFIER_KIND,
  LOGIN_IDENTIFIER_MAX,
} from './auth-identifier';

describe('detectLoginIdentifierKind — ý định của người nhập', () => {
  it('có `@` là đường email, kể cả khi email đó sai', () => {
    for (const value of ['ban@congty.vn', 'ban@', '@congty.vn', 'ban @congty.vn']) {
      expect(detectLoginIdentifierKind(value)).toBe(LOGIN_IDENTIFIER_KIND.EMAIL);
    }
  });

  it('chỉ chữ số và dấu phân tách là đường SĐT, kể cả khi số đó sai', () => {
    for (const value of ['0901234567', '0901', '+84901234567', '090 123 4567', '  0901234567  ']) {
      expect(detectLoginIdentifierKind(value)).toBe(LOGIN_IDENTIFIER_KIND.PHONE);
    }
  });

  it('không đoán được thì trả UNKNOWN — đó là lúc câu lỗi phải nói cả hai lựa chọn', () => {
    for (const value of ['nguyenvana', 'abc123', '']) {
      expect(detectLoginIdentifierKind(value)).toBe(LOGIN_IDENTIFIER_KIND.UNKNOWN);
    }
  });

  /**
   * Nhánh `@` phải khớp ĐÚNG `identifier.includes('@')` của `AuthService.loginWithPassword`:
   * lệch nhau là client báo "SĐT không hợp lệ" cho thứ backend đi tra bảng email.
   */
  it('phân nhánh theo `@` giống hệt backend', () => {
    expect(detectLoginIdentifierKind('090123456@')).toBe(LOGIN_IDENTIFIER_KIND.EMAIL);
  });
});

describe('isValidLoginIdentifier', () => {
  it('nhận email hợp lệ', () => {
    for (const value of ['ban@congty.vn', 'a.b+tag@sub.congty.co.uk', '  ban@congty.vn  ']) {
      expect(isValidLoginIdentifier(value)).toBe(true);
    }
  });

  it('từ chối email gõ nhầm', () => {
    for (const value of ['ban@congty', 'ban@@congty.vn', 'ban @congty.vn', '@congty.vn', 'ban@']) {
      expect(isValidLoginIdentifier(value)).toBe(false);
    }
  });

  it('nhận SĐT di động đúng luật hệ thống (ADR 0082)', () => {
    for (const value of ['0901234567', '84901234567', '+84901234567']) {
      expect(isValidLoginIdentifier(value)).toBe(true);
    }
  });

  it('từ chối SĐT có ký tự lạ — ô nhập đã tự lọc, chuỗi còn dấu tới đây là không qua ô nhập', () => {
    for (const value of ['090 123 4567', '090-123-4567', '090.123.4567', '+84 90 123 4567']) {
      expect(isValidLoginIdentifier(value)).toBe(false);
    }
  });

  it('từ chối SĐT sai độ dài hoặc sai đầu số — cùng luật với ô SĐT lúc đăng ký', () => {
    for (const value of ['0901', '09012345678', '02438123456', '0123456789', '8490123456', '84012345678', '+840901234567']) {
      expect(isValidLoginIdentifier(value)).toBe(false);
    }
  });

  it('từ chối chuỗi rỗng, chuỗi trắng và chuỗi không ra hình gì', () => {
    for (const value of ['', '   ', 'nguyenvana']) {
      expect(isValidLoginIdentifier(value)).toBe(false);
    }
  });

  it('chặn trên độ dài — ô này đi thẳng vào một câu WHERE email = ...', () => {
    const local = 'a'.repeat(LOGIN_IDENTIFIER_MAX);
    expect(isValidLoginIdentifier(`${local}@congty.vn`)).toBe(false);
  });
});
