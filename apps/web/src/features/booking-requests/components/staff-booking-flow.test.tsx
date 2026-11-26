import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PRICE_ROW } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { StaffBookingFlow } from './StaffBookingFlow';

/**
 * Luồng ĐẶT HỘ của gian hàng — cùng hành trình với luồng thuê xe của khách (26/10/2026).
 *
 * Khoá các hợp đồng:
 *  - thanh tiến trình là của luồng đặt hộ (ba chặng), không phải bốn chặng duyệt → giữ chỗ của khách;
 *  - cột xe KHÔNG chào hàng gian hàng cho chính gian hàng;
 *  - thông tin khách nhập ở màn Xem lại, bắt buộc, và đi vào payload cùng cọc thu trực tiếp;
 *  - trùng lịch giữ người dùng ở bước Chuyến đi; xe chưa có giá thì bắt nhập tiền thuê tay.
 */

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/** Xe NỘI BỘ (không lên chợ) — panel dùng tên/ảnh truyền vào, không có lịch bận công khai. */
vi.mock('@/features/marketplace/hooks/use-listing-detail', () => ({
  useListingDetail: () => ({ data: undefined, isLoading: false }),
}));

const api = vi.hoisted(() => ({
  quote: vi.fn(),
  busyDays: vi.fn(),
  conflict: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@/features/calendar/api', () => ({
  fetchCalendarQuote: (...a: unknown[]) => api.quote(...a),
  fetchCalendarBusyDays: (...a: unknown[]) => api.busyDays(...a),
}));
vi.mock('@/features/bookings/api', () => ({
  checkConflict: (...a: unknown[]) => api.conflict(...a),
  fetchBookingSourceLabels: () => Promise.resolve(['Nền tảng A']),
}));
vi.mock('@/features/bookings/hooks/use-booking-mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    useCreateBooking: () => useMutation({ mutationFn: (body: unknown) => api.create(body) }),
  };
});

const QUOTE = {
  rows: [
    { key: PRICE_ROW.BASE, label: '2 ngày × 750.000đ', amount: '1500000' },
    { key: PRICE_ROW.DISCOUNT, label: 'Khuyến mãi', amount: '-150000' },
  ],
  totalAmount: '1350000',
  depositAmount: '5000000',
  policySource: 'vehicle',
  estimateNote: null,
  longTerm: null,
};

function renderFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <StaffBookingFlow
          vehicleId="veh-1"
          vehicleName="Toyota Camry 2023"
          pickupAt="2027-11-03T01:00:00.000Z"
          returnAt="2027-11-05T01:00:00.000Z"
          onClose={vi.fn()}
        />
      </App>
    </QueryClientProvider>,
  );
}

/** Chọn một nguồn trong ô "Nguồn đơn" (ADR 0110) - AntD Select mở bằng mouseDown. */
function chooseSource(label: string) {
  fireEvent.mouseDown(screen.getByLabelText(/Nguồn đơn/));
  fireEvent.click(screen.getByTitle(label));
}

/** Sang màn Xem lại. Mặc định chọn sẵn nguồn "Khách quen" - nguồn đơn là ô bắt buộc. */
async function goToReview(options: { source?: string | null } = {}) {
  renderFlow();
  await screen.findByText('1.350.000 ₫', { selector: 'b' });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByText('Xem lại và tạo đơn thuê');
  const source = options.source === undefined ? 'Khách quen' : options.source;
  if (source) chooseSource(source);
}

beforeEach(() => {
  nav.push.mockReset();
  api.quote.mockReset().mockResolvedValue(QUOTE);
  api.busyDays.mockReset().mockResolvedValue({ days: [], from: '2026-10-25', to: '2027-10-26' });
  api.conflict.mockReset().mockResolvedValue({ hasConflict: false });
  api.create
    .mockReset()
    .mockResolvedValue({ id: 'bk-1', code: 'BK-000123', totalAmount: '1350000' });
});
afterEach(cleanup);

