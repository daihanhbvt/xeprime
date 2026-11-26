import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import {
  BOOKING_HANDOVER_PLACE,
  BOOKING_LIST_PRESET,
  BOOKING_STATUS,
  PERMISSION,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { BookingCard } from './BookingCard';
import type { BookingListItem } from '../api';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

/**
 * Mốc neo vào `Date.now()` — `pickupUrgency` / `rentalProgress` so với đồng hồ thật, một mốc cứng
 * sẽ đổi nhóm khẩn vào ngày test chạy lại.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function booking(over: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: '01JQZX00000000000000000B01',
    code: 'DH-0001',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    vehicleId: '01JQZX0000000000000000000V',
    vehicleName: 'Toyota Vios 2021',
    vehiclePlate: '51H-123.45',
    status: BOOKING_STATUS.RESERVED,
    serviceType: 'self_drive',
    pickupAt: new Date(Date.now() + 2 * DAY).toISOString(),
    returnAt: new Date(Date.now() + 4 * DAY).toISOString(),
    totalAmount: '1500000.00',
    collectedAmount: '0.00',
    debtAmount: '1500000.00',
    pickupHandoverStatus: null,
    handoverPlaceKind: null,
    handoverPlace: null,
    canMessageOnPlatform: false,
    ...over,
  } as BookingListItem;
}

function renderCard(element: ReactElement) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: '01JQZX00000000000000000USR',
    displayName: 'Chủ shop',
    tenant: { id: '01JQZX00000000000000000TEN' },
    permissions: [PERMISSION.VEHICLE_VIEW, PERMISSION.BOOKING_VIEW],
  } as unknown as authApi.CurrentUser);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

const noop = () => {};

beforeEach(() => jest.restoreAllMocks());

/** Thẻ "Đơn thuê xe" gộp — CÙNG khung với web `BookingCard` (sổ cái §3.2b). */
describe('BookingCard - dải đầu và ô tiền', () => {
  it('dải đầu mang mã đơn; ô tiền đơn tự lập là tiền thuê · đã thu · còn phải thu', async () => {
    const view = await renderCard(
      <BookingCard booking={booking()} onPress={noop} group={BOOKING_LIST_PRESET.AWAITING_PICKUP} />,
    );

    expect(await view.findByText('#DH-0001')).toBeTruthy();
    expect(view.getByText('Tiền thuê:')).toBeTruthy();
    expect(view.getByText('Đã thu:')).toBeTruthy();
    expect(view.getByText('Còn phải thu:')).toBeTruthy();
  });

  it('đơn qua chợ: khách trả · đã giữ chỗ · trả chủ xe khi nhận xe', async () => {
    const view = await renderCard(
      <BookingCard
        booking={booking({
          customerTotalAmount: '1550000.00',
          holdPaidAmount: '275000.00',
          payAtPickupAmount: '1275000.00',
        })}
        onPress={noop}
        group={BOOKING_LIST_PRESET.AWAITING_PICKUP}
      />,
    );

    expect(await view.findByText('Khách trả:')).toBeTruthy();
    expect(view.getByText('Đã giữ chỗ:')).toBeTruthy();
    expect(view.getByText('Trả chủ xe khi nhận xe:')).toBeTruthy();
    expect(view.queryByText('Còn phải thu:')).toBeNull();
  });
});

describe('BookingCard - nhóm Chờ giao xe', () => {
  it('có quyền bàn giao: nút "Xử lý giao xe" mở chi tiết', async () => {
    const onPress = jest.fn();
    const view = await renderCard(
      <BookingCard
        booking={booking()}
        onPress={onPress}
        onReceive={noop}
        group={BOOKING_LIST_PRESET.AWAITING_PICKUP}
      />,
    );

    await fireEvent.press(await view.findByText('Xử lý giao xe'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('không có quyền bàn giao: chỉ có "Chi tiết"', async () => {
    const view = await renderCard(
      <BookingCard booking={booking()} onPress={noop} group={BOOKING_LIST_PRESET.AWAITING_PICKUP} />,
    );

    expect(await view.findByText('Chi tiết')).toBeTruthy();
    expect(view.queryByText('Xử lý giao xe')).toBeNull();
  });

  it('dịch MÃ hình thức nhận xe ở ô lịch', async () => {
    const view = await renderCard(
      <BookingCard
        booking={booking({ handoverPlaceKind: BOOKING_HANDOVER_PLACE.DELIVERY })}
        onPress={noop}
        group={BOOKING_LIST_PRESET.AWAITING_PICKUP}
      />,
    );

    expect(await view.findByText(/^Hình thức nhận xe/)).toBeTruthy();
  });
});

describe('BookingCard - nhóm Đang thuê', () => {
  it('nói còn bao lâu tới giờ trả và có nút "Nhận xe"', async () => {
    const onReceive = jest.fn();
    const view = await renderCard(
      <BookingCard
        booking={booking({
          status: BOOKING_STATUS.ACTIVE,
          pickupAt: new Date(Date.now() - DAY).toISOString(),
          returnAt: new Date(Date.now() + 2 * DAY).toISOString(),
        })}
        onPress={noop}
        onReceive={onReceive}
        group={BOOKING_LIST_PRESET.RENTING}
      />,
    );

    expect(await view.findByText(/^Còn lại:/)).toBeTruthy();
    await fireEvent.press(view.getByText('Nhận xe'));
    expect(onReceive).toHaveBeenCalledTimes(1);
  });
});
