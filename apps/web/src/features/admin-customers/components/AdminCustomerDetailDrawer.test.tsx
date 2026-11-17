import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, USER_STATUS } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { AdminCustomerDetail } from '../types';
import { AdminCustomerDetailDrawer } from './AdminCustomerDetailDrawer';

/**
 * Khoá / mở khoá tài khoản khách (đợt rà Admin 16/11/2026): nút chỉ có với quyền
 * `platform.customers.lock`, hộp xác nhận nói hệ quả và bắt lý do; tài khoản đang khoá hiện mốc +
 * lý do khoá.
 */
const detail = vi.hoisted(() => ({ data: undefined as unknown }));
const lockMutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const perms = vi.hoisted(() => ({ granted: [] as string[] }));

vi.mock('../hooks/use-admin-customers', () => ({
  useAdminCustomer: () => ({
    data: detail.data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRevealCustomerContact: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useCustomerLicences: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useCustomerLicenceImage: () => ({ data: undefined }),
  useSetCustomerLock: () => lockMutation,
}));
vi.mock('@/features/platform-wallets/components/PlatformWalletButton', () => ({
  PlatformWalletButton: () => null,
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.includes(p),
    hasAny: (...p: string[]) => p.some((x) => perms.granted.includes(x)),
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function customer(over: Partial<AdminCustomerDetail> = {}): AdminCustomerDetail {
  return {
    id: '01CUS',
    displayName: 'Khách A',
    phoneMasked: '090****567',
    emailMasked: null,
    status: USER_STATUS.ACTIVE,
    phoneVerified: true,
    requestCount: 2,
    bookedCount: 1,
    reviewCount: 0,
    licenceState: 'none',
    licenceExpiresOn: null,
    lastLoginAt: null,
    createdAt: '2026-10-01T03:00:00.000Z',
    emailVerifiedAt: null,
    conversationCount: 0,
    recentRequests: [],
    updatedAt: '2026-10-01T03:00:00.000Z',
    lockedAt: null,
    lockedReason: null,
    ...over,
  } as AdminCustomerDetail;
}

function renderDrawer() {
  renderWithIntl(
    <App>
      <AdminCustomerDetailDrawer customerId="01CUS" onClose={vi.fn()} />
    </App>,
  );
}

beforeEach(() => {
  detail.data = customer();
  perms.granted = [PERMISSION.PLATFORM_CUSTOMER_LOCK];
  lockMutation.mutate.mockReset();
});

afterEach(cleanup);

describe('AdminCustomerDetailDrawer - khoá tài khoản', () => {
  it('khoá: hộp xác nhận nói hệ quả, bắt lý do, gửi đúng lý do', async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Khoá tài khoản' }));
    const title = await screen.findByText('Khoá tài khoản khách');
    const dialog = title.closest<HTMLElement>('[role="dialog"]')!;
    expect(within(dialog).getByText(/đăng xuất khỏi mọi trình duyệt và app/)).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Gian lận hoàn tiền nhiều lần' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khoá tài khoản' }));
    await waitFor(() => expect(lockMutation.mutate).toHaveBeenCalledTimes(1));
    expect(lockMutation.mutate.mock.calls[0]![0]).toEqual({
      lock: true,
      reason: 'Gian lận hoàn tiền nhiều lần',
    });
  });

  it('đang khoá: hiện mốc + lý do, nút là "Mở khoá"', () => {
    detail.data = customer({
      status: USER_STATUS.LOCKED,
      lockedAt: '2026-11-16T03:00:00.000Z',
      lockedReason: 'Quấy rối chủ xe',
    });
    renderDrawer();
    expect(screen.getByText(/Tài khoản bị khoá lúc/)).toBeTruthy();
    expect(screen.getByText('Lý do: Quấy rối chủ xe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mở khoá' })).toBeTruthy();
  });

  it('không có quyền khoá ⇒ không có nút', () => {
    perms.granted = [];
    renderDrawer();
    expect(screen.queryByRole('button', { name: 'Khoá tài khoản' })).toBeNull();
  });
});
