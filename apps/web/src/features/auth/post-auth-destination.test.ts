import { describe, expect, it } from 'vitest';
import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE, TENANT_STATUS } from '@xeprime/types';
import {
  ACCOUNT_SECTION,
  ROUTES,
  SHOP_SECTION,
  accountSectionPath,
  balancePayoutPath,
  shopSectionPath,
  withPlanPurchaseIntent,
} from '@/constants/routes';
import {
  PARTNER_TRACK,
  adminLoginWithNext,
  canUseManagePortal,
  isAdminPublicPage,
  isCommissionOwner,
  isCommissionPage,
  isOnboardingRoute,
  isPackageOnboarding,
  isPartnerInvitePage,
  isPartnerPaymentPage,
  isPartnerPublicPage,
  partnerHomeHref,
  partnerPageRedirect,
  portalLoginWithNext,
  resolveAdminDestination,
  resolveCustomerDestination,
  resolveOwnerCtaHref,
  resolvePartnerDestination,
  resolvePartnerTrack,
  resolveWorkspaceHref,
  type AuthScope,
} from './post-auth-destination';

/**
 * Điều hướng theo SITE (ADR 0051 · ADR 0053). Test chạy ở chế độ `path` (mặc định của vitest), nên
 * `ROUTES.MANAGE.*` mang tiền tố `/manage` — đúng như máy dev.
 *
 * Fixture khai TUYẾN tường minh: luật hỏi thuộc tính của TENANT (`billingMode`, `onboardingState`)
 * do server trả, không hỏi vai.
 */

const noShop: AuthScope = { tenant: null, platformRole: null };

const packagePending: AuthScope = {
  tenant: {
    id: 'TP',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
    billingMode: null,
  },
};

/** Gói hiệu lực — pha `current` (server trả `billingMode = package`). */
const packageCurrent: AuthScope = {
  tenant: {
    id: 'TA',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    billingMode: BILLING_MODE.PACKAGE,
  },
};

/** Gói đang ÂN HẠN — vẫn ở tuyến gói, nên server vẫn trả `billingMode = package` (ADR 0038 điều 5). */
const packageGrace: AuthScope = {
  tenant: { ...packageCurrent.tenant!, id: 'TG' },
};

const commission: AuthScope = {
  tenant: {
    id: 'TC',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    billingMode: BILLING_MODE.COMMISSION,
    publicVehicleCount: 3,
  },
};

/** Gói HẾT ân hạn — về tuyến hoa hồng (ADR 0038 điều 5), cửa vào vẫn `package_active` (ADR 0040 điều 4). */
const lapsed: AuthScope = {
  tenant: {
    id: 'TL',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    billingMode: BILLING_MODE.COMMISSION,
    publicVehicleCount: 0,
  },
};

/** Danh mục gói hỏng — `resolveEffectiveBilling` trả `unconfigured`, `billingMode` null. */
const unconfigured: AuthScope = {
  tenant: {
    id: 'TU',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    billingMode: null,
  },
};

const M = ROUTES.MANAGE;

