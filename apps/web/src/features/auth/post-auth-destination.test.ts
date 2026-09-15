import { describe, expect, it } from 'vitest';
import { BILLING_MODE, TENANT_ROLE, TENANT_STATUS } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import {
  AUTH_INTENT,
  canUseManagePortal,
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
const owner: AuthScope = { tenant: { id: 'T1' }, platformRole: null };
const admin: AuthScope = { tenant: null, platformRole: 'platform_admin' };
const adminWithShop: AuthScope = { tenant: { id: 'T1' }, platformRole: 'platform_admin' };

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
 * `owner` ở trên KHÔNG dính vào nhóm này có chủ đích: nó không có `roleKey`, tức là mô hình hoá
 * một NHÂN VIÊN gian hàng — họ vẫn dùng `/manage` bình thường.
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

  it('nhân viên gian hàng (không phải chủ) → cổng quản lý, bất kể tuyến', () => {
    expect(resolveWorkspaceHref(owner)).toBe(ROUTES.MANAGE.ROOT);
  });
});

describe('canUseManagePortal', () => {
  it('chỉ tuyến gói và nhân viên mới vào được cổng quản lý', () => {
    expect(canUseManagePortal(packageShop)).toBe(true);
    expect(canUseManagePortal(owner)).toBe(true);
    expect(canUseManagePortal(commissionOwner)).toBe(false);
    expect(canUseManagePortal(registeringOwner)).toBe(false);
  });
});

describe('resolvePortalDestination — tuyến hoa hồng', () => {
  it('không có next → về khu tài khoản, KHÔNG phải /manage', () => {
    expect(resolvePortalDestination({ user: commissionOwner })).toBe(ROUTES.ACCOUNT.VEHICLES);
    expect(resolvePortalDestination({ user: registeringOwner })).toBe(
      ROUTES.ACCOUNT.REGISTRATION,
    );
  });

  /**
   * Quan trọng: `?next=` do proxy đặt khi chặn một route `/manage`. Tôn trọng nó với tuyến hoa
   * hồng nghĩa là đăng nhập xong rơi vào `/manage` rồi bị `AppShell` đá ra — hai cú nhảy và một
   * lần nháy màn hình. Chuyển hướng về đúng khu ngay tại đây.
   */
  it('next trỏ vào /manage → vẫn về khu tài khoản', () => {
    expect(
      resolvePortalDestination({ user: commissionOwner, next: ROUTES.MANAGE.VEHICLES }),
    ).toBe(ROUTES.ACCOUNT.VEHICLES);
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
