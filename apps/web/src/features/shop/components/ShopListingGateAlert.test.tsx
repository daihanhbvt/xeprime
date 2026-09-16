import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE, PACKAGE_SHOP_LISTING_REQUIREMENT } from '@xeprime/types';

import { isLogoOnlyGate, packageShopListingGateFrom } from '../listing-gate';
import { ShopListingGateAlert } from './ShopListingGateAlert';

/**
 * CỔNG HỒ SƠ GIAN HÀNG khi gửi xe duyệt (ADR 0040) — từ MÃ lỗi tới một câu đọc được + một link.
 *
 * Hai nửa được khoá ở đây:
 *
 *  1. **Đọc lỗi**: chỉ nhận `PROFILE_INCOMPLETE`, lọc mã lạ ở biên. Một backend mới hơn thêm mã
 *     thứ bảy mà web chưa có nhãn sẽ khiến `t()` in ra CHÍNH khoá đó — đúng lỗi `wardInvalid`
 *     từng gây ra ở một chỗ khác.
 *  2. **Hiển thị**: ca một-mục (chỉ thiếu logo) là ca thường gặp nhất trong luồng thật, và nó
 *     được một câu riêng nói thẳng thay vì một danh sách gạch đầu dòng có một dòng.
 */
afterEach(cleanup);

function apiError(code: string, details?: unknown): ApiClientError {
  return new ApiClientError({ code, message: 'lỗi', status: 409, details });
}

describe('packageShopListingGateFrom', () => {
  it('chỉ nhận PROFILE_INCOMPLETE', () => {
    expect(
      packageShopListingGateFrom(
        apiError(API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING, { missing: ['logo'] }),
      ),
    ).toEqual([PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO]);

    expect(
      packageShopListingGateFrom(apiError(API_ERROR_CODE.CONFLICT, { missing: ['logo'] })),
    ).toBeNull();
    expect(packageShopListingGateFrom(new Error('mạng lỗi'))).toBeNull();
    expect(packageShopListingGateFrom(null)).toBeNull();
  });

  /**
   * Mã LẠ bị lọc, và nếu KHÔNG còn mã nào nhận ra thì trả `null` — nơi gọi rơi về câu lỗi chung
   * của server thay vì dựng một dải "còn thiếu" không liệt kê được gì.
   */
  it('lọc mã lạ ở biên; hết mã nhận ra thì trả null', () => {
    expect(
      packageShopListingGateFrom(
        apiError(API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING, { missing: ['logo', 'businessLicense'] }),
      ),
    ).toEqual([PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO]);

    expect(
      packageShopListingGateFrom(
        apiError(API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING, { missing: ['ownerName', 'ownerPhone'] }),
      ),
    ).toBeNull();
    expect(
      packageShopListingGateFrom(apiError(API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING, { missing: [] })),
    ).toBeNull();
    expect(packageShopListingGateFrom(apiError(API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING, {}))).toBeNull();
  });

  it('isLogoOnlyGate chỉ đúng khi logo là mục DUY NHẤT', () => {
    expect(isLogoOnlyGate([PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO])).toBe(true);
    expect(
      isLogoOnlyGate([
        PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
        PACKAGE_SHOP_LISTING_REQUIREMENT.WARD,
      ]),
    ).toBe(false);
    expect(isLogoOnlyGate([PACKAGE_SHOP_LISTING_REQUIREMENT.WARD])).toBe(false);
  });
});

describe('ShopListingGateAlert', () => {
  it('chỉ thiếu logo: một câu nói thẳng + CTA về đúng section hồ sơ', () => {
    render(<ShopListingGateAlert missing={[PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO]} />);

    expect(screen.getByText('Gian hàng cần có logo trước khi gửi xe duyệt.')).toBeTruthy();
    const cta = screen.getByRole('link', { name: /Tải logo/ });
    // `?section=profile` để trang Cửa hàng cuộn thẳng tới khối "Thông tin hiển thị" — nơi ô logo
    // sống. Trỏ vào `/manage/shop` trần là thả người dùng ở đầu một trang năm section.
    expect(cta.getAttribute('href')).toBe('/manage/shop?section=profile');
  });

  it('thiếu nhiều mục: liệt kê bằng NHÃN, không bao giờ in mã trần', () => {
    render(
      <ShopListingGateAlert
        missing={[
          PACKAGE_SHOP_LISTING_REQUIREMENT.WARD,
          PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE,
          PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
        ]}
      />,
    );

    expect(screen.getByText('Hồ sơ gian hàng còn thiếu thông tin')).toBeTruthy();
    expect(screen.getByText('Xã/phường')).toBeTruthy();
    expect(screen.getByText('Số điện thoại liên hệ')).toBeTruthy();
    expect(screen.getByText('Logo gian hàng')).toBeTruthy();
    // Không mã nào lọt ra giao diện ở dạng chữ trần.
    for (const code of ['ward', 'contactPhone', 'logo']) {
      expect(screen.queryByText(code)).toBeNull();
    }
  });
});
