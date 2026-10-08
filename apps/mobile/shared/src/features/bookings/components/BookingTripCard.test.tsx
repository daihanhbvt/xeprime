import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { ApiClientError } from '@xeprime/api-client';
import { BOOKING_STATUS, type BookingStatus } from '@xeprime/types';
import { handoversApi, type HandoverContext } from '@/features/handovers/api';
import { withIntl } from '@/i18n/test-utils';
import { BookingTripCard } from './BookingTripCard';

/** Bộ quyền của lượt render — đổi trong từng test. */
let mockGranted: string[] = [];

jest.mock('@/features/auth/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isLoading: false,
    has: (p: string) => mockGranted.includes(p),
  }),
}));

const BOOKING_ID = '01JQZX0000000000000000000B';

function renderCard(status: BookingStatus = BOOKING_STATUS.CONFIRMED) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <BookingTripCard bookingId={BOOKING_ID} bookingStatus={status} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockGranted = ['handovers.view', 'handovers.confirm'];
});

describe('BookingTripCard — bám BookingOperationPanel bên web', () => {
  it('thiếu handovers.view: GIỮ thẻ và nói thiếu quyền gì, không gọi API', async () => {
    mockGranted = [];
    const spy = jest.spyOn(handoversApi, 'context');
    await renderCard();

    expect(screen.getByText('Không có quyền xem bàn giao')).toBeTruthy();
    expect(screen.getByText(/handovers\.view/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('lỗi tải: câu dịch theo MÃ lỗi, không phải câu thô của server', async () => {
    jest
      .spyOn(handoversApi, 'context')
      .mockRejectedValue(
        new ApiClientError({ status: 403, code: 'MISSING_PERMISSION', message: 'câu thô server' }),
      );
    await renderCard();

    expect(await screen.findByText('Không tải được thông tin bàn giao')).toBeTruthy();
    expect(screen.queryByText('câu thô server')).toBeNull();
  });

  it('chưa giao xe + thiếu handovers.confirm: nói rõ vì sao không có nút chốt', async () => {
    mockGranted = ['handovers.view'];
    jest
      .spyOn(handoversApi, 'context')
      .mockResolvedValue({ pickup: null, return: null } as unknown as HandoverContext);
    await renderCard();

    expect(await screen.findByText('Bạn không có quyền xác nhận bàn giao')).toBeTruthy();
  });

  it('đủ quyền: không có cảnh báo thiếu quyền xác nhận', async () => {
    jest
      .spyOn(handoversApi, 'context')
      .mockResolvedValue({ pickup: null, return: null } as unknown as HandoverContext);
    await renderCard();

    expect(await screen.findByText(/Chuyến chưa bắt đầu/)).toBeTruthy();
    expect(screen.queryByText('Bạn không có quyền xác nhận bàn giao')).toBeNull();
  });

  it('mốc đã giao: câu "{hành động} lúc {giờ}", dòng Odo và ghi chú', async () => {
    jest.spyOn(handoversApi, 'context').mockResolvedValue({
      pickup: {
        confirmedAt: '2026-09-20T02:30:00.000Z',
        occurredAt: '2026-09-20T02:00:00.000Z',
        odometerKm: 12345,
        notes: 'Xe sạch, đủ xăng',
      },
      return: null,
    } as unknown as HandoverContext);
    await renderCard(BOOKING_STATUS.ACTIVE);

    expect(await screen.findByText(/^Đã giao xe lúc /)).toBeTruthy();
    expect(screen.getByText(/Chỉ số Odo ghi nhận: 12[.,]345/)).toBeTruthy();
    expect(screen.getByText('Xe sạch, đủ xăng')).toBeTruthy();
  });
});
