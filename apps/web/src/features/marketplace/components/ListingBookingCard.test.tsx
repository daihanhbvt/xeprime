import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addDateKeyDays, SERVICE_TYPE, vnDateKey } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { PublicListingDetail } from '../types';
import { ListingBookingCard } from './ListingBookingCard';

/**
 * Thẻ đặt xe của trang chi tiết — từ 27/10/2026 nó là NƠI DUY NHẤT khách chọn chuyến: hộp yêu cầu
 * thuê mở thẳng ở màn Xem lại. Đặc tả khoá hai việc:
 *
 *  - Ô chọn ngày giờ khoá ngày xe đã kín lịch (cùng lịch bận với cổng ở server — preview, ADR 0006).
 *  - "Chọn thuê" chỉ mở hộp khi chuyến đã ĐỦ; thiếu gì thì chỉ ra ngay tại thẻ.
 */
const TODAY_KEY = vnDateKey(new Date());

const api = vi.hoisted(() => ({ fetchVehicleBusyDays: vi.fn() }));
vi.mock('@/features/booking-requests/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/booking-requests/api')>()),
  fetchVehicleBusyDays: (...a: unknown[]) => api.fetchVehicleBusyDays(...a),
}));

/** Báo giá không phải thứ được đo ở đây — lỗi thì thẻ rơi về câu "chưa tải được giá". */
vi.mock('@/features/rental-policies/api', () => ({
  fetchPublicQuote: () => Promise.reject(new Error('quote offline (test)')),
}));

/** Hộp yêu cầu thuê có spec riêng — ở đây chỉ cần biết thẻ CÓ mở nó không, và với prefill nào. */
const booking = vi.hoisted(() => ({ opened: vi.fn() }));
vi.mock('@/features/booking-requests/components/RequestBookingButton', () => ({
  RequestBookingButton: ({
    beforeOpen,
    prefill,
  }: {
    beforeOpen?: () => boolean;
    prefill?: unknown;
  }) => (
    <button
      type="button"
      onClick={() => {
        if (!beforeOpen || beforeOpen()) booking.opened(prefill);
      }}
    >
      Chọn thuê
    </button>
  ),
}));

/** Hộp chọn địa chỉ (bản đồ) — chỉ cần biết hộp nào đang MỞ. */
vi.mock('./DeliveryAddressModal', () => ({
  DeliveryAddressModal: ({
    open,
    title,
    onClose,
  }: {
    open: boolean;
    title?: string;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid={title ? 'driver-address-modal' : 'delivery-address-modal'}>
        <button type="button" onClick={onClose}>
          Đóng hộp địa chỉ
        </button>
      </div>
    ) : null,
}));

vi.mock('@/features/chat/components/ShopChatButton', () => ({
  ShopChatButton: () => <button type="button">Nhắn shop</button>,
}));
vi.mock('@/features/promo-codes/components/PromoCodeField', () => ({
  PromoPicker: () => null,
  PromoStatusNote: () => null,
  PromoCodeField: () => null,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/listings/V1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const LISTING = {
  id: 'V1',
  name: 'Toyota Vios 2022',
  vehicleType: 'car',
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
  weekdayPrice: '585000',
  weekendPrice: '650000',
  hourlyPrice: '90000',
  withDriverDailyPrice: '900000',
  discountPercent: 0,
  deliveryEnabled: true,
  deliveryAvailable: true,
  provinceCode: '79',
  pickupPoint: null,
  shopName: 'Gian hàng Demo XePrime',
  shopSlug: 'demo',
  shopProvince: 'TP. Hồ Chí Minh',
  longTermPackages: [],
  driverSurchargeRules: [],
} as unknown as PublicListingDetail;

function renderCard(activeService: string = SERVICE_TYPE.SELF_DRIVE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <App>
        <ListingBookingCard listing={LISTING} activeService={activeService} />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.fetchVehicleBusyDays.mockReset();
  api.fetchVehicleBusyDays.mockResolvedValue({ days: [], from: TODAY_KEY, to: TODAY_KEY });
  booking.opened.mockReset();
  // Địa chỉ giao xe lần trước sống ở `localStorage` — thẻ điền hộ nó; mỗi ca bắt đầu trắng.
  window.localStorage.clear();
});

afterEach(cleanup);

describe('ListingBookingCard — lịch bận của xe', () => {
  it('nạp lịch bận của ĐÚNG xe này, cửa sổ bắt đầu từ quanh hôm nay', async () => {
    renderCard();

    await waitFor(() => expect(api.fetchVehicleBusyDays).toHaveBeenCalled());
    const [vehicleId, from, to] = api.fetchVehicleBusyDays.mock.calls[0] as [string, string, string];
    expect(vehicleId).toBe('V1');
    // Lùi một ngày: máy khách ở múi giờ âm có thể đang ở "hôm qua" so với ngày nghiệp vụ.
    expect(from).toBe(addDateKeyDays(TODAY_KEY, -1));
    expect(to).toBe(addDateKeyDays(from, 366));
  });

  it('ngày bận trọn ngày bị KHOÁ ngay trên lịch của ô chọn ngày giờ', async () => {
    // Hai ngày tới: nằm trong lưới hai tháng mở ra từ khoảng thuê gợi ý (bắt đầu từ ngày mai).
    const busyKey = addDateKeyDays(TODAY_KEY, 2);
    api.fetchVehicleBusyDays.mockResolvedValue({
      days: [{ date: busyKey, fullyBusy: true, periods: [] }],
      from: TODAY_KEY,
      to: busyKey,
    });
    renderCard();
    await waitFor(() => expect(api.fetchVehicleBusyDays).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Thời gian thuê/ }));
    const [busyDay] = await screen.findAllByTitle('Xe đã có lịch cả ngày');
    expect((busyDay as HTMLButtonElement).disabled).toBe(true);
  });

  it('thuê dài hạn KHÔNG hỏi lịch bận — không có ô chọn khoảng nhận–trả', async () => {
    renderCard(SERVICE_TYPE.LONG_TERM);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.fetchVehicleBusyDays).not.toHaveBeenCalled();
  });
});

describe('ListingBookingCard — "Chọn thuê" chỉ mở hộp khi chuyến đã đủ', () => {
  it('tự lái, tự nhận xe, có khoảng thuê ⇒ mở hộp với prefill đủ chuyến', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));

    expect(booking.opened).toHaveBeenCalledTimes(1);
    expect(booking.opened.mock.calls[0]![0]).toMatchObject({
      pickupMethod: 'self',
      rentalMode: 'daily',
      delivery: null,
    });
  });

  it('giao tận nơi mà chưa có địa chỉ ⇒ KHÔNG mở hộp, mở hộp chọn địa chỉ giao xe', () => {
    renderCard();
    // Chọn giao tận nơi tự mở hộp địa chỉ; khách đóng nó mà không chọn gì.
    fireEvent.click(screen.getByRole('button', { name: /Giao xe tận nơi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng hộp địa chỉ' }));
    expect(screen.queryByTestId('delivery-address-modal')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));

    expect(booking.opened).not.toHaveBeenCalled();
    expect(screen.getByTestId('delivery-address-modal')).toBeTruthy();
  });

  it('có tài xế mà chưa có điểm đón ⇒ KHÔNG mở hộp, mở hộp chọn điểm đón', () => {
    renderCard(SERVICE_TYPE.WITH_DRIVER);

    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));

    expect(booking.opened).not.toHaveBeenCalled();
    expect(screen.getByTestId('driver-address-modal')).toBeTruthy();
  });
});
