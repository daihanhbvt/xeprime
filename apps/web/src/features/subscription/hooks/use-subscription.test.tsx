import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import { queryKeys } from '@/services/query-keys';

import type { SubscriptionInvoice } from '../types';
import { useSyncScopeWhenInvoiceSettles } from './use-subscription';

/**
 * "Tiền đã về" là một sự kiện CHỈ SERVER biết.
 *
 * Kích hoạt gói xảy ra trong transaction của webhook SePay (ADR 0022 · ADR 0040), nên client
 * không có cách nào biết lúc nào nó xảy ra ngoài việc hỏi lại. Tín hiệu duy nhất đáng tin là lượt
 * hỏi CUỐI CÙNG — lượt mà hoá đơn rời khỏi trạng thái chờ — và hook này biến nó thành một lần làm
 * mới scope.
 *
 * Hai bất biến, và cả hai đều là lỗi thật nếu làm sai:
 *
 *  1. **Rời trạng thái chờ ⇒ làm mới scope.** Thiếu nó, màn thanh toán của luồng nâng cấp lặng lẽ
 *     quay về bảng giá: hoá đơn hết "chờ" trong khi `/auth/me` vẫn nói người này ở tuyến hoa hồng.
 *  2. **Chưa từng có hoá đơn thì KHÔNG làm mới.** `data === null` ở cả hai tình huống ("vừa trả
 *     xong" và "chưa bắt đầu"); không phân biệt được thì mỗi lần mở trang là một lượt gọi vô ích.
 */
const fetchPendingInvoice = vi.hoisted(() => vi.fn());

vi.mock('../api', () => ({
  fetchPendingInvoice,
  fetchInvoices: vi.fn(),
  fetchPaymentInfo: vi.fn(),
  fetchMySubscription: vi.fn(),
  fetchTenantPlans: vi.fn(),
  purchaseSubscription: vi.fn(),
}));

const INVOICE = {
  id: 'INV1',
  code: 'XPG123456',
  status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
  totalAmount: '250000',
  paidAmount: '0',
} as unknown as SubscriptionInvoice;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => useSyncScopeWhenInvoiceSettles(), { wrapper });
  return { client, invalidate, view };
}

beforeEach(() => {
  fetchPendingInvoice.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSyncScopeWhenInvoiceSettles', () => {
  it('hoá đơn rời trạng thái chờ ⇒ làm mới scope và gói hiện hành', async () => {
    fetchPendingInvoice.mockResolvedValue(INVOICE);
    const { client, invalidate } = setup();

    // Còn đang chờ tiền: chưa có gì để làm mới.
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.subscription.pendingInvoice())).toBeTruthy(),
    );
    expect(invalidate).not.toHaveBeenCalled();

    // Lượt hỏi kế tiếp trả `null` — webhook đã lật hoá đơn sang `paid`.
    fetchPendingInvoice.mockResolvedValue(null);
    await client.refetchQueries({ queryKey: queryKeys.subscription.pendingInvoice() });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.all }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.subscription.all });
  });

  it('chưa từng tạo hoá đơn ⇒ KHÔNG làm mới gì', async () => {
    fetchPendingInvoice.mockResolvedValue(null);
    const { invalidate } = setup();

    await waitFor(() => expect(fetchPendingInvoice).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
  });
});
