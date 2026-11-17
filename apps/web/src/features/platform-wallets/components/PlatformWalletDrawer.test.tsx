import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WALLET_ENTRY_KIND, WALLET_OWNER_TYPE, WITHDRAWAL_STATUS } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { PlatformWalletEntryPage, PlatformWalletSummary } from '../types';
import { PlatformWalletDrawer } from './PlatformWalletDrawer';

/**
 * Ví điểm chỉ đọc của admin (đợt rà Admin 16/11/2026). Khoá: ba con số + cờ khớp sổ do SERVER tính
 * được nói thành chữ; nguồn của bút toán (đơn, giữ chỗ, lệnh rút) hiện được; ngân hàng chỉ hiện khi
 * server trả (người có quyền tiền).
 */
const summary = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
}));
const entries = vi.hoisted(() => ({
  data: undefined as unknown,
  isFetching: false,
  isError: false,
}));

vi.mock('../hooks', () => ({
  usePlatformWallet: () => ({ ...summary, refetch: vi.fn() }),
  usePlatformWalletEntries: () => ({ ...entries, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const OWNER = { ownerType: WALLET_OWNER_TYPE.USER, ownerId: '01USER', ownerName: 'Khách A' };

function wallet(over: Partial<PlatformWalletSummary> = {}): PlatformWalletSummary {
  return {
    ownerType: WALLET_OWNER_TYPE.USER,
    ownerId: '01USER',
    ownerName: 'Khách A',
    exists: true,
    status: 'active',
    available: '300000',
    pending: '200000',
    total: '500000',
    ledgerTotal: '500000',
    reconciled: true,
    entryCount: 2,
    ...over,
  } as PlatformWalletSummary;
}

function page(): PlatformWalletEntryPage {
  return {
    items: [
      {
        id: 'E1',
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        amount: '700000',
        balanceAfter: '700000',
        sourceType: 'booking_hold',
        sourceRefId: 'H1',
        bookingId: 'B1',
        bookingCode: 'DH000123',
        holdCode: 'XPH000123',
        withdrawal: null,
        isReversal: false,
        note: null,
        createdAt: '2026-11-01T03:00:00.000Z',
      },
      {
        id: 'E2',
        kind: WALLET_ENTRY_KIND.WITHDRAWAL,
        amount: '-200000',
        balanceAfter: '500000',
        sourceType: 'withdrawal_request',
        sourceRefId: 'W1',
        bookingId: null,
        bookingCode: null,
        holdCode: null,
        withdrawal: {
          id: 'W1',
          code: 'XPW000999',
          status: WITHDRAWAL_STATUS.PAID,
          bankCode: 'VCB',
          bankAccountMasked: '••••••4567',
        },
        isReversal: false,
        note: null,
        createdAt: '2026-11-02T03:00:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
    hasNext: false,
  } as PlatformWalletEntryPage;
}

function renderDrawer() {
  renderWithIntl(
    <App>
      <PlatformWalletDrawer owner={OWNER} onClose={vi.fn()} />
    </App>,
  );
}

beforeEach(() => {
  summary.data = wallet();
  entries.data = page();
});

afterEach(cleanup);

describe('PlatformWalletDrawer', () => {
  it('ba con số + sổ khớp, nguồn bút toán và ngân hàng nhận', () => {
    renderDrawer();
    expect(screen.getByText('Ví điểm - Khách A')).toBeTruthy();
    expect(screen.getByText('Khả dụng')).toBeTruthy();
    expect(screen.getByText(/Sổ khớp: 2 bút toán cộng lại 500\.000/)).toBeTruthy();
    expect(screen.getByText(/Đơn DH000123.*Giữ chỗ XPH000123/)).toBeTruthy();
    expect(screen.getByText(/Lệnh rút XPW000999/)).toBeTruthy();
    expect(screen.getByText(/VCB ••••••4567/)).toBeTruthy();
  });

  it('sổ lệch ⇒ cảnh báo đỏ nói cả hai con số', () => {
    summary.data = wallet({ reconciled: false, ledgerTotal: '450000' });
    renderDrawer();
    expect(screen.getByText(/Sổ lệch: tổng bút toán 450\.000.*500\.000/)).toBeTruthy();
  });

  it('chủ ví chưa có ví ⇒ nói thẳng, không bày bảng rỗng', () => {
    summary.data = wallet({ exists: false, entryCount: 0, ledgerTotal: '0', total: '0' });
    renderDrawer();
    expect(screen.getByText(/chưa có Ví điểm/)).toBeTruthy();
    expect(screen.queryByText('Bút toán Ví điểm')).toBeNull();
  });
});
