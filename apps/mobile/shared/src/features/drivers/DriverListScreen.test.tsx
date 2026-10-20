import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_LINK_STATUS,
  DRIVER_TYPE,
  PERMISSION,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { useAssignableDrivers } from '@/features/bookings/hooks/use-bookings';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { driversApi, type Driver } from './api';
import { DriverListScreen } from './DriverListScreen';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

const DRIVER_ID = '01JQZX0000000000000000000D';

function currentUser(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ xe',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Chủ xe Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      onboardingState: 'commission',
      branchScope: 'all',
      logoUrl: null,
      roleKey: 'shop_owner',
      // Tuyến hoa hồng, KHÔNG có cờ gói nào — tài xế vẫn dùng được (ADR 0063).
      features: [],
      planCode: null,
      planName: null,
      serviceFeePercent: null,
      billingMode: 'commission',
      planEndsAt: null,
      billingPhase: 'current',
      graceEndsAt: null,
      publicVehicleCount: 1,
    },
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  } as authApi.CurrentUser;
}

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: DRIVER_ID,
    name: 'Trần Văn B',
    phone: '0901234567',
    driverType: DRIVER_TYPE.STAFF,
    note: null,
    linkStatus: DRIVER_LINK_STATUS.ACTIVE,
    invitedAt: '2026-10-01T00:00:00.000Z',
    respondedAt: '2026-10-01T01:00:00.000Z',
    endedAt: null,
    endedByParty: null,
    account: { displayName: 'Trần Văn B', avatarUrl: null },
    licence: { state: DRIVER_LICENCE_STATE.NONE, classes: [], expiresOn: null },
    activeBookingCount: 0,
    ...overrides,
  } as Driver;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function renderScreen(permissions: Permission[], items: Driver[] = [driver()]) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions));
  const listSpy = jest.spyOn(driversApi, 'list').mockResolvedValue({
    items,
    meta: { page: 1, limit: 10, total: items.length, hasNext: false },
  });
  const inviteSpy = jest.spyOn(driversApi, 'invite').mockResolvedValue(driver());
  const suspendSpy = jest.spyOn(driversApi, 'suspend').mockResolvedValue(driver());
  const resumeSpy = jest.spyOn(driversApi, 'resume').mockResolvedValue(driver());
  const endSpy = jest.spyOn(driversApi, 'end').mockResolvedValue({});

  const queryClient = makeClient();
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <DriverListScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, listSpy, inviteSpy, suspendSpy, resumeSpy, endSpy };
}

beforeEach(() => jest.restoreAllMocks());

describe('DriverListScreen — quyền', () => {
  it('thiếu `drivers.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.BOOKING_VIEW]);

    expect(await view.findByText('Không có quyền truy cập')).toBeTruthy();
    expect(view.listSpy).not.toHaveBeenCalled();
  });

  it('chỉ `drivers.view`: xem được, không mời/sửa', async () => {
    const view = await renderScreen([PERMISSION.DRIVER_VIEW]);

    await view.findByText('Trần Văn B');
    expect(view.queryByLabelText('Mời tài xế')).toBeNull();
    expect(view.queryByText('Sửa')).toBeNull();
  });

  it('tuyến hoa hồng không cờ gói: thao tác vẫn mở (không sau cờ gói)', async () => {
    const view = await renderScreen([PERMISSION.DRIVER_VIEW, PERMISSION.DRIVER_MANAGE]);

    const invite = await view.findByLabelText('Mời tài xế');
    expect(invite.props.accessibilityState?.disabled).not.toBe(true);
  });
});

