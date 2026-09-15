import { describe, expect, it } from 'vitest';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

import {
  ACCOUNT_NAV,
  OWNER_NAV,
  OWNER_REGISTERING_NAV,
  flattenAccountNav,
  isCommissionOwner,
  isShopOwner,
  matchAccountNavKey,
  resolveAccountNav,
} from './account-nav';
import { ROUTES } from './routes';

/**
 * Menu khu tài khoản.
 *
 * Ba nhóm bất biến: **mục nào ĐƯỢC có mặt** (ADR 0014 đã loại ba mục khỏi mockup — quên lý do
 * thì chúng sẽ lặng lẽ quay lại), **ai thấy nhóm chủ xe** (menu chủ xe cho `shop_owner`, không
 * cho nhân viên gian hàng), và **mục nào đang sáng** (một menu chỉ ra sai chỗ đứng còn tệ hơn
 * menu không đánh dấu gì).
 *
 * Bản 08/09/2026 mở rộng: khu tài khoản nay phục vụ CẢ chủ xe ít xe, nên menu có hai hình dạng.
 */

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    displayName: 'Nguyễn Văn A',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: false,
    hasPassword: true,
    tenant: null,
    platformRole: null,
    permissions: [],
    ...overrides,
  } as CurrentUser;
}

function tenant(overrides: Partial<NonNullable<CurrentUser['tenant']>> = {}) {
  return {
    id: 't1',
    name: 'Việt Car Hà Nội',
    slug: 'viet-car',
    status: 'active',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    features: [],
    /*
     * Hình dạng THẬT của một chủ xe đã đi hết vòng đăng ký: có gói bậc `commission` (mọi tenant
     * mới đều được gán — `assignDefaultPlanWithinTx`) và có xe trên chợ.
     */
    planCode: 'BASIC',
    billingMode: BILLING_MODE.COMMISSION,
    planEndsAt: null,
    publicVehicleCount: 2,
    ...overrides,
  } as NonNullable<CurrentUser['tenant']>;
}

describe('ACCOUNT_NAV — thành phần', () => {
  it('mở đầu bằng hồ sơ, và hồ sơ là mục duy nhất trỏ về gốc khu tài khoản', () => {
    expect(ACCOUNT_NAV[0]?.key).toBe('profile');
    expect(ACCOUNT_NAV.filter((i) => i.href === ROUTES.ACCOUNT.ROOT)).toHaveLength(1);
  });

  it('KHÔNG có ví/ưu đãi — ADR 0028 điều 8: số dư chủ xe là sổ công nợ, không phải ví', () => {
    expect(ACCOUNT_NAV.some((i) => /wallet|voucher|promo/i.test(i.key))).toBe(false);
  });

  it('KHÔNG có mục nào dẫn thẳng vào cổng quản lý — đó là việc của ShopEntryCard/CTA chủ xe', () => {
    expect(ACCOUNT_NAV.some((i) => i.href.startsWith('/manage'))).toBe(false);
  });

  it('Chuyến của tôi trỏ sang route /trips có sẵn, đánh dấu external', () => {
    const trips = ACCOUNT_NAV.find((i) => i.key === 'trips');
    expect(trips?.href).toBe(ROUTES.TRIPS);
    expect(trips?.external).toBe(true);
  });

  /**
   * Điều kiện chung thay vì đếm số mục: mọi mục còn lại phải dẫn tới một nơi CÓ THẬT. Thêm mục
   * mới vào menu mà quên dựng trang thì đỏ ở đây.
   */
  it('mọi mục đều dẫn tới một route đã dựng — không còn mục "Sắp có"', () => {
    const built = new Set<string>([
      ROUTES.ACCOUNT.ROOT,
      ROUTES.ACCOUNT.VEHICLES,
      ROUTES.ACCOUNT.CALENDAR,
      ROUTES.ACCOUNT.HOST_GUIDE,
      ROUTES.ACCOUNT.TAX,
      ROUTES.ACCOUNT.CONTRACTS_DOCUMENTS,
      ROUTES.ACCOUNT.DATA_PROTECTION,
      ROUTES.ACCOUNT.BALANCE,
      ROUTES.ACCOUNT.EARNINGS,
      ROUTES.ACCOUNT.BANK_ACCOUNTS,
      ROUTES.ACCOUNT.PAYMENTS,
      ROUTES.ACCOUNT.CHANGE_PASSWORD,
      ROUTES.ACCOUNT.DELETE_ACCOUNT,
      ROUTES.ACCOUNT.REGISTRATION,
      ROUTES.ACCOUNT.MESSAGES,
      ROUTES.ACCOUNT.SUBSCRIPTION,
      ROUTES.TRIPS,
    ]);
    for (const item of [...ACCOUNT_NAV, ...OWNER_NAV, ...OWNER_REGISTERING_NAV]) {
      expect(built.has(item.href)).toBe(true);
    }
  });

  it('mọi mục nằm trong /account đều là route đã khai báo ở ROUTES', () => {
    const declared = new Set<string>(Object.values(ROUTES.ACCOUNT));
    for (const item of [...ACCOUNT_NAV, ...OWNER_NAV, ...OWNER_REGISTERING_NAV]) {
      if (item.external) continue;
      expect(declared.has(item.href)).toBe(true);
    }
  });

  it('khoá của các mục là duy nhất', () => {
    expect(new Set(ACCOUNT_NAV.map((i) => i.key)).size).toBe(ACCOUNT_NAV.length);
    expect(new Set(OWNER_NAV.map((i) => i.key)).size).toBe(OWNER_NAV.length);
    expect(new Set(OWNER_REGISTERING_NAV.map((i) => i.key)).size).toBe(OWNER_REGISTERING_NAV.length);
  });
});

