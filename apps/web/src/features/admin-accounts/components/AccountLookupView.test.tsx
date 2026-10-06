import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountLookupFilters, AccountLookupItem } from '../types';
import { AccountLookupView } from './AccountLookupView';

/**
 * Tra cứu xuyên realm (ADR 0053 điều 9 — B4): một SĐT trả về MỌI tài khoản trùng, mỗi dòng ghi rõ
 * realm. Test khoá ba điều: ô trống không gọi API, mỗi dòng mang nhãn realm, và định danh đi vào URL
 * (một tham số — đổi chế độ tra là bỏ tham số kia).
 */
const url = vi.hoisted(() => ({
  filters: {} as AccountLookupFilters,
  setFilters: vi.fn(),
}));

const query = vi.hoisted(() => ({
  data: undefined as AccountLookupItem[] | undefined,
  isFetching: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useAccountLookupFilters: () => url,
  useAccountLookup: () => query,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function account(over: Partial<AccountLookupItem>): AccountLookupItem {
  return {
    id: '01ACCOUNT000000000000000000',
    realm: 'customer',
    displayName: 'Nguyễn An',
    phoneMasked: '090****001',
    emailMasked: 'kh****@xeprime.test',
    status: 'active',
    tenantName: null,
    tenantRoleKey: null,
    platformRoleKey: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as AccountLookupItem;
}

function renderView() {
  return render(
    <App>
      <AccountLookupView />
    </App>,
  );
}

beforeEach(() => {
  url.filters = {};
  url.setFilters.mockReset();
  query.data = undefined;
  query.isFetching = false;
  query.isError = false;
  query.error = null;
  query.refetch.mockReset();
});

afterEach(cleanup);

describe('AccountLookupView', () => {
  it('chưa có định danh: hiện hướng dẫn, không phải "không có ai"', () => {
    renderView();
    expect(
      screen.getByText('Nhập số điện thoại hoặc email để xem mọi tài khoản dùng định danh đó.'),
    ).toBeTruthy();
  });

  it('bấm tra cứu với ô trống: báo lỗi, KHÔNG ghi URL', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Tra cứu/ }));
    expect(screen.getByRole('alert').textContent).toBe('Nhập số điện thoại hoặc email cần tra');
    expect(url.setFilters).not.toHaveBeenCalled();
  });

  it('tra theo SĐT ghi `phone` và bỏ `email` khỏi URL', () => {
    renderView();
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: ' 0901000001 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tra cứu/ }));
    expect(url.setFilters).toHaveBeenCalledWith({ phone: '0901000001', email: undefined });
  });

  it('một SĐT ra ba tài khoản: mỗi dòng ghi rõ realm và vai trò của realm đó', () => {
    url.filters = { phone: '0902000001' };
    query.data = [
      account({ id: 'C'.repeat(26), realm: 'customer', displayName: 'Khách Sài Gòn' }),
      account({
        id: 'P'.repeat(26),
        realm: 'partner',
        displayName: 'Chủ xe Sài Gòn',
        tenantName: 'Xe Sài Gòn',
        tenantRoleKey: 'shop_owner',
      }),
      account({
        id: 'A'.repeat(26),
        realm: 'platform',
        displayName: 'Quản trị',
        platformRoleKey: 'platform_admin',
      }),
    ];
    renderView();

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Khách thuê')).toBeTruthy();
    expect(within(rows[1]!).getByText('Đối tác')).toBeTruthy();
    expect(within(rows[1]!).getByText(/Xe Sài Gòn/)).toBeTruthy();
    expect(within(rows[2]!).getByText('Nhân sự nền tảng')).toBeTruthy();
  });

  it('có định danh mà không khớp ai: nói "không có tài khoản nào khớp"', () => {
    url.filters = { email: 'khong-ai@xeprime.test' };
    query.data = [];
    renderView();
    expect(screen.getByText('Không có tài khoản nào khớp.')).toBeTruthy();
  });
});
