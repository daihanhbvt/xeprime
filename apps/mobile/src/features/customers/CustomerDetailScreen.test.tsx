import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  PERMISSION,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_SOURCE,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { customersApi, type TenantCustomerDetail } from './api';
import { CustomerDetailScreen } from './CustomerDetailScreen';

const CUSTOMER_ID = '01JQZX0000000000000000000C';

// Tiền tố `mock` là điều kiện của jest để một biến được phép lọt vào factory của `jest.mock`.
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '01JQZX0000000000000000000C' }),
  // `useNavigateOnce` cần `useNavigation().isFocused()` — thiếu nó là màn nổ giữa lúc render.
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

function user(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Nhân viên',
    email: 'staff@xeprime.test',
    avatarUrl: null,
    phone: '0902222222',
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
  };
}

function customer(overrides: Partial<TenantCustomerDetail> = {}): TenantCustomerDetail {
  return {
    id: CUSTOMER_ID,
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    normalizedPhone: '84901234567',
    email: 'an@xeprime.test',
    address: null,
    source: TENANT_CUSTOMER_SOURCE.MANUAL,
    riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
    riskReason: null,
    hasAccount: false,
    archivedAt: null,
    createdAt: '2026-01-02T03:00:00.000Z',
    updatedAt: '2026-01-02T03:00:00.000Z',
    completedRentalCount: 3,
    activeBookingCount: 1,
    noShowCount: 0,
    lateReturnCount: 0,
    lastRentalAt: '2026-08-01T02:00:00.000Z',
    totalBookingAmount: '5000000',
    paidAmount: '3000000',
    debtAmount: '2000000',
    recentBookings: [],
    ...overrides,
  };
}

async function renderScreen(permissions: Permission[], detail = customer()) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user(permissions));
  const spy = jest.spyOn(customersApi, 'detail').mockResolvedValue(detail);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <CustomerDetailScreen />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  // RNTL v14: `render` là async — spread thẳng cái Promise thì `view.findByText` không tồn tại.
  const view = await render(ui);
  return { ...view, detailSpy: spy };
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
});

describe('CustomerDetailScreen — quyền', () => {
  it('thiếu `customers.view`: hiện màn thiếu quyền và KHÔNG gọi API hồ sơ', async () => {
    const view = await renderScreen([PERMISSION.BOOKING_VIEW]);

    expect(await view.findByText('Bạn chưa có quyền xem sổ khách')).toBeTruthy();
    expect(view.detailSpy).not.toHaveBeenCalled();
  });

  it('có quyền: hiện danh tính và các khu của hồ sơ', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);

    // Tên hiện ở CẢ thanh trên lẫn thẻ danh tính — chủ ý, nên đếm chứ không đòi duy nhất.
    expect((await view.findAllByText('Nguyễn Văn An')).length).toBeGreaterThan(0);
    expect(view.getByText('Tổng quan')).toBeTruthy();
    expect(view.getByText('Ghi chú nội bộ')).toBeTruthy();
    expect(view.getByText('Giấy tờ')).toBeTruthy();
  });

  it('thiếu `finance.view`: ẩn HẲN ba ô tiền, không hiện số 0 giả', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findAllByText('Nguyễn Văn An');

    expect(view.queryByText('Tổng giá trị thuê')).toBeNull();
    expect(view.queryByText('Đã thu')).toBeNull();
    expect(view.queryByText('Còn nợ')).toBeNull();
    // Khu "Thu chi" cũng biến mất — tiền là quyền RIÊNG trong sổ khách.
    expect(view.queryByText('Thu chi')).toBeNull();
  });

  it('có `finance.view`: hiện đủ ba ô tiền và khu Thu chi', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.FINANCE_VIEW]);
    await view.findAllByText('Nguyễn Văn An');

    expect(view.getByText('Tổng giá trị thuê')).toBeTruthy();
    expect(view.getByText('Đã thu')).toBeTruthy();
    expect(view.getByText('Thu chi')).toBeTruthy();
  });

  it('thiếu `bookings.view`: KHÔNG có khu lịch sử thuê, và nói rõ vì sao hoạt động bị ẩn', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findAllByText('Nguyễn Văn An');

    expect(view.queryByText('Lịch sử thuê')).toBeNull();
    expect(view.getByText('Bạn chưa có quyền xem đơn thuê nên phần này được ẩn.')).toBeTruthy();
  });

  it('có `bookings.view`: khu lịch sử thuê xuất hiện', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.BOOKING_VIEW]);
    await view.findAllByText('Nguyễn Văn An');
    expect(view.getByText('Lịch sử thuê')).toBeTruthy();
  });

  it('không có quyền quản lý nào: hàng hành động KHÔNG được render', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findAllByText('Nguyễn Văn An');

    // Hàng hành động hiện ra chứ không nấp sau nút "…", nên vắng quyền là vắng hẳn viên nút —
    // không phải "có nút mở nhưng tấm trượt rỗng".
    expect(view.queryByRole('button', { name: new RegExp('Sửa hồ sơ$') })).toBeNull();
  });
});

