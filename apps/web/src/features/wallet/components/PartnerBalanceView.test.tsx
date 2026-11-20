import { App } from 'antd';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_REALM, BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';

import { PartnerBalanceView } from './PartnerBalanceView';

/**
 * "QUẢN LÝ VÍ" của site partner (ráp theo design 04/11/2026) — MỘT trang tiền cho cả hai tuyến.
 *
 * Bộ này khoá bốn lời hứa:
 *
 *  1. **Tài khoản nhận tiền nằm TRONG trang** ở cả hai tuyến — cột phải, ngay dưới thẻ số dư;
 *     `?section=payout` (đích của hai route cũ) cuộn tới đúng khối đó.
 *  2. **Hai tab trên URL** — mặc định bảng tổng hợp; `?tab=activity` là biến động số dư.
 *  3. **Thuế đã khấu trừ ở CẢ hai tuyến** — "Chi tiết" của ô ghi chú thuế mở thẻ thuế đầy đủ;
 *     trang này không nằm sau cờ tính năng nào (ADR 0027 điều 3).
 *  4. **Chỉ CHỦ** — ví và sổ ngân hàng là `@ShopOwnerOnly()`; thành viên gõ URL thấy lời giải thích,
 *     không có query ví nào bay đi.
 */

const user = vi.hoisted(() => ({ value: null as unknown, isPending: false }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isPending: user.isPending }),
}));

const search = vi.hoisted(() => ({ value: '' }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
  useRouter: () => router,
  usePathname: () => '/manage/balance',
}));

/* Các khối con có test riêng — ở đây chỉ cần biết trang đặt đúng khối vào đúng chỗ. */
vi.mock('./WalletStatementPanel', () => ({
  WalletStatementPanel: () => <div data-testid="statement-panel" />,
}));
vi.mock('./WalletActivityPanel', () => ({
  WalletActivityPanel: () => <div data-testid="activity-panel" />,
}));
vi.mock('./WalletMonthSummary', () => ({
  WalletMonthSummary: () => <div data-testid="month-summary" />,
}));
vi.mock('./WalletSummaryCard', () => ({
  WalletSummaryCard: ({ action }: { action?: ReactNode }) => (
    <div data-testid="wallet-summary">{action}</div>
  ),
}));
vi.mock('./WithdrawDialog', () => ({ WithdrawDialog: () => null }));
vi.mock('../hooks', () => ({
  useWithdrawGate: () => ({ canWithdraw: true, hint: null }),
}));

vi.mock('@/features/tax/components/ShopTaxWithheldCard', () => ({
  ShopTaxWithheldCard: () => <div data-testid="tax-withheld" />,
}));

const bankAccounts = vi.hoisted(() => ({
  data: [] as unknown[],
  isPending: false,
  isError: false,
}));
vi.mock('@/features/bank-accounts/hooks/use-bank-accounts', () => ({
  useBankAccounts: () => bankAccounts,
  useCreateBankAccount: () => ({ mutate: vi.fn(), isPending: false }),
  // Tài khoản khoá từ lần khai đầu — đổi qua yêu cầu (biên bản 19/11/2026); không có yêu cầu chờ.
  useCreateChangeRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useCurrentChangeRequest: () => ({ data: null, isPending: false }),
  useCancelChangeRequest: () => ({ mutate: vi.fn(), isPending: false }),
}));

function setUser(opts: { track?: 'commission' | 'package'; role?: string } = {}) {
  const { track = 'commission', role = TENANT_ROLE.SHOP_OWNER } = opts;
  user.value = {
    id: '01HUSER000000000000000000',
    realm: ACCOUNT_REALM.PARTNER,
    tenant: {
      id: '01HSHOP00000000000000000A',
      roleKey: role,
      billingMode: track === 'package' ? BILLING_MODE.PACKAGE : BILLING_MODE.COMMISSION,
      onboardingState:
        track === 'package'
          ? SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE
          : SHOP_ONBOARDING_STATE.COMMISSION,
    },
  };
}

