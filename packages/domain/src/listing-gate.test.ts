import { describe, expect, it } from 'vitest';
import { API_ERROR_CODE, PACKAGE_SHOP_LISTING_REQUIREMENT } from '@xeprime/types';

import { isLogoOnlyGate, packageShopListingGateFrom, type ApiErrorLike } from './listing-gate';

function gateError(details: unknown): ApiErrorLike {
  return { code: API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING, details };
}

/**
 * Cổng "hồ sơ gian hàng chưa đủ để gửi xe duyệt" (ADR 0040 điều 7).
 *
 * Sai ở đây không hiện thành lỗi — nó hiện thành một dải trống, hoặc một mã lạ in trần trên giao
 * diện, đúng kiểu `wardInvalid` từng gây ra ở một chỗ khác.
 */
describe('packageShopListingGateFrom', () => {
  it('đọc danh sách mã còn thiếu từ đúng lỗi của cổng đăng xe', () => {
    const missing = packageShopListingGateFrom(
      gateError({
        missing: [PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO, PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS],
      }),
    );

    expect(missing).toEqual([
      PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
      PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS,
    ]);
  });

  /**
   * KHÔNG nhận `PROFILE_INCOMPLETE` của cổng xác minh: hai bộ quy tắc trùng tên nhau ở
   * `displayName`/`province`, nên chỉ nhìn `details.missing` thì một lỗi của bộ kia sẽ được vẽ
   * bằng nhãn của bộ này và trông vẫn hợp lý.
   */
  it('bỏ qua lỗi của cổng XÁC MINH dù `details.missing` có hình dạng giống hệt', () => {
    const other: ApiErrorLike = {
      code: API_ERROR_CODE.PROFILE_INCOMPLETE,
      details: { missing: ['displayName'] },
    };

    expect(packageShopListingGateFrom(other)).toBeNull();
  });

  it('không phải lỗi API thì trả null, không ném', () => {
    expect(packageShopListingGateFrom(new Error('mạng hỏng'))).toBeNull();
    expect(packageShopListingGateFrom(null)).toBeNull();
    expect(packageShopListingGateFrom(undefined)).toBeNull();
    expect(packageShopListingGateFrom('SHOP_LISTING_REQUIREMENTS_MISSING')).toBeNull();
  });

  it('`details` không có mảng `missing` ⇒ null', () => {
    expect(packageShopListingGateFrom(gateError(null))).toBeNull();
    expect(packageShopListingGateFrom(gateError({ missing: 'logo' }))).toBeNull();
  });

  /**
   * Backend MỚI HƠN có thể thêm mã thứ bảy mà bản app đang cài chưa có nhãn — `t()` với khoá không
   * tồn tại in ra chính khoá đó, tức người dùng đọc thấy `businessLicense` trần trên giao diện.
   */
  it('lọc mã lạ ở biên, giữ lại mã hiểu được', () => {
    const missing = packageShopListingGateFrom(
      gateError({ missing: ['businessLicense', PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO, 42] }),
    );

    expect(missing).toEqual([PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO]);
  });

  it('chỉ toàn mã lạ ⇒ null, để nơi gọi rơi về câu lỗi chung thay vì một dải trống', () => {
    expect(packageShopListingGateFrom(gateError({ missing: ['businessLicense'] }))).toBeNull();
  });
});

describe('isLogoOnlyGate', () => {
  it('đúng khi mục duy nhất còn thiếu là logo — ca thường gặp sau khi thanh toán', () => {
    expect(isLogoOnlyGate([PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO])).toBe(true);
  });

  it('sai khi còn mục khác, kể cả khi logo cũng thiếu', () => {
    expect(
      isLogoOnlyGate([
        PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
        PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS,
      ]),
    ).toBe(false);
    expect(isLogoOnlyGate([PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS])).toBe(false);
    expect(isLogoOnlyGate([])).toBe(false);
  });
});
