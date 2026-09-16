import { describe, expect, it } from 'vitest';
import { BILLING_MODE } from './status/billing';
import {
  hasVerifiedStorefront,
  resolveStorefrontKind,
  STOREFRONT_KIND,
} from './shop-storefront';

describe('resolveStorefrontKind', () => {
  it('tuyến gói ⇒ mặt tiền gian hàng', () => {
    expect(resolveStorefrontKind(BILLING_MODE.PACKAGE)).toBe(STOREFRONT_KIND.SHOP);
  });

  it('tuyến hoa hồng ⇒ mặt tiền cá nhân', () => {
    expect(resolveStorefrontKind(BILLING_MODE.COMMISSION)).toBe(STOREFRONT_KIND.PERSONAL);
  });

  // ADR 0038 điều 1: `unconfigured` không phải một tuyến. Đường đọc hiển thị phải chọn thứ KHÔNG
  // khẳng định gì — mặt tiền cá nhân — chứ không mặc định về gói.
  it('chưa xác định được tuyến ⇒ mặt tiền cá nhân, không phải gian hàng', () => {
    expect(resolveStorefrontKind(null)).toBe(STOREFRONT_KIND.PERSONAL);
    expect(resolveStorefrontKind(undefined)).toBe(STOREFRONT_KIND.PERSONAL);
    expect(resolveStorefrontKind('')).toBe(STOREFRONT_KIND.PERSONAL);
  });

  it('giá trị lạ ⇒ mặt tiền cá nhân', () => {
    expect(resolveStorefrontKind('enterprise')).toBe(STOREFRONT_KIND.PERSONAL);
  });
});

describe('hasVerifiedStorefront', () => {
  it('chỉ tuyến gói mới đeo dấu xác thực', () => {
    expect(hasVerifiedStorefront(BILLING_MODE.PACKAGE)).toBe(true);
    expect(hasVerifiedStorefront(BILLING_MODE.COMMISSION)).toBe(false);
    expect(hasVerifiedStorefront(null)).toBe(false);
  });
});
