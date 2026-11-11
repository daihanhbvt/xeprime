import { describe, expect, it } from 'vitest';
import { generateStaffPassword } from './staff-password';

describe('generateStaffPassword', () => {
  it('đủ luật của server: ≥ 8 ký tự, có chữ và số, không ký tự dễ nhầm', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateStaffPassword();
      expect(password).toHaveLength(10);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[0O1lIo]/);
    }
  });

  it('nguồn ngẫu nhiên toàn số 0 vẫn ra mật khẩu hợp lệ', () => {
    const password = generateStaffPassword((buffer) => buffer.fill(0));
    expect(password).toMatch(/[A-Za-z]/);
    expect(password).toMatch(/\d/);
  });
});