// ── B1: một test mỗi dòng của bảng ──────────────────────────────────────────────────────────────
describe('B1 — partner đăng nhập xong vào đâu', () => {
  it('chưa có gian hàng → /register (trang chọn cách cho thuê)', () => {
    expect(resolvePartnerTrack(noShop)).toBe(PARTNER_TRACK.NONE);
    expect(resolvePartnerDestination({ user: noShop })).toBe(M.REGISTER);
    // Gõ thẳng một trang bất kỳ cũng về trang chọn; HAI bước đầu của hai tuyến được ở lại —
    // wizard đăng xe nhanh (hoa hồng, tự mở gian hàng ở bước lưu) và onboarding (gói).
    expect(partnerPageRedirect(noShop, M.VEHICLES)).toBe(M.REGISTER);
    expect(partnerPageRedirect(noShop, `${M.VEHICLE_REGISTER}?from=marketplace`)).toBeNull();
    expect(partnerPageRedirect(noShop, `${M.ONBOARDING}?track=package`)).toBeNull();
  });

  it('package_pending → /onboarding (màn trần, nơi DUY NHẤT vào được)', () => {
    expect(resolvePartnerTrack(packagePending)).toBe(PARTNER_TRACK.PACKAGE_PENDING);
    expect(resolvePartnerDestination({ user: packagePending })).toBe(M.ONBOARDING);
    expect(resolvePartnerDestination({ user: packagePending, next: M.BOOKINGS })).toBe(
      M.ONBOARDING,
    );
    expect(partnerPageRedirect(packagePending, M.ROOT)).toBe(M.ONBOARDING);
    // Đang nợ thanh toán gói thì không đi đường đăng xe nhanh của tuyến hoa hồng.
    expect(partnerPageRedirect(packagePending, M.VEHICLE_REGISTER)).toBe(M.ONBOARDING);
    expect(partnerPageRedirect(packagePending, M.ONBOARDING)).toBeNull();
    expect(isPackageOnboarding(packagePending)).toBe(true);
  });

  /**
   * Trang thanh toán hoá đơn gói đúng cho MỌI tuyến: gian hàng đang nợ bước thanh toán đầu tiên
   * TRẢ TIỀN ở đây — ép họ về `/onboarding` giữa chừng là mất luôn lượt vừa trả.
   */
  it('trang thanh toán `/payment/:id` mở được ở mọi tuyến, kể cả đang nợ thanh toán gói', () => {
    const page = `${M.PAYMENT}/01HINVOICE?order=01ORDER`;
    expect(isPartnerPaymentPage(page)).toBe(true);
    expect(isPartnerPaymentPage(M.PAYMENT_RETURN)).toBe(true);
    // Gốc trần không phải một trang thanh toán — không có hoá đơn nào để trả.
    expect(isPartnerPaymentPage(M.PAYMENT)).toBe(false);
    for (const user of [packagePending, packageCurrent, commission, lapsed]) {
      expect(partnerPageRedirect(user, page)).toBeNull();
    }
  });

  it('gói current → dashboard Manage (menu tuyến gói)', () => {
    expect(resolvePartnerTrack(packageCurrent)).toBe(PARTNER_TRACK.PACKAGE);
    expect(resolvePartnerDestination({ user: packageCurrent })).toBe(M.ROOT);
    expect(partnerPageRedirect(packageCurrent, M.CUSTOMERS)).toBeNull();
    expect(canUseManagePortal(packageCurrent)).toBe(true);
  });

  it('gói grace → vẫn dashboard Manage', () => {
    expect(resolvePartnerTrack(packageGrace)).toBe(PARTNER_TRACK.PACKAGE);
    expect(resolvePartnerDestination({ user: packageGrace })).toBe(M.ROOT);
  });

  it('tuyến hoa hồng → trang chủ Owner Lite (cùng URL gốc, nội dung theo tuyến)', () => {
    expect(resolvePartnerTrack(commission)).toBe(PARTNER_TRACK.COMMISSION);
    expect(resolvePartnerDestination({ user: commission })).toBe(M.ROOT);
    expect(canUseManagePortal(commission)).toBe(false);
  });

  it('gói đã hết ân hạn (lapsed) → trang chủ Owner Lite, KHÔNG phải wizard đăng ký lần đầu', () => {
    expect(resolvePartnerTrack(lapsed)).toBe(PARTNER_TRACK.COMMISSION);
    expect(resolvePartnerDestination({ user: lapsed })).toBe(M.ROOT);
    expect(isPackageOnboarding(lapsed)).toBe(false);
  });

  it('unconfigured → trang chủ Owner Lite (cảnh báo không chặn do trang chủ hiện)', () => {
    expect(resolvePartnerTrack(unconfigured)).toBe(PARTNER_TRACK.COMMISSION);
    expect(resolvePartnerDestination({ user: unconfigured })).toBe(M.ROOT);
    expect(isPackageOnboarding(unconfigured)).toBe(false);
  });

  it('trang chỉ của tuyến gói gõ thẳng ở tuyến hoa hồng → trang chủ Owner Lite', () => {
    for (const user of [commission, lapsed, unconfigured]) {
      for (const path of [
        M.CUSTOMERS,
        M.FINANCE,
        M.RECEIPTS,
        M.DEBTS,
        M.MEMBERS,
        `${M.SHOP}/branches`,
        M.DRIVERS,
        M.MAINTENANCE,
        M.VEHICLE_NEW,
        `${M.VEHICLES}/01V/edit`,
      ]) {
        expect(partnerPageRedirect(user, path), path).toBe(M.ROOT);
      }
    }
  });

  /*
   * Trang Cửa hàng có bản tương đương ở tuyến hoa hồng: "Hồ sơ chủ xe" đọc CÙNG bản ghi gian hàng.
   * Một gian hàng vừa hết gói bấm bookmark /shop phải rơi vào đúng hồ sơ của mình, không về trang chủ.
   */
  it('trang Cửa hàng ở tuyến hoa hồng → section "Thông tin chủ xe" của Hồ sơ chủ xe', () => {
    for (const user of [commission, lapsed, unconfigured]) {
      expect(partnerPageRedirect(user, M.SHOP)).toBe(`${M.ACCOUNT}?section=profile`);
    }
  });

  it('THÀNH VIÊN của gian hàng hết gói mở /shop → trang chủ (trang tài khoản của họ không có section đó)', () => {
    const staff: AuthScope = {
      tenant: { ...lapsed.tenant!, roleKey: TENANT_ROLE.SHOP_STAFF },
    };
    expect(isCommissionOwner(staff)).toBe(false);
    expect(partnerPageRedirect(staff, M.SHOP)).toBe(M.ROOT);
  });

  it('tuyến hoa hồng ở lại được trang của nó', () => {
    for (const path of [
      M.ROOT,
      M.VEHICLES,
      `${M.VEHICLES}/01V`,
      `${M.VEHICLES}/01V/manage/pricing`,
      `${M.VEHICLE_REGISTER}?from=landing`,
      M.CALENDAR,
      M.TRIPS,
      `${M.BOOKINGS}/01B`,
      M.CHAT,
      M.BALANCE,
      M.REGISTRATION,
      M.SUPPORT_CASES,
      M.SECURITY,
      M.ACCOUNT,
      M.ONBOARDING,
    ]) {
      expect(partnerPageRedirect(commission, path), path).toBeNull();
    }
  });

  /*
   * Ba ALIAS (07/10/2026): khai thuế + gói là section của "Hồ sơ chủ xe", tài khoản nhận tiền là khối
   * của trang số dư. Giải ở MỘT chỗ — cùng luật cho gõ URL lẫn `next` — và chuyển THẲNG tới section.
   */
  it('chủ xe tuyến hoa hồng mở alias cũ → thẳng tới section đích', () => {
    expect(partnerPageRedirect(commission, M.TAX)).toBe(accountSectionPath(ACCOUNT_SECTION.TAX));
    expect(partnerPageRedirect(commission, M.SUBSCRIPTION)).toBe(
      withPlanPurchaseIntent(accountSectionPath(ACCOUNT_SECTION.PLAN)),
    );
    expect(partnerPageRedirect(commission, M.BANK_ACCOUNTS)).toBe(balancePayoutPath());
  });

  it('THÀNH VIÊN gian hàng hoa hồng mở alias cũ → trang tài khoản của họ / trang chủ', () => {
    const staff: AuthScope = { tenant: { ...commission.tenant!, roleKey: TENANT_ROLE.SHOP_STAFF } };
    expect(partnerPageRedirect(staff, M.TAX)).toBe(M.ACCOUNT);
    expect(partnerPageRedirect(staff, M.SUBSCRIPTION)).toBe(M.ACCOUNT);
    expect(partnerPageRedirect(staff, M.BANK_ACCOUNTS)).toBe(M.ROOT);
  });

  it('tuyến gói mở trang chỉ của tuyến hoa hồng → bản tương đương của tuyến gói', () => {
    expect(partnerPageRedirect(packageCurrent, M.REGISTRATION)).toBe(M.SHOP);
    expect(partnerPageRedirect(packageCurrent, M.TAX)).toBe(shopSectionPath(SHOP_SECTION.TAX));
    expect(partnerPageRedirect(packageCurrent, M.SUBSCRIPTION)).toBe(
      withPlanPurchaseIntent(shopSectionPath(SHOP_SECTION.PLAN)),
    );
    // Tài khoản nhận tiền nằm ở trang số dư ở CẢ hai tuyến (07/10/2026), không ở Cửa hàng.
    expect(partnerPageRedirect(packageCurrent, M.BANK_ACCOUNTS)).toBe(balancePayoutPath());
    expect(partnerPageRedirect(packageCurrent, M.HOST_GUIDE)).toBeNull();
  });

  /*
   * "Chuyến cho thuê" (07/10/2026): CHỦ xe tuyến hoa hồng đọc yêu cầu + đơn gộp ở một danh sách
   * thẻ. Hộp thư và bảng đơn vẫn là trang của tuyến — cho THÀNH VIÊN, những người `/trips` không
   * dựng phía chủ xe cho — và chi tiết đơn là màn dùng chung, nơi bàn giao.
   */
  it('chủ xe tuyến hoa hồng: hộp thư + bảng đơn → "Chuyến cho thuê"; chi tiết đơn ở lại', () => {
    for (const user of [commission, lapsed, unconfigured]) {
      for (const path of [M.BOOKING_REQUESTS, M.BOOKINGS, M.BOOKINGS_AWAITING_PICKUP]) {
        expect(partnerPageRedirect(user, `${path}?status=closed`), path).toBe(M.TRIPS);
      }
      expect(partnerPageRedirect(user, M.TRIPS)).toBeNull();
      expect(partnerPageRedirect(user, `${M.BOOKINGS}/01B`)).toBeNull();
    }
  });

  it('THÀNH VIÊN của gian hàng hết gói giữ hộp thư + bảng đơn, /trips đưa về hộp thư', () => {
    const staff: AuthScope = {
      tenant: { ...lapsed.tenant!, roleKey: TENANT_ROLE.SHOP_STAFF },
    };
    expect(partnerPageRedirect(staff, M.BOOKING_REQUESTS)).toBeNull();
    expect(partnerPageRedirect(staff, M.BOOKINGS)).toBeNull();
    expect(partnerPageRedirect(staff, M.TRIPS)).toBe(M.BOOKING_REQUESTS);
  });

  it('tuyến gói mở /trips → hộp thư yêu cầu (họ có hộp thư + bảng đơn đầy đủ)', () => {
    expect(partnerPageRedirect(packageCurrent, M.TRIPS)).toBe(M.BOOKING_REQUESTS);
    expect(partnerPageRedirect(packageCurrent, M.BOOKING_REQUESTS)).toBeNull();
    expect(partnerPageRedirect(packageCurrent, M.BOOKINGS)).toBeNull();
  });
});

