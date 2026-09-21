import type { components } from '@xeprime/types';

import { isPackageOnboarding, resolveWorkspaceHref } from './workspace';

type Me = components['schemas']['MeDto'];
type Tenant = NonNullable<Me['tenant']>;

function me(tenant: Tenant | null): Me {
  return {
    id: '01J000000000000000000000',
    displayName: 'Nguyễn Văn A',
    email: null,
    avatarUrl: null,
    phone: '0901234567',
    phoneVerified: true,
    hasPassword: true,
    tenant,
    openRenterTripCount: 0,
    platformRole: null,
    permissions: [],
  } as Me;
}

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: '01J00000000000000000000T',
    name: 'Gian hàng',
    slug: 'gian-hang',
    status: 'active',
    onboardingState: 'package_active',
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
    ...overrides,
  } as Tenant;
}

/**
 * "Khu làm việc của người này ở đâu" — cùng thứ tự quyết định với `resolveWorkspaceHref` bên web.
 *
 * Sai ở đây không hiện thành lỗi; nó hiện thành một vòng nhảy giữa hai khu, hoặc một gian hàng
 * mười xe bị mời vào wizard "đăng ký chủ xe lần đầu".
 */
describe('resolveWorkspaceHref', () => {
  it('không có gian hàng ⇒ null, nơi gọi tự chọn', () => {
    expect(resolveWorkspaceHref(me(null))).toBeNull();
    expect(resolveWorkspaceHref(null)).toBeNull();
  });

  /**
   * ADR 0040 — câu hỏi "họ vào bằng cửa nào" phải trả lời TRƯỚC "tiền đang chạy theo tuyến nào".
   *
   * Gian hàng trả phí đang chờ đối soát cố ý không có dòng thuê bao nào, nên `billingMode` rỗng —
   * cùng hình dạng với một tenant có danh mục gói hỏng. Mọi phép suy chỉ dựa vào `billingMode` đẩy
   * họ vào Owner Lite, tức đúng màn mà ADR 0040 sinh ra để họ không bao giờ thấy.
   */
  it('gian hàng trả phí chưa chuyển khoản ⇒ màn onboarding, đọc TRƯỚC billingMode', () => {
    const user = me(tenant({ onboardingState: 'package_pending', billingMode: null }));
    expect(resolveWorkspaceHref(user)).toBe('/manage/onboarding');
  });

  it('gian hàng có thuê bao hiệu lực ⇒ khu quản lý, cho MỌI vai', () => {
    for (const roleKey of ['shop_owner', 'shop_manager', 'shop_staff', 'shop_viewer']) {
      expect(resolveWorkspaceHref(me(tenant({ roleKey })))).toBe('/manage');
    }
  });

  it('nhân viên của tenant KHÔNG ở tuyến gói ⇒ khu tài khoản cá nhân, không phải Owner Lite', () => {
    const user = me(tenant({ roleKey: 'shop_staff', billingMode: 'commission' }));
    expect(resolveWorkspaceHref(user)).toBe('/account');
  });

  /**
   * Gian hàng ĐÃ trả tiền mà hết gói về DANH SÁCH XE, không về màn tiến trình đăng ký: họ đã đi hết
   * vòng đó, và mời họ làm lại là nói sai với chính người đang cần một nút gia hạn.
   */
  it('gian hàng đã từng trả tiền mà hết gói ⇒ danh sách xe, KHÔNG phải màn tiến trình', () => {
    const user = me(
      tenant({ onboardingState: 'package_active', billingMode: 'commission', publicVehicleCount: 0 }),
    );
    expect(resolveWorkspaceHref(user)).toBe('/account/vehicles');
  });

  it('chủ xe tuyến hoa hồng đang đăng ký ⇒ màn tiến trình', () => {
    const user = me(
      tenant({ onboardingState: 'commission', billingMode: 'commission', publicVehicleCount: 0 }),
    );
    expect(resolveWorkspaceHref(user)).toBe('/account/registration');
  });

  it('chủ xe tuyến hoa hồng đã có xe trên chợ ⇒ danh sách xe', () => {
    const user = me(
      tenant({ onboardingState: 'commission', billingMode: 'commission', publicVehicleCount: 2 }),
    );
    expect(resolveWorkspaceHref(user)).toBe('/account/vehicles');
  });
});

describe('isPackageOnboarding', () => {
  it('chỉ đúng với gian hàng tuyến gói chưa có thuê bao hiệu lực', () => {
    expect(
      isPackageOnboarding(me(tenant({ onboardingState: 'package_pending', billingMode: null }))),
    ).toBe(true);
    expect(isPackageOnboarding(me(tenant()))).toBe(false);
    expect(isPackageOnboarding(me(null))).toBe(false);
  });

  /**
   * Admin gán gói tay cũng hoàn tất onboarding, nhưng một dòng dữ liệu cũ có thể để lại
   * `package_pending` cạnh một gói ĐANG hiệu lực. Tiền đã về ⇒ không mời họ chuyển khoản lần nữa.
   */
  it('còn cờ package_pending nhưng gói đã hiệu lực ⇒ không còn nợ bước nào', () => {
    const user = me(tenant({ onboardingState: 'package_pending', billingMode: 'package' }));
    expect(isPackageOnboarding(user)).toBe(false);
    expect(resolveWorkspaceHref(user)).toBe('/manage');
  });
});
