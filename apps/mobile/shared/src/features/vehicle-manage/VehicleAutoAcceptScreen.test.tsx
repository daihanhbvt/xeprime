import { fireEvent, render } from '@testing-library/react-native';
import viVehicleManage from '@xeprime/domain/messages/vi/vehicle-manage.json';
import viCommon from '@xeprime/domain/messages/vi/common.json';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { AutoAcceptBody } from './VehicleAutoAcceptScreen';

const mockMutate = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/shell/use-shell-scope', () => ({
  useShellScope: () => ({ switchTo: jest.fn() }),
}));
jest.mock('@/components/feedback/use-app-toast', () => ({
  useAppToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: jest.fn(),
  }),
}));

const mockSetting = {
  serviceType: SERVICE_TYPE.SELF_DRIVE,
  autoAcceptEnabled: false,
  minRentalMinutes: null,
  preferredRouteTypes: [],
  updatedAt: '2026-10-01T00:00:00.000Z',
  withDriverAutoAccept: null,
};

jest.mock('./hooks/use-vehicle-settings', () => ({
  useVehicleServiceSettings: () => ({
    isLoading: false,
    isError: false,
    data: [
      mockSetting,
      {
        ...mockSetting,
        serviceType: 'with_driver',
        withDriverAutoAccept: { available: true, activeDrivers: 2, driversFeatureEnabled: true },
      },
    ],
    refetch: jest.fn(),
  }),
  usePatchVehicleServiceSetting: () => ({ mutate: mockMutate, isPending: false }),
}));

const t = viVehicleManage.autoAccept;

function renderBody(serviceType: ServiceType) {
  return render(withIntl(<AutoAcceptBody vehicleId="v1" serviceType={serviceType} canEdit />));
}

beforeEach(() => {
  mockMutate.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
});

/**
 * Web `AutoAcceptSection` (30/09/2026): công tắc tự nhận LƯU NGAY, chỉ gửi `{autoAcceptEnabled}`;
 * nút Lưu chỉ còn ở có tài xế, gửi đúng hai ô của nó.
 */
describe('AutoAcceptBody — công tắc lưu ngay như web', () => {
  it('tự lái: bấm công tắc ⇒ PATCH ngay với ĐÚNG {autoAcceptEnabled}, không có nút Lưu', async () => {
    mockMutate.mockImplementation((_body, opts) => opts.onSuccess());
    const view = await renderBody(SERVICE_TYPE.SELF_DRIVE);

    expect(view.queryByText(viCommon.actions.saveChanges)).toBeNull();
    await fireEvent(view.getByLabelText(t.toggleTitle), 'valueChange', true);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({ autoAcceptEnabled: true });
    expect(mockShowSuccess).toHaveBeenCalledWith(t.saved);
  });

  it('lỗi ⇒ báo lỗi và trả công tắc về như cũ', async () => {
    mockMutate.mockImplementation((_body, opts) => opts.onError(new Error('boom')));
    const view = await renderBody(SERVICE_TYPE.SELF_DRIVE);

    await fireEvent(view.getByLabelText(t.toggleTitle), 'valueChange', true);

    expect(mockShowError).toHaveBeenCalled();
    expect(view.getByLabelText(t.toggleTitle).props.value).toBe(false);
  });

  it('có tài xế: công tắc cũng lưu ngay; nút Lưu chỉ còn cho hai ô riêng', async () => {
    const view = await renderBody(SERVICE_TYPE.WITH_DRIVER);

    expect(view.getByText(viCommon.actions.saveChanges)).toBeTruthy();
    await fireEvent(view.getByLabelText(t.instantTitle), 'valueChange', true);
    expect(mockMutate.mock.calls[0][0]).toEqual({ autoAcceptEnabled: true });
  });
});
