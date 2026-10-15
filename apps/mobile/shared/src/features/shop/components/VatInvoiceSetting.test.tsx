import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';
import viShop from '@xeprime/domain/messages/vi/shop.json';
import { withIntl } from '@/i18n/test-utils';
import { queryKeys } from '@/queries/query-keys';
import { tenantsApi } from '../api';
import { VatInvoiceSetting } from './VatInvoiceSetting';

const mockToast = { showSuccess: jest.fn(), showError: jest.fn() };
jest.mock('@/components/feedback/use-app-toast', () => ({ useAppToast: () => mockToast }));

const T = viShop.vatInvoice;

/**
 * "Hỗ trợ xuất hoá đơn VAT" — MỘT thiết lập cho mọi xe (ADR 0059). Gương
 * `VatInvoiceSetting.test.tsx` của web: lưu ngay khi bấm, lỗi theo MÃ và công tắc đứng nguyên chỗ
 * cũ; tải hỏng có nút thử lại; thiếu quyền thì chỉ còn chữ.
 */
async function renderSetting(canEdit = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <VatInvoiceSetting canEdit={canEdit} />
      </QueryClientProvider>,
    ),
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockToast.showSuccess.mockReset();
  mockToast.showError.mockReset();
});

describe('VatInvoiceSetting', () => {
  it('mặc định tắt; bấm → lưu true, mockToast xác nhận, làm mới chợ', async () => {
    jest.spyOn(tenantsApi, 'vatInvoiceSetting').mockResolvedValue({ vatInvoiceSupported: false });
    const update = jest
      .spyOn(tenantsApi, 'updateVatInvoiceSetting')
      .mockResolvedValue({ vatInvoiceSupported: true });
    const view = await renderSetting();
    const invalidate = jest.spyOn(view.queryClient, 'invalidateQueries');

    expect(await view.findByText(T.off)).toBeTruthy();
    expect(view.getByText(T.note)).toBeTruthy();
    fireEvent(view.getByRole('switch'), 'valueChange', true);

    await waitFor(() => expect(update).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mockToast.showSuccess).toHaveBeenCalledWith(T.enabled));
    expect(await view.findByText(T.on)).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.marketplace.all });
  });

  it('lưu lỗi → báo theo MÃ (không in message backend), giữ trạng thái cũ', async () => {
    jest.spyOn(tenantsApi, 'vatInvoiceSetting').mockResolvedValue({ vatInvoiceSupported: false });
    jest.spyOn(tenantsApi, 'updateVatInvoiceSetting').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.FORBIDDEN,
        message: 'MESSAGE BACKEND — KHÔNG ĐƯỢC HIỆN',
        status: 403,
      }),
    );
    const view = await renderSetting();
    await view.findByText(T.off);
    fireEvent(view.getByRole('switch'), 'valueChange', true);

    await waitFor(() => expect(mockToast.showError).toHaveBeenCalledTimes(1));
    expect(mockToast.showError.mock.calls[0]?.[0]).not.toContain('KHÔNG ĐƯỢC HIỆN');
    expect(view.getByText(T.off)).toBeTruthy();
  });

  it('tải lỗi → thông báo lỗi', async () => {
    jest.spyOn(tenantsApi, 'vatInvoiceSetting').mockRejectedValue(new Error('down'));
    const view = await renderSetting();
    expect(await view.findByText(T.loadError)).toBeTruthy();
  });

  it('thiếu tenant.update: không có công tắc, vẫn nói trạng thái', async () => {
    jest.spyOn(tenantsApi, 'vatInvoiceSetting').mockResolvedValue({ vatInvoiceSupported: true });
    const view = await renderSetting(false);
    expect(await view.findByText(T.on)).toBeTruthy();
    expect(view.queryByRole('switch')).toBeNull();
  });
});
