import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE, PERMISSION, VEHICLE_BLOCK_REASON, type Permission } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import * as authApi from '@/features/auth/api';
import { branchesApi } from '@/features/branches/api';
import { bookingsApi } from '@/features/bookings/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { calendarApi, type VehicleBlock } from './api';
import { VehicleBlockDetailSheet } from './components/VehicleBlockDetailSheet';
import { VehicleBlockSheet } from './components/VehicleBlockSheet';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/manage/calendar',
  useLocalSearchParams: () => ({}),
}));

const VEHICLE_ID = '01JQZX0000000000000000000V';
const BLOCK_ID = '01JQZX0000000000000000000K';

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

function block(overrides: Partial<VehicleBlock> = {}): VehicleBlock {
  return {
    id: BLOCK_ID,
    vehicleId: VEHICLE_ID,
    vehicleName: 'Toyota Vios',
    vehiclePlate: '43A-123.45',
    startAt: '2026-07-11T17:00:00.000Z',
    endAt: '2026-07-12T17:00:00.000Z',
    reason: VEHICLE_BLOCK_REASON.UNPLANNED_MAINTENANCE,
    note: null,
    rowVersion: 3,
    createdByName: 'Chủ shop',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

/** 409 của exclusion constraint, đúng phong bì mà `AllExceptionsFilter` trả ra (ADR 0006). */
function conflictError() {
  return new ApiClientError({
    status: 409,
    code: API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT,
    message: 'Xe đã có lịch trong khoảng thời gian này',
  });
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

beforeEach(() => {
  jest.restoreAllMocks();
  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(
      currentUser([PERMISSION.CALENDAR_VIEW, PERMISSION.VEHICLE_BLOCK_SCHEDULE]),
    );
  jest.spyOn(branchesApi, 'list').mockResolvedValue({
    items: [],
    total: 0,
    activeCount: 0,
    needsReviewCount: 0,
  });
  // Preview trùng lịch mặc định SẠCH — từng test bật cảnh báo khi cần.
  jest.spyOn(bookingsApi, 'checkConflict').mockResolvedValue({ hasConflict: false, conflicts: [] });
});

describe('CAL-02 — tạo lịch khoá', () => {
  it('không dựng gì khi đóng — bộ khởi tạo của form đọc ngày, không có state thì không có ngày', async () => {
    const view = await render(wrap(<VehicleBlockSheet state={null} onClose={jest.fn()} />));
    expect(view.queryByText('Khóa xe')).toBeNull();
  });

  it('mặc định khoá TRỌN NGÀY được chạm và gửi mốc UTC của biên ngày VN', async () => {
    const create = jest.spyOn(calendarApi, 'createBlock').mockResolvedValue(block());
    const onClose = jest.fn();

    const view = await render(
      wrap(
        <VehicleBlockSheet
          state={{
            mode: 'create',
            vehicleId: VEHICLE_ID,
            vehicleName: 'Toyota Vios · 43A-123.45',
            date: '2026-07-12',
          }}
          onClose={onClose}
        />,
      ),
    );

    await act(async () => {
      fireEvent.press(await view.findByText('Khoá xe'));
    });

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      vehicleId: VEHICLE_ID,
      // 00:00 → 00:00 hôm sau, GIỜ VIỆT NAM: 17:00Z hôm trước → 17:00Z ngày 12.
      startAt: '2026-07-11T17:00:00.000Z',
      endAt: '2026-07-12T17:00:00.000Z',
      reason: VEHICLE_BLOCK_REASON.UNPLANNED_MAINTENANCE,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('hỏi PRE-CHECK trùng lịch trên đúng khoảng sắp ghi — cùng hai mốc gửi lên khi lưu', async () => {
    jest.spyOn(calendarApi, 'createBlock').mockResolvedValue(block());

    await render(
      wrap(
        <VehicleBlockSheet
          state={{
            mode: 'create',
            vehicleId: VEHICLE_ID,
            vehicleName: 'Toyota Vios',
            date: '2026-07-12',
          }}
          onClose={jest.fn()}
        />,
      ),
    );

    await waitFor(() =>
      expect(bookingsApi.checkConflict).toHaveBeenCalledWith({
        vehicleId: VEHICLE_ID,
        startAt: '2026-07-11T17:00:00.000Z',
        endAt: '2026-07-12T17:00:00.000Z',
      }),
    );
  });

  it('pre-check báo BẬN: cảnh báo sớm, nhưng KHÔNG chặn lưu (ADR 0006)', async () => {
    jest
      .spyOn(bookingsApi, 'checkConflict')
      .mockResolvedValue({ hasConflict: true, conflicts: [] });
    const create = jest.spyOn(calendarApi, 'createBlock').mockResolvedValue(block());

    const view = await render(
      wrap(
        <VehicleBlockSheet
          state={{
            mode: 'create',
            vehicleId: VEHICLE_ID,
            vehicleName: 'Toyota Vios',
            date: '2026-07-12',
          }}
          onClose={jest.fn()}
        />,
      ),
    );

    expect(await view.findByText('Xe có thể đã bận khoảng này')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText('Khoá xe'));
    });
    // Cảnh báo là cảnh báo — chốt chặn thật nằm ở constraint DB, không ở đây.
    await waitFor(() => expect(create).toHaveBeenCalled());
  });
});

describe('CAL-03 — 409 trùng lịch từ backend', () => {
  it('hiện thông điệp nghiệp vụ tại chỗ và GIỮ form để người dùng đổi giờ', async () => {
    const create = jest.spyOn(calendarApi, 'createBlock').mockRejectedValue(conflictError());
    const onClose = jest.fn();

    const view = await render(
      wrap(
        <VehicleBlockSheet
          state={{
            mode: 'create',
            vehicleId: VEHICLE_ID,
            vehicleName: 'Toyota Vios',
            date: '2026-07-12',
          }}
          onClose={onClose}
        />,
      ),
    );

    await act(async () => {
      fireEvent.press(await view.findByText('Khoá xe'));
    });

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(await view.findByText('Xe đã bận trong khoảng này')).toBeTruthy();
    // Form KHÔNG đóng: đóng đi thì người dùng mất cả khoảng vừa chọn.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('KHÔNG hiện `message` tiếng Việt của backend làm chữ chính (ADR 0012)', async () => {
    jest.spyOn(calendarApi, 'createBlock').mockRejectedValue(conflictError());

    const view = await render(
      wrap(
        <VehicleBlockSheet
          state={{
            mode: 'create',
            vehicleId: VEHICLE_ID,
            vehicleName: 'Toyota Vios',
            date: '2026-07-12',
          }}
          onClose={jest.fn()}
        />,
      ),
    );

    await act(async () => {
      fireEvent.press(await view.findByText('Khoá xe'));
    });

    await waitFor(() => expect(view.queryByText('Xe đã bận trong khoảng này')).toBeTruthy());
    expect(view.queryByText('Xe đã có lịch trong khoảng thời gian này')).toBeNull();
  });
});

describe('CAL-02 — sửa lịch khoá', () => {
  it('gửi `expectedRowVersion` đang hiển thị — optimistic concurrency, không ghi đè âm thầm', async () => {
    const update = jest.spyOn(calendarApi, 'updateBlock').mockResolvedValue(block({ rowVersion: 4 }));

    const view = await render(
      wrap(<VehicleBlockSheet state={{ mode: 'edit', block: block() }} onClose={jest.fn()} />),
    );

    await act(async () => {
      fireEvent.press(await view.findByText('Lưu thay đổi'));
    });

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]![1]).toMatchObject({ expectedRowVersion: 3 });
  });

  it('sửa thì pre-check BỎ QUA chính khoá đang sửa — nếu không nó tự báo trùng với bản thân', async () => {
    jest.spyOn(calendarApi, 'updateBlock').mockResolvedValue(block());

    await render(
      wrap(<VehicleBlockSheet state={{ mode: 'edit', block: block() }} onClose={jest.fn()} />),
    );

    await waitFor(() =>
      expect(bookingsApi.checkConflict).toHaveBeenCalledWith(
        expect.objectContaining({ excludeSourceId: BLOCK_ID }),
      ),
    );
  });

  it('chống double-submit: chạm hai lần chỉ gửi MỘT lệnh', async () => {
    let resolveUpdate: ((value: VehicleBlock) => void) | undefined;
    const update = jest
      .spyOn(calendarApi, 'updateBlock')
      .mockReturnValue(
        new Promise<VehicleBlock>((resolve) => {
          resolveUpdate = resolve;
        }),
      );

    const view = await render(
      wrap(<VehicleBlockSheet state={{ mode: 'edit', block: block() }} onClose={jest.fn()} />),
    );

    const submit = await view.findByText('Lưu thay đổi');
    await act(async () => {
      fireEvent.press(submit);
    });
    await act(async () => {
      fireEvent.press(submit);
    });

    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveUpdate?.(block({ rowVersion: 4 }));
    });
  });
});

