import { describe, expect, it } from 'vitest';
import { buildRequiredMobilePhoneSchema, buildRequiredPhoneSchema } from './phone';

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

  it('SĐT liên hệ: nhận di động + số bàn 02, dạng 0 / 84 / +84 (ADR 0082)', async () => {
    for (const ok of ['0901234567', '84901234567', '+84901234567', '02438123456', '842438123456']) {
      await expect(errorOf(ok)).resolves.toBeUndefined();
    }
  });

  it('SĐT liên hệ: chặn ký tự lạ và sai độ dài', async () => {
    for (const bad of ['090 123 4567', '090.123.4567', '901234567', '09012345678', '8490123456', '84012345678', '+840901234567']) {
      await expect(errorOf(bad)).resolves.toBe('INVALID');
    }
  });
});

describe('buildRequiredMobilePhoneSchema — SĐT tài khoản', () => {
  const mobile = buildRequiredMobilePhoneSchema({ required: 'REQUIRED', invalid: 'INVALID' });
  const err = async (value: string) => {
    try {
      await mobile.validate(value);
      return undefined;
    } catch (e) {
      return (e as { message: string }).message;
    }
  };

  it('chỉ nhận di động 10 số', async () => {
    for (const ok of ['0901234567', '84901234567', '+84901234567']) {
      await expect(err(ok)).resolves.toBeUndefined();
    }
    for (const bad of ['02438123456', '0123456789', '099 222 2222', '09012345678']) {
      await expect(err(bad)).resolves.toBe('INVALID');
    }
    await expect(err('')).resolves.toBe('REQUIRED');
  });
});
