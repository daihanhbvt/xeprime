import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import { getApiClient } from '@xeprime/api-client';
import { BRANCH_STATUS, PERMISSION, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { calendarApi } from '@/features/calendar/api';
import { vehiclesApi } from '@/features/vehicles/api';
import { useFleetSummary, useInfiniteVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { useManageNavBadges } from '@/features/shell/use-manage-nav-badges';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { branchesApi, type Branch, type BranchList } from './api';
import { isBranchAwareRoute, withBranchParam, withBranchReturn } from './branch-link';
import { BranchFilterField } from './components/BranchFilterField';
import { useBranchFilter, type BranchFilterOptions } from './hooks/use-branch-filter';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  usePathname: () => '/manage',
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/features/badges/hooks/use-badges', () => ({
  useBadges: jest.fn(() => ({ chatCustomer: 0, chatShop: 0, notificationsUnread: 0 })),
}));

jest.mock('@/features/badges/BadgeRealtimeProvider', () => ({
  useBadgeRealtime: jest.fn(() => ({
    counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 },
    live: false,
  })),
}));

function currentUser(permissions: Permission[], withTenant = true): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: withTenant
      ? {
          id: '01JQZX0000000000000000000T',
          name: 'Gian hàng Đà Nẵng',
          slug: 'da-nang',
          status: 'active',
          onboardingState: 'commission',
          branchScope: 'all',
          logoUrl: null,
          roleKey: 'shop_owner',
          features: [],
          planCode: null,
          planName: null,
          serviceFeePercent: null,
          billingMode: 'package',
          planEndsAt: null,
          billingPhase: 'current',
          graceEndsAt: null,
          publicVehicleCount: 1,
        }
      : null,
    openRenterTripCount: 0,
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

const SECOND = branch({
  id: '01JQZX0000000000000000000C',
  code: 'CN02',
  name: 'Chi nhánh Sơn Trà',
  isDefault: false,
});

function list(items: Branch[], activeCount = items.length): BranchList {
  return { items, total: items.length, activeCount, needsReviewCount: 0 };
}

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

function renderFilter(options: BranchFilterOptions) {
  const client = makeClient();
  return renderHook((props: BranchFilterOptions) => useBranchFilter(props), {
    initialProps: options,
    wrapper: ({ children }) => wrap(children, client),
  });
}

const EMPTY_PAGE = { items: [], meta: { page: 1, limit: 10, total: 0, hasNext: false } };

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('useBranchFilter — hiện / khoá', () => {
  it('thiếu `branches.view`: không gọi API, không hiện', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.TENANT_VIEW]));
    const listSpy = jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    const { result } = await renderFilter({});
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listSpy).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
  });

  it('có quyền nhưng KHÔNG đứng trong gian hàng: không gọi API', async () => {
    jest
      .spyOn(authApi, 'fetchCurrentUser')
      .mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW], false));
    const listSpy = jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    await renderFilter({});
    await act(async () => {});
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('chỉ hỏi chi nhánh ĐANG HOẠT ĐỘNG', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    const listSpy = jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    await renderFilter({});
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    expect(listSpy.mock.calls[0]?.[0]).toMatchObject({ status: BRANCH_STATUS.ACTIVE });
  });

  it('gian hàng MỘT chi nhánh: ẩn', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch()]));

    const { result } = await renderFilter({});
    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(result.current.visible).toBe(false);
    expect(result.current.locked).toBe(false);
  });

  it('từ hai chi nhánh: hiện, có nhãn mặc định', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));

    const { result } = await renderFilter({});
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.locked).toBe(false);
    expect(result.current.options.map((o) => o.label)).toEqual([
      'Chi nhánh Hải Châu · Đà Nẵng (mặc định)',
      'Chi nhánh Sơn Trà · Đà Nẵng',
    ]);
    expect(result.current.currentLabel).toBe('Tất cả chi nhánh');
  });

  it('bị giới hạn còn MỘT chi nhánh trong gian hàng nhiều chi nhánh: hiện, KHOÁ, mang tên chi nhánh', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([SECOND], 3));

    const { result } = await renderFilter({});
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.locked).toBe(true);
    expect(result.current.currentLabel).toBe('Chi nhánh Sơn Trà · Đà Nẵng');
  });
});

describe('useBranchFilter — nhả giá trị không dùng được', () => {
  it('chi nhánh không còn trong danh sách ⇒ nhả về "Tất cả" sau khi tải XONG', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));
    const onChange = jest.fn();

    await renderFilter({ value: '01JQZX00000000000000000XXX', onChange });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });

  it('giá trị hợp lệ: KHÔNG nhả', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));
    const onChange = jest.fn();

    const { result } = await renderFilter({ value: SECOND.id, onChange });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.selectedLabel).toBe('Chi nhánh Sơn Trà · Đà Nẵng');
  });

  it('đang TẢI: không nhả', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockReturnValue(new Promise<BranchList>(() => {}));
    const onChange = jest.fn();

    const { result } = await renderFilter({ value: SECOND.id, onChange });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('LỖI mạng: không nhả', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    const listSpy = jest.spyOn(branchesApi, 'list').mockRejectedValue(new Error('500'));
    const onChange = jest.fn();

    const { result } = await renderFilter({ value: SECOND.id, onChange });
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('query bị TẮT (thiếu quyền) mà còn mang tham số ⇒ nhả', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.TENANT_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));
    const onChange = jest.fn();

    await renderFilter({ value: SECOND.id, onChange });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });
});

