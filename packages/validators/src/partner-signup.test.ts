import { REGISTRATION_TRACK } from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import { partnerSignupSchema } from './index';

/** Mã lỗi của lần validate — `useValidationResolver` tra `ShopOnboarding.validation.<mã>`. */
async function errorsFor(value: Record<string, unknown>): Promise<string[]> {
  try {
    await partnerSignupSchema.validate(value, { abortEarly: false });
    return [];
  } catch (error) {
    return ((error as { errors?: string[] }).errors ?? []).sort();
  }
}

const ACCOUNT = {
  withAccount: true,
  displayName: 'Nguyễn Văn A',
  password: 'matkhau123',
  confirmPassword: 'matkhau123',
  phone: '0901234567',
  email: 'a@xeprime.test',
  phoneVerified: true,
  provinceCode: '79',
  addressLine: '12 Lê Lợi',
};

describe('partnerSignupSchema — đăng ký đối tác một form', () => {
  it('chưa xác thực SĐT KHÔNG chặn ở schema — nút đăng ký mở popup OTP (server đối chiếu mã)', async () => {
    const track = REGISTRATION_TRACK.COMMISSION;
    expect(await errorsFor({ ...ACCOUNT, registrationTrack: track, phoneVerified: false })).toEqual(
      [],
    );
    expect(
      await errorsFor({
        ...ACCOUNT,
        withAccount: false,
        registrationTrack: track,
        name: 'Chủ xe A',
        phoneVerified: false,
      }),
    ).toEqual([]);
  });

  it('tuyến hoa hồng + tài khoản mới: họ tên thay cho tên hồ sơ, không hỏi lại', async () => {
    expect(
      await errorsFor({ ...ACCOUNT, registrationTrack: REGISTRATION_TRACK.COMMISSION }),
    ).toEqual([]);
  });

  it('email BẮT BUỘC ở cả hai tuyến', async () => {
    for (const track of [REGISTRATION_TRACK.COMMISSION, REGISTRATION_TRACK.PACKAGE]) {
      const errors = await errorsFor({
        ...ACCOUNT,
        registrationTrack: track,
        name: 'Gian hàng A',
        addressLine: '12 Lê Lợi',
        email: '',
      });
      expect(errors).toContain('emailRequired');
    }
  });

  it('số nhà/đường bắt buộc ở CẢ HAI tuyến', async () => {
    for (const track of [REGISTRATION_TRACK.COMMISSION, REGISTRATION_TRACK.PACKAGE]) {
      const errors = await errorsFor({
        ...ACCOUNT,
        registrationTrack: track,
        name: 'Gian hàng A',
        addressLine: '',
      });
      expect(errors).toEqual(['addressLineRequired']);
    }
  });

  it('tuyến gói đòi tên gian hàng', async () => {
    const errors = await errorsFor({ ...ACCOUNT, registrationTrack: REGISTRATION_TRACK.PACKAGE });
    expect(errors).toEqual(['nameMin', 'nameRequired']);
  });

  it('chỉ phần hồ sơ (đã có tài khoản): không đòi mật khẩu, nhưng đòi tên', async () => {
    const errors = await errorsFor({
      withAccount: false,
      registrationTrack: REGISTRATION_TRACK.COMMISSION,
      phone: '0901234567',
      email: 'a@xeprime.test',
      provinceCode: '79',
      addressLine: '12 Lê Lợi',
    });
    expect(errors).toEqual(['nameMin', 'nameRequired']);
  });

  it('mật khẩu theo PASSWORD_RULES và phải khớp ô nhập lại', async () => {
    const errors = await errorsFor({
      ...ACCOUNT,
      registrationTrack: REGISTRATION_TRACK.COMMISSION,
      password: 'abcdefgh',
      confirmPassword: 'khac',
    });
    expect(errors).toEqual(['confirmMismatch', 'passwordNeedsDigit']);
  });
});
