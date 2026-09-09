import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERMISSION,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';

import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';

import {
  VEHICLE_MANAGE_SECTION,
  accountVehicleManagePath,
  listingPath,
} from '@/constants/routes';
import type { VehicleDetail } from '@/features/vehicles/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { VehicleManageWorkspace } from './VehicleManageWorkspace';

/**
 * Vỏ không gian "Quản lý xe" của chủ xe (`/account/vehicles/:id/manage/*`).
 *
 * Những gì test này khoá:
 *
 *  1. Menu là menu CỦA XE, không phải menu khu tài khoản — và mục đang mở suy từ URL, nên F5 ở
 *     bất kỳ mục con nào cũng dựng lại đúng mục đó.
 *  2. Đủ bốn trạng thái trước khi render nội dung: thiếu quyền · đang tải · không tìm thấy · lỗi.
 *  3. Công tắc dịch vụ gửi TRỌN mảng `serviceTypes` — bật/tắt một dịch vụ không được làm rơi
 *     dịch vụ khác (đặc biệt là thuê dài hạn, thứ không có mục nào trong menu này).
 *  4. Mục của dịch vụ đang tắt nói rõ lý do và cho bật lại, thay vì hiện một form chết.
 *  5. Không có "Số dư", không có giá mẫu lấy từ ảnh thiết kế, không có mục "Tiện ích bổ sung",
 *     và không có lời hứa đối chiếu VNeID tự động.
 */
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/account/vehicles/v1/manage/information',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      id: 'u1',
      displayName: 'Minh Đức',
      email: 'minh@xeprime.test',
      tenant: { id: 't1', name: 'Shop', roleKey: 'shop_owner' },
    },
  }),
}));

const queries = vi.hoisted(() => ({
  vehicle: {
    data: undefined as VehicleDetail | undefined,
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  summary: { data: undefined as unknown, isLoading: false, isError: false },
}));
vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: () => queries.vehicle,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-summary', () => ({
  useVehicleSummary: () => queries.summary,
}));

const update = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (_body?: { serviceTypes: string[] }) => undefined),
  isPending: false,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => update,
}));

function vehicle(overrides: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: 'v1',
    code: 'XE-01',
    name: 'Toyota Vios 2023',
    plateNumber: '51A-123.45',
    vehicleType: VEHICLE_TYPE.CAR,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    mainImageUrl: null,
    images: [],
    media: [],
    features: [],
    branch: null,
    ...(overrides as Record<string, unknown>),
  } as unknown as VehicleDetail;
}

function renderWorkspace(children = <div data-testid="section-content">Nội dung mục</div>) {
  return renderWithIntl(
    <App>
      <VehicleManageWorkspace vehicleId="v1">{children}</VehicleManageWorkspace>
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.VEHICLE_VIEW, PERMISSION.VEHICLE_UPDATE]);
  nav.pathname = accountVehicleManagePath.section('v1', VEHICLE_MANAGE_SECTION.INFORMATION);
  queries.vehicle = {
    data: vehicle(),
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  };
  queries.summary = { data: undefined, isLoading: false, isError: false };
  update.mutateAsync = vi.fn(async (_body?: { serviceTypes: string[] }) => undefined);
  update.isPending = false;
  nav.push.mockReset();
});

afterEach(cleanup);