describe('CAL-02 — chi tiết & gỡ khoá', () => {
  it('gỡ khoá là hành động PHÁ: luôn qua xác nhận, không gọi API ngay', async () => {
    jest.spyOn(calendarApi, 'block').mockResolvedValue(block());
    const remove = jest.spyOn(calendarApi, 'deleteBlock').mockResolvedValue(undefined);

    const view = await render(
      wrap(
        <VehicleBlockDetailSheet
          blockId={BLOCK_ID}
          open
          onClose={jest.fn()}
          onEdit={jest.fn()}
        />,
      ),
    );

    await act(async () => {
      fireEvent.press(await view.findByText('Gỡ khoá'));
    });

    expect(remove).not.toHaveBeenCalled();
    expect(await view.findByText('Gỡ khoá xe?')).toBeTruthy();
  });

  it('xác nhận rồi mới gỡ', async () => {
    jest.spyOn(calendarApi, 'block').mockResolvedValue(block());
    const remove = jest.spyOn(calendarApi, 'deleteBlock').mockResolvedValue(undefined);
    const onClose = jest.fn();

    const view = await render(
      wrap(
        <VehicleBlockDetailSheet blockId={BLOCK_ID} open onClose={onClose} onEdit={jest.fn()} />,
      ),
    );

    await act(async () => {
      fireEvent.press(await view.findByText('Gỡ khoá'));
    });
    await act(async () => {
      // Nút xác nhận trong hộp thoại mang CÙNG nhãn hành động — lấy cái sau cùng (trong dialog).
      const buttons = view.getAllByText('Gỡ khoá');
      fireEvent.press(buttons[buttons.length - 1]!);
    });

    await waitFor(() => expect(remove).toHaveBeenCalledWith(BLOCK_ID));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('thiếu `vehicles.block_schedule`: KHÔNG bày Sửa/Gỡ khoá', async () => {
    jest
      .spyOn(authApi, 'fetchCurrentUser')
      .mockResolvedValue(currentUser([PERMISSION.CALENDAR_VIEW]));
    jest.spyOn(calendarApi, 'block').mockResolvedValue(block());

    const view = await render(
      wrap(
        <VehicleBlockDetailSheet
          blockId={BLOCK_ID}
          open
          onClose={jest.fn()}
          onEdit={jest.fn()}
        />,
      ),
    );

    expect(await view.findByText('Toyota Vios · 43A-123.45')).toBeTruthy();
    expect(view.queryByText('Gỡ khoá')).toBeNull();
    expect(view.queryByText('Sửa')).toBeNull();
  });

  it('404 (khoá vừa bị gỡ ở thiết bị khác) là CÂU TRẢ LỜI, không phải lỗi tạm — không thử lại', async () => {
    const fetchBlock = jest
      .spyOn(calendarApi, 'block')
      .mockRejectedValue(new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'Không tìm thấy' }));

    const view = await render(
      wrap(
        <VehicleBlockDetailSheet
          blockId={BLOCK_ID}
          open
          onClose={jest.fn()}
          onEdit={jest.fn()}
        />,
      ),
    );

    expect(await view.findByText('Không tìm thấy lịch khoá')).toBeTruthy();
    expect(fetchBlock).toHaveBeenCalledTimes(1);
  });
});
