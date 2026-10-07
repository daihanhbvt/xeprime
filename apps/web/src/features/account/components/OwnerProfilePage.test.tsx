import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  PERMISSION,
  SELLER_ENTITY_TYPE,
  SELLER_PROFILE_STATUS,
  SHOP_ONBOARDING_STATE,
  SHOP_VERIFICATION,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';

import type { MyShop } from '@/features/shop/types';

import { PartnerAccountRoute } from './PartnerAccountRoute';

/**
 * HỒ SƠ CHỦ XE — trang tài khoản của CHỦ xe tuyến hoa hồng (06/10/2026).
 *
 * Bộ này khoá những gì làm nên lần gộp "Hồ sơ chủ xe" + "Tài khoản & bảo mật":
 *
 *  1. **Một URL, hai bản theo tuyến**: chủ xe hoa hồng thấy "Hồ sơ chủ xe"; tuyến gói và THÀNH
 *     VIÊN thấy "Tài khoản & bảo mật" thường (`PartnerAccountRoute`).
 *  2. **Bảy section, theo thứ tự**, không chữ "gian hàng" nào ở tiêu đề — gồm "Thông tin khai thuế"
 *     và "Gói dịch vụ" (07/10/2026, trước là hai mục menu riêng), mỗi section theo đúng quyền API.
 *  3. **Mặt tiền cá nhân**: không ô ảnh bìa; ô logo chỉ có khi hồ sơ ĐANG có logo (để còn xoá được).
 *  4. **Thanh lưu chỉ có khi có thay đổi**, và nó gửi lên ĐÚNG endpoint của trang chủ xe.
 */

const PROFILE = {
  id: '01HUSER000000000000000000',
  displayName: 'Trần Thu Hương',
  email: 'chuxe.huong@xeprime.test',
  phone: '0903000001',
  emailVerified: true,
  phoneVerified: true,
  avatarUrl: 'https://cdn.xeprime.test/avatar.jpg',
};
const profile = vi.hoisted(() => ({
  data: null as unknown,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const updateMe = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/features/account/hooks/use-account', () => ({
  useMyProfile: () => profile,
  useUpdateMyProfile: () => updateMe,
}));

const shop = vi.hoisted(() => ({
  data: null as unknown,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const updateShop = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/features/shop/hooks/use-shop', () => ({
  useMyShop: () => shop,
  useUpdateShopProfile: () => updateShop,
}));

const user = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isPending: false }),
}));
const perms = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (key: string) => !perms.denied.has(key),
    hasAny: () => true,
    isLoading: false,
  }),
}));

const search = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/manage/account',
  useSearchParams: () => new URLSearchParams(search.value),
}));

/*
 * Ba section bảo mật DÙNG CHUNG với "Tài khoản & bảo mật" đã có test riêng (`PartnerAccountPage.test`)
 * — ở đây chỉ cần biết chúng có mặt đúng chỗ. Ô địa chỉ cũng vậy (`AddressField.test`).
 */
vi.mock('./AccountSecuritySections', () => ({
  AccountSecuritySections: () => (
    <>
      <section id="account-section-login">
        <h2>Thông tin đăng nhập</h2>
      </section>
      <section id="account-section-password">
        <h2>Mật khẩu</h2>
      </section>
      <section id="account-section-delete">
        <h2>Xoá tài khoản</h2>
      </section>
    </>
  ),
}));
vi.mock('./PartnerAccountPage', () => ({
  PartnerAccountPage: () => <div data-testid="partner-account-page" />,
}));
vi.mock('@/components/form/AddressField', () => ({ AddressField: () => null }));

/** Chuyển trang phía client — thay bằng một mốc QUAN SÁT được ("có chuyển không, tới đâu"). */
vi.mock('@/features/partner/components/ClientRedirect', () => ({
  ClientRedirect: ({ href }: { href: string }) => (
    <div data-testid="client-redirect" data-href={href} />
  ),
}));

