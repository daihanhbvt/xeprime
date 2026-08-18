import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleListItem } from '@/features/vehicles/types';
import { StaffBookingDialog } from './StaffBookingDialog';

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/**
 * Luồng đặt thật có cả chục dependency (báo giá, hồ sơ xe công khai, kiểm trùng lịch) — ở đây
 * chỉ cần biết vỏ đưa ĐÚNG props cho nó và đặt nó ĐÚNG chỗ trong thân overlay.
 */
const flow = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('./StaffBookingFlow', () => ({
  StaffBookingFlow: (props: Record<string, unknown>) => {
    flow.props = props;
    return <div data-testid="staff-booking-flow">{String(props.vehicleId)}</div>;
  },
}));

const list = vi.hoisted(() => ({
  vehicles: [] as VehicleListItem[],
  total: 0,
  isInitialLoading: false,
  initialError: null as unknown,
  appendError: null as unknown,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  retryInitial: vi.fn(),
  retryNextPage: vi.fn(),
  lastQuery: '' as string,
}));
vi.mock('@/features/vehicles/hooks/use-infinite-vehicles', () => ({
  useInfiniteVehicles: (q: string) => {
    list.lastQuery = q;
    return list;
  },
}));

function vehicle(overrides: Partial<VehicleListItem> = {}): VehicleListItem {
  return {
    id: 'veh-1',
    code: 'XM-012',
    name: 'Honda PCX 160 2022',
    plateNumber: '59X1-292.93',
    operationStatus: 'available',
    mainImageUrl: null,
    weekdayPrice: '260000',
    ...overrides,
  } as VehicleListItem;
}

function renderDialog(props: Partial<Parameters<typeof StaffBookingDialog>[0]> = {}) {
  return render(
    <App>
      <StaffBookingDialog open onClose={vi.fn()} {...props} />
    </App>,
  );
}

beforeEach(() => {
  flow.props = null;
  list.vehicles = [vehicle()];
  list.total = 1;
  list.isInitialLoading = false;
  list.initialError = null;
  list.appendError = null;
  list.hasNextPage = false;
  list.isFetchingNextPage = false;
  list.fetchNextPage = vi.fn();
  list.retryInitial = vi.fn();
  list.retryNextPage = vi.fn();
});
afterEach(cleanup);

describe('StaffBookingDialog — một hộp thoại cho mọi lối tạo đơn thủ công', () => {
  it('chưa biết xe: mở ở bước CHỌN XE, chọn xong mới vào luồng đặt', () => {
    renderDialog();
    expect(screen.getByText('Chọn xe cho đơn thuê')).toBeTruthy();
    expect(screen.queryByTestId('staff-booking-flow')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Honda PCX 160 2022/ }));

    expect(screen.getByTestId('staff-booking-flow').textContent).toBe('veh-1');
    expect(screen.getByText('Đặt xe cho khách')).toBeTruthy();
    // Chọn nhầm xe thì quay lại được — luồng tự render nút trong cột hồ sơ xe.
    expect(typeof flow.props?.onChangeVehicle).toBe('function');
  });

  it('biết trước xe (từ lịch): vào thẳng luồng, KHÔNG mở nhánh đổi xe', () => {
    renderDialog({
      vehicleId: 'veh-9',
      vehicleName: 'Toyota Vios',
      pickupAt: '2027-08-19T03:00:00.000Z',
    });
    expect(screen.getByTestId('staff-booking-flow').textContent).toBe('veh-9');
    expect(flow.props?.onChangeVehicle).toBeNull();
    expect(flow.props?.pickupAt).toBe('2027-08-19T03:00:00.000Z');
  });

  it('truyền prefill khách xuống luồng (lối vào từ hồ sơ khách)', () => {
    renderDialog({ vehicleId: 'veh-9', customerName: 'Đại A', customerPhone: '0912312312' });
    expect(flow.props?.customerName).toBe('Đại A');
    expect(flow.props?.customerPhone).toBe('0912312312');
  });

  /**
   * Chốt chặn bố cục: thân overlay cỡ `xl` cao CỐ ĐỊNH và `overflow: hidden`, còn luồng đặt là
   * `height: 100%`. Chèn bất cứ khối nào làm ANH EM của luồng sẽ đẩy hàng nút ở đáy cột phải ra
   * khỏi vùng thấy được — đúng lỗi "chọn xe, chọn giờ rồi mà không có nút nào để bấm".
   */
  it('luồng đặt là con DUY NHẤT của thân overlay — không khối nào ăn mất chiều cao của nó', () => {
    renderDialog({ vehicleId: 'veh-9' });
    const body = document.querySelector('.ant-modal-body');
    expect(body).toBeTruthy();
    expect(body!.children).toHaveLength(1);
    expect(body!.firstElementChild).toBe(screen.getByTestId('staff-booking-flow'));
  });
});

describe('StaffVehiclePicker — tải dần theo cuộn', () => {
  it('ô tìm kiếm đẩy từ khoá xuống hook (lọc ở server, không lọc trên mảng đã tải)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Tìm xe để đặt'), { target: { value: '59X1' } });
    // Ô tìm kiếm áp dụng sau khi ngừng gõ (AutoSearchInput debounce) — chờ đúng hành vi đó.
    await waitFor(() => expect(list.lastQuery).toBe('59X1'));
  });

  it('đang tải trang kế: báo rõ ở đáy, danh sách đang có giữ nguyên', () => {
    list.isFetchingNextPage = true;
    list.hasNextPage = true;
    renderDialog();
    expect(screen.getByText('Đang tải thêm xe…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Honda PCX 160 2022/ })).toBeTruthy();
  });

  it('lỗi TRANG KẾ chỉ hiện dòng thử lại — không nuốt mất xe đã hiện', () => {
    list.appendError = new Error('network');
    renderDialog();
    expect(screen.getByRole('button', { name: /Honda PCX 160 2022/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(list.retryNextPage).toHaveBeenCalled();
  });

  it('lỗi TRANG ĐẦU là màn lỗi toàn vùng có nút thử lại', () => {
    list.vehicles = [];
    list.initialError = new Error('network');
    renderDialog();
    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(list.retryInitial).toHaveBeenCalled();
  });

  it('hết trang: nói rõ đã hiện hết bao nhiêu xe', () => {
    list.total = 1;
    renderDialog();
    expect(screen.getByText('Đã hiện hết 1 xe')).toBeTruthy();
  });

  it('gian hàng chưa có xe: trạng thái rỗng, không phải màn lỗi', () => {
    list.vehicles = [];
    list.total = 0;
    renderDialog();
    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
  });
});
