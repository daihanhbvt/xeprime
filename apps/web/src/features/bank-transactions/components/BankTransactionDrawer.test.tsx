import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
 *  2. Không có lý do thì không khớp, không bỏ qua được: mỗi dòng `manual`/`ignored` phải truy về
 *     một người và một lý do.
 *  3. "Đã trả lại người gửi" chỉ ghi được khi có MÃ giao dịch — không có mã là một lời khai.
 *  4. Giao dịch đã xử lý thì không còn đường xử lý nào — chỉ còn phần đọc.
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
    refundReference: null,
    refundedAt: null,
    createdAt: '2026-09-04T02:01:00.000Z',
    rawJson: { id: 'sepay-123', transferAmount: 300000, gateway: 'Vietcombank' },
    bankGateway: 'Vietcombank',
    bankAccountNumber: '1903567890',
    bankReferenceNumber: 'FT26247000001',
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

const nav = vi.hoisted(() => ({ onNavigate: vi.fn() }));

function renderDrawer(props: { previousId?: string | null; nextId?: string | null } = {}) {
  return render(
    <App>
      <BankTransactionDrawer
        id="tx-1"
        previousId={props.previousId ?? null}
        nextId={props.nextId ?? null}
        onNavigate={nav.onNavigate}
        onClose={vi.fn()}
      />
    </App>,
  );
}

/** Hộp thoại quyết định (không phải panel — panel cũng mang role dialog). */
async function decisionDialog(title: string): Promise<HTMLElement> {
  const titles = await screen.findAllByText(title);
  return titles.map((el) => el.closest<HTMLElement>('.ant-modal')).find(Boolean)!;
}

beforeEach(() => {
  detail.data = makeDetail();
  detail.isError = false;
  match.mutate.mockReset();
  ignore.mutate.mockReset();
  nav.onNavigate.mockReset();
});

afterEach(cleanup);

