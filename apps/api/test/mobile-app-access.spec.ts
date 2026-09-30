import {
  API_ERROR_CODE,
  BILLING_MODE,
  MOBILE_CLIENT_APP,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
} from '@xeprime/types';
import {
  assertMobileAppAccess,
  assertMobileAppCanCreateAccount,
} from '../src/modules/auth/mobile-app-access';
import type { MeDto } from '../src/modules/auth/dto/auth.dto';

/**
 * Cổng phạm vi APP của hai app mobile phát hành riêng — hàm thuần, không cần DB.
 *
 * Điều được khoá ở đây là RANH GIỚI SẢN PHẨM (28/09/2026): một tài khoản thuộc đúng MỘT app.
 * Nới nó ra ở một phía nghĩa là mời người dùng vào một app mà mọi thao tác chính của họ đều
 * bị 403 ở tầng sâu hơn — đúng thứ hai mã lỗi này sinh ra để tránh.
 */
function me(tenant: MeDto['tenant'], platformRole: string | null = null): MeDto {
  return {
    id: '01J000000000000000000000',
    displayName: 'Người dùng',
    email: null,
    avatarUrl: null,
    phone: '0901234567',
    phoneVerified: true,
    hasPassword: true,
    tenant,
    openRenterTripCount: 0,
    platformRole,
    permissions: [],
  } as MeDto;
}

function tenant(overrides: Partial<NonNullable<MeDto['tenant']>>): MeDto['tenant'] {
  return {
    id: '01J00000000000000000000T',
    name: 'Gian hàng Sài Gòn',
    slug: 'gian-hang-sai-gon',
    status: 'active',
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    roleKey: TENANT_ROLE.SHOP_OWNER,
    logoUrl: null,
    features: [],
    planCode: null,
    planName: null,
    serviceFeePercent: null,
    billingMode: BILLING_MODE.PACKAGE,
    planEndsAt: null,
    billingPhase: 'current',
    graceEndsAt: null,
    publicVehicleCount: 0,
    ...overrides,
  } as NonNullable<MeDto['tenant']>;
}

const PACKAGE_SHOP = tenant({});
const COMMISSION_OWNER = tenant({
  billingMode: BILLING_MODE.COMMISSION,
  onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
});
const PACKAGE_PENDING = tenant({
  billingMode: null,
  onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
});

describe('app XePrime Partner — chỉ tài khoản gian hàng tuyến gói', () => {
  it('chủ gian hàng tuyến gói vào được', () => {
    expect(() =>
      assertMobileAppAccess(me(PACKAGE_SHOP), MOBILE_CLIENT_APP.PARTNER),
    ).not.toThrow();
  });

  it('nhân viên của gian hàng gói cũng vào được — câu hỏi hỏi TENANT, không hỏi vai', () => {
    const staff = tenant({ roleKey: TENANT_ROLE.SHOP_STAFF });
    expect(() => assertMobileAppAccess(me(staff), MOBILE_CLIENT_APP.PARTNER)).not.toThrow();
  });

  it('đang nợ bước thanh toán gói vẫn vào được — để trả nốt tiền (ADR 0040)', () => {
    expect(() =>
      assertMobileAppAccess(me(PACKAGE_PENDING), MOBILE_CLIENT_APP.PARTNER),
    ).not.toThrow();
  });

  it('KHÁCH THUẦN bị chặn bằng 403 PARTNER_ACCESS_REQUIRED, không phải 401', () => {
    expect(() => assertMobileAppAccess(me(null), MOBILE_CLIENT_APP.PARTNER)).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ code: API_ERROR_CODE.PARTNER_ACCESS_REQUIRED }),
      }),
    );
  });

  it('chủ xe tuyến HOA HỒNG bị chặn — Owner Lite sống ở app khách', () => {
    expect(() => assertMobileAppAccess(me(COMMISSION_OWNER), MOBILE_CLIENT_APP.PARTNER)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.PARTNER_ACCESS_REQUIRED }),
      }),
    );
  });

  it('ADMIN NỀN TẢNG bị chặn — hai app mobile không phục vụ trục platform', () => {
    expect(() =>
      assertMobileAppAccess(me(null, 'platform_admin'), MOBILE_CLIENT_APP.PARTNER),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.PARTNER_ACCESS_REQUIRED }),
      }),
    );
  });
});

describe('app XePrime (khách) — tài khoản gian hàng gói KHÔNG vào được', () => {
  it('khách thuần vào được', () => {
    expect(() => assertMobileAppAccess(me(null), MOBILE_CLIENT_APP.CUSTOMER)).not.toThrow();
  });

  it('chủ xe tuyến hoa hồng vào được — khu khách là nhà của họ', () => {
    expect(() =>
      assertMobileAppAccess(me(COMMISSION_OWNER), MOBILE_CLIENT_APP.CUSTOMER),
    ).not.toThrow();
  });

  it('chủ gian hàng tuyến gói bị chặn bằng CUSTOMER_APP_NOT_AVAILABLE', () => {
    expect(() => assertMobileAppAccess(me(PACKAGE_SHOP), MOBILE_CLIENT_APP.CUSTOMER)).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: API_ERROR_CODE.CUSTOMER_APP_NOT_AVAILABLE,
          details: { tenantName: 'Gian hàng Sài Gòn' },
        }),
      }),
    );
  });

  it('nhân viên gian hàng gói cũng bị chặn', () => {
    const staff = tenant({ roleKey: TENANT_ROLE.SHOP_VIEWER });
    expect(() => assertMobileAppAccess(me(staff), MOBILE_CLIENT_APP.CUSTOMER)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.CUSTOMER_APP_NOT_AVAILABLE }),
      }),
    );
  });

  it('admin nền tảng vào được app khách như một người dùng thường', () => {
    expect(() =>
      assertMobileAppAccess(me(null, 'platform_admin'), MOBILE_CLIENT_APP.CUSTOMER),
    ).not.toThrow();
  });
});

describe('app hợp nhất CŨ (không gửi clientApp) không bị chặn ở đâu cả', () => {
  it('mọi loại tài khoản đều qua', () => {
    for (const t of [null, PACKAGE_SHOP, COMMISSION_OWNER, PACKAGE_PENDING]) {
      expect(() => assertMobileAppAccess(me(t), undefined)).not.toThrow();
    }
  });
});

/**
 * Cổng TẠO TÀI KHOẢN — chạy TRƯỚC khi ghi hàng nào.
 *
 * Điều được khoá: app Partner không bao giờ tạo được user. Nới nó ra nghĩa là một tài khoản
 * được tạo rồi bị 403 ngay câu lệnh sau — hàng rác đó CHIẾM mất số điện thoại, và lần sau
 * người dùng đăng ký ở app XePrime sẽ nhận `PHONE_TAKEN` cho một tài khoản họ chưa từng
 * dùng được.
 */
describe('tạo tài khoản từ app XePrime Partner', () => {
  it('bị chặn bằng PARTNER_REGISTRATION_NOT_SUPPORTED (403)', () => {
    expect(() => assertMobileAppCanCreateAccount(MOBILE_CLIENT_APP.PARTNER)).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: API_ERROR_CODE.PARTNER_REGISTRATION_NOT_SUPPORTED,
        }),
      }),
    );
  });

  it('app XePrime vẫn đăng ký được', () => {
    expect(() => assertMobileAppCanCreateAccount(MOBILE_CLIENT_APP.CUSTOMER)).not.toThrow();
  });

  it('app hợp nhất CŨ (không gửi clientApp) vẫn đăng ký được', () => {
    expect(() => assertMobileAppCanCreateAccount(undefined)).not.toThrow();
  });
});
