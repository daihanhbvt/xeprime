import { App } from 'antd';
import type { ReactNode } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_REALM, BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';

import { PartnerBalanceView } from './PartnerBalanceView';

/**
 * "SỐ DƯ & RÚT TIỀN" của site partner (07/10/2026) — MỘT trang tiền cho cả hai tuyến.
 *
 * Bộ này khoá ba lời hứa của đợt đồng bộ:
 *
 *  1. **Tài khoản nhận tiền nằm TRONG trang số dư** ở cả hai tuyến — ngay dưới nút Rút (slot
 *     `payout` của `WalletView`), không còn là trang/section riêng.
 *  2. **Thuế đã khấu trừ ở CẢ hai tuyến** — trang này không nằm sau cờ tính năng nào (ADR 0027
 *     điều 3), còn sổ Tài chính của tuyến gói thì có (`PLAN_FEATURE.FINANCE`).
 *  3. **Chỉ CHỦ** — ví và sổ ngân hàng là `@ShopOwnerOnly()`; thành viên gõ URL thấy lời giải thích,
 *     không có query ví nào bay đi.
 */

const user = vi.hoisted(() => ({ value: null as unknown, isPending: false }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isPending: user.isPending }),
}));

const search = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

/*
 * `WalletView` (thẻ số dư, sổ, lệnh rút) có test riêng ở từng khối — ở đây chỉ cần biết trang đặt
 * khối tài khoản nhận tiền VÀO đúng slot của nó.
 */
vi.mock('./WalletView', () => ({
  WalletView: ({ scope, payout }: { scope: string; payout?: ReactNode }) => (
    <div data-testid="wallet-view" data-scope={scope}>
      {payout}
    </div>
  ),
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

describe('Số dư & rút tiền — tài khoản nhận tiền ở trong trang', () => {
  it.each(['commission', 'package'] as const)(
    'tuyến %s: khối "Tài khoản nhận tiền" nằm trong màn ví, có nút thêm tài khoản',
    (track) => {
      setUser({ track });
      renderView();

      const wallet = screen.getByTestId('wallet-view');
      expect(wallet.getAttribute('data-scope')).toBe('shop');
      const block = within(payoutBlock() as HTMLElement);
      expect(wallet.contains(payoutBlock())).toBe(true);
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
describe('Số dư & rút tiền — thuế đã khấu trừ', () => {
  it.each(['commission', 'package'] as const)('tuyến %s: có thẻ thuế đã khấu trừ', (track) => {
    setUser({ track });
    renderView();
    expect(screen.getByTestId('tax-withheld')).toBeTruthy();
  });
});

describe('Số dư & rút tiền — chỉ chủ', () => {
  it.each([TENANT_ROLE.SHOP_MANAGER, TENANT_ROLE.SHOP_STAFF])(
    '%s gõ URL: lời giải thích, không màn ví nào được dựng',
    (role) => {
      setUser({ track: 'package', role });
      renderView();

      expect(screen.getByText('Chỉ chủ sở hữu xem được số dư')).toBeTruthy();
      expect(screen.queryByTestId('wallet-view')).toBeNull();
      expect(payoutBlock()).toBeNull();
    },
  );

  it('đang tải tài khoản: chưa dựng gì có gọi API', () => {
    user.isPending = true;
    user.value = undefined;
    renderView();

    expect(screen.queryByTestId('wallet-view')).toBeNull();
    expect(screen.queryByText('Chỉ chủ sở hữu xem được số dư')).toBeNull();
  });
});
