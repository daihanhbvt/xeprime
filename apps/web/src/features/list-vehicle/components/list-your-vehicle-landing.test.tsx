import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import ListYourVehiclePage from '@/app/(public)/list-your-vehicle/page';

import { ListYourVehicleLanding } from './ListYourVehicleLanding';

/**
 * "Bắt đầu cho thuê xe theo cách phù hợp với bạn" — HAI tuyến doanh thu (ADR 0028), một nội dung cho
 * hai nơi: landing công khai của site khách, và trang chọn cách cho thuê của site partner ngay sau khi
 * tạo tài khoản đối tác (`PartnerRegisterView`, có test riêng).
 *
 * Bất biến: **không ai bị tạo gian hàng vì đi ngang qua đây** — mỗi nút chỉ là một đường dẫn tới
 * bước tiếp theo của ĐÚNG tuyến của nó; và trang KHÔNG mở modal đăng nhập khách (ADR 0053).
 */
const nav = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: nav.back, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/list-your-vehicle',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Hai cửa mang theo TUYẾN (ADR 0040) — chế độ `path` của vitest nên là đường dẫn tương đối.
 *
 * Chuỗi viết TAY chứ không gọi `partnerRegisterHref()`: đây chính là hợp đồng mà test này khoá.
 * Dùng lại hàm dựng đường dẫn nghĩa là một lần đổi mặc định sẽ làm cả hai nút trỏ về một tuyến mà
 * test vẫn xanh — đúng bug ADR 0040 sửa, chỉ là không ai thấy nữa.
 */
const PERSONAL_HREF = '/manage/register?track=commission&from=market';
const SHOP_HREF = '/manage/register?track=package&from=market';

function personalCta(): HTMLElement {
  return screen.getByRole('link', { name: /Đăng xe đầu tiên/ });
}

function shopCta(): HTMLElement {
  return screen.getByRole('link', { name: /Tìm hiểu các gói Gian hàng/ });
}

/** Phiên hiện tại — quyết định mắt đầu của đường dẫn (tài khoản hay trang chủ). */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: session.user ?? undefined }),
}));

/** Khoảng % hoa hồng của lời mời hợp tác — API công khai, đọc qua React Query (`usePartnerOffer`). */
vi.mock('@/features/account/hooks/use-partner-offer', () => ({
  usePartnerOffer: () => ({
    data: { minOwnerCommissionPercent: 0, maxOwnerCommissionPercent: 10 },
  }),
}));

beforeEach(() => {
  nav.back.mockReset();
  session.user = null;
});

afterEach(cleanup);

/** Landing dùng chung, với hai đích bất kỳ — phần nội dung không phụ thuộc nơi dùng. */
function renderLanding(props: Partial<Parameters<typeof ListYourVehicleLanding>[0]> = {}) {
  return renderWithIntl(<ListYourVehicleLanding personalHref="/p" shopHref="/s" {...props} />);
}

describe('Site khách — /list-your-vehicle', () => {
  it('mỗi nút dẫn sang trang đăng ký của site partner, mang đúng tuyến của mình', () => {
    renderWithIntl(<ListYourVehiclePage />);

    expect(personalCta().getAttribute('href')).toBe(PERSONAL_HREF);
    expect(shopCta().getAttribute('href')).toBe(SHOP_HREF);
    // Form đăng ký là site KHÁC (tài khoản khác) — mở tab mới, giữ tab chợ xe.
    expect(personalCta().getAttribute('target')).toBe('_blank');
    expect(shopCta().getAttribute('rel')).toContain('noopener');
  });

  it('chế độ path: mọi đích đều là đường dẫn nội bộ của khu partner', () => {
    renderWithIntl(<ListYourVehiclePage />);

    for (const href of [personalCta().getAttribute('href'), shopCta().getAttribute('href')]) {
      expect(href?.startsWith('/')).toBe(true);
      expect(href).not.toMatch(/^https?:|^\/\//);
    }
  });

  it('đầu trang "Trở thành chủ xe": chưa đăng nhập thì đường dẫn và nút quay lại về Trang chủ', () => {
    renderWithIntl(<ListYourVehiclePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Trở thành chủ xe' })).toBeTruthy();
    const trail = screen.getByRole('navigation', { name: 'Đường dẫn trang' });
    expect(within(trail).getByRole('link', { name: 'Trang chủ' }).getAttribute('href')).toBe('/');
    expect(within(trail).getByRole('link', { name: 'Quay lại' }).getAttribute('href')).toBe('/');
    // Mỗi trang đúng một h1 — tiêu đề lớn của phần giới thiệu lùi xuống h2.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('khách đã đăng nhập (tới từ menu tài khoản): mắt đầu là Tài khoản của tôi', () => {
    session.user = { id: 'u1' };
    renderWithIntl(<ListYourVehiclePage />);

    const trail = screen.getByRole('navigation', { name: 'Đường dẫn trang' });
    expect(
      within(trail).getByRole('link', { name: 'Tài khoản của tôi' }).getAttribute('href'),
    ).toBe('/account');
    expect(within(trail).getByRole('link', { name: 'Quay lại' }).getAttribute('href')).toBe(
      '/account',
    );
  });
});

describe('Hai nút là hai lựa chọn độc lập', () => {
  it('mỗi nút đi đúng đích được truyền vào, không đổi chéo', () => {
    renderLanding({
      personalHref: '/vehicles/register?from=marketplace',
      shopHref: '/onboarding?track=package',
    });

    expect(personalCta().getAttribute('href')).toBe('/vehicles/register?from=marketplace');
    expect(shopCta().getAttribute('href')).toBe('/onboarding?track=package');
  });

  it('showBack={false} (site partner): không có đầu trang, tiêu đề giới thiệu là h1', () => {
    renderLanding({ showBack: false });

    expect(screen.queryByRole('navigation', { name: 'Đường dẫn trang' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chọn mô hình hợp tác cùng XePrime' }),
    ).toBeTruthy();
  });
});

describe('Nội dung landing', () => {
  it('nói rõ hai tuyến và cách tính phí của từng tuyến', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: 'Đăng xe cá nhân' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gian hàng Chuyên nghiệp' })).toBeTruthy();
    // Hoa hồng là bậc thang theo ngày trong fee_policies (ADR 0064) — không in một % cứng.
    expect(screen.getByText(/giảm dần theo số ngày thuê/)).toBeTruthy();
    expect(screen.queryByText(/\d+% giá thuê/)).toBeNull();
    expect(screen.getByText('Gói đề xuất')).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe')).toBeTruthy();
  });

  it('mỗi thẻ có hình minh hoạ RIÊNG — không dùng chung một file', () => {
    const { container } = renderLanding();

    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.some((src) => src?.includes('owner-personal'))).toBe(true);
    expect(sources.some((src) => src?.includes('owner-shop'))).toBe(true);
  });

  it('không hứa con số thu nhập', () => {
    renderLanding();

    expect(screen.queryByText(/phạt nguội/i)).toBeNull();
    expect(screen.queryByText(/\d+\s*(triệu|tr)\/tháng/i)).toBeNull();
  });
});
