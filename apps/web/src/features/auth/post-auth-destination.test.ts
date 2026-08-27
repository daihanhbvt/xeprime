import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/constants/routes';
import {
  AUTH_INTENT,
  resolveCustomerDestination,
  resolveOwnerCtaHref,
  resolvePortalDestination,
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
  it('chưa đăng nhập → portal login kèm owner intent và next=onboarding', () => {
    expect(resolveOwnerCtaHref(null)).toBe(
      '/manage/login?intent=owner&next=%2Fmanage%2Fonboarding',
    );
  });

  it('đã đăng nhập chưa có shop → onboarding; có shop → portal', () => {
    expect(resolveOwnerCtaHref(customer)).toBe(ROUTES.MANAGE.ONBOARDING);
    expect(resolveOwnerCtaHref(owner)).toBe(ROUTES.MANAGE.ROOT);
  });
});
