import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import { ListYourVehicleLanding } from './ListYourVehicleLanding';

/**
 * Landing "Đăng xe cho thuê" — cửa vào công khai của chủ xe, HAI tuyến doanh thu (ADR 0028).
 *
 * Hai bất biến quan trọng nhất:
 *  1. **Không ai bị tạo gian hàng vì đi ngang qua đây.** Nút tuyến cá nhân luôn trỏ wizard
 *     đăng xe, không bao giờ biến thành form tạo gian hàng.
 *  2. Chưa đăng nhập thì mở auth modal mang theo ĐÚNG đích vừa chọn — mọi đích đều là đường
 *     dẫn NỘI BỘ dựng từ hằng số, không lấy từ query, nên không có bề mặt open-redirect.
 */
const nav = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: nav.back, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/list-your-vehicle',
  useSearchParams: () => new URLSearchParams(),
}));

const currentUser = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => currentUser }));

const authModal = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => authModal,
}));

const PERSONAL_HREF = '/list-your-vehicle/register?from=marketplace';
const SHOP_HREF = '/manage/onboarding';

function personalCta(): HTMLElement {
  return screen.getByRole('link', { name: /Đăng xe đầu tiên/ });
}

function shopCta(): HTMLElement {
  return screen.getByRole('link', { name: /Tìm hiểu và tạo gian hàng/ });
}

beforeEach(() => {
  currentUser.data = undefined;
  currentUser.isLoading = false;
  nav.back.mockReset();
  authModal.open.mockReset();
});

afterEach(cleanup);

describe('Hai tuyến là hai lựa chọn độc lập', () => {
  it.each([
    ['chưa đăng nhập', undefined],
    ['đã đăng nhập, chưa có gian hàng', { id: 'u1', tenant: null }],
    ['đã có gian hàng', { id: 'u1', tenant: { id: 't1' } }],
  ])('%s: mỗi nút giữ nguyên đích của tuyến mình', (_label, user) => {
    currentUser.data = user;
    renderWithIntl(<ListYourVehicleLanding />);

    expect(personalCta().getAttribute('href')).toBe(PERSONAL_HREF);
    expect(shopCta().getAttribute('href')).toBe(SHOP_HREF);
  });

  it('mọi đích đều là đường dẫn nội bộ — không có URL tuyệt đối nào', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    for (const href of [personalCta().getAttribute('href'), shopCta().getAttribute('href')]) {
      expect(href?.startsWith('/')).toBe(true);
      expect(href).not.toMatch(/^https?:|^\/\//);
    }
  });
});

describe('Chưa đăng nhập: đăng nhập tại chỗ rồi quay lại đúng đích', () => {
  it('tuyến cá nhân mở auth modal với next là WIZARD, không phải tạo gian hàng', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    fireEvent.click(personalCta());

    expect(authModal.open).toHaveBeenCalledTimes(1);
    expect(authModal.open.mock.calls[0]![0]).toMatchObject({ next: PERSONAL_HREF });
  });

  it('tuyến gian hàng mở auth modal với next là onboarding', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    fireEvent.click(shopCta());

    expect(authModal.open).toHaveBeenCalledTimes(1);
    expect(authModal.open.mock.calls[0]![0]).toMatchObject({ next: SHOP_HREF });
  });

  it('đã đăng nhập thì không chặn — để link đi thẳng tới đích', () => {
    currentUser.data = { id: 'u1', tenant: null };
    renderWithIntl(<ListYourVehicleLanding />);

    fireEvent.click(personalCta());
    fireEvent.click(shopCta());

    expect(authModal.open).not.toHaveBeenCalled();
  });
});

describe('Nội dung landing', () => {
  it('nói rõ hai tuyến, mức phí thí điểm và khả năng nâng cấp sau', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    expect(screen.getByRole('heading', { name: 'Đăng xe cá nhân' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mở gian hàng cho thuê' })).toBeTruthy();
    expect(screen.getByText(/10% giá thuê/)).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Linh hoạt nâng cấp khi cần' })).toBeTruthy();
  });

  it('mỗi thẻ có hình minh hoạ RIÊNG — không dùng chung một file', () => {
    const { container } = renderWithIntl(<ListYourVehicleLanding />);

    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.some((src) => src?.includes('owner-personal-car'))).toBe(true);
    expect(sources.some((src) => src?.includes('owner-shop-showroom'))).toBe(true);
  });

  it('dẫn tới văn bản pháp lý CÓ THẬT và không hứa con số thu nhập', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    const policy = screen.getByRole('link', { name: /Quy định sử dụng chợ xe/ });
    expect(policy.getAttribute('href')).toBe('/legal/marketplace-rules');
    expect(screen.queryByText(/phạt nguội/i)).toBeNull();
    expect(screen.queryByText(/\d+\s*(triệu|tr)\/tháng/i)).toBeNull();
  });
});
