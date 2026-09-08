import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
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
import { customersApi, type TenantCustomer, type TenantCustomerSummary } from './api';
import { CustomerListScreen } from './CustomerListScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  // `useNavigateOnce` cần `useNavigation().isFocused()` — thiếu nó là màn nổ giữa lúc render.
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

/** Thanh trên của khu quản lý cần context Drawer — không thuộc phạm vi test màn danh sách. */
jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

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

function row(overrides: Partial<TenantCustomer> = {}): TenantCustomer {
  return {
    id: '01JQZX0000000000000000000C',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    email: null,
    riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
    source: TENANT_CUSTOMER_SOURCE.MANUAL,
    hasAccount: false,
    archivedAt: null,
    completedRentalCount: 3,
    activeBookingCount: 0,
    noShowCount: 0,
    lateReturnCount: 0,
    lastRentalAt: '2026-08-01T02:00:00.000Z',
    totalBookingAmount: '5000000',
    paidAmount: '3000000',
    debtAmount: '2000000',
    ...overrides,
  };
}

const SUMMARY: TenantCustomerSummary = {
  activeCustomers: 12,
  returningCustomers: 4,
  watchlistCustomers: 1,
  blockedCustomers: 0,
  archivedCustomers: 2,
  totalDebt: '2000000',
  debtCustomers: 1,
};

async function renderScreen(
  permissions: Permission[],
  items: TenantCustomer[] = [row()],
  total = items.length,
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user(permissions));
  const listSpy = jest.spyOn(customersApi, 'list').mockResolvedValue({
    items,
    meta: { page: 1, limit: 10, total, hasNext: total > 10 },
  });
  const summarySpy = jest.spyOn(customersApi, 'summary').mockResolvedValue(SUMMARY);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <CustomerListScreen />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  // RNTL v14: `render` là async — spread thẳng cái Promise thì `view.findByText` không tồn tại.
  const view = await render(ui);
  return { ...view, listSpy, summarySpy };
}

beforeEach(() => {
  mockPush.mockClear();
});

describe('CustomerListScreen — quyền', () => {
  it('thiếu `customers.view`: màn thiếu quyền, KHÔNG gọi API danh sách hay chỉ số', async () => {
    const view = await renderScreen([PERMISSION.BOOKING_VIEW]);

    expect(await view.findByText('Bạn chưa có quyền xem sổ khách')).toBeTruthy();
    expect(view.listSpy).not.toHaveBeenCalled();
    expect(view.summarySpy).not.toHaveBeenCalled();
  });

  it('thiếu `customers.manage`: KHÔNG có nút thêm khách', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findByText('Nguyễn Văn An');
    expect(view.queryByLabelText('Thêm khách hàng')).toBeNull();
  });

  it('có `customers.manage`: nút thêm khách xuất hiện', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.CUSTOMER_MANAGE]);
    await view.findByText('Nguyễn Văn An');
    expect(view.getByLabelText('Thêm khách hàng')).toBeTruthy();
  });
});

describe('CustomerListScreen — gate tài chính', () => {
  it('thiếu `finance.view`: thẻ khách KHÔNG có ô tiền nào', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findByText('Nguyễn Văn An');

    expect(view.queryByText('Còn nợ')).toBeNull();
  });

  it('có `finance.view`: thẻ khách hiện công nợ', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.FINANCE_VIEW]);
    await view.findByText('Nguyễn Văn An');

    expect(view.getAllByText('Còn nợ').length).toBeGreaterThan(0);
  });

  /*
   * Thẻ mang ĐÚNG bộ dữ kiện của thẻ mobile bên web. Hai thứ dưới đây là cột của BẢNG desktop —
   * nhét vào thẻ là mỗi dòng cao thêm hai hàng cho hai con số không ai quét khi lướt.
   */
  it('thẻ KHÔNG mang "số đơn đang chạy" hay "tổng giá trị" — đó là cột của bảng desktop', async () => {
    const view = await renderScreen(
      [PERMISSION.CUSTOMER_VIEW, PERMISSION.FINANCE_VIEW],
      [row({ activeBookingCount: 2 })],
    );
    await view.findByText('Nguyễn Văn An');

    expect(view.queryByText(/đơn đang chạy/)).toBeNull();
    expect(view.queryByText(/Tổng giá trị/)).toBeNull();
  });

  it('thiếu `finance.view`: tấm lọc KHÔNG bày nhóm/sắp xếp theo tiền', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findByText('Nguyễn Văn An');

    await fireEvent.press(view.getByLabelText('Mở bộ lọc'));

    // Lựa chọn bị backend từ chối 403 thì không được bày ra — bày là bẫy người dùng.
    await waitFor(() => expect(view.queryByText('Nhóm khách')).toBeTruthy());
    expect(view.queryByText('Còn nợ nhiều nhất')).toBeNull();
    expect(view.queryByText('Tổng giá trị thuê cao nhất')).toBeNull();
  });

  it('có `finance.view`: hai kiểu sắp xếp theo tiền xuất hiện', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.FINANCE_VIEW]);
    await view.findByText('Nguyễn Văn An');

    await fireEvent.press(view.getByLabelText('Mở bộ lọc'));

    expect(await view.findByText('Còn nợ nhiều nhất')).toBeTruthy();
    expect(view.getByText('Tổng giá trị thuê cao nhất')).toBeTruthy();
  });
});

