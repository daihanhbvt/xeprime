import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARKETPLACE_VISIBILITY_REASON,
  SERVICE_TYPE,
  SUPPORT_CAPABILITY,
  SUPPORT_MODE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { VEHICLE_MANAGE_SECTION, adminTenantSupportPath } from '@/constants/routes';
import { supportWorkspaceValue } from '@/features/tenant-support/components/SupportWorkspaceProvider';
import { SupportSessionScope, supportSessionOf } from '@/features/tenant-support/support-session';
import {
  ADMIN_PLATFORM_PERMISSIONS,
  CONTEXT_A,
  supportContextFixture,
} from '@/features/tenant-support/test-utils';
import type { SupportContext } from '@/features/tenant-support/types';
import type { VehicleDetail } from '@/features/vehicles/types';
import { WorkspaceScope } from '@/hooks/use-workspace';
import { renderWithIntl } from '@/i18n/test-utils';
import viVehicleManage from '@xeprime/domain/messages/vi/vehicle-manage.json';
import { VehicleManageWorkspace } from './VehicleManageWorkspace';

/**
 * CÙNG `VehicleManageWorkspace` của Owner Lite, dựng trong phiên hỗ trợ (ADR 0050).
 *
 * `usePermissions` KHÔNG bị mock: test khoá đúng đường thật — quyền của phiên thay quyền nền tảng
 * của người đăng nhập, và component không nhận prop nào nói "đây là admin".
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), pathname: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      id: 'admin-1',
      displayName: 'Hỗ trợ viên Lan',
      email: 'lan@xeprime.vn',
      permissions: ADMIN_PLATFORM_PERMISSIONS,
      platformRole: 'platform_admin',
      tenant: null,
    },
    isLoading: false,
  }),
}));

const vehicleQuery = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: () => ({ ...vehicleQuery, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-summary', () => ({
  useVehicleSummary: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const vehicle = {
  id: 'v1',
  code: 'XE-01',
  name: 'Toyota Vios 2023',
  plateNumber: '51A-123.45',
  vehicleType: VEHICLE_TYPE.CAR,
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  marketplaceEnabled: true,
  isMarketplaceVisible: true,
  marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.VISIBLE,
  mainImageUrl: null,
  images: [],
  media: [],
  features: [],
  branch: null,
} as unknown as VehicleDetail;

function renderInSession(context: SupportContext) {
  return renderWithIntl(
    <App>
      <SupportSessionScope session={supportSessionOf(context)}>
        <WorkspaceScope value={supportWorkspaceValue(context)}>
          <VehicleManageWorkspace vehicleId="v1">
            <div data-testid="section">nội dung</div>
          </VehicleManageWorkspace>
        </WorkspaceScope>
      </SupportSessionScope>
    </App>,
  );
}

beforeEach(() => {
  vehicleQuery.data = vehicle;
  nav.pathname = adminTenantSupportPath.vehicleManageSection(
    CONTEXT_A,
    'v1',
    VEHICLE_MANAGE_SECTION.INFORMATION,
  );
});

afterEach(() => cleanup());

describe('Không gian "Quản lý xe" (Owner Lite) trong phiên hỗ trợ', () => {
  it('menu chỉ còn Thông tin + Hình ảnh, dẫn về gốc của PHIÊN', () => {
    renderInSession(supportContextFixture());
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    const sectionLinks = links.filter((href) => href.includes('/vehicles/v1/manage/'));
    expect(sectionLinks.sort()).toEqual(
      [
        adminTenantSupportPath.vehicleManageSection(CONTEXT_A, 'v1', VEHICLE_MANAGE_SECTION.INFORMATION),
        adminTenantSupportPath.vehicleManageSection(CONTEXT_A, 'v1', VEHICLE_MANAGE_SECTION.IMAGES),
      ].sort(),
    );
    // Không có đường nào dẫn ra khu tài khoản của chủ xe.
    expect(links.some((href) => href.startsWith('/account'))).toBe(false);
  });

  it('không có công tắc dịch vụ — bật/tắt dịch vụ là quyết định của chủ xe', () => {
    renderInSession(supportContextFixture());
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('thẻ người dùng ở chân menu là NHÂN SỰ NỀN TẢNG, không phải chủ xe (9)', () => {
    renderInSession(supportContextFixture());
    expect(screen.getByText('Hỗ trợ viên Lan')).toBeTruthy();
  });

  it('phiên chế độ xem: nội dung chỉ-xem', () => {
    renderInSession(
      supportContextFixture({
        mode: SUPPORT_MODE.VIEW,
        capabilities: [SUPPORT_CAPABILITY.VEHICLE_VIEW],
        permissions: ['vehicles.view', 'branches.view'],
      }),
    );
    expect(screen.getByTestId('section')).toBeTruthy();
    // Băng "chỉ xem" của chính workspace — cùng câu chủ xe thiếu quyền sửa vẫn thấy.
    expect(screen.getByText(viVehicleManage.readOnlyNotice)).toBeTruthy();
  });
});
