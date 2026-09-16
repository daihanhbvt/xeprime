import { describe, expect, it } from 'vitest';
import {
  BILLING_MODE,
  REGISTRATION_TRACK,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { REGISTRATION_TRACK_PARAM, ROUTES } from '@/constants/routes';
import {
  AUTH_INTENT,
  canUseManagePortal,
  isOnboardingRoute,
  isPackageOnboarding,
  resolveCustomerDestination,
  resolveOwnerCtaHref,
  resolvePortalDestination,
  resolveWorkspaceHref,
  type AuthScope,
} from './post-auth-destination';

/**
 * Bug gốc mà bộ test này khoá lại: MỌI đường đăng nhập đều mặc định về `/manage`, nên khách
 * thuê xe bị đẩy vào khu quản lý rồi bị hỏi tạo gian hàng. Từ đây, đích phụ thuộc NGỮ CẢNH mở
 * auth chứ không phụ thuộc việc user có tài khoản hay không.
 */
const customer: AuthScope = { tenant: null, platformRole: null };
/*
 * ⚠️ Fixture phải khai TUYẾN tường minh (15/09/2026).
 *
 * Trước đây fixture này chỉ có `{ id: 'T1' }`, và nó đi vào `/manage` nhờ một tai nạn: hàm cũ
 * `isCommissionTrack` đòi `roleKey === shop_owner`, nên với fixture thiếu `roleKey` nó trả
 * `false` và `!false` cho qua. Luật mới hỏi đúng một chuyện — tenant có THUÊ BAO hiệu lực không —
 * nên một fixture không khai `billingMode` là một gian hàng không có gói, và nó về `/account`.
 */
const owner: AuthScope = {
  tenant: { id: 'T1', roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.PACKAGE },
  platformRole: null,
};
const admin: AuthScope = { tenant: null, platformRole: 'platform_admin' };
const adminWithShop: AuthScope = {
  tenant: { id: 'T1', roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.PACKAGE },
  platformRole: 'platform_admin',
};

describe('resolveCustomerDestination', () => {
  it('không có next → KHÔNG điều hướng (ở lại marketplace), tuyệt đối không /manage', () => {
    expect(resolveCustomerDestination(null)).toBeNull();
    expect(resolveCustomerDestination(undefined)).toBeNull();
    expect(resolveCustomerDestination('')).toBeNull();
  });

  it('có next nội bộ → quay lại đúng chỗ khách đang dở', () => {
    expect(resolveCustomerDestination(ROUTES.TRIPS)).toBe('/trips');
    expect(resolveCustomerDestination('/listings/01H?c=1')).toBe('/listings/01H?c=1');
  });

  it('next ra ngoài domain → bỏ qua, không redirect', () => {
    expect(resolveCustomerDestination('https://evil.example')).toBeNull();
    expect(resolveCustomerDestination('//evil.example')).toBeNull();
  });
});

describe('resolvePortalDestination', () => {
  it('có gian hàng, không next → /manage', () => {
    expect(resolvePortalDestination({ user: owner })).toBe(ROUTES.MANAGE.ROOT);
  });

  it('có gian hàng + next hợp lệ → tôn trọng next', () => {
    expect(resolvePortalDestination({ user: owner, next: '/manage/vehicles' })).toBe(
      '/manage/vehicles',
    );
  });

  it('owner intent + chưa có gian hàng → onboarding', () => {
    expect(resolvePortalDestination({ user: customer, intent: AUTH_INTENT.OWNER })).toBe(
      ROUTES.MANAGE.ONBOARDING,
    );
    expect(
      resolvePortalDestination({
        user: customer,
        intent: AUTH_INTENT.OWNER,
        next: ROUTES.MANAGE.ONBOARDING,
      }),
    ).toBe(ROUTES.MANAGE.ONBOARDING);
  });

  it('có gian hàng rồi thì owner intent không đưa lại vào onboarding', () => {
    expect(resolvePortalDestination({ user: owner, intent: AUTH_INTENT.OWNER })).toBe(
      ROUTES.MANAGE.ROOT,
    );
  });

  it('chỉ có platform role → dashboard nền tảng, KHÔNG phải onboarding shop', () => {
    expect(resolvePortalDestination({ user: admin })).toBe(ROUTES.MANAGE.ADMIN);
    expect(resolvePortalDestination({ user: admin, next: '/manage/admin/tenants' })).toBe(
      '/manage/admin/tenants',
    );
  });

  it('KHÔNG có platform role mà next trỏ khu nền tảng → về /manage (403 do layout/backend quyết)', () => {
    expect(resolvePortalDestination({ user: owner, next: '/manage/admin' })).toBe(
      ROUTES.MANAGE.ROOT,
    );
    expect(resolvePortalDestination({ user: owner, next: '/manage/admin/tenants' })).toBe(
      ROUTES.MANAGE.ROOT,
    );
  });

  it('user vừa có shop vừa có platform role vẫn vào được route nền tảng', () => {
    expect(resolvePortalDestination({ user: adminWithShop, next: '/manage/admin' })).toBe(
      '/manage/admin',
    );
  });

  it('không tenant, không platform, không owner intent → /manage (màn "chưa có gian hàng")', () => {
    expect(resolvePortalDestination({ user: customer })).toBe(ROUTES.MANAGE.ROOT);
    // Không ném họ vào một trang quản lý gian hàng cụ thể — ở đó chỉ có dashboard rỗng.
    expect(resolvePortalDestination({ user: customer, next: '/manage/vehicles' })).toBe(
      ROUTES.MANAGE.ROOT,
    );
  });

  it('next ra ngoài domain bị bỏ qua ở mọi scope', () => {
    expect(resolvePortalDestination({ user: owner, next: '//evil.example' })).toBe(
      ROUTES.MANAGE.ROOT,
    );
    expect(resolvePortalDestination({ user: admin, next: 'https://evil.example' })).toBe(
      ROUTES.MANAGE.ADMIN,
    );
  });
});

describe('resolveOwnerCtaHref', () => {
  /*
   * 09/09/2026: CTA chủ xe dẫn tới LANDING công khai trước, không ném thẳng vào form tạo gian
   * hàng. Người ta phải đọc được lời mời trước khi bị hỏi tài khoản; landing tự rẽ tiếp
   * (login → onboarding → wizard) theo trạng thái thật.
   */
  it('chưa đăng nhập → landing đăng xe, KHÔNG hỏi tài khoản ngay', () => {
    expect(resolveOwnerCtaHref(null)).toBe(ROUTES.LIST_YOUR_VEHICLE.ROOT);
  });

  it('đã đăng nhập chưa có shop → vẫn landing (chưa tạo tenant cho ai)', () => {
    expect(resolveOwnerCtaHref(customer)).toBe(ROUTES.LIST_YOUR_VEHICLE.ROOT);
  });

  it('đã có gian hàng → vào thẳng cổng quản lý', () => {
    expect(resolveOwnerCtaHref(owner)).toBe(ROUTES.MANAGE.ROOT);
  });
});

/**
 * Cổng TUYẾN (14/09/2026 — ADR 0027 · ADR 0028 điều 1).
 *
 * Bất biến: chủ xe tuyến hoa hồng không bao giờ được điều hướng vào `/manage`, kể cả khi họ tự
 * gõ URL hoặc một đường `?next=` cũ dẫn tới đó. Trước bản này `hasTenant → /manage` là toàn bộ
 * luật, nên mọi chủ xe mới đăng ký đều rơi vào cổng quản lý ngay sau khi đăng nhập.
 *
 * `owner` ở trên nay là một GIAN HÀNG TUYẾN GÓI khai tường minh — xem ghi chú ở chính fixture đó.
 */
const commissionOwner: AuthScope = {
  tenant: {
    id: 'T2',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    billingMode: BILLING_MODE.COMMISSION,
    publicVehicleCount: 3,
  },
  platformRole: null,
};
const registeringOwner: AuthScope = {
  tenant: {
    id: 'T3',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.DRAFT,
    billingMode: BILLING_MODE.COMMISSION,
    publicVehicleCount: 0,
  },
  platformRole: null,
};
const packageShop: AuthScope = {
  tenant: {
    id: 'T4',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    billingMode: BILLING_MODE.PACKAGE,
    publicVehicleCount: 12,
  },
  platformRole: null,
};

describe('resolveWorkspaceHref — hai tuyến, hai khu', () => {
  it('không có gian hàng → null (nơi gọi tự chọn đích)', () => {
    expect(resolveWorkspaceHref(customer)).toBeNull();
    expect(resolveWorkspaceHref(null)).toBeNull();
  });

  it('chủ xe hoa hồng đã có xe trên chợ → danh sách xe ở khu tài khoản', () => {
    expect(resolveWorkspaceHref(commissionOwner)).toBe(ROUTES.ACCOUNT.VEHICLES);
  });

  it('chủ xe hoa hồng đang đăng ký → màn tiến trình', () => {
    expect(resolveWorkspaceHref(registeringOwner)).toBe(ROUTES.ACCOUNT.REGISTRATION);
  });

  it('gian hàng có gói → cổng quản lý', () => {
    expect(resolveWorkspaceHref(packageShop)).toBe(ROUTES.MANAGE.ROOT);
  });

  /*
   * F7 (sửa 15/09/2026) — ĐÂY LÀ CHỖ LUẬT ĐỔI.
   *
   * Bản cũ: "nhân viên gian hàng → cổng quản lý, BẤT KỂ TUYẾN". Nó đúng theo nghĩa đen của hàm
   * cũ, nhưng hàm cũ hỏi sai câu: `isCommissionTrack` đòi `roleKey === shop_owner`, nên với mọi
   * vai khác nó trả `false` và `!false` mở cổng — kể cả ở gian hàng tuyến hoa hồng và gian hàng
   * đã hết gói.
   *
   * Luật mới hỏi thuộc tính của TENANT, không hỏi vai: hết gói thì cả gian hàng ra khỏi Manage
   * cùng lúc, không ai ở lại nhờ `roleKey` của mình.
   */
  it('nhân viên của gian hàng TUYẾN GÓI → cổng quản lý', () => {
    const staffAtShop: AuthScope = {
      tenant: { id: 'T4', roleKey: TENANT_ROLE.SHOP_STAFF, billingMode: BILLING_MODE.PACKAGE },
      platformRole: null,
    };
    expect(resolveWorkspaceHref(staffAtShop)).toBe(ROUTES.MANAGE.ROOT);
  });

  it('nhân viên của gian hàng TUYẾN HOA HỒNG → khu tài khoản, KHÔNG vào Manage', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const staff: AuthScope = {
        tenant: { id: 'T2', roleKey, billingMode: BILLING_MODE.COMMISSION },
        platformRole: null,
      };
      // Không phải chủ xe ⇒ không có Owner Lite; họ về khu tài khoản cá nhân.
      expect(resolveWorkspaceHref(staff)).toBe(ROUTES.ACCOUNT.ROOT);
    }
  });
});

