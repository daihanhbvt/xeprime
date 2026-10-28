import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto } from './auth.dto';

function newPasswordErrors(newPassword: string): string[] {
  const dto = plainToInstance(ChangePasswordDto, { currentPassword: 'cu', newPassword });
  return validateSync(dto)
    .filter((e) => e.property === 'newPassword')
    .flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('ChangePasswordDto.newPassword', () => {
  it('nhận mật khẩu có chữ và số dù không chứa chữ "d"', () => {
    expect(newPasswordErrors('At123456789@')).toEqual([]);
  });

  it('từ chối mật khẩu không có chữ số', () => {
    expect(newPasswordErrors('Abcdefgh@')).toContain('Mật khẩu cần có số');
  });

  it('từ chối mật khẩu không có chữ cái', () => {
    expect(newPasswordErrors('12345678@')).toContain('Mật khẩu cần có chữ');
  });
});
