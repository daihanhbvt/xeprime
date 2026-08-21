import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopEntryCard } from './ShopEntryCard';

/**
 * Cửa đi từ khu tài khoản sang khu quản lý.
 *
 * Thẻ này đọc VAI THỰC TẾ (ADR 0014) — sai vai là hai lỗi khác nhau và đều tệ: mời một chủ
 * shop "đăng xe cho thuê" (thứ họ làm xong rồi), hoặc đưa một khách thuê tới `/manage` để ăn
 * 403. Và trong lúc chưa biết mình là ai thì **không đoán**.
 */

const user = vi.hoisted(() => ({
  value: null as null | {
    platformRole: string | null;
    tenant: { name: string } | null;
  },
  isLoading: false,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isLoading: user.isLoading }),
}));

beforeEach(() => {
  user.value = null;
  user.isLoading = false;
});

afterEach(cleanup);

describe('ShopEntryCard', () => {
  it('có gian hàng → mời vào cổng quản lý, hiện TÊN gian hàng', () => {
    user.value = { platformRole: null, tenant: { name: 'Cho thuê xe Bình Minh' } };
    render(<ShopEntryCard />);

    expect(screen.getByText('Cho thuê xe Bình Minh')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/manage');
  });

  it('chưa có gian hàng → mời đăng xe, dẫn tới onboarding', () => {
    user.value = { platformRole: null, tenant: null };
    render(<ShopEntryCard />);

    expect(screen.getByText('Đăng xe cho thuê')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/manage/onboarding');
  });

  it('nhân sự nền tảng → dẫn tới trang quản trị', () => {
    user.value = { platformRole: 'platform_admin', tenant: null };
    render(<ShopEntryCard />);

    expect(screen.getByText('Quản trị nền tảng')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/manage/admin');
  });

  it('chưa đăng nhập → không hiện gì', () => {
    user.value = null;
    const { container } = render(<ShopEntryCard />);

    expect(container.textContent).toBe('');
  });

  it('đang tải "tôi là ai" → không đoán, không hiện thẻ nào', () => {
    user.isLoading = true;
    user.value = null;
    const { container } = render(<ShopEntryCard />);

    expect(container.textContent).toBe('');
  });
});
