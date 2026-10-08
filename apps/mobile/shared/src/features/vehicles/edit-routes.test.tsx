import type { ComponentType } from 'react';
import { render } from '@testing-library/react-native';
import { MOBILE_CLIENT_APP, SERVICE_TYPE } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';

const mockRedirect = jest.fn();
const mockTermsScreen = jest.fn();
const mockVehicle: { data: { serviceTypes: string[] } | undefined } = { data: undefined };
const ID = '01M1X1AFM9M3JMWS2YZBYB1QN8';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '01M1X1AFM9M3JMWS2YZBYB1QN8' }),
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
}));
jest.mock('@/features/auth/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true, isLoading: false }),
}));
jest.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: () => mockVehicle,
}));
jest.mock('@/features/vehicle-manage/VehicleBookingTermsScreen', () => ({
  VehicleBookingTermsScreen: (props: unknown) => {
    mockTermsScreen(props);
    return null;
  },
}));

/* Route file nằm ở app Partner — chỉ app đó đăng ký cổng quản lý. */
const describePartnerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER ? describe : describe.skip;

const ROUTE_DIR = '../../../../manage/app/manage/vehicles/[id]';

const load = (file: string) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(`${ROUTE_DIR}/${file}`).default as ComponentType;

/** Web: `/manage/vehicles/[id]/{pricing,optimization}` redirect + bí danh `?tab=operations`. */
const CASES: [string, VehicleEditTab][] = [
  ['pricing', VEHICLE_EDIT_TAB.PRICING],
  ['optimization', VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION],
  ['edit/operations', VEHICLE_EDIT_TAB.HANDOVER_TIME],
];

describePartnerOnly('route CŨ của xe gian hàng chuyển hướng vào mục của màn sửa xe', () => {
  it.each(CASES)('%s', async (file, tab) => {
    mockRedirect.mockReset();
    const Route = load(file);
    await render(<Route />);
    expect(mockRedirect).toHaveBeenCalledWith(ROUTES.manage.vehicleEditTab(ID, tab));
  });
});

describePartnerOnly('mục "Nhận chuyến & thủ tục" tự lái', () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockTermsScreen.mockReset();
  });

  it('xe chỉ có tài xế → mục có tài xế (web VehicleEditWorkspace)', async () => {
    mockVehicle.data = { serviceTypes: [SERVICE_TYPE.WITH_DRIVER] };
    const Route = load('edit/self-drive-optimization');
    await render(<Route />);
    expect(mockRedirect).toHaveBeenCalledWith(
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION),
    );
    expect(mockTermsScreen).not.toHaveBeenCalled();
  });

  it('xe có tự lái → dựng mục tự lái ở khu quản lý', async () => {
    mockVehicle.data = { serviceTypes: [SERVICE_TYPE.SELF_DRIVE] };
    const Route = load('edit/self-drive-optimization');
    await render(<Route />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockTermsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: ID,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        workspace: 'manage',
        scrollToTerms: false,
      }),
    );
  });
});
