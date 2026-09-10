import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  DRIVER_STATUS,
  DRIVER_TYPE,
  FEATURE_STATE,
  type FeatureState,
  PERMISSION,
  PLAN_FEATURE,
  type PlanFeature,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { useAssignableDrivers } from '@/features/bookings/hooks/use-bookings';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { driversApi, type Driver } from './api';
import { DriverListScreen } from './DriverListScreen';

/** Cờ NĂNG LỰC THEO GÓI đi kèm phiên — union, không phải chuỗi trần (ADR 0005). */
type TenantFeature = { feature: PlanFeature; state: FeatureState };

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function currentUser(
  permissions: Permission[],
  features: TenantFeature[] = [],
): authApi.CurrentUser {
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
      features,
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: '01JQZX0000000000000000000D',
    name: 'Trần Văn B',
    phone: '0901234567',
    driverType: DRIVER_TYPE.STAFF,
    status: DRIVER_STATUS.ACTIVE,
    licenseNo: 'B2-123456',
    licenseExpiresAt: null,
    idNo: null,
    note: null,
    activeBookingCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function renderScreen(
  permissions: Permission[],
  items: Driver[] = [driver()],
  features: TenantFeature[] = [],
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions, features));
  const listSpy = jest.spyOn(driversApi, 'list').mockResolvedValue({
    items,
    meta: { page: 1, limit: 10, total: items.length, hasNext: false },
  });
  const createSpy = jest.spyOn(driversApi, 'create').mockResolvedValue(driver());
  const updateSpy = jest.spyOn(driversApi, 'update').mockResolvedValue(driver());
  const removeSpy = jest.spyOn(driversApi, 'remove').mockResolvedValue({ ok: true });

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
  return { ...view, listSpy, createSpy, updateSpy, removeSpy, queryClient };
}

beforeEach(() => jest.restoreAllMocks());

describe('DriverListScreen — quyền và gói', () => {
  it('thiếu `drivers.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.BOOKING_VIEW]);

    expect(await view.findByText('Không có quyền truy cập')).toBeTruthy();
    expect(view.listSpy).not.toHaveBeenCalled();
  });

  it('chỉ `drivers.view`: xem được, không thêm/sửa/xoá', async () => {
    const view = await renderScreen([PERMISSION.DRIVER_VIEW]);

    await view.findByText('Trần Văn B');
    expect(view.queryByLabelText('Thêm tài xế')).toBeNull();
    expect(view.queryByText('Sửa')).toBeNull();
  });

  it('gói hết hạn (`read_only`): VẪN xem lại hồ sơ, chỉ không thêm/sửa', async () => {
    const view = await renderScreen(
      [PERMISSION.DRIVER_VIEW, PERMISSION.DRIVER_MANAGE],
      [driver()],
      [{ feature: PLAN_FEATURE.DRIVERS, state: FEATURE_STATE.READ_ONLY }],
    );

    expect(await view.findByText('Trần Văn B')).toBeTruthy();
    /*
     * Nút Thêm và thao tác trên thẻ vẫn HIỆN (đúng quyền `drivers.manage`) nhưng bị khoá — ẩn
     * hẳn sẽ trông như thiếu quyền, trong khi lý do thật là gói hết hạn (ADR 0027 điều 3).
     */
    const addButton = await view.findByLabelText('Thêm tài xế');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);
    const editAction = await view.findByLabelText('Sửa');
    expect(editAction.props.accessibilityState?.disabled).toBe(true);
    expect(await view.findByText(/Gói đã hết hạn/)).toBeTruthy();
  });
});

