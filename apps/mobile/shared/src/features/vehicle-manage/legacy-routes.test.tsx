import type { ComponentType } from 'react';
import { render } from '@testing-library/react-native';
import { MOBILE_CLIENT_APP } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { ROUTES } from '@/navigation/routes';
import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_MANAGE_SECTION,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';

const mockRedirect = jest.fn();
const ID = '01M1X1AFM9M3JMWS2YZBYB1QN8';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '01M1X1AFM9M3JMWS2YZBYB1QN8' }),
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
}));

/* Route file nằm ở app Customer — chỉ app đó đăng ký khu tài khoản. */
const describeCustomerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.CUSTOMER ? describe : describe.skip;

const ROUTE_DIR = '../../../../customer/app/account/vehicles/[id]/manage';

/** Web: `app/(public)/account/vehicles/[id]/manage/<cũ>/page.tsx` chuyển hướng đúng các đích này. */
const CASES: [string, VehicleManageSection, string | null][] = [
  ['self-drive/pricing', VEHICLE_MANAGE_SECTION.PRICING, null],
  ['with-driver/pricing', VEHICLE_MANAGE_SECTION.PRICING, null],
  ['self-drive/delivery', VEHICLE_MANAGE_SECTION.PRICING, null],
  ['self-drive/handover-time', VEHICLE_MANAGE_SECTION.HANDOVER_TIME, null],
  ['self-drive/terms', VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION, RENTAL_TERMS_ANCHOR],
  ['with-driver/terms', VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION, RENTAL_TERMS_ANCHOR],
];

describeCustomerOnly('đường dẫn CŨ của không gian Quản lý xe chuyển hướng như web', () => {
  it.each(CASES)('%s', async (file, section, anchor) => {
    mockRedirect.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Route = require(`${ROUTE_DIR}/${file}`).default as ComponentType;
    await render(<Route />);
    expect(mockRedirect).toHaveBeenCalledWith(
      ROUTES.account.vehicleManageSection(ID, section, anchor ? { anchor } : undefined),
    );
  });
});