describe('CustomerListScreen — trạng thái danh sách', () => {
  it('sổ chưa có khách: mời thêm khách đầu tiên (khác hẳn "không khớp bộ lọc")', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.CUSTOMER_MANAGE], []);

    expect(await view.findByText('Sổ khách còn trống')).toBeTruthy();
    expect(view.queryByText('Không có khách nào khớp bộ lọc')).toBeNull();
  });

  it('mở hồ sơ: điều hướng tới route chi tiết chia sẻ được', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await fireEvent.press(await view.findByLabelText('Nguyễn Văn An'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/manage/customers/[id]',
        params: { id: '01JQZX0000000000000000000C' },
      }),
    );
  });

  it('lọc/sắp xếp chạy ở SERVER — đổi nhóm là một request mới kèm đúng tham số', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW]);
    await view.findByText('Nguyễn Văn An');

    expect(view.listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'last_rental', page: 1, limit: 10 }),
    );
    // `all` là sentinel của giao diện — KHÔNG được gửi xuống API.
    expect(view.listSpy.mock.calls[0]?.[0]).not.toHaveProperty('relationship');
  });

  /*
   * Phân trang, KHÔNG cuộn vô hạn — và `meta` phải đi lên `ManageListShell`, vì đó là thứ duy
   * nhất cho nó biết danh sách có gì để cuộn. Thiếu `meta` thì khối đầu trang không bao giờ thu
   * lại, tức bộ lọc dính cứng trên màn suốt lúc người dùng đang đọc danh sách.
   */
  it('hiện thanh phân trang khi tổng vượt một trang', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW], [row()], 45);
    await view.findByText('Nguyễn Văn An');

    expect(view.getByLabelText('Trang sau')).toBeTruthy();
    expect(view.getByText('45 khách')).toBeTruthy();
  });

  it('chỉ một trang: không dựng thanh phân trang thừa', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW], [row()], 1);
    await view.findByText('Nguyễn Văn An');

    expect(view.queryByLabelText('Trang sau')).toBeNull();
  });
});

describe('CustomerListScreen — kéo xuống làm mới', () => {
  /*
   * Dải chỉ số là một truy vấn KHÁC danh sách. Buộc cú kéo vào `query.refetch()` của riêng danh
   * sách — thứ dễ viết nhất — thì bốn con số đầu trang đứng yên ở giá trị lúc mở màn, mà đó đúng
   * là thứ người ta kéo xuống để xem có đổi không.
   */
  it('làm mới CẢ danh sách lẫn dải chỉ số, không riêng danh sách', async () => {
    const view = await renderScreen([PERMISSION.CUSTOMER_VIEW, PERMISSION.FINANCE_VIEW]);
    await view.findByText('Nguyễn Văn An');

    expect(view.listSpy).toHaveBeenCalledTimes(1);
    expect(view.summarySpy).toHaveBeenCalledTimes(1);

    // `RefreshControl` đi vào `ScrollView` dưới dạng PROP chứ không phải con, nên không có node
    // nào để `fireEvent` nhắm vào — lấy thẳng `onRefresh` từ prop đó.
    const [scroller] = view.root!.queryAll((node) => node.props.refreshControl !== undefined);
    await act(async () => {
      scroller!.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(view.listSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.summarySpy).toHaveBeenCalledTimes(2));
  });
});
