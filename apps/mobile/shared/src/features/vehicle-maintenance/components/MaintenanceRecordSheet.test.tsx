import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { PERMISSION } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { MaintenanceRecordSheet } from './MaintenanceRecordSheet';

let mockGranted: string[] = [];

jest.mock('@/features/auth/hooks/use-permissions', () => ({
  usePermissions: () => ({ isLoading: false, has: (p: string) => mockGranted.includes(p) }),
}));

async function renderSheet() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <MaintenanceRecordSheet
          vehicleId="01JQZX0000000000000000000V"
          state={{ mode: 'create' }}
          onClose={jest.fn()}
        />
      </QueryClientProvider>,
    ),
  );
}

/** Bám `MaintenanceRecordDialog` bên web: chi phí + mã phiếu chi đi theo quyền xem chi phí. */
describe('MaintenanceRecordSheet — chi phí theo vehicles.maintenance.view_cost', () => {
  it('thiếu quyền xem chi phí: không có ô chi phí và mã phiếu chi', async () => {
    mockGranted = [PERMISSION.VEHICLE_MAINTENANCE_MANAGE];
    await renderSheet();
    expect(screen.getByText('Ghi chú')).toBeTruthy();
    expect(screen.queryByText('Chi phí (VNĐ)')).toBeNull();
    expect(screen.queryByText('Mã phiếu chi / chứng từ')).toBeNull();
  });

  it('có quyền xem chi phí: hiện cả hai ô', async () => {
    mockGranted = [PERMISSION.VEHICLE_MAINTENANCE_MANAGE, PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW];
    await renderSheet();
    expect(screen.getByText('Chi phí (VNĐ)')).toBeTruthy();
    expect(screen.getByText('Mã phiếu chi / chứng từ')).toBeTruthy();
  });
});