describe('canUseManagePortal', () => {
  it('chỉ gian hàng có THUÊ BAO hiệu lực mới vào được cổng quản lý', () => {
    expect(canUseManagePortal(packageShop)).toBe(true);
    expect(canUseManagePortal(owner)).toBe(true);
    expect(canUseManagePortal(commissionOwner)).toBe(false);
    expect(canUseManagePortal(registeringOwner)).toBe(false);
  });

  /*
   * Cả gian hàng ra cùng lúc khi hết gói — đây là điều bản cũ KHÔNG làm được, vì nhân viên đi
   * qua một nhánh khác với chủ.
   */
  it('gian hàng hết gói: MỌI vai đều mất cổng quản lý', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_OWNER,
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const lapsed: AuthScope = {
        tenant: { id: 'T9', roleKey, billingMode: BILLING_MODE.COMMISSION },
        platformRole: null,
      };
      expect(canUseManagePortal(lapsed)).toBe(false);
    }
  });
});

describe('resolvePortalDestination — tuyến hoa hồng', () => {
  it('không có next → về khu tài khoản, KHÔNG phải /manage', () => {
    expect(resolvePortalDestination({ user: commissionOwner })).toBe(ROUTES.ACCOUNT.VEHICLES);
    expect(resolvePortalDestination({ user: registeringOwner })).toBe(ROUTES.ACCOUNT.REGISTRATION);
  });

  /**
   * Quan trọng: `?next=` do proxy đặt khi chặn một route `/manage`. Tôn trọng nó với tuyến hoa
   * hồng nghĩa là đăng nhập xong rơi vào `/manage` rồi bị `AppShell` đá ra — hai cú nhảy và một
   * lần nháy màn hình. Chuyển hướng về đúng khu ngay tại đây.
   */
  it('next trỏ vào /manage → vẫn về khu tài khoản', () => {
    expect(resolvePortalDestination({ user: commissionOwner, next: ROUTES.MANAGE.VEHICLES })).toBe(
      ROUTES.ACCOUNT.VEHICLES,
    );
    expect(resolvePortalDestination({ user: commissionOwner, next: ROUTES.MANAGE.SHOP })).toBe(
      ROUTES.ACCOUNT.VEHICLES,
    );
  });

  it('next trỏ ra ngoài /manage vẫn được tôn trọng', () => {
    expect(resolvePortalDestination({ user: commissionOwner, next: ROUTES.TRIPS })).toBe(
      ROUTES.TRIPS,
    );
  });

  it('gian hàng có gói KHÔNG bị đổi hướng', () => {
    expect(resolvePortalDestination({ user: packageShop, next: ROUTES.MANAGE.VEHICLES })).toBe(
      ROUTES.MANAGE.VEHICLES,
    );
  });
});