describe('DriverListScreen — mời và vòng đời liên kết', () => {
  const manage: Permission[] = [PERMISSION.DRIVER_VIEW, PERMISSION.DRIVER_MANAGE];

  it('thiếu tên/SĐT: chặn ở client, KHÔNG gọi API', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByLabelText('Mời tài xế'));
    await fireEvent.press(await view.findByRole('button', { name: 'Gửi lời mời' }));

    expect(await view.findByText('Nhập tên tài xế')).toBeTruthy();
    expect(view.getByText('Nhập số điện thoại')).toBeTruthy();
    expect(view.inviteSpy).not.toHaveBeenCalled();
  });

  it('mời đủ trường: gửi đúng payload', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByLabelText('Mời tài xế'));
    await fireEvent.changeText(await view.findByLabelText('Số điện thoại tài khoản'), '0912345678');
    await fireEvent.changeText(view.getByLabelText('Tên gọi'), 'Nguyễn Văn C');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi lời mời' }));

    await waitFor(() => expect(view.inviteSpy).toHaveBeenCalled());
    expect(view.inviteSpy.mock.calls[0]?.[0]).toEqual({
      phone: '0912345678',
      name: 'Nguyễn Văn C',
      driverType: DRIVER_TYPE.STAFF,
    });
  });

  it('TẠM KHOÁ phải xác nhận', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByText('Tạm khoá'));
    expect(
      await view.findByText(
        'Tạm khoá tài xế này? Liên kết vẫn giữ, nhưng không gán được vào chuyến mới.',
      ),
    ).toBeTruthy();
    expect(view.suspendSpy).not.toHaveBeenCalled();

    const buttons = view.getAllByRole('button', { name: 'Tạm khoá' });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(view.suspendSpy).toHaveBeenCalledWith(DRIVER_ID));
  });

  it('MỞ KHOÁ thì không hỏi', async () => {
    const view = await renderScreen(manage, [driver({ linkStatus: DRIVER_LINK_STATUS.SUSPENDED })]);

    await fireEvent.press(await view.findByText('Mở khoá'));
    await waitFor(() => expect(view.resumeSpy).toHaveBeenCalledWith(DRIVER_ID));
  });

  it('lời mời đang chờ: "Thu hồi lời mời" (không phải "Kết thúc liên kết")', async () => {
    const view = await renderScreen(manage, [driver({ linkStatus: DRIVER_LINK_STATUS.INVITED })]);

    await fireEvent.press(await view.findByText('Thu hồi lời mời'));
    expect(await view.findByText('Thu hồi lời mời này?')).toBeTruthy();
    expect(view.queryByText('Kết thúc liên kết')).toBeNull();
  });

  it('liên kết đã kết thúc: không còn thao tác nào', async () => {
    const view = await renderScreen(manage, [driver({ linkStatus: DRIVER_LINK_STATUS.ENDED })]);

    await view.findByText('Trần Văn B');
    expect(view.queryByText('Sửa')).toBeNull();
    expect(view.queryByText('Kết thúc liên kết')).toBeNull();
  });
});

describe('DriverListScreen — bằng lái', () => {
  it('hiện TRẠNG THÁI bằng lái của tài khoản, kèm hạng + hạn khi đã xác thực', async () => {
    const view = await renderScreen(
      [PERMISSION.DRIVER_VIEW],
      [
        driver({
          licence: {
            state: DRIVER_LICENCE_STATE.VERIFIED,
            classes: ['B'],
            expiresOn: '2030-01-01',
          },
        }),
      ],
    );

    expect(await view.findByText('Bằng lái đã xác thực')).toBeTruthy();
    expect(view.getByText(/Hạng B/)).toBeTruthy();
  });
});

describe('Điểm nối Booking — bộ chọn gán tài xế', () => {
  it('khả dụng do SERVER chấm — bộ chọn đọc `assignable`, không đọc `list`', async () => {
    jest
      .spyOn(authApi, 'fetchCurrentUser')
      .mockResolvedValue(currentUser([PERMISSION.DRIVER_VIEW, PERMISSION.BOOKING_UPDATE]));
    const spy = jest.spyOn(driversApi, 'assignable').mockResolvedValue([
      {
        id: DRIVER_ID,
        name: 'Trần Văn B',
        phone: '0901234567',
        busy: false,
        licenceState: DRIVER_LICENCE_STATE.VERIFIED,
      },
    ]);
    const listSpy = jest.spyOn(driversApi, 'list');

    const client = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(
        <ReduxProvider store={store}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </ReduxProvider>,
      );

    const { result } = await renderHook(
      () =>
        useAssignableDrivers(
          { pickupAt: '2026-09-10T02:00:00.000Z', returnAt: '2026-09-12T02:00:00.000Z' },
          true,
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(spy).toHaveBeenCalled();
    expect(listSpy).not.toHaveBeenCalled();
  });
});
