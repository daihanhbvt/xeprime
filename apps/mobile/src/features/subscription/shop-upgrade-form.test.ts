import { PACKAGE_SHOP_LISTING_REQUIREMENT } from '@xeprime/types';
import type { ShopUpgradeValues } from '@xeprime/validators';

import type { Branch } from '@/features/branches/api';
import type { MyShop } from '@/features/shop/api';

import {
  missingShopUpgradeFields,
  toShopUpgradeBranchBody,
  toShopUpgradeProfileBody,
  toShopUpgradeValues,
} from './shop-upgrade-form';

/**
 * Bước 2 của luồng nâng cấp đụng vào HAI bảng qua hai endpoint, và ba hàm dưới đây quyết định cái
 * gì đi vào phong bì nào. Đó là chỗ một lỗi im lặng đắt nhất: gửi thiếu một ô của
 * `PATCH /shop/profile` không báo lỗi gì cả — nó xoá trắng ô đó.
 */

/** Hồ sơ gian hàng ĐẦY ĐỦ — mọi ô mà form nâng cấp KHÔNG hỏi đều có giá trị thật. */
function shopFixture(overrides: Partial<MyShop['profile']> = {}): MyShop {
  return {
    profile: {
      displayName: 'Gian hàng cũ',
      bio: 'Giới thiệu đã viết từ trước',
      provinceCode: '01',
      wardCode: '00001',
      taxCode: '0101234567',
      businessLicenseNo: 'GP-123',
      logoUrl: 'https://cdn.test/logo.png',
      coverUrl: 'https://cdn.test/cover.png',
      ...overrides,
    },
    defaultBranch: { id: 'branch-1' },
  } as unknown as MyShop;
}

function branchFixture(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'branch-1',
    provinceCode: '48',
    wardCode: '20194',
    addressLine: '12 Nguyễn Văn Linh',
    phone: '0905123456',
    ...overrides,
  } as unknown as Branch;
}

function valuesFixture(overrides: Partial<ShopUpgradeValues> = {}): ShopUpgradeValues {
  return {
    displayName: 'Gian hàng mới',
    provinceCode: '48',
    wardCode: '20194',
    addressLine: '12 Nguyễn Văn Linh',
    contactPhone: '0905123456',
    logoUrl: 'https://cdn.test/logo.png',
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    ...overrides,
  };
}

describe('toShopUpgradeValues', () => {
  it('đọc địa chỉ và SĐT từ CHI NHÁNH, không từ bản sao trên hồ sơ', () => {
    const values = toShopUpgradeValues(shopFixture(), branchFixture());

    // Hồ sơ nói tỉnh 01, chi nhánh nói 48 — chi nhánh là nguồn sự thật của địa chỉ vận hành.
    expect(values.provinceCode).toBe('48');
    expect(values.wardCode).toBe('20194');
    expect(values.addressLine).toBe('12 Nguyễn Văn Linh');
    expect(values.contactPhone).toBe('0905123456');
  });

  it('rơi về hồ sơ khi chưa có chi nhánh, và mở form ở trạng thái CHƯA xác nhận ghim', () => {
    const values = toShopUpgradeValues(shopFixture(), null);

    expect(values.provinceCode).toBe('01');
    expect(values.contactPhone).toBe('');
    // Ghim để NGƯỜI DÙNG xác nhận lại trên bản đồ — địa chỉ cũ thường chưa từng đi qua đó.
    expect(values.placeId).toBeNull();
    expect(values.latitude).toBeNull();
    expect(values.longitude).toBeNull();
  });
});

describe('toShopUpgradeProfileBody', () => {
  it('GIỮ NGUYÊN những ô form không hỏi', () => {
    const body = toShopUpgradeProfileBody(shopFixture(), valuesFixture());

    expect(body.bio).toBe('Giới thiệu đã viết từ trước');
    expect(body.taxCode).toBe('0101234567');
    expect(body.businessLicenseNo).toBe('GP-123');
    expect(body.coverUrl).toBe('https://cdn.test/cover.png');
  });

  it('ghi đè đúng những ô người dùng vừa sửa', () => {
    const body = toShopUpgradeProfileBody(
      shopFixture(),
      valuesFixture({ displayName: 'Tên mới', logoUrl: null }),
    );

    expect(body.displayName).toBe('Tên mới');
    expect(body.provinceCode).toBe('48');
    expect(body.addressLine).toBe('12 Nguyễn Văn Linh');
    expect(body.logoUrl).toBe('');
  });

  it('KHÔNG gửi mã xã rỗng — `@IsOptional()` chỉ bỏ qua null/undefined, không bỏ qua chuỗi rỗng', () => {
    const body = toShopUpgradeProfileBody(shopFixture(), valuesFixture({ wardCode: '' }));

    expect(body.wardCode).toBeUndefined();
  });
});

describe('toShopUpgradeBranchBody', () => {
  it('chỉ mang SĐT — địa chỉ đã đi qua hồ sơ và được chuyển tiếp cho chính chi nhánh này', () => {
    expect(toShopUpgradeBranchBody(valuesFixture())).toEqual({ phone: '0905123456' });
  });
});

describe('missingShopUpgradeFields', () => {
  it('không báo thiếu khi bốn ô bắt buộc đã đủ', () => {
    expect(missingShopUpgradeFields(valuesFixture())).toEqual([]);
  });

  it('nêu đúng ô còn trống, theo cùng bộ mã mà cổng đăng xe dùng', () => {
    const missing = missingShopUpgradeFields(
      valuesFixture({ contactPhone: '', addressLine: '   ' }),
    );

    expect(missing).toContain(PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE);
    expect(missing).toContain(PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS);
  });

  it('LOGO không phải điều kiện mua gói — cổng đòi nó là lúc chiếc xe đầu tiên lên chợ', () => {
    expect(missingShopUpgradeFields(valuesFixture({ logoUrl: null }))).toEqual([]);
  });
});
