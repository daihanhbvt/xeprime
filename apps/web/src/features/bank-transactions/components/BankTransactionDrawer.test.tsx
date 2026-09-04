import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANK_MATCH_STATUS } from '@xeprime/types';

import type { BankTransactionDetail } from '../types';
import { BankTransactionDrawer } from './BankTransactionDrawer';

/**
 * Màn khớp tay một khoản tiền vào (ADR 0022 điều 4).
 *
 * Thứ được khoá ở đây KHÔNG phải bố cục mà là **kỷ luật không tự động**:
 *
 *  1. Số tiền trùng khớp tuyệt đối chỉ được GẮN NHÃN và đưa lên đầu — không chọn sẵn, không tự
 *     gửi. Khớp theo số tiền sẽ gán tiền của người này vào hoá đơn của người khác.
 *  2. Không có ghi chú thì không khớp được: mỗi dòng `manual` phải truy về một người và một lý do.
 *  3. Giao dịch đã xử lý thì không còn đường khớp nào — chỉ còn phần đọc.
 */
const detail = vi.hoisted(() => ({
  data: undefined as BankTransactionDetail | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

const match = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const ignore = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-bank-transactions', () => ({
  useBankTransaction: () => detail,
  useMatchBankTransaction: () => match,
  useIgnoreBankTransaction: () => ignore,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function makeDetail(over: Partial<BankTransactionDetail> = {}): BankTransactionDetail {
  return {
    id: 'tx-1',
    provider: 'sepay',
    providerTxId: 'sepay-123',
    amountIn: '300000',
    content: 'CT tu 0123 den 9999 khong ghi ma',
    referenceCode: null,
    bankTime: '2026-09-04T02:00:00.000Z',
    matchStatus: BANK_MATCH_STATUS.UNMATCHED,
    matchedType: null,
    matchedRefId: null,
    matchNote: null,
    matchedAt: null,
    matchedByName: null,
    matchedInvoiceCode: null,
    createdAt: '2026-09-04T02:01:00.000Z',
    rawJson: { id: 'sepay-123', transferAmount: 300000 },
    suggestions: [
      {
        invoiceId: 'inv-exact',
        code: 'XPG2K9ADFG',
        tenantName: 'Shop A',
        status: 'issued',
        totalAmount: '300000',
        paidAmount: '0',
        remainingAmount: '300000',
        amountMatches: true,
        createdAt: '2026-09-03T00:00:00.000Z',
      },
      {
        invoiceId: 'inv-other',
        code: 'XPG7NPQRST',
        tenantName: 'Shop B',
        status: 'issued',
        totalAmount: '900000',
        paidAmount: '0',
        remainingAmount: '900000',
        amountMatches: false,
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ],
    ...over,
  } as BankTransactionDetail;
}

function renderDrawer() {
  return render(
    <App>
      <BankTransactionDrawer id="tx-1" onClose={vi.fn()} />
    </App>,
  );
}

beforeEach(() => {
  detail.data = makeDetail();
  detail.isError = false;
  match.mutate.mockReset();
  ignore.mutate.mockReset();
});

afterEach(cleanup);

describe('Khớp tay giao dịch ngân hàng', () => {
  it('nói rõ hệ thống KHÔNG tự khớp theo số tiền', () => {
    renderDrawer();
    expect(screen.getByText(/KHÔNG tự khớp theo số tiền/)).toBeTruthy();
  });

  it('hoá đơn khớp đúng số tiền được gắn nhãn — nhưng KHÔNG chọn sẵn, không tự gửi', () => {
    renderDrawer();

    expect(screen.getByText('Khớp đúng số tiền')).toBeTruthy();
    // Chưa chọn gì thì chưa có form ghi chú, và tuyệt đối chưa gọi mutation nào.
    expect(screen.queryByLabelText('Lý do / ghi chú')).toBeNull();
    expect(match.mutate).not.toHaveBeenCalled();
  });

  it('chọn hoá đơn rồi bỏ trống ghi chú: KHÔNG gọi mutation, hiện lỗi', async () => {
    renderDrawer();

    fireEvent.click(screen.getAllByRole('button', { name: 'Khớp vào hoá đơn này' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận khớp' }));

    await waitFor(() => expect(screen.getByText('Nhập lý do khớp tay')).toBeTruthy());
    expect(match.mutate).not.toHaveBeenCalled();
  });

  it('có ghi chú: gửi đúng id hoá đơn ĐÃ CHỌN, không phải cái đầu danh sách', async () => {
    renderDrawer();

    // Cố ý chọn hoá đơn THỨ HAI (không khớp số tiền) — payload phải theo lựa chọn của người.
    fireEvent.click(screen.getAllByRole('button', { name: 'Khớp vào hoá đơn này' })[1]!);
    fireEvent.change(screen.getByLabelText('Lý do / ghi chú'), {
      target: { value: 'Đã gọi xác nhận với gian hàng' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận khớp' }));

    await waitFor(() => expect(match.mutate).toHaveBeenCalledTimes(1));
    expect(match.mutate.mock.calls[0]![0]).toEqual({
      id: 'tx-1',
      invoiceId: 'inv-other',
      note: 'Đã gọi xác nhận với gian hàng',
    });
  });

  it('giao dịch đã xử lý: không còn đường khớp, chỉ còn phần đọc', () => {
    detail.data = makeDetail({
      matchStatus: BANK_MATCH_STATUS.MANUAL,
      matchedByName: 'Nhân viên tài chính',
      matchNote: 'khách quên ghi mã',
      matchedInvoiceCode: 'XPG2K9ADFG',
    });
    renderDrawer();

    expect(screen.getByText('Giao dịch này đã được xử lý.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Khớp vào hoá đơn này' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bỏ qua giao dịch' })).toBeNull();
    // Vẫn phải thấy ai xử lý và vì sao — đó là điểm của việc lưu dòng lại.
    expect(screen.getByText(/khách quên ghi mã/)).toBeTruthy();
  });

  it('luôn hiện payload gốc làm bằng chứng', () => {
    renderDrawer();
    expect(screen.getByText(/Bằng chứng khi có tranh cãi/)).toBeTruthy();
    // Mã giao dịch xuất hiện ở CẢ bảng thuộc tính lẫn payload gốc — đó là đúng, nên getAllBy*.
    expect(screen.getAllByText(/sepay-123/).length).toBeGreaterThan(1);
  });
});
