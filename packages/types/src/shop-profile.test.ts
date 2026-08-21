import { describe, expect, it } from 'vitest';
import {
  SHOP_PROFILE_REQUIREMENT,
  SHOP_PROFILE_SUGGESTION,
  isShopProfileSubmittable,
  missingShopProfileRequirements,
  missingShopProfileSuggestions,
  type ShopProfileCompletenessInput,
} from './shop-profile';

/**
 * Quy tắc này là cổng gửi duyệt của CẢ HAI phía, nên nó phải trả lời y hệt nhau ở mọi dạng
 * "chưa có" mà hai phía sinh ra: backend ghi `NULL`, form phía web cầm chuỗi rỗng, và người
 * dùng thì gõ dấu cách.
 */
const COMPLETE: ShopProfileCompletenessInput = {
  displayName: 'Cho thuê xe Bình Minh',
  provinceCode: '48',
  ownerFullName: 'Nguyễn Văn A',
  ownerPhone: '84901234567',
};

describe('missingShopProfileRequirements', () => {
  it('đủ bốn mục bắt buộc → không thiếu gì, gửi duyệt được', () => {
    expect(missingShopProfileRequirements(COMPLETE)).toEqual([]);
    expect(isShopProfileSubmittable(COMPLETE)).toBe(true);
  });

  it('hồ sơ trắng trơn → thiếu đủ bốn mục, theo đúng thứ tự đọc trên màn hình', () => {
    expect(missingShopProfileRequirements({})).toEqual([
      SHOP_PROFILE_REQUIREMENT.DISPLAY_NAME,
      SHOP_PROFILE_REQUIREMENT.PROVINCE,
      SHOP_PROFILE_REQUIREMENT.OWNER_NAME,
      SHOP_PROFILE_REQUIREMENT.OWNER_PHONE,
    ]);
    expect(isShopProfileSubmittable({})).toBe(false);
  });

  it.each([
    ['null (dạng backend ghi)', null],
    ['chuỗi rỗng (dạng form web cầm)', ''],
    ['toàn dấu cách', '   '],
  ])('%s đều tính là chưa có', (_label, value) => {
    expect(missingShopProfileRequirements({ ...COMPLETE, ownerPhone: value })).toEqual([
      SHOP_PROFILE_REQUIREMENT.OWNER_PHONE,
    ]);
  });
});

describe('missingShopProfileSuggestions', () => {
  it('mục nên có KHÔNG chặn gửi duyệt', () => {
    expect(missingShopProfileSuggestions(COMPLETE).length).toBeGreaterThan(0);
    expect(isShopProfileSubmittable(COMPLETE)).toBe(true);
  });

  it('tài khoản nhận tiền là MỘT mục — thiếu một cột là thiếu cả mục', () => {
    const partialBank: ShopProfileCompletenessInput = {
      ...COMPLETE,
      bankName: 'Vietcombank',
      bankAccountNo: '0123456789',
      bankAccountName: null,
    };

    expect(missingShopProfileSuggestions(partialBank)).toContain(SHOP_PROFILE_SUGGESTION.BANK);
  });

  it('đủ cả ba cột ngân hàng → mục đó biến mất', () => {
    const fullBank: ShopProfileCompletenessInput = {
      ...COMPLETE,
      bankName: 'Vietcombank',
      bankAccountNo: '0123456789',
      bankAccountName: 'NGUYEN VAN A',
    };

    expect(missingShopProfileSuggestions(fullBank)).not.toContain(SHOP_PROFILE_SUGGESTION.BANK);
  });
});