describe('CustomerDetailScreen — mức rủi ro (CUS-03)', () => {
  it('`blocked`: cảnh báo nêu hệ quả và KHÔNG lập được đơn mới', async () => {
    const view = await renderScreen(
      [PERMISSION.CUSTOMER_VIEW, PERMISSION.BOOKING_CREATE],
      customer({
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
        riskReason: 'Trả xe muộn 2 lần',
      }),
    );
    await view.findAllByText('Nguyễn Văn An');

    expect(view.getByText('Gian hàng đang từ chối phục vụ khách này')).toBeTruthy();
    // Lý do là NỘI BỘ nhưng vẫn phải hiện cho người trong gian hàng.
    expect(view.getByText('Trả xe muộn 2 lần')).toBeTruthy();

    const create = await view.findByRole('button', { name: new RegExp('Tạo đơn thuê$') });
    expect(create.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(create);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('`watchlist`: chỉ NHẮC, không chặn tạo đơn', async () => {
    const view = await renderScreen(
      [PERMISSION.CUSTOMER_VIEW, PERMISSION.BOOKING_CREATE],
      customer({
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST,
        riskReason: 'Hay tới muộn',
      }),
    );
    await view.findAllByText('Nguyễn Văn An');

    expect(view.getByText('Khách được đánh dấu cần lưu ý')).toBeTruthy();
    expect(
      view.getByText('Đây chỉ là lời nhắc cho người trực — không thao tác nào bị chặn.'),
    ).toBeTruthy();

    const create = await view.findByRole('button', { name: new RegExp('Tạo đơn thuê$') });
    expect(create.props.accessibilityState.disabled).toBe(false);
  });

  it('chỉ `customers.manage_risk` mới thấy hành động đổi mức rủi ro', async () => {
    const withoutRisk = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.CUSTOMER_MANAGE]);
    await withoutRisk.findAllByText('Nguyễn Văn An');
    expect(withoutRisk.queryByRole('button', { name: new RegExp('Mức rủi ro$') })).toBeNull();
    // RNTL v14: `unmount` là async — không await thì cây thứ nhất còn sống và test kế bị nhiễu.
    await withoutRisk.unmount();

    const withRisk = await renderScreen([
      PERMISSION.CUSTOMER_VIEW,
      PERMISSION.CUSTOMER_MANAGE_RISK,
    ]);
    await withRisk.findAllByText('Nguyễn Văn An');
    expect(await withRisk.findByRole('button', { name: new RegExp('Mức rủi ro$') })).toBeTruthy();
  });
});

describe('CustomerDetailScreen — hồ sơ lưu trữ', () => {
  it('báo rõ đang lưu trữ, đổi hành động thành Khôi phục, và chặn sửa + tạo đơn', async () => {
    const view = await renderScreen(
      [PERMISSION.CUSTOMER_VIEW, PERMISSION.CUSTOMER_MANAGE, PERMISSION.BOOKING_CREATE],
      customer({ archivedAt: '2026-08-20T00:00:00.000Z' }),
    );
    await view.findAllByText('Nguyễn Văn An');

    expect(view.getByText('Hồ sơ đang lưu trữ')).toBeTruthy();

    expect(await view.findByRole('button', { name: new RegExp('Khôi phục$') })).toBeTruthy();
    expect(view.queryByRole('button', { name: new RegExp('Lưu trữ$') })).toBeNull();

    expect(
      view.getByRole('button', { name: new RegExp('Sửa hồ sơ$') }).props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(
      view.getByRole('button', { name: new RegExp('Tạo đơn thuê$') }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });
});

describe('CustomerDetailScreen — tạo đơn thuê', () => {
  it('đi tới LUỒNG ĐƠN ĐÃ CÓ kèm khách điền sẵn — không dựng form thứ hai', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.BOOKING_CREATE]);
    await view.findAllByText('Nguyễn Văn An');

    await fireEvent.press(await view.findByRole('button', { name: new RegExp('Tạo đơn thuê$') }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/manage/bookings/new',
        params: { customerName: 'Nguyễn Văn An', customerPhone: '0901234567' },
      }),
    );
  });

  it('thiếu `bookings.create`: KHÔNG có hành động tạo đơn', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.CUSTOMER_MANAGE]);
    await view.findAllByText('Nguyễn Văn An');

    expect(view.queryByRole('button', { name: new RegExp('Tạo đơn thuê$') })).toBeNull();
  });
});