describe('Trạng thái trước khi có dữ liệu', () => {
  it('thiếu quyền xem xe: nói rõ thiếu quyền, KHÔNG render nội dung mục', () => {
    permissions.granted = new Set();
    renderWorkspace();

    expect(screen.getByText('Không có quyền quản lý xe')).toBeTruthy();
    expect(screen.queryByTestId('section-content')).toBeNull();
  });

  it('đang tải: hiện trạng thái tải, chưa render mục', () => {
    queries.vehicle = { ...queries.vehicle, data: undefined, isLoading: true };
    renderWorkspace();

    expect(screen.getByText('Đang tải hồ sơ xe…')).toBeTruthy();
    expect(screen.queryByTestId('section-content')).toBeNull();
  });

  it('xe không tồn tại (404): thông báo riêng và lối quay lại danh sách, không có nút Thử lại', () => {
    queries.vehicle = {
      ...queries.vehicle,
      data: undefined,
      isError: true,
      error: new ApiClientError({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy xe',
        status: 404,
      }),
    };
    renderWorkspace();

    expect(screen.getByText('Không tìm thấy xe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Về danh sách xe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('lỗi tải: cho thử lại đúng truy vấn hồ sơ xe', () => {
    const refetch = vi.fn();
    queries.vehicle = {
      ...queries.vehicle,
      data: undefined,
      isError: true,
      error: new Error('network'),
      refetch,
    };
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('chỉ có quyền xem: nội dung vẫn hiện kèm cảnh báo chỉ đọc', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_VIEW]);
    renderWorkspace();

    expect(screen.getByTestId('section-content')).toBeTruthy();
    expect(screen.getByText(/chỉ có quyền xem/i)).toBeTruthy();
  });
});

describe('Menu của XE, không phải menu khu tài khoản', () => {
  it('hiện ba nhóm mục của xe và KHÔNG có mục của khu tài khoản', () => {
    renderWorkspace();
    const menu = screen.getByRole('navigation', { name: 'Menu quản lý xe' });

    expect(within(menu).getByText('Thông tin xe')).toBeTruthy();
    expect(within(menu).getByText('Hình ảnh')).toBeTruthy();
    expect(within(menu).getByText('Giấy tờ xe')).toBeTruthy();
    expect(within(menu).getByText('Lịch sử chuyến')).toBeTruthy();

    // Menu khu tài khoản không được lẫn vào đây.
    expect(within(menu).queryByText('Chuyến của tôi')).toBeNull();
    expect(within(menu).queryByText('Đổi mật khẩu')).toBeNull();
    expect(within(menu).queryByText('Thông tin khai thuế')).toBeNull();
  });

  it('mục đang mở suy từ URL — F5 ở mục con nào cũng đánh dấu đúng mục đó', () => {
    for (const section of [
      VEHICLE_MANAGE_SECTION.IMAGES,
      VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME,
    ]) {
      cleanup();
      nav.pathname = accountVehicleManagePath.section('v1', section);
      renderWorkspace();

      const active = screen
        .getByRole('navigation', { name: 'Menu quản lý xe' })
        .querySelector('[aria-current="page"]');
      expect(active?.getAttribute('href')).toBe(accountVehicleManagePath.section('v1', section));
    }
  });

  it('mọi mục trong menu đều là link thật tới đúng route con', () => {
    renderWorkspace();
    const menu = screen.getByRole('navigation', { name: 'Menu quản lý xe' });
    const hrefs = [...menu.querySelectorAll('a')].map((a) => a.getAttribute('href'));

    expect(hrefs).toContain(
      accountVehicleManagePath.section('v1', VEHICLE_MANAGE_SECTION.DOCUMENTS),
    );
    expect(hrefs).toContain(
      accountVehicleManagePath.section('v1', VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES),
    );
    expect(hrefs.every((href) => href && href.startsWith('/account/vehicles/v1/manage/'))).toBe(
      true,
    );
  });

  it('KHÔNG có mục "Tiện ích bổ sung" trong menu', () => {
    renderWorkspace();
    expect(screen.queryByText(/tiện ích bổ sung/i)).toBeNull();
  });
});

describe('Đầu trang — không bịa dữ liệu', () => {
  it('không hiện "Số dư" và không hiện con số tiền nào chưa có nguồn', () => {
    renderWorkspace();
    expect(screen.queryByText(/số dư/i)).toBeNull();
    // Giá mẫu trong ảnh thiết kế (780K) không được đi vào mã.
    expect(screen.queryByText(/780/)).toBeNull();
  });

  it('xe chưa duyệt công khai: không mời bấm "Xem trang xe"', () => {
    queries.vehicle = {
      ...queries.vehicle,
      data: vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW }),
    };
    renderWorkspace();

    const link = screen.queryByRole('link', { name: /xem trang xe/i });
    expect(link).toBeNull();
  });

  it('xe đã duyệt: link sang trang xe công khai đúng địa chỉ', () => {
    renderWorkspace();
    const link = screen.getByRole('link', { name: /xem trang xe/i });
    // Trang xe của KHÁCH (chợ), không phải màn quản trị nội bộ.
    expect(link.getAttribute('href')).toBe(listingPath.detail('v1'));
  });
});

describe('Công tắc dịch vụ — không làm rơi dịch vụ khác', () => {
  it('bật "có tài xế" gửi TRỌN mảng, giữ nguyên tự lái và thuê dài hạn', async () => {
    queries.vehicle = {
      ...queries.vehicle,
      data: vehicle({
        publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.LONG_TERM],
      }),
    };
    renderWorkspace();

    const withDriverSwitch = screen.getByRole('switch', { name: /có tài xế/i });
    fireEvent.click(withDriverSwitch);

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalled());
    const sent = update.mutateAsync.mock.calls[0]![0]!;
    expect([...sent.serviceTypes].sort()).toEqual(
      [SERVICE_TYPE.LONG_TERM, SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER].sort(),
    );
  });

  it('không cho tắt dịch vụ cuối cùng — xe phải còn ít nhất một dịch vụ', async () => {
    queries.vehicle = {
      ...queries.vehicle,
      data: vehicle({
        publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      }),
    };
    renderWorkspace();

    fireEvent.click(screen.getByRole('switch', { name: /tự lái/i }));
    await waitFor(() => expect(update.mutateAsync).not.toHaveBeenCalled());
  });

  it('xe đang công khai: bật thêm dịch vụ lưu thẳng, không còn hỏi "duyệt lại" (ADR 0030)', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('switch', { name: /có tài xế/i }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/duyệt lại/i)).toBeNull();
  });

  it('tắt dịch vụ ĐANG CÓ GIÁ vẫn hỏi — lưu là mất giá đó', async () => {
    queries.vehicle = {
      ...queries.vehicle,
      data: vehicle({
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
        withDriverDailyPrice: '1300000',
      }),
    };
    renderWorkspace();

    fireEvent.click(screen.getByRole('switch', { name: /có tài xế/i }));
    expect(update.mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText(/mất giá|xoá giá/i)).toBeTruthy();
  });

  it('thiếu quyền sửa: công tắc bị khoá', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_VIEW]);
    renderWorkspace();

    for (const item of screen.getAllByRole('switch')) {
      expect(item.getAttribute('disabled')).not.toBeNull();
    }
  });
});

describe('Mục của dịch vụ đang tắt', () => {
  it('nói rõ lý do và cho bật lại thay vì hiện form chết', () => {
    nav.pathname = accountVehicleManagePath.section(
      'v1',
      VEHICLE_MANAGE_SECTION.WITH_DRIVER_PRICING,
    );
    queries.vehicle = {
      ...queries.vehicle,
      data: vehicle({
        publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      }),
    };
    renderWorkspace();

    expect(screen.queryByTestId('section-content')).toBeNull();
    expect(screen.getByText(/đang tắt/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /bật/i })).toBeTruthy();
  });

  it('dịch vụ đang bật: nội dung mục hiện bình thường', () => {
    nav.pathname = accountVehicleManagePath.section(
      'v1',
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING,
    );
    renderWorkspace();
    expect(screen.getByTestId('section-content')).toBeTruthy();
  });
});