describe('resolvePartnerDestination — next', () => {
  it('next an toàn trong site partner được tôn trọng (qua cùng luật tuyến)', () => {
    expect(resolvePartnerDestination({ user: packageCurrent, next: `${M.BOOKINGS}?s=1` })).toBe(
      `${M.BOOKINGS}?s=1`,
    );
    expect(resolvePartnerDestination({ user: commission, next: M.CALENDAR })).toBe(M.CALENDAR);
    expect(resolvePartnerDestination({ user: commission, next: M.CUSTOMERS })).toBe(M.ROOT);
  });

  it('next sang site khác, ra ngoài domain, hay chính trang công khai → trang chủ theo tuyến', () => {
    for (const next of [
      '/trips',
      ROUTES.ADMIN.TENANTS,
      'https://evil.test/',
      '//evil.test',
      M.LOGIN,
      `${M.REGISTER}?track=package`,
    ]) {
      expect(resolvePartnerDestination({ user: packageCurrent, next }), next).toBe(M.ROOT);
    }
  });

  it('next là LỜI MỜI → về đúng lời mời, kể cả khi chưa có gian hàng (trang công khai khác thì không)', () => {
    const invite = `${M.INVITES}/tok-1`;
    expect(resolvePartnerDestination({ user: noShop, next: invite })).toBe(invite);
    expect(resolvePartnerDestination({ user: packageCurrent, next: invite })).toBe(invite);
    expect(isPartnerInvitePage(invite)).toBe(true);
    expect(isPartnerInvitePage(M.LOGIN)).toBe(false);
    expect(isPartnerInvitePage('//evil.test/manage/invites/x')).toBe(false);
  });

  it('partnerHomeHref theo tuyến', () => {
    expect(partnerHomeHref(noShop)).toBe(M.REGISTER);
    expect(partnerHomeHref(packagePending)).toBe(M.ONBOARDING);
    expect(partnerHomeHref(packageCurrent)).toBe(M.ROOT);
    expect(partnerHomeHref(commission)).toBe(M.ROOT);
  });
});

