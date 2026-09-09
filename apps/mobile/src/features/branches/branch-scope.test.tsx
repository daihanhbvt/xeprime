import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BRANCH_STATUS, PERMISSION, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { bookingsApi } from '@/features/bookings/api';
import { vehiclesApi } from '@/features/vehicles/api';
import { useInfiniteVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { useBookingsPage } from '@/features/bookings/hooks/use-bookings';
import { useBookingRequestsPage } from '@/features/booking-requests/hooks/use-booking-requests';
import { useManageNavBadges } from '@/features/shell/use-manage-nav-badges';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { branchesApi, type Branch, type BranchList } from './api';
import { branchScopeReset } from './branch-scope.slice';
import { BranchScopePill } from './components/BranchScopePill';
import { useBranchScope } from './hooks/use-branch-scope';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/manage',
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

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: '01JQZX0000000000000000000B',
    code: 'CN01',
    name: 'Chi nhánh Hải Châu',
    provinceCode: '48',
    provinceName: 'Đà Nẵng',
    address: '12 Bạch Đằng',
    phone: '0901234567',
    latitude: null,
    longitude: null,
    isDefault: true,
    status: BRANCH_STATUS.ACTIVE,
    vehicleCount: 4,
    needsLocationReview: false,
    legacyProvinceValue: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function list(items: Branch[]): BranchList {
  return {
    items,
    total: items.length,
    activeCount: items.filter((b) => b.status === BRANCH_STATUS.ACTIVE).length,
    needsReviewCount: items.filter((b) => b.needsLocationReview).length,
  };
}

const SECOND = branch({
  id: '01JQZX0000000000000000000C',
  code: 'CN02',
  name: 'Chi nhánh Sơn Trà',
  isDefault: false,
  vehicleCount: 2,
});

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrap(children: ReactNode, client: QueryClient) {
  return withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ReduxProvider>,
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  // Store là SINGLETON — scope của test trước sống sang test sau nếu không dọn.
  store.dispatch(branchScopeReset());
});

describe('BranchScopePill — điều kiện hiện', () => {
  it('thiếu `branches.view`: KHÔNG gọi API và KHÔNG render gì', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.TENANT_VIEW]));
    const listSpy = jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch()]));

    const view = await render(wrap(<BranchScopePill />, makeClient()));

    await waitFor(() => expect(listSpy).not.toHaveBeenCalled());
    // `withIntl` dựng sẵn provider + viewport toast, nên cây không rỗng — thứ phải vắng là CHÍNH thanh.
    expect(view.queryByText(/Chi nhánh/)).toBeNull();
    expect(view.queryByLabelText(/Chi nhánh đang xem/)).toBeNull();
  });

  it('gian hàng chưa có chi nhánh nào: không render', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([]));

    const view = await render(wrap(<BranchScopePill />, makeClient()));

    await waitFor(() => expect(view.queryByText(/Chi nhánh/)).toBeNull());
    expect(view.queryByLabelText(/Chi nhánh đang xem/)).toBeNull();
  });

  it('đúng MỘT chi nhánh: hiện tên + tỉnh làm ngữ cảnh, KHÔNG dựng dropdown chết', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch()]));

    const view = await render(wrap(<BranchScopePill />, makeClient()));

    expect(await view.findByText('Chi nhánh Hải Châu · Đà Nẵng')).toBeTruthy();
    expect(view.queryByLabelText(/Chi nhánh đang xem/)).toBeNull();
  });

  it('từ HAI chi nhánh: mở được danh sách, có "Tất cả" và nhãn mặc định', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    const view = await render(wrap(<BranchScopePill />, makeClient()));

    const trigger = await view.findByLabelText('Chi nhánh đang xem: Tất cả chi nhánh');
    await fireEvent.press(trigger);

    expect(await view.findByText('Chi nhánh Hải Châu · Đà Nẵng (mặc định)')).toBeTruthy();
    expect(view.getByText('Chi nhánh Sơn Trà · Đà Nẵng')).toBeTruthy();
    expect(view.getAllByText('Tất cả chi nhánh').length).toBeGreaterThan(0);
  });

  it('chọn một chi nhánh: nhãn trên viên đổi theo', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    const view = await render(wrap(<BranchScopePill />, makeClient()));
    await fireEvent.press(await view.findByLabelText('Chi nhánh đang xem: Tất cả chi nhánh'));
    await fireEvent.press(await view.findByText('Chi nhánh Sơn Trà · Đà Nẵng'));

    expect(
      await view.findByLabelText('Chi nhánh đang xem: Chi nhánh Sơn Trà · Đà Nẵng'),
    ).toBeTruthy();
  });
});

