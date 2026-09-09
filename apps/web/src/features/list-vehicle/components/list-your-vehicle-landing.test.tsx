import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import { ListYourVehicleLanding } from './ListYourVehicleLanding';

/**
 * Landing "Đăng ký xe" — cửa vào công khai của chủ xe.
 *
 * Bất biến quan trọng nhất: **không ai bị tạo gian hàng vì đi ngang qua đây.** Trang đọc được
 * khi chưa đăng nhập, và CTA rẽ theo trạng thái thật — mọi đích đều là đường dẫn NỘI BỘ dựng từ
 * hằng số, không lấy từ query, nên không có bề mặt open-redirect.
 */
const nav = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: nav.back, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/list-your-vehicle',
  useSearchParams: () => new URLSearchParams(),
}));

const currentUser = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => currentUser }));

function ctaHref(): string | null {
  const cta = screen.getByRole('link', { name: /Đăng ký xe tự lái/ });
  return cta.getAttribute('href');
}

beforeEach(() => {
  currentUser.data = undefined;
  currentUser.isLoading = false;
  nav.back.mockReset();
});

afterEach(cleanup);

describe('CTA rẽ theo trạng thái đăng nhập', () => {
  it('chưa đăng nhập: đi qua đăng nhập, mang theo owner intent và đích là WIZARD', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    const href = ctaHref()!;
    expect(href.startsWith('/manage/login?')).toBe(true);
    expect(href).toContain('intent=owner');
    // `next` là wizard đăng xe, KHÔNG phải form tạo gian hàng — người dùng chưa đồng ý mở shop.
    expect(decodeURIComponent(href)).toContain('/list-your-vehicle/register?from=marketplace');
  });

  it('đã đăng nhập nhưng chưa có gian hàng: qua onboarding rồi quay lại wizard', () => {
    currentUser.data = { id: 'u1', tenant: null };
    renderWithIntl(<ListYourVehicleLanding />);

    const href = ctaHref()!;
    expect(href.startsWith('/manage/onboarding?next=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('/list-your-vehicle/register?from=marketplace');
  });

  it('đã có gian hàng: vào thẳng wizard, không hỏi tạo gian hàng lần hai', () => {
    currentUser.data = { id: 'u1', tenant: { id: 't1' } };
    renderWithIntl(<ListYourVehicleLanding />);

    expect(ctaHref()).toBe('/list-your-vehicle/register?from=marketplace');
  });

  it('mọi đích đều là đường dẫn nội bộ — không có URL tuyệt đối nào', () => {
    for (const user of [undefined, { id: 'u1', tenant: null }, { id: 'u1', tenant: { id: 't1' } }]) {
      cleanup();
      currentUser.data = user;
      renderWithIntl(<ListYourVehicleLanding />);
      const href = ctaHref()!;
      expect(href.startsWith('/')).toBe(true);
      expect(href).not.toMatch(/^https?:|^\/\//);
    }
  });
});

describe('Nội dung landing', () => {
  it('nói rõ bốn bước và dẫn tới văn bản pháp lý CÓ THẬT', () => {
    renderWithIntl(<ListYourVehicleLanding />);

    expect(screen.getByText('Điền thông tin xe')).toBeTruthy();
    expect(screen.getByText('Đăng tải hình ảnh xe')).toBeTruthy();
    expect(screen.getByText('XePrime duyệt hồ sơ')).toBeTruthy();
    expect(screen.getByText('Bắt đầu cho thuê')).toBeTruthy();

    const policy = screen.getByRole('link', { name: /Quy định sử dụng chợ xe/ });
    expect(policy.getAttribute('href')).toBe('/legal/marketplace-rules');
  });

  it('không hứa con số thu nhập hay cam kết pháp lý tự nghĩ ra', () => {
    renderWithIntl(<ListYourVehicleLanding />);
    expect(screen.queryByText(/phạt nguội/i)).toBeNull();
    expect(screen.queryByText(/\d+\s*(triệu|tr)\/tháng/i)).toBeNull();
  });
});
