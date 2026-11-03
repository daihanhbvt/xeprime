import { App } from 'antd';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERMISSION,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';

import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  listYourVehicleRegisterPath,
  ownerVehiclePath,
} from '@/constants/routes';
import type { VehicleListItem } from '@/features/vehicles/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { AccountVehiclesView } from './AccountVehiclesView';

/**
 * Danh sách xe của CHỦ XE tuyến hoa hồng — cùng màn với gian hàng từ 03/11/2026
 * (`VehiclesListView scope="owner"`), khác ở lối thêm xe, nút "Quản lý xe" và bộ lọc.
 *
 * "Quản lý xe" là cửa vào không gian quản lý theo xe — nó phải dẫn tới `/vehicles/:id/manage`,
 * KHÔNG phải màn sửa của tuyến gói.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({ state: 'enabled', canWrite: true, isVisible: true, planEndsAt: null }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));
vi.mock(
  '@/features/branches/hooks/use-branch-filter',
  () => import('@/features/branches/test-utils'),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/vehicles',
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

const support = vi.hoisted(() => ({ active: false }));
vi.mock('@/features/tenant-support/support-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tenant-support/support-session')>()),
  useSupportHides: () => support.active,
}));

const list = vi.hoisted(() => ({
  data: undefined as { items: VehicleListItem[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));
vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({ useVehicles: () => list }));
vi.mock('@/features/vehicles/hooks/use-fleet-summary', () => ({
  useFleetSummary: () => ({
    data: { total: 1, available: 1, renting: 0, maintenance: 0, inactive: 0 },
    isLoading: false,
    isError: false,
  }),
}));

/** Lưới thẻ xe là component dùng chung — ở đây chỉ cần bấm được hành động của một dòng. */
const grid = vi.hoisted(() => ({ layout: undefined as string | undefined }));
vi.mock('@/features/vehicles/components/VehicleCardGrid', () => ({
  VehicleCardGrid: ({
    items,
    layout,
    rowActions,
  }: {
    items: VehicleListItem[];
    layout: string;
    rowActions: (
      row: VehicleListItem,
      shape: 'card' | 'row',
    ) => Array<{ key: string; label: string; hidden?: boolean; onClick: () => void }>;
  }) => {
    grid.layout = layout;
    return (
      <div>
        {items.map((item) => (
          <div key={item.id}>
            {rowActions(item, 'card')
              .filter((action) => !action.hidden)
              .map((action) => (
                <button key={action.key} type="button" onClick={action.onClick}>
                  {action.label}
                </button>
              ))}
          </div>
        ))}
      </div>
    );
  },
}));

function item(): VehicleListItem {
  return {
    id: 'v1',
    code: 'XE-01',
    name: 'Toyota Vios 2023',
    plateNumber: '51A-123.45',
    vehicleType: VEHICLE_TYPE.CAR,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  } as unknown as VehicleListItem;
}

function renderView() {
  renderWithIntl(
    <App>
      <AccountVehiclesView />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.VEHICLE_VIEW, PERMISSION.VEHICLE_UPDATE]);
  list.data = { items: [item()], meta: { page: 1, limit: 20, total: 1, hasNext: false } };
  list.isError = false;
  support.active = false;
  grid.layout = undefined;
  nav.push.mockReset();
});

afterEach(cleanup);

describe('AccountVehiclesView', () => {
  it('"Quản lý xe" dẫn vào không gian quản lý xe của Owner Lite, KHÔNG vào màn sửa của tuyến gói', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Quản lý xe' }));
    expect(nav.push).toHaveBeenCalledWith(ownerVehiclePath.manage('v1'));
    expect(nav.push).not.toHaveBeenCalledWith(expect.stringContaining('/edit'));
  });

  it('thứ tự nút theo design: Lịch · Quản lý xe · Chi tiết; "Chi tiết" mở Hồ sơ xe', () => {
    renderView();

    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels.slice(-3)).toEqual(['Lịch', 'Quản lý xe', 'Chi tiết']);
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }));
    expect(nav.push).toHaveBeenCalledWith(ownerVehiclePath.detail('v1'));
  });

  it('không có quyền sửa: còn Lịch và Chi tiết, không có "Quản lý xe"', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_VIEW]);
    renderView();

    expect(screen.queryByRole('button', { name: 'Quản lý xe' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chi tiết' })).toBeTruthy();
  });

  it('dưới 3 xe: bố cục thẻ to (ít xe)', () => {
    renderView();
    expect(grid.layout).toBe('few');
  });

  it('"Thêm xe mới" mở luồng đăng xe của chủ xe; trong phiên hỗ trợ thì vắng hẳn', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_VIEW, PERMISSION.VEHICLE_CREATE]);
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Thêm xe mới/ }));
    expect(nav.push).toHaveBeenCalledWith(
      listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.ACCOUNT),
    );

    cleanup();
    support.active = true;
    renderView();
    expect(screen.queryByRole('button', { name: /Thêm xe mới/ })).toBeNull();
  });

  it('không còn hai thẻ dẫn đường — Cẩm nang và Hợp đồng nằm ở menu Trợ giúp', () => {
    renderView();
    expect(screen.queryByRole('link', { name: /Cẩm nang/ })).toBeNull();
    expect(document.querySelector(`a[href="${ROUTES.MANAGE.HOST_GUIDE}"]`)).toBeNull();
  });

  it('thiếu quyền xem xe: chặn ở màn này, không dẫn tiếp vào không gian quản lý', () => {
    permissions.granted = new Set();
    renderView();

    expect(screen.queryByRole('button', { name: 'Quản lý xe' })).toBeNull();
  });
});