function renderView() {
  return render(
    <App>
      <PartnerBalanceView />
    </App>,
  );
}

const payoutBlock = () => document.getElementById('balance-payout');

beforeEach(() => {
  user.isPending = false;
  search.value = '';
  bankAccounts.data = [];
  setUser();
});

afterEach(cleanup);

describe('Quản lý ví - tài khoản nhận tiền ở trong trang', () => {
  it.each(['commission', 'package'] as const)(
    'tuyến %s: khối "Tài khoản nhận tiền" nằm trong màn ví, có nút thêm tài khoản',
    (track) => {
      setUser({ track });
      renderView();

      const aside = screen.getByRole('complementary', { name: 'Số dư và tài khoản nhận tiền' });
      expect(within(aside).getByTestId('wallet-summary')).toBeTruthy();
      expect(aside.contains(payoutBlock())).toBe(true);
      const block = within(payoutBlock() as HTMLElement);
      expect(block.getByRole('heading', { name: 'Tài khoản nhận tiền' })).toBeTruthy();
      expect(block.getByRole('button', { name: /Thêm tài khoản/ })).toBeTruthy();
    },
  );

  /* Đích của `/bank-accounts` và `/shop?section=payout` cũ — hứa "mở ra ở đúng chỗ". */
  it('mở thẳng `?section=payout`: cuộn tới khối tài khoản nhận tiền ngay lần vẽ đầu', () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.id);
    } as Element['scrollIntoView'];
    try {
      search.value = 'section=payout';
      renderView();
      expect(scrolled).toEqual(['balance-payout']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('mở trang trần: không cuộn đi đâu cả', () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      renderView();
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

/*
 * "Vì sao tôi nhận ít hơn" là câu hỏi của trang tiền, ở cả hai tuyến. Tuyến gói còn có thẻ đó ở sổ
 * Tài chính, nhưng sổ ấy gác bằng cờ tính năng — trang này thì không bao giờ (ADR 0027 điều 3).
 */
describe('Quản lý ví - thuế đã khấu trừ', () => {
  it.each(['commission', 'package'] as const)(
    'tuyến %s: "Chi tiết" của ô ghi chú thuế mở thẻ thuế đầy đủ',
    (track) => {
      setUser({ track });
      renderView();
      expect(screen.queryByTestId('tax-withheld')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }));
      expect(screen.getByTestId('tax-withheld')).toBeTruthy();
    },
  );
});

describe('Quản lý ví - hai tab', () => {
  it('mặc định là bảng tổng hợp giao dịch', () => {
    renderView();
    expect(screen.getByTestId('statement-panel')).toBeTruthy();
    expect(screen.queryByTestId('activity-panel')).toBeNull();
    expect(screen.getByTestId('month-summary')).toBeTruthy();
  });

  it('`?tab=activity` mở biến động số dư - thẻ tổng hợp tháng vẫn ở cột phải', () => {
    search.value = 'tab=activity&period=2026-10';
    renderView();
    expect(screen.getByTestId('activity-panel')).toBeTruthy();
    expect(screen.queryByTestId('statement-panel')).toBeNull();
    expect(screen.getByTestId('month-summary')).toBeTruthy();
  });
});

describe('Quản lý ví - chỉ chủ', () => {
  it.each([TENANT_ROLE.SHOP_MANAGER, TENANT_ROLE.SHOP_STAFF])(
    '%s gõ URL: lời giải thích, không màn ví nào được dựng',
    (role) => {
      setUser({ track: 'package', role });
      renderView();

      expect(screen.getByText('Chỉ chủ sở hữu xem được số dư')).toBeTruthy();
      expect(screen.queryByTestId('wallet-summary')).toBeNull();
      expect(payoutBlock()).toBeNull();
    },
  );

  it('đang tải tài khoản: chưa dựng gì có gọi API', () => {
    user.isPending = true;
    user.value = undefined;
    renderView();

    expect(screen.queryByTestId('wallet-summary')).toBeNull();
    expect(screen.queryByText('Chỉ chủ sở hữu xem được số dư')).toBeNull();
  });
});