describe('Khớp tay giao dịch ngân hàng', () => {
  it('hoá đơn khớp đúng số tiền được gắn nhãn — nhưng KHÔNG chọn sẵn, nút khớp còn khoá', () => {
    renderDrawer();

    expect(screen.getByText('Khớp đúng số tiền')).toBeTruthy();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((radio) => !radio.checked)).toBe(true);
    const submit = screen.getByRole('button', { name: 'Xác nhận khớp' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(match.mutate).not.toHaveBeenCalled();
  });

  it('chọn hoá đơn rồi bỏ trống lý do trong hộp thoại: KHÔNG gọi mutation, hiện lỗi', async () => {
    renderDrawer();

    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Khớp vào XPG2K9ADFG' }));
    const dialog = await decisionDialog('Khớp tay giao dịch');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận khớp' }));

    await waitFor(() => expect(within(dialog).getByText('Nhập lý do xử lý')).toBeTruthy());
    expect(match.mutate).not.toHaveBeenCalled();
  });

  it('có lý do: gửi đúng id hoá đơn ĐÃ CHỌN, không phải cái đầu danh sách', async () => {
    renderDrawer();

    // Cố ý chọn hoá đơn THỨ HAI (không khớp số tiền) — payload phải theo lựa chọn của người.
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Khớp vào XPG7NPQRST' }));
    const dialog = await decisionDialog('Khớp tay giao dịch');
    fireEvent.change(within(dialog).getByLabelText('Lý do xử lý'), {
      target: { value: 'Đã gọi xác nhận với gian hàng' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận khớp' }));

    await waitFor(() => expect(match.mutate).toHaveBeenCalledTimes(1));
    expect(match.mutate.mock.calls[0]![0]).toEqual({
      id: 'tx-1',
      invoiceId: 'inv-other',
      note: 'Đã gọi xác nhận với gian hàng',
    });
  });

  it('không có hoá đơn nào đang chờ: KHÔNG có nút khớp, chỉ còn đường bỏ qua', () => {
    detail.data = makeDetail({ suggestions: [] });
    renderDrawer();

    expect(screen.queryByRole('button', { name: 'Xác nhận khớp' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bỏ qua giao dịch' })).toBeTruthy();
  });
});

describe('Bỏ qua giao dịch', () => {
  it('bỏ trống lý do: không gọi mutation', async () => {
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua giao dịch' }));
    const dialog = await decisionDialog('Bỏ qua giao dịch này?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ qua' }));

    await waitFor(() => expect(within(dialog).getByText('Nhập lý do xử lý')).toBeTruthy());
    expect(ignore.mutate).not.toHaveBeenCalled();
  });

  it('đánh dấu đã trả lại mà thiếu mã giao dịch: chặn lại', async () => {
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua giao dịch' }));
    const dialog = await decisionDialog('Bỏ qua giao dịch này?');
    fireEvent.change(within(dialog).getByLabelText('Lý do xử lý'), {
      target: { value: 'Khách chuyển nhầm' },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Đã hoàn lại tiền cho người gửi' }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ qua' }));

    await waitFor(() =>
      expect(within(dialog).getByText('Nhập mã giao dịch hoàn (tối thiểu 3 ký tự).')).toBeTruthy(),
    );
    expect(ignore.mutate).not.toHaveBeenCalled();
  });

  it('có lý do + mã hoàn: gửi kèm `refundReference`', async () => {
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua giao dịch' }));
    const dialog = await decisionDialog('Bỏ qua giao dịch này?');
    fireEvent.change(within(dialog).getByLabelText('Lý do xử lý'), {
      target: { value: 'Khách chuyển nhầm' },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Đã hoàn lại tiền cho người gửi' }),
    );
    fireEvent.change(within(dialog).getByLabelText('Mã giao dịch hoàn'), {
      target: { value: 'FT999' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ qua' }));

    await waitFor(() => expect(ignore.mutate).toHaveBeenCalledTimes(1));
    expect(ignore.mutate.mock.calls[0]![0]).toEqual({
      id: 'tx-1',
      note: 'Khách chuyển nhầm',
      refundReference: 'FT999',
    });
  });
});

describe('Đọc giao dịch', () => {
  it('bóc sẵn ngân hàng, tài khoản nhận và mã tham chiếu — không bắt đọc JSON', () => {
    renderDrawer();

    expect(screen.getByText('Vietcombank')).toBeTruthy();
    expect(screen.getByText('1903567890')).toBeTruthy();
    expect(screen.getByText('FT26247000001')).toBeTruthy();
    expect(screen.getByText('Bằng chứng gốc từ ngân hàng')).toBeTruthy();
  });

  it('giao dịch đã xử lý: không còn đường xử lý, chỉ còn kết quả', () => {
    detail.data = makeDetail({
      matchStatus: BANK_MATCH_STATUS.IGNORED,
      matchedByName: 'Nhân viên tài chính',
      matchNote: 'khách chuyển nhầm',
      matchedAt: '2026-09-04T03:00:00.000Z',
      refundReference: 'FT26247999',
      refundedAt: '2026-09-04T03:00:00.000Z',
    });
    renderDrawer();

    expect(screen.getByText('Kết quả xử lý')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bỏ qua giao dịch' })).toBeNull();
    expect(screen.getByText('Giao dịch này đã được xử lý.')).toBeTruthy();
    // Vẫn phải thấy vì sao, và lần trả lại người gửi kèm mã của nó.
    expect(screen.getByText('khách chuyển nhầm')).toBeTruthy();
    expect(screen.getByText(/FT26247999/)).toBeTruthy();
  });

  it('chuyển sang giao dịch kế tiếp ngay trong panel — cùng khuôn màn duyệt xe', () => {
    renderDrawer({ nextId: 'tx-2' });

    expect(
      (screen.getByRole('button', { name: 'Giao dịch trước' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Giao dịch sau' }));
    expect(nav.onNavigate).toHaveBeenCalledWith('tx-2');
  });
});