/** Hồ sơ người bán (section khai thuế) — chặn ở tầng hook, như hai hồ sơ ở trên. */
const sellerProfile = vi.hoisted(() => ({
  data: null as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const saveSeller = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('@/features/seller-profile/hooks/use-seller-profile', () => ({
  useSellerProfile: () => sellerProfile,
  useSaveSellerProfile: () => saveSeller,
}));

/*
 * Khối gói DÙNG CHUNG với trang Cửa hàng và có test riêng (`SubscriptionWorkspace.test`) — ở đây
 * chỉ hỏi nó có nằm đúng section không.
 */
vi.mock('@/features/subscription/components/SubscriptionWorkspace', () => ({
  SubscriptionWorkspace: () => <div data-testid="subscription-workspace" />,
}));

const SELLER = {
  id: '01HSELLER0000000000000000',
  tenantId: '01HSHOP00000000000000000A',
  entityType: SELLER_ENTITY_TYPE.INDIVIDUAL,
  legalName: 'Trần Thu Hương',
  taxId: null,
  idNumber: '079190000001',
  idIssuedAt: '2015-06-01',
  idIssuedBy: 'Cục Cảnh sát QLHC về TTXH',
  status: SELLER_PROFILE_STATUS.DRAFT,
  editable: true,
  reviewNote: null,
};

function makeShop(profileOverrides: Partial<MyShop['profile']> = {}): MyShop {
  return {
    id: '01HSHOP00000000000000000A',
    code: 'SHOP-1',
    slug: 'xe-chi-huong',
    name: 'Xe tự lái chị Hương',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    verification: SHOP_VERIFICATION.UNVERIFIED,
    phone: '84903000001',
    email: null,
    latestApproval: null,
    ownerAccount: {
      userId: '01HUSER000000000000000000',
      displayName: 'Trần Thu Hương',
      email: 'chuxe.huong@xeprime.test',
      phone: '84903000001',
      emailVerified: true,
      phoneVerified: true,
    },
    defaultBranch: {
      id: '01HBRANCH0000000000000000',
      code: 'CN01',
      name: 'Chi nhánh chính',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      needsLocationReview: false,
    },
    profile: {
      displayName: 'Xe tự lái chị Hương',
      bio: 'Xe gia đình, giữ gìn kỹ.',
      logoUrl: null,
      coverUrl: null,
      address: '12 Nguyễn Thái Học',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      taxCode: null,
      businessLicenseNo: null,
      ...profileOverrides,
    },
  } as MyShop;
}

function setUser(opts: { track?: 'commission' | 'package'; role?: string } = {}) {
  const { track = 'commission', role = TENANT_ROLE.SHOP_OWNER } = opts;
  user.value = {
    id: '01HUSER000000000000000000',
    displayName: 'Trần Thu Hương',
    avatarUrl: null,
    tenant: {
      id: '01HSHOP00000000000000000A',
      name: 'Xe tự lái chị Hương',
      roleKey: role,
      logoUrl: null,
      billingMode: track === 'package' ? BILLING_MODE.PACKAGE : BILLING_MODE.COMMISSION,
      onboardingState:
        track === 'package'
          ? SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE
          : SHOP_ONBOARDING_STATE.COMMISSION,
    },
  };
}

function renderRoute() {
  return render(
    <App>
      <PartnerAccountRoute />
    </App>,
  );
}

const section = (id: string) => within(document.getElementById(`account-section-${id}`)!);

beforeEach(() => {
  profile.data = { ...PROFILE };
  profile.isPending = false;
  profile.isError = false;
  shop.data = makeShop();
  shop.isError = false;
  updateShop.mutate.mockReset();
  updateShop.mutateAsync.mockReset().mockResolvedValue({});
  updateMe.mutateAsync.mockReset().mockResolvedValue({});
  updateShop.isPending = false;
  search.value = '';
  perms.denied = new Set();
  sellerProfile.data = { ...SELLER };
  sellerProfile.isLoading = false;
  sellerProfile.isError = false;
  saveSeller.mutate.mockReset();
  saveSeller.isPending = false;
  setUser();
});

afterEach(() => cleanup());

describe('/manage/account — một URL, bản theo tuyến', () => {
  it('chủ xe tuyến hoa hồng → Hồ sơ chủ xe', () => {
    renderRoute();
    expect(screen.queryByTestId('partner-account-page')).toBeNull();
    // Tiêu đề là HỌ TÊN tài khoản — tên khách thấy (ADR 0054), không phải `tenants.name` cũ.
    expect(screen.getByRole('heading', { level: 1, name: 'Trần Thu Hương' })).toBeTruthy();
  });

  it('tuyến gói → Tài khoản & bảo mật thường', () => {
    setUser({ track: 'package' });
    renderRoute();
    expect(screen.getByTestId('partner-account-page')).toBeTruthy();
  });

  it('chủ xe thiếu quyền xem hồ sơ gian hàng → bản thường, không treo ở khung tải', () => {
    perms.denied = new Set([PERMISSION.TENANT_VIEW]);
    renderRoute();
    expect(screen.getByTestId('partner-account-page')).toBeTruthy();
  });

  it('THÀNH VIÊN của gian hàng tuyến hoa hồng → trang tài khoản của riêng họ', () => {
    setUser({ role: TENANT_ROLE.SHOP_STAFF });
    renderRoute();
    expect(screen.getByTestId('partner-account-page')).toBeTruthy();
  });

  /*
   * Luồng nâng cấp nằm NGAY TRÊN trang này (section "Gói dịch vụ"). Tiền về ⇒ `/auth/me` lật sang
   * tuyến gói — người vừa trả tiền phải tới gian hàng vừa mở, không phải trang "Tài khoản & bảo mật".
   * Không phụ thuộc `?section=`: họ có thể đã cuộn tới bảng giá mà không bấm mục lục.
   */
  it('thanh toán nâng cấp xong ngay trên trang → sang section gói của trang Cửa hàng', () => {
    const view = renderRoute();
    expect(screen.queryByTestId('client-redirect')).toBeNull();

    setUser({ track: 'package' });
    view.rerender(
      <App>
        <PartnerAccountRoute />
      </App>,
    );

    expect(screen.getByTestId('client-redirect').getAttribute('data-href')).toBe(
      '/manage/shop?section=plan',
    );
  });

  it.each([
    ['plan', '/manage/shop?section=plan'],
    ['tax', '/manage/shop?section=tax'],
    ['address', '/manage/shop?section=legal'],
  ])(
    'tài khoản tuyến gói mở bookmark `?section=%s` → section cùng vai ở trang Cửa hàng',
    (key, href) => {
      setUser({ track: 'package' });
      search.value = `section=${key}`;
      renderRoute();

      expect(screen.getByTestId('client-redirect').getAttribute('data-href')).toBe(href);
    },
  );

  it('tài khoản tuyến gói ở section của CON NGƯỜI (đăng nhập) → ở lại trang tài khoản', () => {
    setUser({ track: 'package' });
    search.value = 'section=login';
    renderRoute();

    expect(screen.queryByTestId('client-redirect')).toBeNull();
    expect(screen.getByTestId('partner-account-page')).toBeTruthy();
  });
});

describe('Hồ sơ chủ xe — bố cục', () => {
  it('bảy section theo thứ tự — không còn "Trang chủ xe" riêng, không chữ "gian hàng"', () => {
    renderRoute();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Thông tin chủ xe',
      'Địa chỉ nhận xe',
      'Thông tin khai thuế',
      'Gói dịch vụ',
      'Thông tin đăng nhập',
      'Mật khẩu',
      'Xoá tài khoản',
    ]);
    expect(headings.some((h) => /gian hàng/i.test(h ?? ''))).toBe(false);
    // Địa chỉ nhận xe KHÔNG có ô MST/GPKD — giấy tờ người bán khai ở section khai thuế.
    expect(section('address').queryByText('Mã số thuế')).toBeNull();
    expect(section('address').queryByText('Số giấy phép KD')).toBeNull();
  });

  /*
   * Tiền KHÔNG ở trang hồ sơ: số dư, tài khoản nhận tiền, thuế đã khấu trừ sống ở "Số dư & rút
   * tiền" — cũng như ở tuyến gói, nơi trang Cửa hàng không còn khối tài khoản nhận tiền.
   */
  it('không có khối tài khoản nhận tiền hay thuế đã khấu trừ trên trang hồ sơ', () => {
    renderRoute();

    expect(screen.queryByText('Tài khoản nhận tiền')).toBeNull();
    expect(screen.queryByText('Thuế đã khấu trừ trong kỳ')).toBeNull();
  });

  it('thông tin chủ xe: ảnh + nút Thay đổi, họ tên, lời giới thiệu — KHÔNG có nút xoá ảnh', () => {
    renderRoute();

    const owner = section('profile');
    expect(owner.getByRole('button', { name: /Thay đổi/ })).toBeTruthy();
    expect(owner.queryByRole('button', { name: /Xoá ảnh/ })).toBeNull();
    expect(owner.getByLabelText(/Họ tên|Tên hiển thị/)).toBeTruthy();
    expect(owner.getByLabelText(/Giới thiệu/)).toBeTruthy();
    // Không có ô tải ảnh thứ hai bên dưới, không có dòng giải thích cơ chế.
    expect(owner.queryByText('Ảnh đại diện')).toBeNull();
    expect(owner.queryByRole('link', { name: 'Mở Cài đặt gian hàng' })).toBeNull();
  });

  it('logo cũ từ thời có gói KHÔNG thay ảnh đại diện — cả trang dùng ảnh tài khoản', () => {
    shop.data = makeShop({ logoUrl: 'https://cdn.xeprime.test/logo.png' });
    renderRoute();

    const imgs = Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(imgs).toContain('https://cdn.xeprime.test/avatar.jpg');
    expect(imgs).not.toContain('https://cdn.xeprime.test/logo.png');
  });

  it('thiếu quyền sửa gian hàng: nói rõ chỉ được xem, ô giới thiệu bị khoá', () => {
    perms.denied = new Set([PERMISSION.TENANT_UPDATE]);
    renderRoute();

    expect(screen.getByText(/chỉ có quyền xem lời giới thiệu/)).toBeTruthy();
    // `fieldset[disabled]` khoá ô — đọc trạng thái THẬT bằng `:disabled`, không bằng thuộc tính.
    expect(
      section('profile')
        .getByLabelText(/Giới thiệu/)
        .matches(':disabled'),
    ).toBe(true);
  });

  it('trang đang hoạt động: có lối xem trang chủ xe công khai', () => {
    renderRoute();
    expect(screen.getByRole('link', { name: /Xem trang chủ xe/ })).toBeTruthy();
  });
});

describe('Hồ sơ chủ xe — lưu thông tin chủ xe', () => {
  const saveButton = () => section('profile').getByRole('button', { name: /Lưu/ });

  it('chưa sửa gì: nút lưu mờ', () => {
    renderRoute();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('chỉ sửa lời giới thiệu: gửi RIÊNG bio lên hồ sơ gian hàng, không chạm tài khoản', async () => {
    renderRoute();

    fireEvent.change(section('profile').getByLabelText(/Giới thiệu/), {
      target: { value: 'Xe nhà, giao tận nơi trong quận.' },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateShop.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateShop.mutateAsync).toHaveBeenCalledWith({
      bio: 'Xe nhà, giao tận nơi trong quận.',
    });
    expect(updateMe.mutateAsync).not.toHaveBeenCalled();
  });

  it('chỉ sửa họ tên: gửi lên tài khoản, không chạm hồ sơ gian hàng', async () => {
    renderRoute();

    fireEvent.change(section('profile').getByLabelText(/Họ tên|Tên hiển thị/), {
      target: { value: 'Trần Thu Hương B' },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMe.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMe.mutateAsync).toHaveBeenCalledWith({
      displayName: 'Trần Thu Hương B',
      avatarUrl: 'https://cdn.xeprime.test/avatar.jpg',
    });
    expect(updateShop.mutateAsync).not.toHaveBeenCalled();
  });

  it('chưa có ảnh: không lưu được — ảnh là bắt buộc', async () => {
    profile.data = { ...PROFILE, avatarUrl: null };
    renderRoute();

    fireEvent.change(section('profile').getByLabelText(/Họ tên|Tên hiển thị/), {
      target: { value: 'Trần Thu Hương B' },
    });
    fireEvent.click(saveButton());

    expect(await section('profile').findByText(/Vui lòng chọn ảnh đại diện/)).toBeTruthy();
    expect(updateMe.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('Hồ sơ chủ xe — khai thuế và gói dịch vụ', () => {
  it('khai thuế: chủ xe cá nhân khai CCCD, không có ô mã số thuế', () => {
    renderRoute();

    const tax = section('tax');
    expect(tax.getByLabelText(/Số CCCD/)).toBeTruthy();
    expect(tax.queryByLabelText(/Mã số thuế/)).toBeNull();
  });

  /*
   * `PUT /seller-profile` ghi TOÀN PHẦN: payload phải mang cả phần hồ sơ section này không hiện
   * (ngày/nơi cấp CCCD), nếu không lưu một số CCCD là xoá sạch phần còn lại.
   */
  it('lưu khai thuế: gửi bốn trường của section + GIỮ NGUYÊN phần hồ sơ không hiện', async () => {
    renderRoute();

    const tax = section('tax');
    fireEvent.change(tax.getByLabelText(/Số CCCD/), { target: { value: '079190000002' } });
    fireEvent.click(tax.getByRole('button', { name: 'Lưu thông tin thuế' }));

    await waitFor(() => expect(saveSeller.mutate).toHaveBeenCalledTimes(1));
    expect(saveSeller.mutate.mock.calls[0]?.[0]).toEqual({
      entityType: SELLER_ENTITY_TYPE.INDIVIDUAL,
      legalName: 'Trần Thu Hương',
      taxId: null,
      idNumber: '079190000002',
      idIssuedAt: '2015-06-01',
      idIssuedBy: 'Cục Cảnh sát QLHC về TTXH',
    });
  });

  it('gói dịch vụ nằm trong section của nó trên trang hồ sơ', () => {
    renderRoute();

    expect(section('plan').getByTestId('subscription-workspace')).toBeTruthy();
  });

  /* Thiếu quyền ⇒ section vắng khỏi trang lẫn mục lục — không thành một khối "không có quyền". */
  it('thiếu quyền xem hồ sơ người bán / gói: hai section đó không có mặt', () => {
    perms.denied = new Set([PERMISSION.SELLER_PROFILE_VIEW, PERMISSION.SUBSCRIPTION_VIEW]);
    renderRoute();

    expect(document.getElementById('account-section-tax')).toBeNull();
    expect(document.getElementById('account-section-plan')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Thông tin khai thuế' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Gói dịch vụ' })).toBeNull();
  });

  /* Link `?section=tax` tới người không có section đó: rơi về đầu trang, không cuộn vào hư không. */
  it('thiếu quyền mà mở `?section=tax`: mục lục sáng "Thông tin chủ xe", không cuộn', () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      perms.denied = new Set([PERMISSION.SELLER_PROFILE_VIEW]);
      search.value = 'section=tax';
      renderRoute();

      expect(
        screen.getByRole('link', { name: 'Thông tin chủ xe' }).getAttribute('aria-current'),
      ).toBe('true');
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  /* `/tax` và `/subscription` cũ chuyển tới `?section=tax` · `?section=plan` — phải rơi đúng khối. */
  it.each(['tax', 'plan'])('mở thẳng `?section=%s`: cuộn tới đúng khối ngay lần vẽ đầu', (key) => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.id);
    } as Element['scrollIntoView'];
    try {
      search.value = `section=${key}`;
      renderRoute();
      expect(scrolled).toEqual([`account-section-${key}`]);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe('Hồ sơ chủ xe — trạng thái tải', () => {
  it('lỗi tải gian hàng: nói rõ và thử lại đúng query hỏng', () => {
    shop.data = null;
    shop.isError = true;
    renderRoute();

    expect(screen.getByText('Không tải được hồ sơ chủ xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(shop.refetch).toHaveBeenCalled();
    expect(profile.refetch).not.toHaveBeenCalled();
  });
});
