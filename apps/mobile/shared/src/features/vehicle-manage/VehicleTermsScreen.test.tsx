import { render } from '@testing-library/react-native';
import viVehicleManage from '@xeprime/domain/messages/vi/vehicle-manage.json';
import { POLICY_SOURCE, SERVICE_TYPE } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { TermsBody } from './VehicleTermsScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/use-navigate-once', () => ({ useNavigateOnce: () => jest.fn() }));
jest.mock('@/components/feedback/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}));

jest.mock('./hooks/use-vehicle-settings', () => ({
  useVehicleServiceSettings: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        serviceType: 'self_drive',
        autoAcceptEnabled: false,
        minRentalMinutes: null,
        preferredRouteTypes: [],
        requiredDocuments: [],
        identityVerifyMethod: 'in_person',
        requireTermsAcceptance: false,
        termsText: null,
        depositMode: 'none',
        updatedAt: '2026-10-01T00:00:00.000Z',
        withDriverAutoAccept: null,
      },
    ],
    refetch: jest.fn(),
  }),
  usePatchVehicleServiceSetting: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/features/vehicle-pricing/hooks/use-vehicle-pricing', () => ({
  useVehiclePricing: () => ({
    isLoading: false,
    isError: false,
    data: { source: 'shop', policy: null, shopPolicy: null },
    refetch: jest.fn(),
  }),
  useSaveVehiclePricing: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const t = viVehicleManage.terms;

/**
 * Web `TermsSection` (30/09/2026): ở KHU TÀI KHOẢN khối bảo đảm sửa thẳng — không banner "đang
 * kế thừa chính sách gian hàng", không nút "Tuỳ chỉnh". Cổng quản lý giữ cửa mở khoá.
 */
describe('TermsBody — khối bảo đảm theo khu', () => {
  it('khu tài khoản: không banner kế thừa, không nút tuỳ chỉnh', async () => {
    expect(POLICY_SOURCE.SHOP).toBe('shop');
    const view = await render(
      withIntl(
        <TermsBody vehicleId="v1" serviceType={SERVICE_TYPE.SELF_DRIVE} canEdit isManage={false} />,
      ),
    );
    expect(view.queryByText(t.collateralInherited)).toBeNull();
    expect(view.queryByText(t.collateralCustomize)).toBeNull();
  });

  it('cổng quản lý: xe đang kế thừa ⇒ banner + nút tuỳ chỉnh', async () => {
    const view = await render(
      withIntl(<TermsBody vehicleId="v1" serviceType={SERVICE_TYPE.SELF_DRIVE} canEdit isManage />),
    );
    expect(view.getByText(t.collateralInherited)).toBeTruthy();
    expect(view.getByText(t.collateralCustomize)).toBeTruthy();
  });
});
