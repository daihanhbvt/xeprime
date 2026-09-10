import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render } from '@testing-library/react-native';
import { PERMISSION, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { branchesApi } from '@/features/branches/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { calendarApi } from '../api';
import { BulkDayBlockSheet } from './BulkDayBlockSheet';
import { BulkDayPriceSheet } from './BulkDayPriceSheet';
import { DailyPriceSheet } from './DailyPriceSheet';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/manage/calendar',
  useLocalSearchParams: () => ({}),
}));

function currentUser(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrap(children: ReactNode) {
  return withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ReduxProvider>,
  );
}

const FILTERS = { from: '2026-09-01', days: 14, vehicleType: null, q: null, sort: 'next_booking' } as const;

beforeEach(() => {
  jest.restoreAllMocks();
  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(
      currentUser([
        PERMISSION.CALENDAR_VIEW,
        PERMISSION.VEHICLE_BLOCK_SCHEDULE,
        PERMISSION.VEHICLE_UPDATE,
        PERMISSION.BOOKING_CREATE,
      ]),
    );
  jest.spyOn(branchesApi, 'list').mockResolvedValue({
    items: [],
    total: 0,
    activeCount: 0,
    needsReviewCount: 0,
  });
  jest.spyOn(calendarApi, 'bulkDayPreview').mockResolvedValue({
    from: '2026-09-01',
    to: '2026-09-01',
    dayCount: 1,
    vehicles: [],
  });
  jest.spyOn(calendarApi, 'vehicleDailyPrices').mockResolvedValue([]);
});

/*
 * Bug đã sửa: hai ô "from"/"to" của cả ba tấm trượt (BulkDayBlockSheet, BulkDayPriceSheet,
 * DailyPriceSheet) là hai `DatePickerSheet` TÁCH RỜI (không phải một `DatePicker.RangePicker`
 * như web, vốn CẤU TRÚC không cho chọn ngày kết thúc trước ngày bắt đầu). Trước bản sửa, mở ô
 * "to" và chạm một ngày trước ngày "from" ghi thẳng ngày đó xuống — khoảng `to < from` hoặc lọt
 * xuống tận validation của backend (Bulk*), hoặc bị `rangeInvalid` chặn nhưng với đúng câu lỗi
 * SAI ("khoảng quá dài", DailyPriceSheet). Bản sửa truyền `minDate = from` cho `DatePickerSheet`
 * khi đang chọn "to", nên những ngày đó bị khoá NGAY TỪ Ô CHỌN.
 */
describe('BulkDayBlockSheet — khoảng "to" không được đứng trước "from"', () => {
  it('ngày trước `rangeFrom` bị khoá trong ô chọn "to", ngày sau vẫn chọn được', async () => {
    const view = await render(
      wrap(
        <BulkDayBlockSheet
          state={{
            date: '2026-09-20',
            suggestedRange: { from: '2026-09-20', to: '2026-09-25' },
          }}
          filters={FILTERS}
          onClose={jest.fn()}
        />,
      ),
    );

    // Cụm 20–25/09 gợi ý mở sẵn ở chế độ "khoảng ngày" (suggestsRange = true) — không cần bấm chip.
    await fireEvent.press(await view.findByLabelText(/^Kết thúc:/));

    // Đang chọn "to": ngày 15/09 (trước rangeFrom = 20/09) phải bị KHOÁ.
    const before = view.getByTestId('day-2026-09-15');
    expect(before.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(before);
    // Chạm ô đã khoá không được đổi giá trị — vẫn còn nguyên 25/09 của gợi ý.
    expect(view.getByLabelText(/^Kết thúc: .*25/)).toBeTruthy();

    // Một ngày SAU rangeFrom (22/09) thì chọn được bình thường.
    const after = view.getByTestId('day-2026-09-22');
    expect(after.props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(after);
    expect(await view.findByLabelText(/^Kết thúc: .*22/)).toBeTruthy();
  });

  it('ngày trước `rangeFrom` vẫn chọn được ở CHÍNH ô "from" — sàn hẹp chỉ áp cho ô "to"', async () => {
    const view = await render(
      wrap(
        <BulkDayBlockSheet
          state={{
            date: '2026-09-20',
            suggestedRange: { from: '2026-09-20', to: '2026-09-25' },
          }}
          filters={FILTERS}
          onClose={jest.fn()}
        />,
      ),
    );

    await fireEvent.press(await view.findByLabelText(/^Khoảng ngày:/));

    const earlier = view.getByTestId('day-2026-09-15');
    expect(earlier.props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(earlier);

    expect(await view.findByLabelText(/^Khoảng ngày: .*15/)).toBeTruthy();
  });
});

describe('BulkDayPriceSheet — cùng ràng buộc "to" ≥ "from"', () => {
  it('ngày trước `rangeFrom` bị khoá trong ô chọn "to"', async () => {
    const view = await render(
      wrap(
        <BulkDayPriceSheet
          state={{
            date: '2026-09-20',
            suggestedRange: { from: '2026-09-20', to: '2026-09-25' },
          }}
          filters={FILTERS}
          onClose={jest.fn()}
        />,
      ),
    );

    await fireEvent.press(await view.findByLabelText(/^Kết thúc:/));

    const before = view.getByTestId('day-2026-09-15');
    expect(before.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('DailyPriceSheet — cùng ràng buộc "to" ≥ "from"', () => {
  it('ngày trước `from` bị khoá trong ô chọn "to"', async () => {
    const view = await render(
      wrap(
        <DailyPriceSheet
          state={{
            vehicleId: '01JQZX0000000000000000000V',
            vehicleName: 'Toyota Vios',
            weekdayPrice: '500000',
            hourlyPrice: null,
            date: '2026-09-20',
          }}
          onClose={jest.fn()}
        />,
      ),
    );

    // `from`/`to` mặc định cùng đúng ngày được chạm (2026-09-20) — mở ô "to" trước.
    await fireEvent.press(await view.findByLabelText(/^Kết thúc:/));

    const before = view.getByTestId('day-2026-09-15');
    expect(before.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(before);
    // Chạm ô đã khoá không được đổi giá trị — vẫn còn nguyên 20/09.
    expect(view.getByLabelText(/^Kết thúc: .*20/)).toBeTruthy();
  });
});
