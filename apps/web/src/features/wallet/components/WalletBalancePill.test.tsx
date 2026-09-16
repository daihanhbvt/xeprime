import { cleanup, fireEvent, screen } from '@testing-library/react';
import { TENANT_ROLE } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';
import type { WalletSummary } from '../types';
import { WalletBalancePill } from './WalletBalancePill';

/**
 * Lối tắt số dư ở góc hồ sơ — bốn điều được khoá:
 *
 *  1. Trỏ đúng SỔ của người đang xem: chủ xe có ví thuộc tenant, khách thuê thuần có ví `user`.
 *     Trỏ nhầm là dẫn người đi tìm tiền tới một màn hiện 0.
 *  2. Con mắt bấm được THẬT — vẽ ra mà không toggle là hứa suông.
 *  3. Chưa có dữ liệu ⇒ không render gì, thay vì một ô "—" ở góc hồ sơ trông như tiền có vấn đề.
 *  4. `localStorage` hỏng (cửa sổ ẩn danh) không được làm vỡ trang.
 */
const state = vi.hoisted(() => ({
  user: null as { tenant: { roleKey: string } | null } | null,
  summary: undefined as WalletSummary | undefined,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: state.user }),
}));

vi.mock('../hooks', () => ({
  useWalletSummary: () => ({ data: state.summary }),
}));

const summary = (available: string): WalletSummary => ({
  available,
  pending: '0',
  total: available,
  status: 'active',
  minWithdrawAmount: '10000',
  maxBusinessDays: 2,
});

beforeEach(() => {
  state.user = { tenant: null };
  state.summary = summary('1850000');
  try {
    window.localStorage.clear();
  } catch {
    /* Môi trường test luôn có localStorage; bọc cho khớp với chính component. */
  }
});

afterEach(cleanup);

describe('WalletBalancePill', () => {
  it('khách thuê thuần: hiện số dư khả dụng và trỏ về sổ ví cá nhân', () => {
    renderWithIntl(<WalletBalancePill />);

    expect(screen.getByText('1.850.000 ₫')).toBeTruthy();
    expect(screen.getByText('Số dư').closest('a')?.getAttribute('href')).toBe(
      ROUTES.ACCOUNT.BALANCE,
    );
  });

  /** Ví chủ xe thuộc TENANT (ADR 0038 điều 2) — `/account/balance` trả 0 cho họ. */
  it('chủ xe: trỏ sang sổ của GIAN HÀNG, không phải sổ cá nhân', () => {
    state.user = { tenant: { roleKey: TENANT_ROLE.SHOP_OWNER } };
    renderWithIntl(<WalletBalancePill />);

    expect(screen.getByText('Số dư').closest('a')?.getAttribute('href')).toBe(
      ROUTES.ACCOUNT.EARNINGS,
    );
  });

  it('con mắt che số dư và nhớ lựa chọn cho lần mở sau', () => {
    renderWithIntl(<WalletBalancePill />);

    fireEvent.click(screen.getByRole('button', { name: 'Ẩn số dư' }));

    expect(screen.queryByText('1.850.000 ₫')).toBeNull();
    // Mở lại trang: lựa chọn còn nguyên, không phải gõ lại mỗi lần.
    cleanup();
    renderWithIntl(<WalletBalancePill />);
    expect(screen.queryByText('1.850.000 ₫')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hiện số dư' })).toBeTruthy();
  });

  it('chưa có số dư hoặc chưa biết người dùng ⇒ không render gì', () => {
    state.summary = undefined;
    const { container } = renderWithIntl(<WalletBalancePill />);
    expect(container.textContent).toBe('');

    cleanup();
    state.summary = summary('0');
    state.user = null;
    const { container: second } = renderWithIntl(<WalletBalancePill />);
    expect(second.textContent).toBe('');
  });

  /** Cửa sổ ẩn danh ném ngay ở bước truy cập `localStorage`; pill vẫn phải hiện. */
  it('localStorage bị chặn: vẫn hiện số dư, chỉ mất khả năng nhớ lựa chọn', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderWithIntl(<WalletBalancePill />);
    expect(screen.getByText('1.850.000 ₫')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn số dư' }));

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
