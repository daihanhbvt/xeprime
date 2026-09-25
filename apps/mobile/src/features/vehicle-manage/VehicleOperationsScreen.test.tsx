import { useState } from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import viVehicleManage from '@xeprime/domain/messages/vi/vehicle-manage.json';
import { withIntl } from '@/i18n/test-utils';
import { VehicleOperationsScreen } from './VehicleOperationsScreen';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/auth/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isLoading: false,
    has: (p: string) => {
      const { PERMISSION: P } = jest.requireActual('@xeprime/types');
      return p === P.VEHICLE_VIEW || p === P.VEHICLE_UPDATE;
    },
  }),
}));

jest.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: () => ({
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    data: { id: 'v1', name: 'Mazda3', plateNumber: '51A-12345', serviceTypes: ['self_drive'] },
  }),
}));

/*
 * Bốn thân form thật tự bắn truy vấn — thứ màn này đo là NHÓM GẬP, nên thay chúng bằng một ô
 * nhập có state cục bộ: nếu nhóm tháo nó khỏi cây khi gập, chữ đã gõ biến mất.
 */
function mockDraftBody(testID: string) {
  return function DraftBody() {
    const [value, setValue] = useState('');
    return <TextInput testID={testID} value={value} onChangeText={setValue} />;
  };
}
jest.mock('./VehicleHandoverTimeScreen', () => ({ HandoverBody: mockDraftBody('handover') }));
jest.mock('./VehicleAutoAcceptScreen', () => ({ AutoAcceptBody: mockDraftBody('auto-accept') }));
jest.mock('./VehicleTermsScreen', () => ({ TermsBody: mockDraftBody('terms') }));
jest.mock('./VehicleSurchargesScreen', () => ({ SurchargesBody: mockDraftBody('surcharges') }));

const t = viVehicleManage.operationsTab;

async function renderScreen() {
  return render(withIntl(<VehicleOperationsScreen vehicleId="v1" />));
}

describe('VehicleOperationsScreen — đúng như VehicleOperationsPanel của web', () => {
  it('chỉ có đoạn gợi ý + ba nhóm; "Thời gian giao nhận" mở sẵn', async () => {
    const view = await renderScreen();

    expect(view.getByText(t.hint)).toBeTruthy();
    expect(view.getByText(t.handover)).toBeTruthy();
    expect(view.getByText(t.selfDrive)).toBeTruthy();
    expect(view.getByText(t.withDriver)).toBeTruthy();
    expect(view.getByTestId('handover')).toBeTruthy();
    expect(view.queryByTestId('terms')).toBeNull();
  });

  /*
   * `Collapse` của AntD giữ panel đã mở trong cây. Bản native trước unmount khi gập ⇒ người dùng
   * gõ dở, gập nhóm để nhìn nhóm khác, mở lại thì mất sạch.
   */
  it('gập rồi mở lại: sửa dở CHƯA LƯU vẫn còn', async () => {
    const view = await renderScreen();

    await fireEvent.changeText(view.getByTestId('handover'), '07:00');
    await fireEvent.press(view.getByRole('button', { name: t.handover }));
    await fireEvent.press(view.getByRole('button', { name: t.handover }));

    expect(view.getByTestId('handover').props.value).toBe('07:00');
  });

  it('xe không đăng dịch vụ: câu serviceOff nằm BÊN TRONG nhóm, không có viên "Chưa bật"', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByRole('button', { name: t.withDriver }));

    expect(view.getByText(t.serviceOff)).toBeTruthy();
    expect(view.queryByText('Chưa bật')).toBeNull();
    expect(view.queryByText('Đang mở')).toBeNull();
  });
});
