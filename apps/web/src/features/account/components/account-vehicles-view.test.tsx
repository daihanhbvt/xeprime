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

import { accountVehiclePath } from '@/constants/routes';
import type { VehicleListItem } from '@/features/vehicles/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { AccountVehiclesView } from './AccountVehiclesView';

/**
 * Danh sách xe trong khu tài khoản của CHỦ XE.
 *
 * Nút "Quản lý xe" là cửa vào duy nhất của không gian quản lý theo xe — nó phải dẫn tới
 * `/account/vehicles/:id/manage` (khu tài khoản), KHÔNG phải `/manage/vehicles/:id` (cổng gian
 * hàng): chủ xe Owner Lite không có menu cổng quản lý, đưa họ sang đó là đẩy vào một vỏ khác.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/account/vehicles',
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

const list = vi.hoisted(() => ({
  data: undefined as { items: VehicleListItem[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));
vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({ useVehicles: () => list }));
vi.mock('@/features/vehicles/hooks/use-vehicle-filters', () => ({
  useVehicleFilters: () => ({ filters: {}, setFilters: vi.fn() }),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-options', () => ({
  useVehicleOptions: () => ({ vehicleTypes: [], serviceTypes: [], statuses: [] }),
}));

/** Lưới thẻ xe là component dùng chung — ở đây chỉ cần bấm được hành động của một dòng. */
vi.mock('@/features/vehicles/components/VehicleCardGrid', () => ({
  VehicleCardGrid: ({
    items,
    rowActions,
  }: {
    items: VehicleListItem[];
    rowActions: (row: VehicleListItem) => Array<{ key: string; label: string; onClick: () => void }>;
  }) => (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          {rowActions(item).map((action) => (
            <button key={action.key} type="button" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}));
vi.mock('@/features/vehicles/components/VehicleStatusChips', () => ({
  VehicleStatusChips: () => null,
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

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.VEHICLE_VIEW]);
  list.data = { items: [item()], meta: { page: 1, limit: 12, total: 1, hasNext: false } };
  list.isError = false;
  nav.push.mockReset();
});

afterEach(cleanup);

describe('AccountVehiclesView', () => {
  it('"Quản lý xe" dẫn vào không gian quản lý của khu tài khoản', () => {
    renderWithIntl(
      <App>
        <AccountVehiclesView />
      </App>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quản lý xe' }));
    expect(nav.push).toHaveBeenCalledWith(accountVehiclePath.manage('v1'));
    expect(nav.push).not.toHaveBeenCalledWith(expect.stringContaining('/manage/vehicles/'));
  });

  it('thiếu quyền xem xe: chặn ở màn này, không dẫn tiếp vào không gian quản lý', () => {
    permissions.granted = new Set();
    renderWithIntl(
      <App>
        <AccountVehiclesView />
      </App>,
    );

    expect(screen.queryByRole('button', { name: 'Quản lý xe' })).toBeNull();
  });
});
