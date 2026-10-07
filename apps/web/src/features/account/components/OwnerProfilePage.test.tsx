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

import type { MyShop } from '@/features/shop/types';

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
  it('năm section theo thứ tự — không còn "Trang chủ xe" riêng, không chữ "gian hàng"', () => {
    renderRoute();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Thông tin chủ xe',
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
