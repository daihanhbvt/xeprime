import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from '../src/modules/auth/dto/auth.dto';
import { MobileLoginDto } from '../src/modules/auth/dto/mobile-auth.dto';

/**
 * Ô "Email hoặc số điện thoại" phải bị chặn ở MÉP VÀO, không phải ở câu truy vấn.
 *
 * Trước đây trường này chỉ có `@MinLength(1)`: `nguyenvana` đi thẳng vào
 * `WHERE phone = 'nguyenvana'` rồi quay về `INVALID_CREDENTIALS` — cùng một câu với "sai mật
 * khẩu", nên người gõ nhầm email không có cách nào biết mình gõ nhầm ở đâu.
 *
 * Luật là hàm `isValidLoginIdentifier` của `@xeprime/types` — CÙNG hàm mà yup của web và app
 * native gọi, nên spec này cũng là chốt chặn cho lời hứa "web, app và API nhận đúng một tập giá
 * trị". Không cần DB: đây thuần là lớp validate DTO.
 */
function identifierErrors(value: unknown): string[] {
  const dto = plainToInstance(LoginDto, { identifier: value, password: 'matkhau123' });
  const errors = validateSync(dto);
  const field = errors.find((e) => e.property === 'identifier');
  return Object.values(field?.constraints ?? {});
}

describe('LoginDto.identifier', () => {
  it('nhận email và SĐT hợp lệ (kể cả khi có khoảng trắng thừa hai đầu)', () => {
    for (const value of ['ban@congty.vn', '0901234567', '+84901234567', '  ban@congty.vn  ']) {
      expect(identifierErrors(value)).toEqual([]);
    }
  });

  it('nhận SĐT chép từ danh bạ, còn nguyên dấu cách/gạch', () => {
    expect(identifierErrors('090 123 4567')).toEqual([]);
    expect(identifierErrors('090-123-4567')).toEqual([]);
  });

  it('từ chối email sai định dạng và chỉ đúng "email"', () => {
    expect(identifierErrors('ban@congty')).toContain('Email không hợp lệ');
  });

  it('từ chối SĐT sai định dạng và chỉ đúng "số điện thoại"', () => {
    expect(identifierErrors('0901')).toContain('Số điện thoại không hợp lệ');
    expect(identifierErrors('09012345678')).toContain('Số điện thoại không hợp lệ');
  });

  it('chuỗi không ra hình gì → câu lỗi nêu cả hai lựa chọn kèm ví dụ', () => {
    const [message] = identifierErrors('nguyenvana');
    expect(message).toContain('email');
    expect(message).toContain('0901234567');
  });

  it('bỏ trống vẫn là lỗi', () => {
    expect(identifierErrors('').length).toBeGreaterThan(0);
    expect(identifierErrors('    ').length).toBeGreaterThan(0);
  });

  it('không phải chuỗi thì không lọt xuống service', () => {
    for (const value of [null, undefined, 12345, { toString: () => 'ban@congty.vn' }]) {
      expect(identifierErrors(value).length).toBeGreaterThan(0);
    }
  });
});

/** `/auth/mobile/login` là cùng một ô nhập ở một vỏ khác — luật không được rẽ nhánh theo client. */
describe('MobileLoginDto.identifier — cùng luật với web', () => {
  function mobileErrors(value: unknown): string[] {
    const dto = plainToInstance(MobileLoginDto, { identifier: value, password: 'matkhau123' });
    const field = validateSync(dto).find((e) => e.property === 'identifier');
    return Object.values(field?.constraints ?? {});
  }

  it('nhận thứ web nhận và từ chối thứ web từ chối', () => {
    expect(mobileErrors('ban@congty.vn')).toEqual([]);
    expect(mobileErrors('0901234567')).toEqual([]);
    expect(mobileErrors('ban@congty')).toContain('Email không hợp lệ');
    expect(mobileErrors('0901')).toContain('Số điện thoại không hợp lệ');
  });
});
