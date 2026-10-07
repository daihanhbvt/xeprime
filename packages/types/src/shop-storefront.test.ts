import { describe, expect, it } from 'vitest';

import {
  STOREFRONT_KIND,
  storefrontAvatarUrl,
  storefrontIdentity,
  type StorefrontOwnerIdentity,
  type StorefrontShopIdentity,
} from './shop-storefront';

/**
 * ADR 0054 — mặt tiền CÁ NHÂN dùng danh tính tài khoản chủ, mặt tiền GIAN HÀNG giữ bộ riêng.
 * Suy lúc đọc theo tuyến: đổi tuyến là đổi theo, không có gì để chép.
 */

const SHOP: StorefrontShopIdentity = {
  name: 'Xe Sài Gòn Premium',
  phone: '1900 1234',
  email: 'lienhe@xesaigon.vn',
  logoUrl: 'https://cdn.test/logo.png',
};

const OWNER: StorefrontOwnerIdentity = {
  displayName: 'Trần Thu Hương',
  phone: '84903000001',
  phoneVerified: true,
  email: 'huong@xeprime.test',
  emailVerified: true,
  avatarUrl: 'https://cdn.test/avatar.jpg',
};

describe('storefrontIdentity', () => {
  it('mặt tiền gian hàng: bộ riêng của gian hàng, không đụng tài khoản chủ', () => {
    expect(storefrontIdentity(STOREFRONT_KIND.SHOP, SHOP, OWNER)).toEqual({
      name: 'Xe Sài Gòn Premium',
      phone: '1900 1234',
      email: 'lienhe@xesaigon.vn',
      avatarUrl: 'https://cdn.test/logo.png',
    });
  });

  it('mặt tiền cá nhân: tên, SĐT (dạng 0…), email, ảnh đều từ tài khoản — logo cũ không thắng', () => {
    expect(storefrontIdentity(STOREFRONT_KIND.PERSONAL, SHOP, OWNER)).toEqual({
      name: 'Trần Thu Hương',
      phone: '0903000001',
      email: 'huong@xeprime.test',
      avatarUrl: 'https://cdn.test/avatar.jpg',
    });
  });

  it('SĐT/email CHƯA xác thực thì không công bố — không rơi về số tự khai của gian hàng', () => {
    const identity = storefrontIdentity(STOREFRONT_KIND.PERSONAL, SHOP, {
      ...OWNER,
      phoneVerified: false,
      emailVerified: false,
    });
    expect(identity.phone).toBeNull();
    expect(identity.email).toBeNull();
  });

  it('họ tên toàn dấu cách: rơi về tên đã lưu thay vì hiện một ô trống', () => {
    expect(
      storefrontIdentity(STOREFRONT_KIND.PERSONAL, SHOP, { ...OWNER, displayName: '   ' }).name,
    ).toBe('Xe Sài Gòn Premium');
  });
});

describe('storefrontAvatarUrl', () => {
  it('cùng luật ảnh với storefrontIdentity', () => {
    expect(storefrontAvatarUrl(SHOP.logoUrl, OWNER.avatarUrl, STOREFRONT_KIND.PERSONAL)).toBe(
      OWNER.avatarUrl,
    );
    expect(storefrontAvatarUrl(SHOP.logoUrl, OWNER.avatarUrl, STOREFRONT_KIND.SHOP)).toBe(
      SHOP.logoUrl,
    );
    // Gian hàng chưa có logo KHÔNG mượn ảnh chân dung của người đứng tên.
    expect(storefrontAvatarUrl(null, OWNER.avatarUrl, STOREFRONT_KIND.SHOP)).toBeNull();
  });
});
