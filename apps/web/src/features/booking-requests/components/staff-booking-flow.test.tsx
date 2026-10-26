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

async function goToReview() {
  renderFlow();
  await screen.findByText('1.350.000 ₫', { selector: 'b' });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByText('Xem lại và tạo đơn thuê');
}

beforeEach(() => {
  nav.push.mockReset();
  api.quote.mockReset().mockResolvedValue(QUOTE);
  api.busyDays.mockReset().mockResolvedValue({ days: [], from: '2026-10-25', to: '2027-10-26' });
  api.conflict.mockReset().mockResolvedValue({ hasConflict: false });
  api.create.mockReset().mockResolvedValue({ id: 'bk-1', code: 'BK-000123' });
});
afterEach(cleanup);

describe('StaffBookingFlow — bước Chuyến đi', () => {
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

  it('xe NỘI BỘ (không có tin đăng) vẫn nạp lịch bận — qua cửa của gian hàng, không qua cửa công khai', async () => {
    // Bản trước chỉ hỏi cửa công khai khi xe có tin đăng ⇒ xe nội bộ không có ngày nào bị khoá.
    renderFlow();
    await waitFor(() => expect(api.busyDays).toHaveBeenCalled());
    expect(api.busyDays.mock.calls[0]![0]).toBe('veh-1');
  });

  it('không chào hàng gian hàng cho chính gian hàng — không có "Xem gian hàng"', () => {
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

describe('StaffBookingFlow — màn Xem lại và tạo đơn', () => {
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
    });

    expect(await screen.findByText('Đã tạo đơn thuê')).toBeTruthy();
    expect(screen.getByText('BK-000123')).toBeTruthy();
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

describe('StaffBookingFlow — xe chưa cấu hình giá', () => {
  it('bắt nhập tiền thuê tay trước khi tạo đơn — không tạo đơn 0đ âm thầm', async () => {
    api.quote.mockRejectedValue(
      new ApiClientError({ status: 400, code: API_ERROR_CODE.VALIDATION_FAILED, message: 'x' }),
    );
    renderFlow();
    expect(await screen.findByText('Nhập tiền thuê ở bước sau')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await screen.findByText('Xem lại và tạo đơn thuê');
    expect(
      screen.getByText('Xe chưa cấu hình giá ngày — nhập tiền thuê đã thoả thuận với khách.'),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'B' } });
    fireEvent.change(screen.getByPlaceholderText('0901234567'), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn thuê' }));
    expect(
      await screen.findByText('Xe chưa cấu hình giá — nhập tiền thuê trước khi tạo đơn.'),
    ).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });
});
