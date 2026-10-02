import { fireEvent, render } from '@testing-library/react-native';
import { SERVICE_TYPE, VEHICLE_OPERATION_STATUS, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { VehicleCard } from './VehicleCard';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../api';

const vehicle: VehicleListItem = {
  id: '01JQZX00000000000000000V01',
  code: 'XE-001',
  name: 'Toyota Vios 2021',
  plateNumber: '51H-123.45',
  vehicleType: 'car',
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  mainImageUrl: null,
  weekdayPrice: '850000.00',
  weekendPrice: '950000.00',
  discountPercent: 10,
  updatedAt: '2026-09-01T03:00:00.000Z',
} as VehicleListItem;

const stats: VehicleStats = {
  vehicleId: vehicle.id,
  activeBookings: 2,
  completedBookings: 5,
  totalIncome: '30000000.00',
  totalExpense: '17300000.00',
  ratingCount: 0,
};

const alerts: VehicleAlertGroup = {
  vehicleId: vehicle.id,
  currentOdometerKm: 42500,
  alerts: [],
} as VehicleAlertGroup;

/** Thẻ không tự dựng thao tác nữa — màn truyền vào. Ca kiểm ở đây là NỘI DUNG thẻ. */
const NO_ACTIONS = () => [];

async function renderCard(props: Partial<Parameters<typeof VehicleCard>[0]> = {}) {
  return await render(
    withIntl(
      <VehicleCard
        vehicle={vehicle}
        onPress={jest.fn()}
        actions={NO_ACTIONS}
        stats={stats}
        statsLoading={false}
        statsFailed={false}
        alerts={alerts}
        alertsLoading={false}
        alertsFailed={false}
        {...props}
      />,
    ),
  );
}

describe('VehicleCard', () => {
  it('hiện đủ ba dòng chỉ số: KM · đơn · thu và lãi', async () => {
    const { getByText } = await renderCard();

    expect(getByText(/KM hiện tại/)).toBeTruthy();
    expect(getByText(/42.500 km/)).toBeTruthy();
    expect(getByText(/Đơn:/)).toBeTruthy();
    expect(getByText(/Lãi:/)).toBeTruthy();
  });

  it('LỖ ăn nhãn riêng — không phải một con số âm để người đọc tự suy', async () => {
    const { getByText, queryByText } = await renderCard({
      stats: { ...stats, totalIncome: '10000000.00', totalExpense: '17300000.00' },
    });

    expect(getByText(/Lỗ:/)).toBeTruthy();
    expect(queryByText(/Lãi:/)).toBeNull();
  });

  it('thiếu quyền finance.view thì KHÔNG có ô tiền, hai ô còn lại vẫn đủ', async () => {
    const { getByText, queryByText } = await renderCard({
      stats: { vehicleId: vehicle.id, activeBookings: 2, completedBookings: 5, ratingCount: 0 },
    });

    expect(queryByText(/Lãi:/)).toBeNull();
    expect(queryByText(/Thu:/)).toBeNull();
    expect(getByText(/KM hiện tại/)).toBeTruthy();
    expect(getByText(/Đơn:/)).toBeTruthy();
  });

  it('giá hiện là giá ĐÃ giảm, kèm viên -N% (khuyến mãi chỉ áp cho tự lái — ADR 0011)', async () => {
    const { getByText } = await renderCard();

    // 850.000 − 10% = 765.000
    expect(getByText('765.000 ₫/ngày')).toBeTruthy();
    expect(getByText('-10%')).toBeTruthy();
  });

  it('xe không bán tự lái thì không trưng khuyến mãi, giá về nguyên giá', async () => {
    const { getByText, queryByText } = await renderCard({
      vehicle: { ...vehicle, serviceTypes: [SERVICE_TYPE.LONG_TERM] },
    });

    expect(getByText('850.000 ₫/ngày')).toBeTruthy();
    expect(queryByText('-10%')).toBeNull();
  });
});

/**
 * Thanh thao tác đến TỪ MÀN, không từ thẻ.
 *
 * Ca này canh đúng chỗ khu tài khoản từng hỏng: thẻ tự dựng bộ Xem · Sửa · Lịch của cổng quản
 * lý và áp nó lên mọi nơi, nên danh sách xe trong hồ sơ khách hàng không có "Quản lý xe" — thứ
 * web đặt làm thao tác CHÍNH ở màn đó.
 */
describe('VehicleCard — thao tác do màn truyền vào', () => {
  it('dựng đúng bộ thao tác của nơi gọi, không có bộ mặc định nào', async () => {
    const onManage = jest.fn();

    const { getByText, queryByText } = await renderCard({
      actions: (v) => [
        {
          key: 'manage',
          label: 'Quản lý xe',
          icon: 'construct-outline',
          onPress: () => onManage(v.id),
        },
        { key: 'view', label: 'Xem chi tiết', icon: 'eye-outline', onPress: jest.fn() },
      ],
    });

    expect(getByText('Quản lý xe')).toBeTruthy();
    expect(getByText('Xem chi tiết')).toBeTruthy();
    // Bộ của cổng quản lý KHÔNG được rò sang.
    expect(queryByText('Sửa')).toBeNull();
    expect(queryByText('Lịch')).toBeNull();

    fireEvent.press(getByText('Quản lý xe'));
    expect(onManage).toHaveBeenCalledWith(vehicle.id);
  });
});
