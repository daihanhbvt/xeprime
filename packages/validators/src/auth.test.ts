import { describe, expect, it } from 'vitest';
import { buildLoginSchema, loginSchema, registerSchema, type AuthSchemaLabels } from './auth';

/**
 * Ô "Email hoặc số điện thoại" — thứ được khoá ở đây KHÔNG chỉ là "chặn được giá trị sai", mà là
 * CÂU LỖI nào hiện ra: một ô nhận hai loại giá trị mà chỉ biết nói "không hợp lệ" thì người gõ
 * nhầm tên miền và người gõ thiếu một chữ số nhận cùng một câu vô dụng.
 */
async function identifierError(value: string): Promise<string | undefined> {
  try {
    await loginSchema.validateAt('identifier', { identifier: value, password: 'matkhau123' });
    return undefined;
  } catch (err) {
    return (err as { message: string }).message;
  }
}

describe('loginSchema.identifier', () => {
  it('nhận email và SĐT hợp lệ', async () => {
    for (const value of ['ban@congty.vn', '0901234567', '+84901234567', ' ban@congty.vn ']) {
      await expect(identifierError(value)).resolves.toBeUndefined();
    }
  });

  it('gõ có `@` mà sai → câu lỗi của EMAIL', async () => {
    await expect(identifierError('ban@congty')).resolves.toBe('Email không hợp lệ');
  });

  it('gõ ra dáng số mà sai → câu lỗi của SỐ ĐIỆN THOẠI', async () => {
    await expect(identifierError('0901')).resolves.toBe('Số điện thoại không hợp lệ');
  });

  it('không đoán được định nhập gì → câu lỗi nêu CẢ HAI lựa chọn kèm ví dụ', async () => {
    const message = await identifierError('nguyenvana');
    expect(message).toContain('email');
    expect(message).toContain('0901234567');
  });

  it('bỏ trống chỉ ra MỘT câu — của `required`, không kèm câu sai định dạng', async () => {
    await expect(identifierError('')).resolves.toBe('Vui lòng nhập email hoặc số điện thoại');
  });

  it('câu lỗi lấy từ labels truyền vào — app native dịch được mà luật không đổi', async () => {
    const en = {
      invalid: 'That phone number is not valid',
      required: 'Enter your phone number',
      passwordRequired: 'Enter your password',
      passwordTooShort: 'Password too short',
      passwordNeedsLetter: 'Password must contain a letter',
      passwordNeedsDigit: 'Password must contain a digit',
      emailInvalid: 'That email address is not valid',
      emailRequired: 'Enter your email',
      identifierRequired: 'Enter your email or phone number',
      identifierInvalid: 'Enter an email or a phone number',
      nameRequired: 'Enter your full name',
      confirmRequired: 'Re-enter your password',
      confirmMismatch: 'The two passwords do not match',
    } satisfies AuthSchemaLabels;
    const schema = buildLoginSchema(en);
    const check = async (value: string) => {
      try {
        await schema.validateAt('identifier', { identifier: value, password: 'matkhau123' });
        return undefined;
      } catch (err) {
        return (err as { message: string }).message;
      }
    };

    await expect(check('ban@congty')).resolves.toBe(en.emailInvalid);
    await expect(check('0901')).resolves.toBe(en.invalid);
    await expect(check('nguyenvana')).resolves.toBe(en.identifierInvalid);
    await expect(check('0901234567')).resolves.toBeUndefined();
  });
});

/** Lỗi ĐẦU TIÊN của một ô — đúng câu form hiện (react-hook-form chỉ hiện lỗi đầu của mỗi ô). */
async function firstRegisterError(field: 'displayName' | 'password', value: string) {
  try {
    await registerSchema.validateAt(field, { [field]: value }, { abortEarly: false });
    return undefined;
  } catch (err) {
    return (err as { errors: string[] }).errors[0];
  }
}

describe('registerSchema.password — thứ tự báo lỗi (BR-AUTH-03: độ dài → số → chữ)', () => {
  it.each([
    ['abc', 'Mật khẩu tối thiểu 8 ký tự'],
    ['!!!!!!!!', 'Mật khẩu cần có số'],
    ['xeprimeabc', 'Mật khẩu cần có số'],
    ['12345678', 'Mật khẩu cần có chữ'],
  ])('%s → %s', async (value, message) => {
    await expect(firstRegisterError('password', value)).resolves.toBe(message);
  });
});

describe('registerSchema.displayName — DISPLAY_NAME_POLICY', () => {
  it.each([
    ['', 'Vui lòng nhập họ tên'],
    ['      ', 'Vui lòng nhập họ tên'],
    ['   A   ', 'Tên cần từ 2 đến 50 ký tự'],
    ['A'.repeat(51), 'Tên cần từ 2 đến 50 ký tự'],
    ['An@#', 'Tên chỉ gồm chữ cái, chữ số và khoảng trắng'],
    ['<script>alert(1)</script>', 'Tên chỉ gồm chữ cái, chữ số và khoảng trắng'],
  ])('%j → %s', async (value, message) => {
    await expect(firstRegisterError('displayName', value)).resolves.toBe(message);
  });

  it('nhận đúng hai biên và tên tiếng Việt có dấu, có chữ số', async () => {
    for (const value of ['An', 'A'.repeat(50), 'Nguyễn Thị Ánh', 'Trần Văn Bảo 2']) {
      await expect(firstRegisterError('displayName', value)).resolves.toBeUndefined();
    }
  });

  it('gõ dấu kiểu tổ hợp (NFD) không bị tính là dài hơn', async () => {
    const nfd = 'Ễ'.repeat(50).normalize('NFD');
    expect(nfd.length).toBeGreaterThan(50);
    await expect(firstRegisterError('displayName', nfd)).resolves.toBeUndefined();
  });
});