describe('StaffBookingFlow - bước Chuyến đi', () => {
  it('thanh tiến trình là của luồng đặt hộ: 3 chặng, đứng ở "Chọn chuyến"', () => {
    renderFlow();
    expect(screen.getByText('Bước 1 / 3 · Chọn chuyến')).toBeTruthy();
  });

  it('dòng tổng dính đáy đọc số từ báo giá server', async () => {
    renderFlow();
    const amount = await screen.findByText('1.350.000 ₫', { selector: 'b' });
    // Nhãn đứng CẠNH số trong cùng thanh — bảng chi tiết phía trên cũng mang nhãn này cho dòng tổng.
    expect(amount.parentElement?.textContent).toContain('Tổng tiền thuê');
  });

  it('xe NỘI BỘ (không có tin đăng) vẫn nạp lịch bận - qua cửa của gian hàng, không qua cửa công khai', async () => {
    // Bản trước chỉ hỏi cửa công khai khi xe có tin đăng ⇒ xe nội bộ không có ngày nào bị khoá.
    renderFlow();
    await waitFor(() => expect(api.busyDays).toHaveBeenCalled());
    expect(api.busyDays.mock.calls[0]![0]).toBe('veh-1');
  });

  it('không chào hàng gian hàng cho chính gian hàng - không có "Xem gian hàng"', () => {
    renderFlow();
    expect(screen.queryByText('Xem gian hàng')).toBeNull();
  });

  it('trùng lịch: ở lại bước Chuyến đi kèm lời báo, không sang màn Xem lại', async () => {
    api.conflict.mockResolvedValue({ hasConflict: true });
    renderFlow();
    await screen.findByText('1.350.000 ₫', { selector: 'b' });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(
      await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
    ).toBeTruthy();
    expect(screen.queryByText('Xem lại và tạo đơn thuê')).toBeNull();
  });
});

describe('StaffBookingFlow - màn Xem lại và tạo đơn', () => {
  it('đứng ở chặng 2/3, không có ô đồng ý điều khoản của khách', async () => {
    await goToReview();
    expect(screen.getByText('Bước 2 / 3 · Khách & xác nhận')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('thiếu tên/SĐT khách thì không tạo đơn', async () => {
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(await screen.findByText('Nhập tên khách')).toBeTruthy();
    expect(screen.getByText('Nhập số điện thoại khách')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('tạo đơn: payload mang khách, tiền từ báo giá và cọc thu trực tiếp điền sẵn; xong hiện mã đơn', async () => {
    await goToReview();
    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), {
      target: { value: 'Trần Thị B' },
    });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912 345 678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]![0]).toMatchObject({
      vehicleId: 'veh-1',
      customerName: 'Trần Thị B',
      customerPhone: '0912345678',
      serviceType: 'self_drive',
      baseAmount: '1500000',
      discountAmount: '150000',
      deliveryFee: '0',
      depositAmount: '5000000',
      returnAt: '2027-11-05T01:00:00.000Z',
      // Nguồn chủ xe chọn; nguồn không nhận nhãn thì nhãn là null.
      source: 'repeat_customer',
      sourceLabel: null,
    });

    expect(await screen.findByText('Đã tạo đơn thuê')).toBeTruthy();
    expect(screen.getByText('BK-000123')).toBeTruthy();
  });

  it('chưa chọn nguồn đơn thì không tạo đơn', async () => {
    await goToReview({ source: null });
    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'B' } });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(await screen.findByText('Vui lòng chọn nguồn đơn')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('nguồn "Nền tảng khác": bắt nhập tên nền tảng, tên đi vào payload', async () => {
    await goToReview({ source: 'Nền tảng khác' });
    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'B' } });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(await screen.findByText('Vui lòng nhập tên nguồn')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Tên nền tảng/), { target: { value: ' Nền tảng A ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]![0]).toMatchObject({
      source: 'other_platform',
      sourceLabel: 'Nền tảng A',
    });
  });

  it('xe vừa bị đặt mất khung giờ lúc tạo: báo đúng lỗi, không sang màn kết quả', async () => {
    api.create.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT,
        message: 'conflict',
      }),
    );
    await goToReview();
    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'B' } });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(
      await screen.findByText(
        'Xe vừa được đặt vào khung giờ này. Bấm “Chỉnh sửa” để chọn khoảng khác.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Đã tạo đơn thuê')).toBeNull();
  });
});

describe('StaffBookingFlow - xe chưa cấu hình giá', () => {
  it('bắt nhập tiền thuê tay trước khi tạo đơn - không tạo đơn 0đ âm thầm', async () => {
    api.quote.mockRejectedValue(
      new ApiClientError({ status: 400, code: API_ERROR_CODE.VALIDATION_FAILED, message: 'x' }),
    );
    renderFlow();
    expect(await screen.findByText('Nhập tiền thuê ở bước sau')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await screen.findByText('Xem lại và tạo đơn thuê');
    expect(
      screen.getByText('Xe chưa cấu hình giá ngày - nhập tiền thuê đã thoả thuận với khách.'),
    ).toBeTruthy();
    chooseSource('Khách quen');

    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'B' } });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(
      await screen.findByText('Xe chưa cấu hình giá - nhập tiền thuê trước khi tạo đơn.'),
    ).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });
});

