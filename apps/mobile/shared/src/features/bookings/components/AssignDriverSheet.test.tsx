import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { SERVICE_TYPE } from '@xeprime/types';
import { driversApi } from '@/features/drivers/api';
import { withIntl } from '@/i18n/test-utils';
import type { AssignableDriver, BookingDetail } from '../api';
import { AssignDriverSheet } from './AssignDriverSheet';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

function driver(overrides: Partial<AssignableDriver> = {}): AssignableDriver {
  return {
    id: '01JQZX0000000000000000000D',
    name: 'Nguyễn Văn Tuấn',
    phone: '0901234567',
    busy: false,
    licenseExpired: false,
    ...overrides,
  } as AssignableDriver;
}

function booking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: '01JQZX0000000000000000000B',
    pickupAt: '2026-09-20T02:00:00.000Z',
    returnAt: '2026-09-22T02:00:00.000Z',
    serviceType: SERVICE_TYPE.WITH_DRIVER,
    driver: null,
    ...overrides,
  } as BookingDetail;
}

async function renderSheet(drivers: AssignableDriver[], overrides: Partial<BookingDetail> = {}) {
  const listSpy = jest.spyOn(driversApi, 'assignable').mockResolvedValue(drivers);
  const onSelect = jest.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const view = await render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AssignDriverSheet
          open
          onClose={jest.fn()}
          booking={booking(overrides)}
          onSelect={onSelect}
        />
      </QueryClientProvider>,
    ),
  );
  return { ...view, listSpy, onSelect };
}

/** Sáu tài xế — vượt ngưỡng hiện ô tìm (5). */
function manyDrivers(): AssignableDriver[] {
  return [
    driver({ id: 'd1', name: 'Nguyễn Văn Tuấn', phone: '0901111111' }),
    driver({ id: 'd2', name: 'Trần Thị Bích', phone: '0902222222' }),
    driver({ id: 'd3', name: 'Lê Văn Cường', phone: '0903333333' }),
    driver({ id: 'd4', name: 'Phạm Minh Dũng', phone: '0904444444' }),
    driver({ id: 'd5', name: 'Hoàng Văn Em', phone: '0905555555' }),
    driver({ id: 'd6', name: 'Vũ Thị Giang', phone: '0906666666' }),
  ];
}

beforeEach(() => jest.restoreAllMocks());

describe('AssignDriverSheet — cửa sổ hỏi', () => {
  it('hỏi theo khung giờ CỦA ĐƠN và trừ chính đơn đó ra', async () => {
    const view = await renderSheet([driver()]);

    expect(await view.findByText('Nguyễn Văn Tuấn')).toBeTruthy();
    // Thiếu `excludeBookingId` thì tài xế đang gán cho chính đơn này tự báo "bận".
    expect(view.listSpy).toHaveBeenCalledWith({
      pickupAt: '2026-09-20T02:00:00.000Z',
      returnAt: '2026-09-22T02:00:00.000Z',
      excludeBookingId: '01JQZX0000000000000000000B',
    });
  });
});

describe('AssignDriverSheet — người không khả dụng', () => {
  it('bận: VẪN hiện kèm lý do, nhưng không chọn được', async () => {
    const view = await renderSheet([driver({ busy: true })]);

    expect(await view.findByText('bận khung giờ này')).toBeTruthy();
    await fireEvent.press(view.getByText('Nguyễn Văn Tuấn'));
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it('GPLX hết hạn: cũng hiện kèm lý do và không chọn được', async () => {
    const view = await renderSheet([driver({ licenseExpired: true })]);

    expect(await view.findByText('GPLX hết hạn')).toBeTruthy();
    await fireEvent.press(view.getByText('Nguyễn Văn Tuấn'));
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it('khả dụng: chọn được và trả đúng id', async () => {
    const view = await renderSheet([driver()]);

    await fireEvent.press(await view.findByText('Nguyễn Văn Tuấn'));
    expect(view.onSelect).toHaveBeenCalledWith('01JQZX0000000000000000000D');
  });
});

describe('AssignDriverSheet — tìm trong danh sách', () => {
  it('ít tài xế: KHÔNG dựng ô tìm', async () => {
    const view = await renderSheet([driver()]);

    await view.findByText('Nguyễn Văn Tuấn');
    expect(view.queryByLabelText('Tìm tài xế')).toBeNull();
  });

  it('nhiều tài xế: có ô tìm, lọc được theo tên', async () => {
    const view = await renderSheet(manyDrivers());

    const search = await view.findByLabelText('Tìm tài xế');
    await fireEvent.changeText(search, 'bích');

    expect(view.getByText('Trần Thị Bích')).toBeTruthy();
    expect(view.queryByText('Nguyễn Văn Tuấn')).toBeNull();
  });

  it('lọc được theo SỐ ĐIỆN THOẠI — người trực nhớ số trước khi nhớ tên', async () => {
    const view = await renderSheet(manyDrivers());

    await fireEvent.changeText(await view.findByLabelText('Tìm tài xế'), '0903');

    expect(view.getByText('Lê Văn Cường')).toBeTruthy();
    expect(view.queryByText('Trần Thị Bích')).toBeNull();
  });

  it('tìm hụt nói KHÁC gian hàng chưa có tài xế nào', async () => {
    const view = await renderSheet(manyDrivers());

    await fireEvent.changeText(await view.findByLabelText('Tìm tài xế'), 'zzz');

    expect(view.getByText('Không có tài xế nào khớp “zzz”')).toBeTruthy();
    expect(view.queryByText('Chưa có tài xế nào đang hoạt động')).toBeNull();
  });
});

describe('AssignDriverSheet — chỉ là nơi CHỌN người', () => {
  /*
   * "Bỏ gán" sống ở hàng tài xế trên màn đơn, cạnh "Đổi" — đúng như web. Ở cả hai nơi thì cùng
   * một việc có hai lối, và lối nằm trong tấm chọn là lối không ai nghĩ tới khi muốn GỠ người.
   */
  it('đơn ĐÃ có tài xế: tấm chọn vẫn KHÔNG có nút bỏ gán', async () => {
    const view = await renderSheet([driver()], {
      driver: { id: '01JQZX0000000000000000000D', name: 'Nguyễn Văn Tuấn', phone: '0901234567' },
    } as Partial<BookingDetail>);

    await view.findByText('Nguyễn Văn Tuấn');
    expect(view.queryByRole('button', { name: 'Bỏ gán' })).toBeNull();
  });

  it('người đang gán được đánh dấu đã chọn', async () => {
    const view = await renderSheet([driver()], {
      driver: { id: '01JQZX0000000000000000000D', name: 'Nguyễn Văn Tuấn', phone: '0901234567' },
    } as Partial<BookingDetail>);

    const row = await view.findByRole('button', { name: /Nguyễn Văn Tuấn/ });
    expect(row.props.accessibilityState.selected).toBe(true);
  });
});