describe('isShopOwner / isCommissionOwner', () => {
  it('chỉ vai chủ gian hàng mới là chủ xe — quản lý/nhân viên thì không', () => {
    expect(isShopOwner(user({ tenant: tenant() }))).toBe(true);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_MANAGER }) }))).toBe(false);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) }))).toBe(false);
    expect(isShopOwner(user())).toBe(false);
  });

  /**
   * Sửa 14/09/2026 — đây là một BUG THẬT, không phải đổi ý.
   *
   * Bản cũ hỏi `planCode == null`, nhưng `BillingService.assignDefaultPlanWithinTx` gán cho MỌI
   * gian hàng mới một gói bậc `commission` ngay trong transaction đăng ký. Nghĩa là `planCode`
   * gần như không bao giờ rỗng, và 100% chủ xe tuyến hoa hồng bị xếp nhầm sang tuyến gói. Nguồn
   * đúng là `billingMode` của gói hiện hành (ADR 0024 đóng băng nó trên dòng thuê bao).
   */
  it('tuyến hoa hồng đọc từ billingMode, KHÔNG suy từ planCode', () => {
    // Có gói, nhưng gói đó là bậc hoa hồng ⇒ vẫn là Basic Owner.
    expect(
      isCommissionOwner(
        user({ tenant: tenant({ planCode: 'BASIC', billingMode: BILLING_MODE.COMMISSION }) }),
      ),
    ).toBe(true);
    expect(
      isCommissionOwner(
        user({ tenant: tenant({ planCode: 'slot_flat', billingMode: BILLING_MODE.PACKAGE }) }),
      ),
    ).toBe(false);
    // Không có gói hiệu lực (hết hạn) ⇒ không có thuê bao ⇒ tuyến hoa hồng.
    expect(
      isCommissionOwner(user({ tenant: tenant({ planCode: null, billingMode: null }) })),
    ).toBe(true);
    // Khách thuê không phải "chủ xe tuyến hoa hồng" chỉ vì họ chưa có gói.
    expect(isCommissionOwner(user())).toBe(false);
  });
});

describe('resolveAccountNav', () => {
  it('chủ gian hàng: nhóm chủ xe đứng trước, rồi nhóm Tài khoản', () => {
    const groups = resolveAccountNav(user({ tenant: tenant() }));
    expect(groups.map((g) => g.key)).toEqual(['owner', 'account']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'vehicles',
      'calendar',
      'trips',
      'earnings',
      'messages',
      'ownerProfile',
      'subscription',
      'hostGuide',
      'tax',
      'contractsDocuments',
      'dataProtection',
    ]);
    // `payments` nằm ở nhóm CÁ NHÂN, không nằm ở nhóm chủ xe: nó là tiền họ trả khi đi THUÊ xe
    // của người khác, còn mọi mục nhóm chủ xe nói về tiền họ NHẬN.
    expect(groups[1]?.items.map((i) => i.key)).toEqual([
      'profile',
      'payments',
      'balance',
      'bankAccounts',
      'changePassword',
      'deleteAccount',
    ]);
  });

  it('khách thuê: một nhóm, có "Trở thành chủ xe", KHÔNG có mục quản lý xe', () => {
    const groups = resolveAccountNav(user());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'profile',
      'becomeOwner',
      'trips',
      'payments',
      'balance',
      'bankAccounts',
      'changePassword',
      'deleteAccount',
    ]);
    expect(groups[0]?.items.some((i) => i.href === ROUTES.ACCOUNT.VEHICLES)).toBe(false);
    // Ví gian hàng KHÔNG hiện cho người không có gian hàng — với họ sổ đó không tồn tại.
    expect(groups[0]?.items.some((i) => i.href === ROUTES.ACCOUNT.EARNINGS)).toBe(false);
  });

  /**
   * Điều quan trọng nhất của bản này: nhân viên gian hàng KHÔNG phải chủ xe. Cho họ menu chủ xe
   * là dẫn họ tới những màn mà `TenantScopeGuard` + permission sẽ từ chối.
   */
  it('quản lý/nhân viên của một gian hàng dùng menu cá nhân, không phải menu chủ xe', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const groups = resolveAccountNav(user({ tenant: tenant({ roleKey }) }));
      expect(groups.some((g) => g.key === 'owner')).toBe(false);
      // Họ đã thuộc một gian hàng ⇒ CTA dẫn về cổng quản lý, không mời "trở thành chủ xe".
      const cta = groups[0]?.items.find((i) => i.key === 'becomeOwner');
      expect(cta?.href).toBe(ROUTES.MANAGE.ROOT);
      expect(cta?.labelKey).toBe('public.manageShop');
    }
  });

  it('người chưa có gian hàng được mời qua LANDING đăng xe, không phải form tạo shop', () => {
    const cta = resolveAccountNav(user())[0]?.items.find((i) => i.key === 'becomeOwner');
    // 09/09/2026: CTA dừng ở trang giới thiệu công khai; gian hàng chỉ được tạo khi người dùng
    // bấm tiếp ở đó (`resolveOwnerCtaHref`).
    expect(cta?.href).toBe(ROUTES.LIST_YOUR_VEHICLE.ROOT);
    expect(cta?.labelKey).toBe('public.becomeOwner');
  });
});

