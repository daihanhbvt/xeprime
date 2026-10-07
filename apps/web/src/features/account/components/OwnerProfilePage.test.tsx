import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  PERMISSION,
  SHOP_ONBOARDING_STATE,
  SHOP_VERIFICATION,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';

import type { MyShop, UpdateProfileInput } from '@/features/shop/types';

import { PartnerAccountRoute } from './PartnerAccountRoute';

/**
 * HỒ SƠ CHỦ XE — trang tài khoản của CHỦ xe tuyến hoa hồng (06/10/2026).
 *
 * Bộ này khoá những gì làm nên lần gộp "Hồ sơ chủ xe" + "Tài khoản & bảo mật":
 *
 *  1. **Một URL, hai bản theo tuyến**: chủ xe hoa hồng thấy "Hồ sơ chủ xe"; tuyến gói và THÀNH
 *     VIÊN thấy "Tài khoản & bảo mật" thường (`PartnerAccountRoute`).
 *  2. **Sáu section, theo thứ tự**, không chữ "gian hàng" nào ở tiêu đề.
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
vi.mock('@/features/account/hooks/use-account', () => ({
  useMyProfile: () => profile,
  useUpdateMyProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

const shop = vi.hoisted(() => ({
  data: null as unknown,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const updateShop = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
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
  updateShop.isPending = false;
  search.value = '';
  perms.denied = new Set();
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
});

describe('Hồ sơ chủ xe — bố cục', () => {
  it('sáu section theo thứ tự, không còn chữ "gian hàng" ở tiêu đề', () => {
    renderRoute();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Thông tin chủ xe',
      'Trang chủ xe',
      'Địa chỉ nhận xe',
      'Thông tin đăng nhập',
      'Mật khẩu',
      'Xoá tài khoản',
    ]);
    expect(headings.some((h) => /gian hàng/i.test(h ?? ''))).toBe(false);
    // Chủ xe cá nhân không khai MST/GPKD — hai ô đó chỉ có ở trang Cửa hàng của tuyến gói.
    expect(screen.queryByText('Mã số thuế')).toBeNull();
    expect(screen.queryByText('Số giấy phép KD')).toBeNull();
  });

  it('khối thông tin chủ xe nói rõ ảnh đại diện là ảnh trang chủ xe, không trỏ sang trang Cửa hàng', () => {
    renderRoute();

    const owner = section('profile');
    expect(owner.getByText(/cũng là tên, ảnh khách thấy trên trang chủ xe/)).toBeTruthy();
    expect(owner.queryByRole('link', { name: 'Mở Cài đặt gian hàng' })).toBeNull();
  });

  it('trang chủ xe: "khách thấy bạn là" = TÀI KHOẢN, không có ô tên/SĐT/email/ảnh thứ hai', () => {
    renderRoute();

    const storefront = section('storefront');
    expect(storefront.getByText('Khách thấy bạn là')).toBeTruthy();
    expect(storefront.getByText('Trần Thu Hương')).toBeTruthy();
    // SĐT đăng nhập ĐÃ XÁC THỰC, dạng nội địa.
    expect(storefront.getByText('0903000001')).toBeTruthy();
    expect(storefront.queryByLabelText(/Tên hiển thị/)).toBeNull();
    expect(storefront.queryByLabelText(/SĐT liên hệ/)).toBeNull();
    expect(storefront.queryByText(/Ảnh bìa|Logo/)).toBeNull();
    // Phần riêng duy nhất còn lại: lời giới thiệu.
    expect(storefront.getByLabelText(/Giới thiệu/)).toBeTruthy();
  });

  it('SĐT chưa xác thực: nói thẳng khách không có số để gọi, không hiện số tự khai của gian hàng', () => {
    profile.data = { ...PROFILE, phoneVerified: false };
    renderRoute();

    const storefront = section('storefront');
    expect(storefront.getByText(/Chưa xác thực — khách sẽ không thấy số nào/)).toBeTruthy();
    expect(storefront.queryByText('0903000001')).toBeNull();
    expect(storefront.queryByText('84903000001')).toBeNull();
  });

  it('logo cũ từ thời có gói KHÔNG thay ảnh đại diện — cả trang dùng ảnh tài khoản', () => {
    shop.data = makeShop({ logoUrl: 'https://cdn.xeprime.test/logo.png' });
    renderRoute();

    const imgs = Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(imgs).toContain('https://cdn.xeprime.test/avatar.jpg');
    expect(imgs).not.toContain('https://cdn.xeprime.test/logo.png');
  });

  it('thiếu quyền sửa: nói rõ chỉ được xem, không có thanh lưu', () => {
    perms.denied = new Set([PERMISSION.TENANT_UPDATE]);
    renderRoute();

    expect(screen.getByText(/chỉ có quyền xem trang chủ xe/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lưu trang chủ xe/ })).toBeNull();
  });

  it('trang đang hoạt động: có lối xem trang chủ xe công khai', () => {
    renderRoute();
    expect(screen.getByRole('link', { name: /Xem trang chủ xe/ })).toBeTruthy();
  });
});

describe('Hồ sơ chủ xe — lưu trang chủ xe', () => {
  it('chưa sửa gì: không có thanh lưu', () => {
    renderRoute();
    expect(screen.queryByRole('button', { name: /Lưu trang chủ xe/ })).toBeNull();
  });

  it('sửa lời giới thiệu: thanh lưu hiện ra và gửi đúng thân request hồ sơ', async () => {
    renderRoute();

    fireEvent.change(section('storefront').getByLabelText(/Giới thiệu/), {
      target: { value: 'Xe nhà, giao tận nơi trong quận.' },
    });
    const save = await screen.findByRole('button', { name: /Lưu trang chủ xe/ });
    fireEvent.click(save);

    await waitFor(() => expect(updateShop.mutate).toHaveBeenCalledTimes(1));
    const body = updateShop.mutate.mock.calls[0]![0] as UpdateProfileInput;
    expect(body.bio).toBe('Xe nhà, giao tận nơi trong quận.');
    // Mã tỉnh, không phải tên — tên do server tra.
    expect(body.provinceCode).toBe('79');
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
