import { cleanup, fireEvent, screen } from '@testing-library/react';
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
  return screen.getByRole('link', { name: /Tìm hiểu và tạo gian hàng/ });
}

beforeEach(() => {
  nav.back.mockReset();
});

afterEach(cleanup);

/** Landing dùng chung, với hai đích bất kỳ — phần nội dung không phụ thuộc nơi dùng. */
function renderLanding(props: Partial<Parameters<typeof ListYourVehicleLanding>[0]> = {}) {
  return renderWithIntl(
    <ListYourVehicleLanding personalHref="/p" shopHref="/s" {...props} />,
  );
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

  it('có nút Quay lại (người ta tới từ chợ xe)', () => {
    renderWithIntl(<ListYourVehiclePage />);

    fireEvent.click(screen.getByRole('button', { name: /Quay lại/ }));
    expect(nav.back).toHaveBeenCalledTimes(1);
  });
});

describe('Hai nút là hai lựa chọn độc lập', () => {
  it('mỗi nút đi đúng đích được truyền vào, không đổi chéo', () => {
    renderLanding({ personalHref: '/vehicles/register?from=marketplace', shopHref: '/onboarding?track=package' });

    expect(personalCta().getAttribute('href')).toBe('/vehicles/register?from=marketplace');
    expect(shopCta().getAttribute('href')).toBe('/onboarding?track=package');
  });

  it('showBack={false} (site partner): không có nút Quay lại', () => {
    renderLanding({ showBack: false });

    expect(screen.queryByRole('button', { name: /Quay lại/ })).toBeNull();
  });
});

describe('Nội dung landing', () => {
  it('nói rõ hai tuyến, mức phí thí điểm và khả năng nâng cấp sau', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: 'Đăng xe cá nhân' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mở gian hàng cho thuê' })).toBeTruthy();
    expect(screen.getByText(/10% giá thuê/)).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Linh hoạt nâng cấp khi cần' })).toBeTruthy();
  });

  it('mỗi thẻ có hình minh hoạ RIÊNG — không dùng chung một file', () => {
    const { container } = renderLanding();

    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.some((src) => src?.includes('owner-personal-car'))).toBe(true);
    expect(sources.some((src) => src?.includes('owner-shop-showroom'))).toBe(true);
  });

  it('dẫn tới văn bản pháp lý CÓ THẬT và không hứa con số thu nhập', () => {
    renderLanding();

    const policy = screen.getByRole('link', { name: /Quy định sử dụng chợ xe/ });
    expect(policy.getAttribute('href')).toBe('/legal/marketplace-rules');
    expect(screen.queryByText(/phạt nguội/i)).toBeNull();
    expect(screen.queryByText(/\d+\s*(triệu|tr)\/tháng/i)).toBeNull();
  });
});
