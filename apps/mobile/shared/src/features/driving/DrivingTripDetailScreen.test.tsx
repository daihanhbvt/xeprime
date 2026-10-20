import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { DRIVER_ASSIGNMENT_OUTCOME, DRIVER_ASSIGNMENT_STATUS } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { drivingApi, type DriverTripDetail } from './api';
import { DrivingTripDetailScreen } from './DrivingTripDetailScreen';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    setParams: jest.fn(),
  }),
}));

const BOOKING_ID = '01JQZX0000000000000000000B';

function trip(overrides: Partial<DriverTripDetail> = {}): DriverTripDetail {
  return {
    id: BOOKING_ID,
    code: 'BK-0001',
    status: 'confirmed',
    assignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
    outcome: DRIVER_ASSIGNMENT_OUTCOME.OPEN,
    endedAt: null,
    assignedAt: '2026-10-10T02:00:00.000Z',
    respondedAt: null,
    pickupAt: '2026-10-20T02:00:00.000Z',
    returnAt: '2026-10-21T02:00:00.000Z',
    routeType: null,
    pickupAddress: '1 Lê Lợi, Quận 1',
    destination: null,
    vehicle: { name: 'Toyota Vios', plateNumber: '51A-123.45', mainImageUrl: null },
    employer: { name: 'Gian hàng Sài Gòn', phone: '0909000000', avatarUrl: null, kind: 'shop' },
    customer: { name: 'Nguyễn Văn A', phone: null, contactVisibleFrom: '2026-10-19T02:00:00.000Z' },
    pickupLatitude: null,
    pickupLongitude: null,
    destinationLatitude: null,
    destinationLongitude: null,
    actualPickupAt: null,
    actualReturnAt: null,
    ...overrides,
  };
}

async function renderScreen(detail: DriverTripDetail) {
  jest.spyOn(drivingApi, 'trip').mockResolvedValue(detail);
  const acceptSpy = jest
    .spyOn(drivingApi, 'acceptTrip')
    .mockResolvedValue({ ...detail, assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED });
  const declineSpy = jest.spyOn(drivingApi, 'declineTrip').mockResolvedValue({});
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={client}>
          <DrivingTripDetailScreen bookingId={BOOKING_ID} />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, acceptSpy, declineSpy };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
});

describe('DrivingTripDetailScreen (ADR 0063)', () => {
  it('chuyến chờ nhận: nhận chuyến gọi đúng endpoint', async () => {
    const view = await renderScreen(trip());

    expect(await view.findByText('Bên thuê gán bạn vào chuyến này')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Nhận chuyến' }));
    await waitFor(() => expect(view.acceptSpy).toHaveBeenCalledWith(BOOKING_ID));
  });

  it('từ chối phải xác nhận, xong thì về danh sách chuyến tôi lái', async () => {
    const view = await renderScreen(trip());

    await fireEvent.press(await view.findByRole('button', { name: 'Từ chối' }));
    expect(await view.findByText('Từ chối chuyến này?')).toBeTruthy();
    expect(view.declineSpy).not.toHaveBeenCalled();

    const buttons = view.getAllByRole('button', { name: 'Từ chối' });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(view.declineSpy).toHaveBeenCalledWith(BOOKING_ID));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it('đã nhận: không còn nút nhận/từ chối; SĐT khách bị che thì nói khi nào hiện', async () => {
    const view = await renderScreen(
      trip({
        assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
        respondedAt: '2026-10-10T03:00:00.000Z',
      }),
    );

    expect(await view.findByText('Nguyễn Văn A')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Nhận chuyến' })).toBeNull();
    expect(view.getByText(/SĐT khách hiện từ/)).toBeTruthy();
  });

  it('bị gỡ khi còn chờ nhận: chỉ một nhãn kết quả, không có nút nhận/từ chối', async () => {
    const view = await renderScreen(
      trip({
        outcome: DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
        endedAt: '2026-10-11T03:00:00.000Z',
      }),
    );

    expect(await view.findByText('Không còn giao cho bạn')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Nhận chuyến' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Từ chối' })).toBeNull();
  });
});
