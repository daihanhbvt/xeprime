import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { queryKeys } from '@/queries/query-keys';
import { receiptsApi } from '../api';
import { useApproveReceipt, useCancelReceipt, useCreateReceipt } from './use-finance';

/**
 * Sau mỗi thay đổi phiếu, MỌI nhánh đọc lại chính những phiếu đó phải được làm mới.
 *
 * Thiếu `finance` thì màn Tổng quan doanh thu giữ số cũ cho tới khi cache tự hết hạn — người vừa
 * duyệt phiếu nhìn thấy một con số họ biết chắc là sai. Thiếu `debts` thì một phiếu thu gắn đơn
 * không làm giảm công nợ trên màn Công nợ. Thiếu `customers` thì ba ô tiền ở hồ sơ khách nói dối.
 */
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

/** Nhánh nào đã được yêu cầu làm mới — so bằng phần tử ĐẦU của khoá, không so cả khoá. */
function branches(invalidate: jest.SpyInstance): string[] {
  return invalidate.mock.calls
    .map((call) => (call[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey?.[0])
    .filter((value): value is string => typeof value === 'string');
}

const EXPECTED = [
  queryKeys.receipts.all[0],
  queryKeys.finance.all[0],
  queryKeys.debts.all[0],
  queryKeys.bookings.all[0],
  queryKeys.customers.all[0],
  queryKeys.dashboard.all[0],
];

afterEach(() => jest.restoreAllMocks());

describe('mutation phiếu — làm mới đủ mọi nhánh tiền', () => {
  it('TẠO phiếu', async () => {
    jest.spyOn(receiptsApi, 'create').mockResolvedValue({} as never);
    const { wrapper, invalidate } = setup();

    const { result } = await renderHook(() => useCreateReceipt(), { wrapper });
    result.current.mutate({ type: 'expense', amount: '1000', paymentMethod: 'cash' } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(branches(invalidate)).toEqual(expect.arrayContaining(EXPECTED));
  });

  it('DUYỆT phiếu', async () => {
    jest.spyOn(receiptsApi, 'approve').mockResolvedValue({} as never);
    const { wrapper, invalidate } = setup();

    const { result } = await renderHook(() => useApproveReceipt(), { wrapper });
    result.current.mutate('r1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(branches(invalidate)).toEqual(expect.arrayContaining(EXPECTED));
  });

  it('HUỶ phiếu', async () => {
    const cancel = jest.spyOn(receiptsApi, 'cancel').mockResolvedValue({} as never);
    const { wrapper, invalidate } = setup();

    const { result } = await renderHook(() => useCancelReceipt(), { wrapper });
    result.current.mutate({ id: 'r1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cancel).toHaveBeenCalledWith('r1', undefined);
    expect(branches(invalidate)).toEqual(expect.arrayContaining(EXPECTED));
  });
});