describe('StaffBookingFlow - giá thoả thuận + cọc & thế chấp (ADR 0109)', () => {
  async function fillCustomer() {
    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'Khách C' } });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912345678' },
    });
  }

  it('bật giá thoả thuận: điền sẵn từ báo giá, sửa tiền thuê + phụ phí theo dòng, tổng tính lại', async () => {
    await goToReview();
    fireEvent.click(screen.getByRole('switch', { name: 'Giá thoả thuận' }));
    const base = (await screen.findByLabelText(/Tiền thuê \(cả kỳ\)/)) as HTMLInputElement;
    expect(base.value).toBe('1.500.000');
    expect((screen.getByLabelText('Giảm giá') as HTMLInputElement).value).toBe('150.000');

    fireEvent.change(base, { target: { value: '1800000' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm phụ phí/ }));
    fireEvent.change(screen.getByPlaceholderText('Ghế trẻ em'), {
      target: { value: 'Ghế trẻ em' },
    });
    fireEvent.change(screen.getByLabelText('Số tiền'), { target: { value: '100000' } });
    // 1.800.000 − 150.000 + 100.000
    // Tổng hiện ở thẻ "Tiền thuê" và ở hàng đáy - hai chỗ cùng một số.
    expect((await screen.findAllByText('1.750.000 ₫')).length).toBe(2);

    await fillCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]![0]).toMatchObject({
      baseAmount: '1800000',
      discountAmount: '150000',
      deliveryFee: '0',
      negotiatedPrice: true,
      extraCharges: [{ label: 'Ghế trẻ em', amount: '100000' }],
    });
  });

  it('giảm giá lớn hơn tiền thuê: báo lỗi, không tạo đơn', async () => {
    await goToReview();
    fireEvent.click(screen.getByRole('switch', { name: 'Giá thoả thuận' }));
    fireEvent.change(await screen.findByLabelText('Giảm giá'), { target: { value: '2000000' } });
    await fillCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(await screen.findByText('Giảm giá không được lớn hơn tiền thuê.')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('không có ô chọn hình thức bảo đảm - chỉ ô tiền cọc và danh sách tài sản', async () => {
    await goToReview();
    expect(screen.queryByText('Cả hai')).toBeNull();
    expect(screen.queryByText('Không cọc')).toBeNull();
    expect((screen.getByLabelText('Tiền cọc') as HTMLInputElement).value).toBe('5.000.000');
    expect(screen.getByRole('button', { name: /Thêm tài sản/ })).toBeTruthy();
  });

  it('cọc cả tiền lẫn tài sản: gửi cọc tiền + danh sách tài sản kèm mô tả', async () => {
    await goToReview();
    // Mỗi lượt bấm thêm một dòng (mặc định CCCD).
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài sản/ }));
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài sản/ }));
    const descriptions = screen.getAllByLabelText('Mô tả');
    fireEvent.change(descriptions[1]!, { target: { value: '59A1-12345' } });

    await fillCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const body = api.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.depositAmount).toBe('5000000');
    expect(body.collaterals).toEqual([
      { collateralType: 'citizen_id', description: null },
      { collateralType: 'citizen_id', description: '59A1-12345' },
    ]);
    expect(body).not.toHaveProperty('negotiatedPrice');
  });

  it('chỉ tài sản: xoá tiền cọc về 0, vẫn gửi danh sách tài sản', async () => {
    await goToReview();
    fireEvent.change(screen.getByLabelText('Tiền cọc'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài sản/ }));
    await fillCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const body = api.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.depositAmount).toBe('0');
    expect(body.collaterals).toEqual([{ collateralType: 'citizen_id', description: null }]);
  });

  it('không cọc: tiền cọc 0 và không thêm tài sản ⇒ không gửi khoản nào', async () => {
    await goToReview();
    fireEvent.change(screen.getByLabelText('Tiền cọc'), { target: { value: '0' } });
    await fillCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const body = api.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.depositAmount).toBe('0');
    expect(body).not.toHaveProperty('collaterals');
  });
});