describe('trang công khai', () => {
  it('site partner: đăng nhập, đăng ký, quên/đặt lại mật khẩu, lời mời', () => {
    expect(isPartnerPublicPage(M.LOGIN)).toBe(true);
    expect(isPartnerPublicPage(`${M.REGISTER}?track=commission`)).toBe(true);
    expect(isPartnerPublicPage(M.FORGOT_PASSWORD)).toBe(true);
    expect(isPartnerPublicPage(M.RESET_PASSWORD)).toBe(true);
    expect(isPartnerPublicPage(`${M.INVITES}/tok`)).toBe(true);
    expect(isPartnerPublicPage(M.ROOT)).toBe(false);
    expect(isPartnerPublicPage(M.ONBOARDING)).toBe(false);
    // Trang công khai không bao giờ bị chuyển đi, kể cả khi đã có phiên.
    expect(partnerPageRedirect(packagePending, M.LOGIN)).toBeNull();
  });

  it('site quản trị: KHÔNG có trang tự đăng ký', () => {
    expect(isAdminPublicPage(ROUTES.ADMIN.LOGIN)).toBe(true);
    expect(isAdminPublicPage(ROUTES.ADMIN.FORGOT_PASSWORD)).toBe(true);
    expect(isAdminPublicPage(ROUTES.ADMIN.RESET_PASSWORD)).toBe(true);
    expect(isAdminPublicPage('/admin/register')).toBe(false);
    expect(isAdminPublicPage(ROUTES.ADMIN.ROOT)).toBe(false);
  });

  it('isCommissionPage: form đầy đủ của tuyến gói không lọt vào danh sách trắng', () => {
    expect(isCommissionPage(M.VEHICLE_NEW)).toBe(false);
    expect(isCommissionPage(`${M.VEHICLES}/01V/edit`)).toBe(false);
    expect(isCommissionPage(`${M.VEHICLES}/01V`)).toBe(true);
  });
});

