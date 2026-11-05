import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import { bookingPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';

/**
 * Toast "Ghi nhận thanh toán" — chỉ khi một yêu cầu RỜI nhóm chờ khách trả VÀ server nói nó đã thành
 * đơn. Lần tải đầu chỉ ghi mốc; hết hạn / bị huỷ thì im lặng.
 */

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));

const watch = vi.hoisted(() => ({
  items: undefined as Array<{ id: string }> | undefined,
  calls: [] as Array<{ filters: Record<string, unknown>; enabled: boolean; live: boolean }>,
}));
vi.mock('@/features/booking-requests/hooks/use-booking-requests', () => ({
  useBookingRequests: (
    filters: Record<string, unknown>,
    options: { enabled?: boolean; live?: boolean } = {},
  ) => {
    watch.calls.push({ filters, enabled: options.enabled ?? true, live: options.live ?? false });
    return { data: watch.items ? { items: watch.items, meta: {} } : undefined };
  },
}));

const api = vi.hoisted(() => ({ fetchBookingRequest: vi.fn() }));
vi.mock('@/features/booking-requests/api', () => api);

const { usePaymentArrivalToast } = await import('./use-payment-arrival-toast');

function Probe({ canOpenBooking = true }: { canOpenBooking?: boolean }) {
  usePaymentArrivalToast({ enabled: true, canOpenBooking });
  return null;
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function mount(canOpenBooking = true) {
  const queryClient = client();
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <App>
        <Probe canOpenBooking={canOpenBooking} />
      </App>
    </QueryClientProvider>
  );
  const view = renderWithIntl(tree());
  return { rerender: () => view.rerender(tree()) };
}

beforeEach(() => {
  watch.items = undefined;
  watch.calls = [];
  api.fetchBookingRequest.mockReset();
  nav.push.mockClear();
});
afterEach(cleanup);

describe('usePaymentArrivalToast', () => {
  it('theo dõi tối đa 100 yêu cầu đang chờ khách trả, làm mới nền', () => {
    mount();
    expect(watch.calls[0]).toEqual({
      filters: expect.objectContaining({
        status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
        page: 1,
        limit: 100,
      }),
      enabled: true,
      live: true,
    });
  });

  it('lần tải ĐẦU chỉ ghi mốc — không hỏi server, không toast', () => {
    watch.items = [{ id: 'r1' }];
    mount();
    expect(api.fetchBookingRequest).not.toHaveBeenCalled();
  });

  it('rời nhóm và đã thành đơn ⇒ toast có mã đơn + "Xem đơn hàng" mở chi tiết đơn', async () => {
    watch.items = [{ id: 'r1' }, { id: 'r2' }];
    const view = mount();
    api.fetchBookingRequest.mockResolvedValue({
      id: 'r1',
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      bookingId: 'b-9',
      bookingCode: 'DH-0009',
      vehicleName: 'Kia Carnival',
    });
    watch.items = [{ id: 'r2' }];
    view.rerender();

    expect(await screen.findByText('Ghi nhận thanh toán')).toBeTruthy();
    expect(screen.getByText(/Khách đã thanh toán cho đơn hàng #DH-0009/)).toBeTruthy();
    expect(api.fetchBookingRequest).toHaveBeenCalledWith('r1');
    fireEvent.click(screen.getByRole('button', { name: 'Xem đơn hàng' }));
    expect(nav.push).toHaveBeenCalledWith(bookingPath.detail('b-9'));
  });

  it('rời nhóm vì hết hạn / bị huỷ ⇒ im lặng', async () => {
    watch.items = [{ id: 'r1' }];
    const view = mount();
    api.fetchBookingRequest.mockResolvedValue({
      id: 'r1',
      status: BOOKING_REQUEST_STATUS.HOLD_EXPIRED,
      bookingId: null,
      bookingCode: null,
      vehicleName: 'Kia Carnival',
    });
    watch.items = [];
    view.rerender();
    await waitFor(() => expect(api.fetchBookingRequest).toHaveBeenCalledWith('r1'));
    expect(screen.queryByText('Ghi nhận thanh toán')).toBeNull();
  });

  it('không có quyền xem đơn ⇒ toast không có nút mở đơn', async () => {
    watch.items = [{ id: 'r1' }];
    const view = mount(false);
    api.fetchBookingRequest.mockResolvedValue({
      id: 'r1',
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      bookingId: 'b-9',
      bookingCode: 'DH-0009',
      vehicleName: 'Kia Carnival',
    });
    watch.items = [];
    view.rerender();
    expect(await screen.findByText('Ghi nhận thanh toán')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem đơn hàng' })).toBeNull();
  });
});
