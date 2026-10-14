import { describe, expect, it } from 'vitest';
import { buildRequiredPhoneSchema } from './phone';

/**
 * SĐT bắt buộc — dùng chung cho đăng nhập, đăng ký, quên mật khẩu và mời thành viên (ADR 0060).
 * Thứ được khoá là CÂU LỖI: bỏ trống phải nói "hãy nhập", không phải "không hợp lệ".
 */
const schema = buildRequiredPhoneSchema({ required: 'REQUIRED', invalid: 'INVALID' });

async function errorOf(value: string): Promise<string | undefined> {
  try {
    await schema.validate(value);
    return undefined;
  } catch (err) {
    return (err as { message: string }).message;
  }
}

describe('buildRequiredPhoneSchema', () => {
  it('bỏ trống (kể cả chỉ có dấu cách) → câu của `required`', async () => {
    await expect(errorOf('')).resolves.toBe('REQUIRED');
    await expect(errorOf('   ')).resolves.toBe('REQUIRED');
  });

  it('gõ sai → câu sai định dạng', async () => {
    await expect(errorOf('0901')).resolves.toBe('INVALID');
    await expect(errorOf('ban@congty.vn')).resolves.toBe('INVALID');
  });

  it('nhận số nội địa và +84', async () => {
    await expect(errorOf('0901234567')).resolves.toBeUndefined();
    await expect(errorOf('+84901234567')).resolves.toBeUndefined();
  });
});
