import { REGISTRATION_TRACK, TENANT_TYPE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import {
  PROVINCE_CODE_PATTERN,
  WARD_CODE_PATTERN,
  registerShopSchema,
  type RegisterShopValues,
} from './index';

/**
 * ĐĂNG KÝ người cho thuê xe — MỘT schema, HAI cửa vào (ADR 0040).
 *
 * Hai thứ được khoá ở đây, và cả hai là lỗi ĐÃ CÓ THẬT trên giao diện:
 *
 *  1. **Mẫu mã hành chính.** Bản trước viết `/^d{5}$/` — thiếu dấu gạch chéo ngược, nên nó khớp
 *     chuỗi `"ddddd"` và KHÔNG khớp một mã xã thật nào. Mọi lượt chọn xã đều bị từ chối, và vì
 *     `ShopOnboarding.validation` chưa có khoá `wardInvalid`, `useValidationResolver` để nguyên
 *     chuỗi gốc — người dùng đọc thấy đúng chữ `wardInvalid` trên màn hình.
 *  2. **`registrationTrack` đổi LUẬT, không chỉ đổi chữ.** Nếu nó chỉ là câu chữ thì hai cửa vào
 *     gửi lên cùng một request, và người bấm "Đăng ký gian hàng" thành chủ xe tuyến hoa hồng.
 */

/** Mã lỗi của lần validate — `useValidationResolver` tra `ShopOnboarding.validation.<mã>`. */
async function errorsFor(value: Record<string, unknown>): Promise<string[]> {
  try {
    await registerShopSchema.validate(value, { abortEarly: false });
    return [];
  } catch (error) {
    return ((error as { errors?: string[] }).errors ?? []).sort();
  }
}

const COMMISSION = {
  name: 'Nguyễn Văn A',
  tenantType: TENANT_TYPE.INDIVIDUAL,
  registrationTrack: REGISTRATION_TRACK.COMMISSION,
  provinceCode: '79',
  wardCode: '',
  addressLine: '',
  phone: '',
  email: '',
};

const PACKAGE = {
  ...COMMISSION,
  registrationTrack: REGISTRATION_TRACK.PACKAGE,
  name: 'Cho thuê xe Bình Minh',
  wardCode: '26734',
  addressLine: '12 Nguyễn Huệ',
  phone: '0901234567',
};

describe('Mẫu mã đơn vị hành chính', () => {
  /*
   * Hằng số chứ không phải mẫu viết inline: ba ô địa chỉ trong `index.ts` đã mang cùng một lỗi
   * đánh máy, và một hằng được kiểm ở đây thì không thể sai ở chỗ thứ tư.
   */
  it('khớp mã THẬT (2 và 5 chữ số), không khớp chữ `dd`/`ddddd`', () => {
    expect(PROVINCE_CODE_PATTERN.test('79')).toBe(true);
    expect(PROVINCE_CODE_PATTERN.test('01')).toBe(true);
    expect(PROVINCE_CODE_PATTERN.test('dd')).toBe(false);
    expect(PROVINCE_CODE_PATTERN.test('7')).toBe(false);
    expect(PROVINCE_CODE_PATTERN.test('790')).toBe(false);

    expect(WARD_CODE_PATTERN.test('26734')).toBe(true);
    expect(WARD_CODE_PATTERN.test('00001')).toBe(true);
    expect(WARD_CODE_PATTERN.test('ddddd')).toBe(false);
    expect(WARD_CODE_PATTERN.test('2673')).toBe(false);
    expect(WARD_CODE_PATTERN.test('267341')).toBe(false);
  });
});

describe('registerShopSchema — tuyến HOA HỒNG', () => {
  it('chỉ đòi tên + loại hình + tỉnh', async () => {
    expect(await errorsFor(COMMISSION)).toEqual([]);
  });

  it('thiếu tỉnh ⇒ mã `provinceRequired`', async () => {
    expect(await errorsFor({ ...COMMISSION, provinceCode: '' })).toContain('provinceRequired');
  });

  /**
   * HỒI QUY `wardInvalid`: một mã xã HỢP LỆ phải đi qua. Với mẫu cũ, dòng này đỏ — và đó là lý do
   * người dùng thấy chữ `wardInvalid` trên màn hình.
   */
  it('chọn xã hợp lệ vẫn qua, dù xã là tuỳ chọn ở tuyến này', async () => {
    expect(await errorsFor({ ...COMMISSION, wardCode: '26734' })).toEqual([]);
  });

  it('mã xã SAI ĐỘ DÀI ⇒ mã `wardInvalid` (và chỉ khi có nhập)', async () => {
    expect(await errorsFor({ ...COMMISSION, wardCode: '267' })).toContain('wardInvalid');
    // Ô chưa chọn mang chuỗi rỗng — một trường TUỲ CHỌN không được chặn form ngay khi vừa mở.
    expect(await errorsFor({ ...COMMISSION, wardCode: '' })).toEqual([]);
  });
});

describe('registerShopSchema — tuyến GÓI', () => {
  it('đủ xã + địa chỉ + SĐT ⇒ qua', async () => {
    expect(await errorsFor(PACKAGE)).toEqual([]);
  });

  /**
   * Hai trường nghiêm hơn, và chúng khớp ĐÚNG `missingPackageShopRegistrationFields` ở
   * `@xeprime/types` — cùng quy tắc, hai lớp thi hành. Hỏi ở bước 1 rẻ hơn hẳn so với để gian
   * hàng trả tiền xong rồi mới bị cổng đăng xe từ chối.
   *
   * Từng có trường thứ ba là `wardCode`. ADR 0042 bỏ nó ở cả hai lớp cùng lúc: form không còn ô
   * Xã/phường, nên một schema vẫn đòi nó là một nút Lưu chết không giải thích được.
   */
  it('thiếu cả hai ⇒ hai mã lỗi, không phải một câu chung', async () => {
    expect(await errorsFor({ ...PACKAGE, addressLine: '', phone: '' })).toEqual([
      'addressLineRequired',
      'phoneRequired',
    ]);
  });

  it('xã/phường để trống vẫn qua — không lớp nào còn đòi nó', async () => {
    expect(await errorsFor({ ...PACKAGE, wardCode: '' })).toEqual([]);
  });

  it.each([
    ['addressLine', 'addressLineRequired'],
    ['phone', 'phoneRequired'],
  ])('thiếu %s ⇒ %s', async (field, code) => {
    expect(await errorsFor({ ...PACKAGE, [field]: '' })).toEqual([code]);
  });

  it('SĐT sai dạng ⇒ `phoneInvalid`, không phải `phoneRequired`', async () => {
    expect(await errorsFor({ ...PACKAGE, phone: '12345' })).toEqual(['phoneInvalid']);
  });

  /*
   * CÙNG bộ giá trị, KHÁC cửa vào ⇒ khác kết quả. Đây là mệnh đề chứng minh `registrationTrack`
   * điều khiển LUẬT chứ không chỉ câu chữ: nếu nó chỉ là một nhãn thì hai dòng dưới đây bằng nhau.
   */
  it('cùng dữ liệu: tuyến hoa hồng qua, tuyến gói không', async () => {
    const bare = { ...COMMISSION, wardCode: '', addressLine: '', phone: '' };
    expect(await errorsFor(bare)).toEqual([]);
    expect(await errorsFor({ ...bare, registrationTrack: REGISTRATION_TRACK.PACKAGE })).toEqual([
      'addressLineRequired',
      'phoneRequired',
    ]);
  });

  /*
   * Vắng `registrationTrack` (client cũ, hay một form chưa đặt giá trị) rơi về cửa MẶC ĐỊNH nhờ
   * `.default()` — mức không đòi tiền và không đòi thêm trường nào.
   */
  it('vắng `registrationTrack` ⇒ mặc định tuyến hoa hồng', async () => {
    const { registrationTrack: _omit, ...withoutTrack } = COMMISSION;
    const value = (await registerShopSchema.validate(withoutTrack)) as RegisterShopValues;
    expect(value.registrationTrack).toBe(REGISTRATION_TRACK.COMMISSION);
  });
});