describe('resolveAdminDestination', () => {
  it('next an toàn trong khu quản trị, còn lại về trang đầu', () => {
    expect(resolveAdminDestination({ next: `${ROUTES.ADMIN.TENANTS}?status=active` })).toBe(
      `${ROUTES.ADMIN.TENANTS}?status=active`,
    );
    for (const next of [null, M.ROOT, '/trips', ROUTES.ADMIN.LOGIN, 'https://evil.test/']) {
      expect(resolveAdminDestination({ next }), String(next)).toBe(ROUTES.ADMIN.ROOT);
    }
  });

  it('phiên hỏng → trang đăng nhập CỦA site đó giữ đường đang mở', () => {
    expect(adminLoginWithNext('/admin/tenants')).toBe(
      `${ROUTES.ADMIN.LOGIN}?next=%2Fadmin%2Ftenants`,
    );
    expect(portalLoginWithNext('/manage/bookings')).toBe(`${M.LOGIN}?next=%2Fmanage%2Fbookings`);
    expect(portalLoginWithNext('//evil.test')).toBe(`${M.LOGIN}?next=%2Fmanage`);
  });
});

describe('site khách', () => {
  it('resolveCustomerDestination: không next → ở nguyên trang; next chỉ trong site khách', () => {
    expect(resolveCustomerDestination(null)).toBeNull();
    expect(resolveCustomerDestination('')).toBeNull();
    expect(resolveCustomerDestination(ROUTES.TRIPS)).toBe(ROUTES.TRIPS);
    expect(resolveCustomerDestination('/xe/01H?c=1')).toBe('/xe/01H?c=1');
    expect(resolveCustomerDestination(M.ROOT)).toBeNull();
    expect(resolveCustomerDestination(ROUTES.ADMIN.ROOT)).toBeNull();
    expect(resolveCustomerDestination('https://evil.test')).toBeNull();
  });

  it('CTA chủ xe LUÔN dẫn sang trang đăng ký của site partner', () => {
    expect(resolveOwnerCtaHref()).toBe(M.REGISTER);
  });
});