describe('resolveOwnerCtaHref — theo tuyến', () => {
  it('chủ xe hoa hồng → khu tài khoản; gian hàng có gói → cổng quản lý', () => {
    expect(resolveOwnerCtaHref(commissionOwner)).toBe(ROUTES.ACCOUNT.VEHICLES);
    expect(resolveOwnerCtaHref(registeringOwner)).toBe(ROUTES.ACCOUNT.REGISTRATION);
    expect(resolveOwnerCtaHref(packageShop)).toBe(ROUTES.MANAGE.ROOT);
  });
});

/**
 * ── HAI TUYẾN ĐĂNG KÝ (ADR 0040) ─────────────────────────────────────────────────────────────
 *
 * Bốn fixture dưới đây là bốn tình huống mà `billingMode` MỘT MÌNH không phân biệt được, và mỗi
 * cái phải rẽ một đường khác:
 *
 * | Fixture | `onboardingState` | `billingMode` | Đích |
 * | --- | --- | --- | --- |
 * | `packagePending` | `package_pending` | `null` | màn onboarding (bước 2) |
 * | `misconfigured` | `commission` | `null` | Owner Lite — đây là LỖI CẤU HÌNH, không phải một tuyến |
 * | `lapsedPackageShop` | `package_active` | `commission` | danh sách xe, KHÔNG phải wizard lần đầu |
 * | `paidPackageShop` | `package_active` | `package` | `/manage` |
 *
 * Hai dòng đầu có `billingMode` GIỐNG HỆT nhau. Đó chính là lý do trục đăng ký phải tồn tại.
 */
