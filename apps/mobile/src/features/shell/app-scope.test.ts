import type { components } from '@xeprime/types';
import { SHOP_ONBOARDING_STATE } from '@xeprime/types';

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
    openRenterTripCount: 0,
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
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    logoUrl: null,
    roleKey: 'shop_owner',
    features: [],
    planCode: null,
    planName: null,
    serviceFeePercent: null,
    billingMode: 'package',
    planEndsAt: null,
    billingPhase: 'current',
    graceEndsAt: null,
    publicVehicleCount: 1,
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
      packageOnboardingPending: false,
    });
  });

  it('khách thuần: thuê được, không có gì để quản lý', () => {
    expect(resolveScopeCapability(me())).toEqual({
      canRent: true,
      canManage: false,
      canAdmin: false,
      packageOnboardingPending: false,
    });
  });

  it('gian hàng TUYẾN GÓI quản lý được ở BẤT KỲ trạng thái tenant nào', () => {
    for (const status of ['draft', 'pending_review', 'suspended', 'expired', 'active']) {
      expect(resolveScopeCapability(me({ tenant: tenant(status) })).canManage).toBe(true);
    }
  });

  /**
   * ADR 0038 điều 4 — cổng Manage hỏi TUYẾN, không hỏi "có tenant không".
   *
   * Chủ xe tuyến hoa hồng cũng có `tenant`, nhưng `SubscriptionTrackGuard` ở server từ chối cả bộ
   * quản lý gian hàng. Mở khu đó cho họ là đẩy họ vào một loạt màn trả 403 — app trông như hỏng,
   * còn nguyên nhân nằm ở một tầng họ không nhìn thấy.
   */
  it('chủ xe tuyến HOA HỒNG có tenant nhưng KHÔNG vào khu quản lý', () => {
    const user = me({ tenant: { ...tenant('active'), billingMode: 'commission' } });
    expect(resolveScopeCapability(user).canManage).toBe(false);
  });

  /**
   * `unconfigured` không phải một tuyến (ADR 0038 điều 1) — và mức an toàn khi hỏng là mức CHẶT.
   */
  it('gian hàng chưa xác định được tuyến cũng KHÔNG vào khu quản lý', () => {
    const user = me({ tenant: { ...tenant('active'), billingMode: null } });
    expect(resolveScopeCapability(user).canManage).toBe(false);
  });

  /**
   * Câu hỏi hỏi TENANT, không hỏi vai: hết ân hạn thì chủ, quản lý, nhân viên và người xem rời khu
   * quản lý CÙNG LÚC. Bản trước hỏi một hàm gộp vai với tuyến, nên nó mở cổng cho mọi vai khác chủ.
   */
  it('mọi vai của một tenant tuyến hoa hồng đều bị chặn như nhau', () => {
    for (const roleKey of ['shop_owner', 'shop_manager', 'shop_staff', 'shop_viewer']) {
      const user = me({
        tenant: { ...tenant('active'), roleKey, billingMode: 'commission' },
      });
      expect(resolveScopeCapability(user).canManage).toBe(false);
    }
  });

  it('nhân sự nền tảng nhận cờ riêng, không lẫn với chủ gian hàng', () => {
    const cap = resolveScopeCapability(me({ platformRole: 'platform_admin' }));
    expect(cap).toEqual({
      canRent: true,
      canManage: false,
      canAdmin: true,
      packageOnboardingPending: false,
    });
  });

  /**
   * ADR 0040 — gian hàng trả phí CHƯA chuyển khoản có `billingMode` rỗng y như một tenant hỏng
   * danh mục gói, nên cờ này là thứ duy nhất tách được hai ca đó ở client.
   */
  it('gian hàng tuyến gói chưa thanh toán: chưa vào Manage, nhưng đang NỢ bước onboarding', () => {
    const user = me({
      tenant: { ...tenant('draft'), onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING, billingMode: null },
    });
    const cap = resolveScopeCapability(user);
    expect(cap.canManage).toBe(false);
    expect(cap.packageOnboardingPending).toBe(true);
  });

  it('gian hàng đã trả tiền xong KHÔNG còn nợ bước nào', () => {
    const user = me({ tenant: { ...tenant('active'), onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE } });
    expect(resolveScopeCapability(user).packageOnboardingPending).toBe(false);
  });

  /**
   * Một dòng dữ liệu cũ có thể để lại `package_pending` cạnh một gói ĐANG hiệu lực (admin gán tay).
   * Tiền đã về ⇒ không còn nợ gì, và một màn "hãy chuyển khoản" đứng trước một gian hàng đã trả
   * tiền là lỗi tệ hơn hẳn việc bỏ sót một lần cập nhật cột.
   */
  it('còn cờ package_pending nhưng gói đã hiệu lực ⇒ không nợ bước nào', () => {
    const user = me({
      tenant: { ...tenant('active'), onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING, billingMode: 'package' },
    });
    const cap = resolveScopeCapability(user);
    expect(cap.canManage).toBe(true);
    expect(cap.packageOnboardingPending).toBe(false);
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

  it('chủ xe tuyến hoa hồng mở ở khu KHÁCH — Owner Lite là nhà của họ', () => {
    const user = me({ tenant: { ...tenant('active'), billingMode: 'commission' } });
    expect(resolveInitialScope({ user, remembered: APP_SCOPE.MANAGE })).toBe(APP_SCOPE.CUSTOMER);
  });

  it('gian hàng tuyến gói → khu quản lý ở MỌI trạng thái gian hàng', () => {
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

  /**
   * ADR 0040 — bước còn nợ THẮNG cả lựa chọn đã nhớ.
   *
   * Không có chốt này thì người vừa bấm "Đăng ký gian hàng" rồi tắt app giữa chừng mở lại vào chợ
   * xe (hoặc tệ hơn: vào Owner Lite của tuyến hoa hồng, đúng màn mà ADR 0040 sinh ra để họ không
   * bao giờ thấy) — trong khi việc duy nhất họ có là màn thanh toán ở khu quản lý.
   */
  it('gian hàng trả phí chưa chuyển khoản → khu QUẢN LÝ, kể cả khi lần trước chọn khu khách', () => {
    const user = me({
      tenant: { ...tenant('draft'), onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING, billingMode: null },
    });
    expect(resolveInitialScope({ user })).toBe(APP_SCOPE.MANAGE);
    expect(resolveInitialScope({ user, remembered: APP_SCOPE.CUSTOMER })).toBe(APP_SCOPE.MANAGE);
  });
});
