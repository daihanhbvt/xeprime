import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANK_ACCOUNT_STATUS, WALLET_OWNER_TYPE } from '@xeprime/types';

import type { BankAccount } from '../types';
import { BankAccountList } from './BankAccountList';

/**
 * "Tài khoản nhận tiền" — MỘT tài khoản mỗi chủ (07/10/2026).
 *
 * Bộ này khoá lời hứa của đợt đổi: không còn sổ nhiều tài khoản, nên khối chỉ có một thẻ và đúng một
 * nút — **Thêm tài khoản** khi chưa có, **Đổi tài khoản** khi đã có — và không còn "Mặc định",
 * "Đặt làm mặc định", "Bỏ dùng". Nút không hiện khi chưa biết mình đang thêm hay đổi.
 */

const query = vi.hoisted(() => ({
  data: undefined as BankAccount[] | undefined,
  isPending: false,
  isError: false,
}));
vi.mock('../hooks/use-bank-accounts', () => ({
  useBankAccounts: () => query,
  useCreateBankAccount: () => ({ mutate: vi.fn(), isPending: false }),
}));

const ACCOUNT: BankAccount = {
  id: '01HBANK0000000000000000000',
  ownerType: WALLET_OWNER_TYPE.TENANT,
  bankCode: 'VCB',
  accountNumberMasked: '•••••••••3456',
  accountName: 'CONG TY TNHH XEPRIME SAI GON',
  label: null,
  isDefault: true,
  status: BANK_ACCOUNT_STATUS.ACTIVE,
  verifiedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

function renderList() {
  return render(
    <App>
      <BankAccountList scope="shop" />
    </App>,
  );
}

beforeEach(() => {
  query.data = [];
  query.isPending = false;
  query.isError = false;
});

afterEach(cleanup);

describe('Tài khoản nhận tiền — một tài khoản', () => {
  it('chưa có: nút "Thêm tài khoản" và lời mời khai, không có nút đổi', () => {
    renderList();

    expect(screen.getByRole('button', { name: /Thêm tài khoản/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đổi tài khoản/ })).toBeNull();
    expect(screen.getByText('Chưa có tài khoản nào. Thêm một tài khoản để nhận tiền.')).toBeTruthy();
  });

  it('đã có: một thẻ và nút "Đổi tài khoản" — không còn mặc định / bỏ dùng', () => {
    query.data = [ACCOUNT];
    renderList();

    expect(screen.getByText('Vietcombank')).toBeTruthy();
    expect(screen.getByText('STK: •••••••••3456')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đổi tài khoản/ })).toBeTruthy();

    expect(screen.queryByRole('button', { name: /Thêm tài khoản/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bỏ dùng/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Đặt làm mặc định/ })).toBeNull();
    expect(screen.queryByText('Mặc định')).toBeNull();
  });

  it('bấm "Đổi tài khoản": hộp thoại ĐỔI nói rõ tài khoản nào sẽ bị thay', async () => {
    query.data = [ACCOUNT];
    renderList();

    fireEvent.click(screen.getByRole('button', { name: /Đổi tài khoản/ }));

    expect(await screen.findByText('Đổi tài khoản nhận tiền')).toBeTruthy();
    expect(screen.getByText(/Tài khoản mới sẽ thay cho Vietcombank · •••••••••3456\./)).toBeTruthy();
    // Không còn công tắc "mặc định": tài khoản vừa khai LÀ tài khoản nhận tiền.
    expect(screen.queryByText('Đặt làm tài khoản nhận tiền mặc định')).toBeNull();
  });

  it.each([
    ['đang tải', { isPending: true, isError: false }],
    ['tải lỗi', { isPending: false, isError: true }],
  ] as const)('%s: không hiện nút thêm/đổi — chưa biết mình đang thêm hay đổi', (_, state) => {
    query.data = undefined;
    query.isPending = state.isPending;
    query.isError = state.isError;
    renderList();

    expect(screen.queryByRole('button', { name: /Thêm tài khoản/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Đổi tài khoản/ })).toBeNull();
    if (state.isError) {
      expect(screen.getByText('Không tải được tài khoản nhận tiền.')).toBeTruthy();
    }
  });
});