describe('matchAccountNavKey', () => {
  const ownerItems = flattenAccountNav(resolveAccountNav(user({ tenant: tenant() })));

  it('khớp tuyệt đối', () => {
    expect(matchAccountNavKey(ROUTES.ACCOUNT.CHANGE_PASSWORD, ownerItems)).toBe('changePassword');
  });

  it('trang con vẫn sáng mục cha', () => {
    expect(matchAccountNavKey(`${ROUTES.ACCOUNT.VEHICLES}/abc`, ownerItems)).toBe('vehicles');
    expect(matchAccountNavKey(`${ROUTES.TRIPS}/abc`, ownerItems)).toBe('trips');
  });

  it('gốc /account KHÔNG nuốt các trang con', () => {
    // Nếu khớp theo tiền tố thì mọi trang trong khu đều sáng "Tài khoản của tôi".
    expect(matchAccountNavKey(ROUTES.ACCOUNT.ROOT, ownerItems)).toBe('profile');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.TAX, ownerItems)).toBe('tax');
  });

  /*
   * `/account/payments` từng bị bỏ khỏi menu khi nó còn là placeholder. Màn thật đã có
   * (PROMPT 5), nên nó phải có đường vào — và phải có cho CẢ HAI loại người dùng, vì một chủ xe
   * cũng đi thuê xe của người khác.
   */
  it('lịch sử thanh toán có đường vào và sáng đúng mục', () => {
    expect(matchAccountNavKey(ROUTES.ACCOUNT.PAYMENTS, ownerItems)).toBe('payments');
  });

  /**
   * BẤT BIẾN TIỀN — ADR 0033 điều 1.
   *
   * Ba sổ tiền phải LUÔN có đường vào từ menu, cho đúng loại người dùng:
   *
   *   · `balance`      ví điểm CÁ NHÂN (hoàn khoản giữ chỗ) — mọi người đăng nhập
   *   · `bankAccounts` nơi khai số tài khoản để rút số dư đó — mọi người đăng nhập
   *   · `earnings`     ví điểm GIAN HÀNG (`D − T` sau mỗi chuyến) — chủ xe
   *
   * Cả ba từng biến khỏi menu một lần trong đợt làm lại nav: route vẫn còn, màn vẫn chạy, nhưng
   * không ai tới được. Với một sổ CÔNG NỢ thì ẩn đường vào tương đương không trả — điểm không
   * hết hạn và không thu hồi (ADR 0033 điều 1) thì cũng không được vô hình. Test này là cái chốt
   * để lần sau đỏ ngay thay vì im lặng.
   */
  it('BẤT BIẾN: cả ba sổ tiền đều có đường vào từ menu', () => {
    const renterItems = flattenAccountNav(resolveAccountNav(user()));

    for (const href of [ROUTES.ACCOUNT.BALANCE, ROUTES.ACCOUNT.BANK_ACCOUNTS]) {
      expect(matchAccountNavKey(href, ownerItems)).toBeDefined();
      expect(matchAccountNavKey(href, renterItems)).toBeDefined();
    }

    // Ví gian hàng là đường DUY NHẤT tới tiền của chủ xe tuyến hoa hồng — họ không vào `/manage`.
    expect(matchAccountNavKey(ROUTES.ACCOUNT.EARNINGS, ownerItems)).toBe('earnings');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.EARNINGS, renterItems)).toBeUndefined();

    /*
     * Và cả ở bậc ĐANG ĐĂNG KÝ. Bậc đó không chỉ có người mới: một chủ xe từng cho thuê rồi tạm
     * ẩn hết xe cũng tụt về đây (`publicVehicleCount = 0`), và tiền họ đã kiếm vẫn nằm trong sổ.
     */
    const registeringItems = flattenAccountNav(
      resolveAccountNav(user({ tenant: tenant({ publicVehicleCount: 0 }) })),
    );
    expect(matchAccountNavKey(ROUTES.ACCOUNT.EARNINGS, registeringItems)).toBe('earnings');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.CALENDAR, registeringItems)).toBeUndefined();
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/search', ownerItems)).toBeUndefined();
  });

  it('/trips sáng mục Chuyến của tôi dù nó nằm ngoài /account', () => {
    expect(matchAccountNavKey('/trips')).toBe('trips');
    expect(matchAccountNavKey('/trips/abc')).toBe('trips');
  });
});