const packagePending: AuthScope = {
  tenant: {
    id: 'TP',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
    billingMode: null,
  },
  platformRole: null,
};
const misconfigured: AuthScope = {
  tenant: {
    id: 'TM',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    billingMode: null,
  },
  platformRole: null,
};
const lapsedPackageShop: AuthScope = {
  tenant: {
    id: 'TL',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    billingMode: BILLING_MODE.COMMISSION,
    publicVehicleCount: 0,
  },
  platformRole: null,
};
const paidPackageShop: AuthScope = {
  tenant: {
    id: 'TA',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    billingMode: BILLING_MODE.PACKAGE,
  },
  platformRole: null,
};

describe('resolveWorkspaceHref — hai tuyến đăng ký (ADR 0040)', () => {
  it('gian hàng trả phí CHƯA thanh toán → màn onboarding, KHÔNG phải Owner Lite', () => {
    expect(resolveWorkspaceHref(packagePending)).toBe(ROUTES.MANAGE.ONBOARDING);
    expect(isPackageOnboarding(packagePending)).toBe(true);
  });

  /*
   * ĐIỀU MẤU CHỐT: hai fixture này có `billingMode` giống hệt nhau (`null`) và vẫn phải rẽ hai
   * đường. Nếu phép suy chỉ đọc `billingMode` thì test này không thể xanh.
   */
  it('cùng `billingMode: null` nhưng khác cửa vào ⇒ khác đích', () => {
    expect(resolveWorkspaceHref(packagePending)).toBe(ROUTES.MANAGE.ONBOARDING);
    expect(resolveWorkspaceHref(misconfigured)).toBe(ROUTES.ACCOUNT.REGISTRATION);
    expect(isPackageOnboarding(misconfigured)).toBe(false);
  });

  it('gói đã thanh toán → /manage', () => {
    expect(resolveWorkspaceHref(paidPackageShop)).toBe(ROUTES.MANAGE.ROOT);
    expect(canUseManagePortal(paidPackageShop)).toBe(true);
    expect(isPackageOnboarding(paidPackageShop)).toBe(false);
  });

  /*
   * Gian hàng HẾT GÓI không phải người đang đăng ký lần đầu. `resolveOwnerStage` chấm họ là
   * `registering` ngay khi chiếc xe cuối rời chợ, nên nếu không có trục đăng ký thì họ bị mời vào
   * wizard "Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ" mà họ đã làm xong từ lâu.
   */
  it('gói HẾT HẠN → danh sách xe, KHÔNG phải màn đăng ký lần đầu', () => {
    expect(resolveWorkspaceHref(lapsedPackageShop)).toBe(ROUTES.ACCOUNT.VEHICLES);
    expect(canUseManagePortal(lapsedPackageShop)).toBe(false);
    expect(isPackageOnboarding(lapsedPackageShop)).toBe(false);
  });

  /*
   * Nhân viên KHÔNG có Owner Lite, kể cả ở một gian hàng đã từng trả tiền: Owner Lite là bộ công
   * cụ của CHỦ XE, còn họ chỉ là một con người có tài khoản.
   */
  it('nhân viên của gian hàng hết gói → khu tài khoản cá nhân, không Owner Lite', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const member: AuthScope = {
        tenant: {
          ...lapsedPackageShop.tenant!,
          roleKey,
        },
        platformRole: null,
      };
      expect(resolveWorkspaceHref(member)).toBe(ROUTES.ACCOUNT.ROOT);
    }
  });
});