describe('khu làm việc dùng chung với app native', () => {
  it('resolveWorkspaceHref: mọi đích đều nằm ở site partner', () => {
    expect(resolveWorkspaceHref(noShop)).toBeNull();
    expect(resolveWorkspaceHref(null)).toBeNull();
    expect(resolveWorkspaceHref(packagePending)).toBe(M.ONBOARDING);
    expect(resolveWorkspaceHref(packageCurrent)).toBe(M.ROOT);
    expect(resolveWorkspaceHref(commission)).toBe(M.VEHICLES);
    expect(resolveWorkspaceHref(lapsed)).toBe(M.VEHICLES);
    // Bậc `registering`: trang chủ Owner Lite chính là màn tiến trình đăng ký.
    expect(resolveWorkspaceHref(unconfigured)).toBe(M.ROOT);
  });

  it('isOnboardingRoute so phần đường dẫn, bỏ query', () => {
    expect(isOnboardingRoute(`${M.ONBOARDING}?track=package`)).toBe(true);
    expect(isOnboardingRoute(M.ROOT)).toBe(false);
    expect(isOnboardingRoute(null)).toBe(false);
  });
});

/*
 * Lối vào ỔN ĐỊNH của email hướng dẫn gói (`PARTNER_PLAN_PURCHASE_PATH` = `/subscription`): server-side
 * dữ liệu tuyến (`/auth/me`) quyết đích, và đích mang `?purchase=1` để section gói mở luồng mua.
 */
describe('/subscription — bảng quyết định của link email gói', () => {
  it('chưa đăng nhập → trang đăng nhập partner, quay lại đúng /subscription', () => {
    expect(portalLoginWithNext(M.SUBSCRIPTION)).toBe(
      `${M.LOGIN}?next=${encodeURIComponent(M.SUBSCRIPTION)}`,
    );
  });

  it('đăng nhập xong với next=/subscription → đi thẳng tới đích theo tuyến', () => {
    expect(resolvePartnerDestination({ user: packageCurrent, next: M.SUBSCRIPTION })).toBe(
      withPlanPurchaseIntent(shopSectionPath(SHOP_SECTION.PLAN)),
    );
    expect(resolvePartnerDestination({ user: commission, next: M.SUBSCRIPTION })).toBe(
      withPlanPurchaseIntent(accountSectionPath(ACCOUNT_SECTION.PLAN)),
    );
    expect(resolvePartnerDestination({ user: packagePending, next: M.SUBSCRIPTION })).toBe(
      M.ONBOARDING,
    );
    expect(resolvePartnerDestination({ user: noShop, next: M.SUBSCRIPTION })).toBe(M.REGISTER);
  });

  it('tuyến gói → "Gói & hạn mức" + mở hộp thoại; gian hàng đang nợ thanh toán đầu → onboarding', () => {
    expect(partnerPageRedirect(packageCurrent, M.SUBSCRIPTION)).toBe(
      `${M.SHOP}?section=${SHOP_SECTION.PLAN}&purchase=1`,
    );
    expect(partnerPageRedirect(packagePending, M.SUBSCRIPTION)).toBe(M.ONBOARDING);
  });

  it('chỉ /subscription mang ý định mua — section gói mở trực tiếp thì không', () => {
    expect(partnerPageRedirect(packageCurrent, shopSectionPath(SHOP_SECTION.PLAN))).toBeNull();
  });
});
