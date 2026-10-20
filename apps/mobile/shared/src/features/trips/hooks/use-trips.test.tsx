import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { CUSTOMER_TRIP_STAGE } from '@xeprime/types';
import { tripsApi } from '../api';
import { useTripsInfinite } from './use-trips';

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: () => true,
  useRefetchOnForeground: () => undefined,
}));

jest.mock('@/features/badges/BadgeRealtimeProvider', () => ({
  useBadgeRealtimeLive: () => true,
}));

jest.mock('../api', () => ({
  TRIPS_DEFAULT_LIMIT: 20,
  tripsApi: { list: jest.fn() },
  reviewsApi: {},
}));

const listMock = tripsApi.list as jest.Mock;

function page(stage: string) {
  return {
    items: [{ id: 't1', stage }],
    counts: {},
    meta: { page: 1, limit: 20, total: 1, hasNext: false },
  };
}

function Probe() {
  const q = useTripsInfinite('upcoming', 'renter');
  return <Text testID="stage">{q.data?.pages[0]?.items[0]?.stage ?? '-'}</Text>;
}

async function renderProbe() {
  const client = new QueryClient({
    // Như app thật (`query-client.ts`): mặc định TẮT — test chứng minh chính query tự bật `always`.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listMock.mockReset();
  focusManager.setFocused(true);
});

afterEach(() => {
  focusManager.setFocused(undefined);
});

/** App xuống nền rồi quay lại — đúng hai lượt `handleFocus` mà listener AppState phát. */
function returnToForeground() {
  focusManager.setFocused(false);
  focusManager.setFocused(true);
}

describe('useTripsInfinite — quay lại tiền cảnh', () => {
  it('đọc lại khi danh sách có chuyến chờ tiền giữ chỗ', async () => {
    listMock.mockResolvedValueOnce(page(CUSTOMER_TRIP_STAGE.AWAITING_HOLD));
    listMock.mockResolvedValueOnce(page(CUSTOMER_TRIP_STAGE.READY));
    const { getByTestId } = await renderProbe();
    await waitFor(() =>
      expect(getByTestId('stage').props.children).toBe(CUSTOMER_TRIP_STAGE.AWAITING_HOLD),
    );

    await act(async () => returnToForeground());

    await waitFor(() =>
      expect(getByTestId('stage').props.children).toBe(CUSTOMER_TRIP_STAGE.READY),
    );
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('đọc lại cả khi không có chuyến nào chờ tiền (chủ xe duyệt/huỷ lúc app nằm nền)', async () => {
    listMock.mockResolvedValueOnce(page(CUSTOMER_TRIP_STAGE.READY));
    listMock.mockResolvedValueOnce(page(CUSTOMER_TRIP_STAGE.CANCELLED));
    const { getByTestId } = await renderProbe();
    await waitFor(() =>
      expect(getByTestId('stage').props.children).toBe(CUSTOMER_TRIP_STAGE.READY),
    );

    await act(async () => returnToForeground());

    await waitFor(() =>
      expect(getByTestId('stage').props.children).toBe(CUSTOMER_TRIP_STAGE.CANCELLED),
    );
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});
