import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingPickerFilters } from '@/features/vehicles/hooks/use-booking-picker-vehicles';
import type { VehicleBookingPickerItem } from '@/features/vehicles/types';
import { StaffBookingDialog } from './StaffBookingDialog';

// Ô lọc chi nhánh đọc server (ADR 0052) — chặn ở tầng hook như mọi hook dữ liệu khác ở bộ này.
vi.mock(
  '@/features/branches/hooks/use-branch-filter',
  () => import('@/features/branches/test-utils'),
);

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

// Nhãn nhiên liệu đọc danh mục từ server — thẻ chỉ cần một nhãn cố định.
vi.mock('@/features/catalog/use-catalog', () => ({
  useCatalogLabels: () => ({
    brandLabel: (key: string | null) => key,
    bodyTypeLabel: (key: string | null) => key,
    fuelTypeLabel: (key: string | null) => (key === 'gasoline' ? 'Xăng' : key),
    featureLabel: (key: string) => key,
  }),
}));

// Báo giá nội bộ cho dòng tạm tính ở chân hộp.
const quote = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/features/calendar/api', () => ({ fetchCalendarQuote: quote.fetch }));

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
  vehicles: [] as VehicleBookingPickerItem[],
  total: 0,
  isInitialLoading: false,
  initialError: null as unknown,
  appendError: null as unknown,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  retryInitial: vi.fn(),
  retryNextPage: vi.fn(),
  lastFilters: null as BookingPickerFilters | null,
}));
vi.mock('@/features/vehicles/hooks/use-booking-picker-vehicles', () => ({
  useBookingPickerVehicles: (filters: BookingPickerFilters) => {
    list.lastFilters = filters;
    return list;
  },
}));

function vehicle(overrides: Partial<VehicleBookingPickerItem> = {}): VehicleBookingPickerItem {
  return {
    id: 'veh-1',
    code: 'OT-012',
    name: 'Toyota Corolla Cross',
    plateNumber: '51K-292.93',
    vehicleType: 'car',
    serviceTypes: ['self_drive'],
    operationStatus: 'available',
    mainImageUrl: null,
    seatCount: 5,
    transmission: 'automatic',
    fuelType: 'gasoline',
    discountPercent: null,
    weekdayPrice: '860000',
    deliveryEnabled: true,
    noCollateral: false,
    instantBookServiceTypes: [],
    ratingAvg: null,
    ratingCount: 0,
    wardName: 'Phường An Phú',
    provinceName: 'TP. Hồ Chí Minh',
    busy: false,
    ...overrides,
  };
}

function renderDialog(props: Partial<Parameters<typeof StaffBookingDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <StaffBookingDialog open onClose={vi.fn()} {...props} />
      </App>
    </QueryClientProvider>,
  );
}

const cardButton = (name: RegExp) => screen.getByRole('button', { name, pressed: false });
const continueButton = () => screen.getByRole('button', { name: 'Tiếp tục' });

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
  list.lastFilters = null;
  quote.fetch.mockReset();
  quote.fetch.mockResolvedValue({ days: 2, totalAmount: '1720000', rows: [] });
});
afterEach(cleanup);

describe('StaffBookingDialog - một hộp thoại cho mọi lối tạo đơn thủ công', () => {
  it('chưa biết xe: mở ở bước CHỌN XE, chọn thẻ rồi bấm Tiếp tục mới vào luồng đặt', async () => {
    renderDialog();
    expect(screen.getByText('Tạo đơn thuê xe cho khách')).toBeTruthy();
    expect(
      screen.getByText('Chọn phương tiện còn trống để tiến hành các bước tạo đơn'),
    ).toBeTruthy();
    expect(continueButton().hasAttribute('disabled')).toBe(true);

    fireEvent.click(cardButton(/Toyota Corolla Cross/));
    // Chưa nhảy bước: chân hộp hiện tạm tính của xe vừa chọn trong khung giờ.
    expect(screen.queryByTestId('staff-booking-flow')).toBeNull();
    await waitFor(() => expect(screen.getByText(/1\.720\.000/)).toBeTruthy());
    expect(quote.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'veh-1', serviceType: 'self_drive' }),
    );

    fireEvent.click(continueButton());
    expect(screen.getByTestId('staff-booking-flow').textContent).toBe('veh-1');
    expect(screen.getByText('Đặt xe cho khách')).toBeTruthy();
    // Khung giờ chọn ở bước chọn xe thành giá trị mở đầu của bước Chuyến đi.
    expect(flow.props?.pickupAt).toBe(list.lastFilters?.pickupAt);
    expect(flow.props?.returnAt).toBe(list.lastFilters?.returnAt);
    // Chọn nhầm xe thì quay lại được — luồng tự render nút trong cột hồ sơ xe.
    expect(typeof flow.props?.onChangeVehicle).toBe('function');
  });

  it('Quay lại ở bước chọn xe là đóng hộp', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(onClose).toHaveBeenCalled();
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
  it('luồng đặt là con DUY NHẤT của thân overlay - không khối nào ăn mất chiều cao của nó', () => {
    renderDialog({ vehicleId: 'veh-9' });
    const body = document.querySelector('.ant-modal-body');
    expect(body).toBeTruthy();
    expect(body!.children).toHaveLength(1);
    expect(body!.firstElementChild).toBe(screen.getByTestId('staff-booking-flow'));
  });
});