describe('DriverListScreen — CRUD và vòng đời', () => {
  const manage: Permission[] = [PERMISSION.DRIVER_VIEW, PERMISSION.DRIVER_MANAGE];

  it('thiếu tên/SĐT: chặn ở client, KHÔNG gọi API', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByLabelText('Thêm tài xế'));
    await fireEvent.press(await view.findByRole('button', { name: 'Thêm' }));

    expect(await view.findByText('Nhập tên tài xế')).toBeTruthy();
    expect(view.getByText('Nhập số điện thoại')).toBeTruthy();
    expect(view.createSpy).not.toHaveBeenCalled();
  });

  it('SĐT sai định dạng: chặn bằng ĐÚNG luật dùng chung với web', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByLabelText('Thêm tài xế'));
    await fireEvent.changeText(await view.findByLabelText('Họ và tên'), 'Nguyễn Văn C');
    await fireEvent.changeText(view.getByLabelText('Số điện thoại'), '12345');
    await fireEvent.press(view.getByRole('button', { name: 'Thêm' }));

    expect(await view.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    expect(view.createSpy).not.toHaveBeenCalled();
  });

  it('thêm tài xế đủ trường: gửi đúng payload', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByLabelText('Thêm tài xế'));
    await fireEvent.changeText(await view.findByLabelText('Họ và tên'), 'Nguyễn Văn C');
    await fireEvent.changeText(view.getByLabelText('Số điện thoại'), '0912345678');
    await fireEvent.press(view.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(view.createSpy).toHaveBeenCalled());
    expect(view.createSpy.mock.calls[0]?.[0]).toMatchObject({
      name: 'Nguyễn Văn C',
      phone: '0912345678',
      driverType: DRIVER_TYPE.STAFF,
    });
  });

  it('NGỪNG hoạt động phải xác nhận (không gán vào đơn mới được nữa)', async () => {
    const view = await renderScreen(manage);

    await fireEvent.press(await view.findByText('Ngừng hoạt động'));

    expect(
      await view.findByText('Ngừng hoạt động tài xế này? Sẽ không gán được vào đơn mới.'),
    ).toBeTruthy();
    expect(view.updateSpy).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Ngừng' }));
    await waitFor(() =>
      expect(view.updateSpy).toHaveBeenCalledWith('01JQZX0000000000000000000D', {
        status: DRIVER_STATUS.INACTIVE,
      }),
    );
  });

  it('BẬT LẠI thì không hỏi — bật lại không lấy mất gì của ai', async () => {
    const view = await renderScreen(manage, [driver({ status: DRIVER_STATUS.INACTIVE })]);

    await fireEvent.press(await view.findByText('Bật lại'));

    await waitFor(() =>
      expect(view.updateSpy).toHaveBeenCalledWith('01JQZX0000000000000000000D', {
        status: DRIVER_STATUS.ACTIVE,
      }),
    );
  });
});

describe('DriverListScreen — hạn GPLX', () => {
  it('GPLX hết hạn: nói ra ngay trên thẻ', async () => {
    const view = await renderScreen(
      [PERMISSION.DRIVER_VIEW],
      [driver({ licenseExpiresAt: '2020-01-01' })],
    );

    expect(await view.findByText(/GPLX hết hạn/)).toBeTruthy();
  });

  it('chưa khai hạn: KHÔNG bịa nhãn nào', async () => {
    const view = await renderScreen([PERMISSION.DRIVER_VIEW], [driver({ licenseExpiresAt: null })]);

    await view.findByText('Trần Văn B');
    expect(view.queryByText(/GPLX/)).toBeNull();
  });
});

describe('Điểm nối Booking — bộ chọn gán tài xế', () => {
  it('tài xế INACTIVE không nằm trong danh sách gán được, và khả dụng do SERVER chấm', async () => {
    jest
      .spyOn(authApi, 'fetchCurrentUser')
      .mockResolvedValue(currentUser([PERMISSION.DRIVER_VIEW, PERMISSION.BOOKING_UPDATE]));
    /*
     * `/drivers/assignable` là endpoint RIÊNG: nó chỉ trả tài xế còn hoạt động và tự chấm
     * "bận / GPLX hết hạn" cho khung giờ của đơn. Client KHÔNG lọc lại theo `status`, và cũng
     * không tự tính lịch bận — đó là lý do bộ chọn không đọc `driversApi.list`.
     */
    const spy = jest.spyOn(driversApi, 'assignable').mockResolvedValue([
      {
        id: '01JQZX0000000000000000000D',
        name: 'Trần Văn B',
        phone: '0901234567',
        driverType: DRIVER_TYPE.STAFF,
        available: true,
        licenseExpired: false,
        busy: false,
      } as never,
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