describe('useBranchScope — tự dọn lựa chọn', () => {
  it('chi nhánh đang chọn biến khỏi danh sách hợp lệ ⇒ quay về "Tất cả"', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    const listSpy = jest
      .spyOn(branchesApi, 'list')
      .mockResolvedValue(list([branch(), SECOND]));

    const client = makeClient();
    const { result } = await renderHook(() => useBranchScope(), {
      wrapper: ({ children }) => wrap(children, client),
    });

    await waitFor(() => expect(result.current.options.length).toBe(2));
    await act(async () => result.current.select(SECOND.id));
    await waitFor(() => expect(result.current.branchId).toBe(SECOND.id));

    // Chi nhánh vừa bị NGỪNG hoạt động: `?status=active` không trả nó nữa.
    listSpy.mockResolvedValue(list([branch()]));
    await act(async () => {
      await client.invalidateQueries();
    });

    await waitFor(() => expect(result.current.branchId).toBeNull());
  });

  it('đang TẢI thì không xoá lựa chọn — nếu không, mỗi lần điều hướng là mất scope', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    let resolveList: ((value: BranchList) => void) | null = null;
    jest.spyOn(branchesApi, 'list').mockReturnValue(
      new Promise<BranchList>((resolve) => {
        resolveList = resolve;
      }),
    );

    const client = makeClient();
    const { result } = await renderHook(() => useBranchScope(), {
      wrapper: ({ children }) => wrap(children, client),
    });

    await act(async () => result.current.select(SECOND.id));
    // Danh sách CHƯA về: lựa chọn phải còn nguyên trong store.
    expect(store.getState().branchScope.branchId).toBe(SECOND.id);

    await act(async () => {
      resolveList?.(list([branch(), SECOND]));
    });
    await waitFor(() => expect(result.current.branchId).toBe(SECOND.id));
  });

  it('kết thúc phiên: `branchScopeReset` quên chi nhánh của gian hàng cũ', async () => {
    store.dispatch({ type: 'branchScope/branchSelected', payload: SECOND.id });
    expect(store.getState().branchScope.branchId).toBe(SECOND.id);

    store.dispatch(branchScopeReset());
    expect(store.getState().branchScope.branchId).toBeNull();
  });
});

describe('Scope chi nhánh ghép vào các màn CÓ nghĩa theo chi nhánh', () => {
  async function selectBranch(client: QueryClient) {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(
      currentUser([
        PERMISSION.BRANCH_VIEW,
        PERMISSION.VEHICLE_VIEW,
        PERMISSION.BOOKING_VIEW,
        PERMISSION.BOOKING_REQUEST_VIEW,
      ]),
    );
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    const { result } = await renderHook(() => useBranchScope(), {
      wrapper: ({ children }) => wrap(children, client),
    });
    await waitFor(() => expect(result.current.options.length).toBe(2));
    await act(async () => result.current.select(SECOND.id));
    await waitFor(() => expect(result.current.branchId).toBe(SECOND.id));
  }

  it('đội xe: `branchId` đi vào request', async () => {
    const client = makeClient();
    await selectBranch(client);

    const spy = jest
      .spyOn(vehiclesApi, 'list')
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 10, total: 0, hasNext: false } });

    await renderHook(() => useInfiniteVehicles({}), {
      wrapper: ({ children }) => wrap(children, client),
    });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ branchId: SECOND.id });
  });

  it('đơn thuê: `branchId` đi vào request', async () => {
    const client = makeClient();
    await selectBranch(client);

    const spy = jest
      .spyOn(bookingsApi, 'list')
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 10, total: 0, hasNext: false } });

    await renderHook(() => useBookingsPage({ page: 1 }), {
      wrapper: ({ children }) => wrap(children, client),
    });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ branchId: SECOND.id });
  });

  it('yêu cầu thuê VÀ huy hiệu "chờ duyệt" cùng đọc một scope', async () => {
    const client = makeClient();
    await selectBranch(client);

    const spy = jest.spyOn(bookingRequestsApi, 'list').mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 10, total: 0, hasNext: false, statusCounts: [] },
    });

    await renderHook(() => useBookingRequestsPage({ page: 1 }), {
      wrapper: ({ children }) => wrap(children, client),
    });
    await renderHook(() => useManageNavBadges(), {
      wrapper: ({ children }) => wrap(children, client),
    });

    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2));
    for (const call of spy.mock.calls) {
      expect(call[0]).toMatchObject({ branchId: SECOND.id });
    }
  });
});