describe('resolvePortalDestination — cửa gian hàng đi qua bước đăng nhập', () => {
  /*
   * CTA "Đăng ký gian hàng" mang `?track=package`, và proxy đặt nó vào `?next=` khi chặn người
   * chưa đăng nhập. Phép so `next === ROUTES.MANAGE.ONBOARDING` trả `false` vì có query — nên nó
   * đã được thay bằng `isOnboardingRoute` (so PHẦN ĐƯỜNG DẪN). Không có test này thì người bấm
   * đúng cửa gian hàng rồi đăng nhập sẽ mất cửa mình đã chọn mà không có gì đỏ lên.
   */
  const onboardingWithTrack = `${ROUTES.MANAGE.ONBOARDING}?${REGISTRATION_TRACK_PARAM}=${REGISTRATION_TRACK.PACKAGE}`;

  it('chưa có gian hàng: `?next=` mang tuyến gói được tôn trọng NGUYÊN VẸN', () => {
    expect(
      resolvePortalDestination({
        user: customer,
        next: onboardingWithTrack,
        intent: AUTH_INTENT.OWNER,
      }),
    ).toBe(onboardingWithTrack);
  });

  it('không kèm intent vẫn giữ cửa: ý định nằm trong chính `next`', () => {
    expect(resolvePortalDestination({ user: customer, next: onboardingWithTrack })).toBe(
      onboardingWithTrack,
    );
  });

  it('isOnboardingRoute bỏ qua query, và không khớp route khác', () => {
    expect(isOnboardingRoute(onboardingWithTrack)).toBe(true);
    expect(isOnboardingRoute(ROUTES.MANAGE.ONBOARDING)).toBe(true);
    expect(isOnboardingRoute(ROUTES.MANAGE.SHOP)).toBe(false);
    expect(isOnboardingRoute(null)).toBe(false);
  });

  /*
   * Đã ĐANG onboarding gói thì mọi `?next=` trong `/manage` đều đưa về bước còn nợ — không thả họ
   * vào một trang quản lý mà `SubscriptionTrackGuard` sẽ trả 403.
   */
  it('đang onboarding gói: next trỏ vào /manage → về đúng bước thanh toán', () => {
    expect(resolvePortalDestination({ user: packagePending, next: ROUTES.MANAGE.VEHICLES })).toBe(
      ROUTES.MANAGE.ONBOARDING,
    );
    expect(resolvePortalDestination({ user: packagePending })).toBe(ROUTES.MANAGE.ONBOARDING);
  });
});