describe('StaffVehiclePicker - lọc theo khung giờ, tải dần theo cuộn', () => {
  it('mở ra đã có khung giờ mặc định và lọc ô tô — hook được gọi với đủ tham số', () => {
    renderDialog();
    expect(list.lastFilters?.vehicleType).toBe('car');
    expect(list.lastFilters?.pickupAt).toMatch(/Z$/);
    expect(list.lastFilters?.returnAt).toMatch(/Z$/);
  });

  it('ô Loại chuyển sang xe máy', () => {
    renderDialog();
    fireEvent.click(screen.getByText('Xe máy'));
    expect(list.lastFilters?.vehicleType).toBe('motorbike');
  });

  it('ô tìm kiếm đẩy từ khoá xuống hook (lọc ở server, không lọc trên mảng đã tải)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Tìm xe để đặt'), { target: { value: '51K' } });
    // Ô tìm kiếm áp dụng sau khi ngừng gõ (AutoSearchInput debounce) — chờ đúng hành vi đó.
    await waitFor(() => expect(list.lastFilters?.q).toBe('51K'));
  });

  it('xe đã có lịch trong khung giờ: vẫn hiện, nhãn "Đã có lịch", không chọn được', () => {
    list.vehicles = [vehicle({ id: 'veh-2', name: 'Mazda CX-5', busy: true })];
    renderDialog();
    expect(screen.getByText('Đã có lịch')).toBeTruthy();
    const card = screen.getByRole('button', { name: /Mazda CX-5/ });
    expect(card.hasAttribute('disabled')).toBe(true);
    fireEvent.click(card);
    expect(continueButton().hasAttribute('disabled')).toBe(true);
  });

  it('thẻ có hàng "Biển số xe" + giá/ngày (design cập nhật 25/11)', () => {
    renderDialog();
    expect(screen.getByText('Biển số xe')).toBeTruthy();
    expect(screen.getByText('51K-292.93')).toBeTruthy();
    expect(screen.getByText('/ngày')).toBeTruthy();
    // Không khuyến mãi ⇒ không có giá gốc gạch ngang.
    expect(document.querySelector('s')).toBeNull();
  });

  it('xe có khuyến mãi: giá gốc gạch ngang nằm trên giá đã giảm', () => {
    list.vehicles = [vehicle({ discountPercent: 20, weekdayPrice: '1050000' })];
    renderDialog();
    expect(document.querySelector('s')?.textContent).toMatch(/1[.,]05/);
  });

  it('xe chưa có biển số: hiện mã xe thay vào', () => {
    list.vehicles = [vehicle({ plateNumber: null })];
    renderDialog();
    expect(screen.getByText('Mã xe')).toBeTruthy();
    expect(screen.getByText('OT-012')).toBeTruthy();
  });

  it('đang tải trang kế: báo rõ ở đáy, danh sách đang có giữ nguyên', () => {
    list.isFetchingNextPage = true;
    list.hasNextPage = true;
    renderDialog();
    expect(screen.getByText('Đang tải thêm xe…')).toBeTruthy();
    expect(cardButton(/Toyota Corolla Cross/)).toBeTruthy();
  });

  it('lỗi TRANG KẾ chỉ hiện dòng thử lại - không nuốt mất xe đã hiện', () => {
    list.appendError = new Error('network');
    renderDialog();
    expect(cardButton(/Toyota Corolla Cross/)).toBeTruthy();
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

  it('gian hàng chưa có ô tô: trạng thái rỗng theo loại, không phải màn lỗi', () => {
    list.vehicles = [];
    list.total = 0;
    renderDialog();
    expect(screen.getByText('Gian hàng chưa có ô tô nào')).toBeTruthy();
  });
});