describe('BranchFilterField', () => {
  function Harness({ onChange }: { onChange: (v: string | undefined) => void }) {
    const filter = useBranchFilter({ value: undefined, onChange });
    return <BranchFilterField filter={filter} value={undefined} />;
  }

  it('chọn một chi nhánh gọi `onChange` với id của nó', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([PERMISSION.BRANCH_VIEW]));
    jest.spyOn(branchesApi, 'list').mockResolvedValue(list([branch(), SECOND]));
    const onChange = jest.fn();

    const view = await render(wrap(<Harness onChange={onChange} />, makeClient()));
    await fireEvent.press(await view.findByLabelText('Chi nhánh: Tất cả chi nhánh'));
    await fireEvent.press(await view.findByText('Chi nhánh Sơn Trà · Đà Nẵng'));

    expect(onChange).toHaveBeenCalledWith(SECOND.id);
  });
});

describe('Dữ liệu đi theo chi nhánh của MÀN', () => {
  it('đội xe: `branchId` trong bộ lọc đi vào request', async () => {
    const spy = jest.spyOn(vehiclesApi, 'list').mockResolvedValue(EMPTY_PAGE);
    const client = makeClient();
    await renderHook(() => useInfiniteVehicles({ branchId: SECOND.id }), {
      wrapper: ({ children }) => wrap(children, client),
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ branchId: SECOND.id });
  });

  it('dải chỉ số đội xe đi CÙNG chi nhánh với danh sách', async () => {
    const spy = jest
      .spyOn(vehiclesApi, 'fleetSummary')
      .mockResolvedValue({ total: 0, available: 0, renting: 0 } as never);
    const client = makeClient();
    await renderHook(() => useFleetSummary(true, SECOND.id), {
      wrapper: ({ children }) => wrap(children, client),
    });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ branchId: SECOND.id }));
  });

  it('huy hiệu "chờ duyệt" đếm TOÀN gian hàng — không mang `branchId`', async () => {
    jest
      .spyOn(authApi, 'fetchCurrentUser')
      .mockResolvedValue(currentUser([PERMISSION.BOOKING_REQUEST_VIEW]));
    const spy = jest.spyOn(bookingRequestsApi, 'list').mockResolvedValue({
      ...EMPTY_PAGE,
      meta: { ...EMPTY_PAGE.meta, statusCounts: [] },
    } as never);
    const client = makeClient();
    await renderHook(() => useManageNavBadges(), {
      wrapper: ({ children }) => wrap(children, client),
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[0]).not.toHaveProperty('branchId');
  });

  it('gỡ lô khoá hàng loạt mang `?branchId=` — chỉ gỡ phần của chi nhánh đang xem', async () => {
    const del = jest.spyOn(getApiClient(), 'delete').mockResolvedValue({ released: 1 } as never);
    await calendarApi.releaseBulkBlockBatch('BATCH1', SECOND.id);
    expect(del).toHaveBeenCalledWith(`/calendar/bulk-day/blocks/BATCH1?branchId=${SECOND.id}`);
    await calendarApi.releaseBulkBlockBatch('BATCH1');
    expect(del).toHaveBeenLastCalledWith('/calendar/bulk-day/blocks/BATCH1');
  });
});

/** Customer app không có route `/manage/**` trong bảng typed route — test dùng chuỗi trần. */
const h = (path: string) => path as Href;

describe('branch-link', () => {
  it('chỉ màn LỌC ĐƯỢC mang chi nhánh', () => {
    expect(isBranchAwareRoute('/manage/vehicles?x=1')).toBe(true);
    expect(isBranchAwareRoute('/manage/customers')).toBe(false);
    expect(withBranchParam(h('/manage/vehicles'), 'B1')).toBe('/manage/vehicles?branchId=B1');
    expect(withBranchParam(h('/manage/customers'), 'B1')).toBe('/manage/customers');
    expect(withBranchParam(h('/manage/vehicles'), null)).toBe('/manage/vehicles');
    expect(withBranchParam(h('/manage/vehicles?branchId=B2'), 'B1')).toBe(
      '/manage/vehicles?branchId=B2',
    );
    expect(
      withBranchParam({ pathname: '/manage/receipts', params: { status: 'approved' } } as unknown as Href, 'B1'),
    ).toEqual({ pathname: '/manage/receipts', params: { status: 'approved', branchId: 'B1' } });
  });

  it('đường về của màn chi tiết / form mang chi nhánh bất kể đích', () => {
    expect(withBranchReturn(h('/manage/vehicles/new'), 'B1')).toBe('/manage/vehicles/new?branchId=B1');
    expect(withBranchReturn(h('/manage/vehicles/new'), undefined)).toBe('/manage/vehicles/new');
  });
});
