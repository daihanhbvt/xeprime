import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { BOOKING_STATUS, PERMISSION, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { DebtListScreen } from './DebtListScreen';
import { debtsApi, type DebtItem } from './api';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function user(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Thu ngân',
    email: 'thungan@xeprime.test',
    avatarUrl: null,
    phone: '0903333333',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_staff',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  } as authApi.CurrentUser;
}

function debt(over: Partial<DebtItem> = {}): DebtItem {
  return {
    bookingId: '01JQZX0000000000000000000B',
    code: 'BK-0042',
    customerName: 'Trần Thị Bình',
    customerPhone: '0912345678',
    vehicleName: 'Vios 2022',
    status: BOOKING_STATUS.COMPLETED,
    returnAt: '2026-09-05T09:00:00.000Z',
    totalAmount: '5000000',
    paidAmount: '2000000',
    surchargeTotal: '0',
    debtAmount: '3000000',
    ...over,
  } as DebtItem;
}

async function renderScreen(
  permissions: Permission[],
  options: { items?: DebtItem[]; total?: number } = {},
) {
  const items = options.items ?? [debt()];
  const total = options.total ?? items.length;

  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user(permissions));
  const listSpy = jest.spyOn(debtsApi, 'list').mockResolvedValue({
    items,
    meta: { page: 1, limit: 20, total, hasNext: total > 20 },
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <DebtListScreen />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, listSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/**
 * Công nợ (FIN-04). Ba điều phải giữ:
 *  1. thiếu `finance.view` thì không một request nào được bắn đi;
 *  2. TRẠNG THÁI ĐƠN đọc được TRƯỚC các con số — một đơn `reserved` còn nợ không phải nợ quá hạn;
 *  3. hai hành động gác bằng HAI quyền khác nhau, và "Thu tiền" mở đúng luồng FIN-05 đã có.
 */
describe('DebtListScreen — quyền', () => {
  it('thiếu `finance.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const { findByText, listSpy } = await renderScreen([]);

    expect(await findByText('Không có quyền xem số liệu tài chính')).toBeTruthy();
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('chỉ `finance.view`: thấy khoản nợ nhưng KHÔNG có hành động nào', async () => {
    const { findByText, queryByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    expect(await findByText('Trần Thị Bình')).toBeTruthy();
    expect(queryByText('Xem đơn')).toBeNull();
    expect(queryByText('Thu tiền')).toBeNull();
  });

  it('`bookings.view` mở hành động "Xem đơn"; `payments.record` mở "Thu tiền"', async () => {
    const { findByText } = await renderScreen([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.PAYMENT_RECORD,
    ]);

    expect(await findByText('Xem đơn')).toBeTruthy();
    expect(await findByText('Thu tiền')).toBeTruthy();
  });
});

describe('DebtListScreen — thẻ và hành động', () => {
  it('trạng thái đơn hiện ra, và ba con số tiền đọc được', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    expect(await findByText('Hoàn thành')).toBeTruthy();
    // Đã trả / tổng đứng chung một dòng phụ dưới nhãn 'Còn nợ'.
    expect(await findByText('2.000.000 ₫ / 5.000.000 ₫')).toBeTruthy();
    expect(await findByText('3.000.000 ₫')).toBeTruthy();
  });

  it('"Xem đơn" đi tới chi tiết đơn, không tới một bản chi tiết thứ hai', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW, PERMISSION.BOOKING_VIEW]);

    await fireEvent.press(await findByText('Xem đơn'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/bookings/[id]',
      params: { id: '01JQZX0000000000000000000B' },
    });
  });

  it('"Thu tiền" mở tấm ghi nhận thu tiền của FIN-05 với số CÒN NỢ điền sẵn', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW, PERMISSION.PAYMENT_RECORD]);

    await fireEvent.press(await findByText('Thu tiền'));

    // Tiêu đề của `RecordPaymentSheet` — cùng tấm mà chi tiết đơn dùng, không phải form thứ hai.
    expect(await findByText('Thu tiền đơn')).toBeTruthy();
    expect(await findByText('Còn nợ:')).toBeTruthy();
  });
});

describe('DebtListScreen — rỗng', () => {
  it('chưa ai còn nợ: câu chữ riêng, không phải "không khớp bộ lọc"', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      items: [],
      total: 0,
    });

    expect(await findByText('Không có đơn nào còn nợ')).toBeTruthy();
  });

  it('bộ lọc mặc định gửi `filter=all` xuống server, không cắt ở client', async () => {
    const { listSpy } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    expect(listSpy.mock.calls[0]![0].filter).toBe('all');
  });
});
