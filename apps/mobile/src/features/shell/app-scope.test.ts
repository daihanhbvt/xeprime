import type { components } from '@xeprime/types';
import { APP_SCOPE, resolveInitialScope, resolveScopeCapability } from './app-scope';

type Me = components['schemas']['MeDto'];

function me(overrides: Partial<Me> = {}): Me {
  return {
    id: '01J000000000000000000000',
    displayName: 'Nguyễn Văn A',
    email: null,
    avatarUrl: null,
    phone: '0901234567',
    phoneVerified: true,
    hasPassword: true,
    tenant: null,
    platformRole: null,
    permissions: [],
    ...overrides,
  } as Me;
}

function tenant(status: string) {
  return {
    id: '01J00000000000000000000T',
    name: 'Gian hàng',
    slug: 'gian-hang',
    status,
    roleKey: 'shop_owner',
    features: [],
    planCode: null,
    planEndsAt: null,
  };
}

/**
 * Vai của phiên quyết định app mở ra khu nào. Sai ở đây không hiện thành lỗi — nó hiện thành
 * "app tự nhảy" hoặc "chủ shop mở app thấy marketplace", tức triệu chứng không ai báo được.
 */
describe('resolveScopeCapability', () => {
  it('chưa đăng nhập: không thuê được, không quản lý được', () => {
    expect(resolveScopeCapability(null)).toEqual({
      canRent: false,
      canManage: false,
      canAdmin: false,
    });
  });

  it('khách thuần: thuê được, không có gì để quản lý', () => {
    expect(resolveScopeCapability(me())).toEqual({
      canRent: true,
      canManage: false,
      canAdmin: false,
    });
  });

  it('có membership gian hàng ở BẤT KỲ trạng thái nào cũng quản lý được', () => {
    for (const status of ['draft', 'pending_review', 'suspended', 'expired', 'active']) {
      expect(resolveScopeCapability(me({ tenant: tenant(status) })).canManage).toBe(true);
    }
  });

  it('nhân sự nền tảng nhận cờ riêng, không lẫn với chủ gian hàng', () => {
    const cap = resolveScopeCapability(me({ platformRole: 'platform_admin' }));
    expect(cap).toEqual({ canRent: true, canManage: false, canAdmin: true });
  });
});

describe('resolveInitialScope', () => {
  it('chưa đăng nhập → khu khách', () => {
    expect(resolveInitialScope({ user: null })).toBe(APP_SCOPE.CUSTOMER);
  });

  it('khách thuần → khu khách, kể cả khi lần trước đã chọn khu quản lý', () => {
    expect(resolveInitialScope({ user: me(), remembered: APP_SCOPE.MANAGE })).toBe(
      APP_SCOPE.CUSTOMER,
    );
  });

  it('có gian hàng → khu quản lý ở MỌI trạng thái gian hàng', () => {
    for (const status of [
      'draft',
      'pending_review',
      'needs_revision',
      'suspended',
      'rejected',
      'expired',
      'active',
    ]) {
      expect(resolveInitialScope({ user: me({ tenant: tenant(status) }) })).toBe(APP_SCOPE.MANAGE);
    }
  });

  it('nhân sự nền tảng KHÔNG có gian hàng vẫn mở ở khu quản lý', () => {
    expect(resolveInitialScope({ user: me({ platformRole: 'platform_admin' }) })).toBe(
      APP_SCOPE.MANAGE,
    );
  });

  it('đã tự chọn khu khách thì tôn trọng lựa chọn đó', () => {
    const user = me({ tenant: tenant('active') });
    expect(resolveInitialScope({ user, remembered: APP_SCOPE.CUSTOMER })).toBe(APP_SCOPE.CUSTOMER);
    expect(resolveInitialScope({ user, remembered: APP_SCOPE.MANAGE })).toBe(APP_SCOPE.MANAGE);
    expect(resolveInitialScope({ user })).toBe(APP_SCOPE.MANAGE);
  });
});
