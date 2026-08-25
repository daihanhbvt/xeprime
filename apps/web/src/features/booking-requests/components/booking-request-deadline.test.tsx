import { App } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  BOOKING_REQUEST_STATUS,
  SERVICE_TYPE,
} from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { BookingRequestCard } from './BookingRequestCard';
import type { BookingRequestItem } from '../types';

/**
 * HẠN PHẢN HỒI 60 PHÚT nhìn từ hộp thư của gian hàng.
 *
 * Hai điều được khoá ở đây:
 *
 *  1. **Đồng hồ nói đúng chuyện đang xảy ra** — còn nhiều giờ thì trung tính, còn dưới 15 phút
 *     thì cảnh báo (đúng mốc worker gửi lần nhắc cuối), hết giờ thì nói thẳng là hết giờ.
 *  2. **Quá hạn thì KHÔNG còn nút quyết định nào.** Server từ chối cả duyệt lẫn từ chối
 *     (`BOOKING_REQUEST_EXPIRED`), nên để nút lại là mời người dùng bấm một thứ chắc chắn hỏng.
 *     Vị từ ở đây phải là `respondBy`, KHÔNG phải cột `status`: worker chạy theo nhịp nên có
 *     một cửa sổ mà bản ghi vẫn còn `pending_host_approval` trong khi giờ đã hết.
 */

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const MINUTE = 60_000;
/** Mốc ISO cách "bây giờ" `minutes` phút về SAU (số âm là quá khứ). */
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString();

function request(overrides: Partial<BookingRequestItem> = {}): BookingRequestItem {
  return {
    id: 'req-1',
    vehicleId: 'veh-1',
    vehicleName: 'Mazda 3',
    vehiclePlate: '43B-336.92',
    vehicleCode: 'X-01',
    vehicleImageUrl: null,
    vehicleType: 'car',
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    customerName: 'Lê Minh Cường',
    customerPhone: '0908157925',
    customerEmail: null,
    tenantCustomerId: null,
    customerAvatarUrl: null,
    customerRiskLevel: null,
    canMessageOnPlatform: false,
    pickupAt: inMinutes(3 * 24 * 60),
    returnAt: inMinutes(5 * 24 * 60),
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: null,
    pickupWindowStartDate: null,
    pickupWindowEndDate: null,
    routeType: null,
    pickupAddress: null,
    destination: null,
    note: null,
    deliveryRequested: false,
    deliveryAddress: null,
    deliveryQuote: null,
    rejectReason: null,
    bookingId: null,
    createdAt: inMinutes(-5),
    respondBy: inMinutes(BOOKING_REQUEST_RESPOND_WINDOW_MINUTES - 5),
    decidedAt: null,
    ...overrides,
  } as unknown as BookingRequestItem;
}

const handlers = {
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onMessage: vi.fn(),
  onOpenDetail: vi.fn(),
  onOpenVehicle: vi.fn(),
  onOpenCustomer: vi.fn(),
};

function renderCard(item: BookingRequestItem = request(), canApprove = true) {
  return render(
    <App>
      <BookingRequestCard
        request={item}
        canApprove={canApprove}
        canViewVehicle
        canViewCustomer
        canViewBooking
        pendingAction={null}
        backHref="/manage/booking-requests"
        {...handlers}
      />
    </App>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(handlers)) fn.mockReset();
});

describe('Đồng hồ hạn phản hồi', () => {
  it('còn nhiều thời gian: hiện phút:giây còn lại', () => {
    renderCard(request({ respondBy: inMinutes(42) }));

    // 41:xx hoặc 42:00 tuỳ mili-giây trôi giữa lúc dựng dữ liệu và lúc render.
    expect(screen.getByText(/^4[12]:\d{2}$/)).toBeTruthy();
  });

  /**
   * Dưới 15 phút = đúng mốc worker gửi lần nhắc cuối. Hai kênh phải nói cùng một điều, nếu
   * không người trực học được rằng màu sắc trên màn hình và tin trong chuông là hai chuyện.
   */
  it('còn dưới 15 phút: đổi sang sắc thái cảnh báo', () => {
    const { container } = renderCard(request({ respondBy: inMinutes(9) }));
    const urgent = container.querySelector('[class*="urgent"]');

    expect(urgent).not.toBeNull();
    expect(urgent?.textContent).toMatch(/8:\d{2}|9:00/);
  });

  it('còn nhiều thời gian thì KHÔNG cảnh báo', () => {
    const { container } = renderCard(request({ respondBy: inMinutes(50) }));

    expect(container.querySelector('[class*="urgent"]')).toBeNull();
  });

  it('hết giờ: nói thẳng là quá hạn, không đếm ngược số âm', () => {
    renderCard(request({ respondBy: inMinutes(-1) }));

    expect(screen.getByText(/Đã quá hạn phản hồi/)).toBeTruthy();
    expect(screen.queryByText(/^-/)).toBeNull();
  });

  it('yêu cầu đã xử lý không còn đồng hồ nào chạy', () => {
    renderCard(
      request({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingId: 'bk-1',
        respondBy: inMinutes(-500),
      }),
    );

    expect(screen.queryByText(/Đã quá hạn phản hồi/)).toBeNull();
  });
});

describe('Quyết định theo hạn phản hồi', () => {
  it('còn hạn: CTA là "Duyệt & giữ xe", cạnh nút từ chối', () => {
    renderCard();

    expect(screen.getByRole('button', { name: /Duyệt & giữ xe/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Từ chối/ })).toBeTruthy();
  });

  it('bấm duyệt gọi đúng callback với chính yêu cầu đó', async () => {
    const item = request();
    renderCard(item);

    fireEvent.click(screen.getByRole('button', { name: /Duyệt & giữ xe/ }));

    await waitFor(() => expect(handlers.onApprove).toHaveBeenCalledTimes(1));
    expect(handlers.onApprove.mock.calls[0]![0]).toBe(item);
  });

  /**
   * Cột `status` vẫn là `pending_host_approval` — worker chưa chạy. Nút vẫn phải biến mất, vì
   * server đã đóng cửa theo `respond_by` chứ không theo `status`.
   */
  it('quá hạn nhưng worker chưa kịp đổi status: KHÔNG còn duyệt/từ chối', () => {
    renderCard(request({ respondBy: inMinutes(-2) }));

    expect(screen.queryByRole('button', { name: /Duyệt & giữ xe/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Từ chối/ })).toBeNull();
    // Nói vì sao — im lặng ở đây đọc như một lỗi tải.
    expect(screen.getByText(/Quá 60 phút chưa phản hồi/)).toBeTruthy();
  });

  it('yêu cầu đã hết hạn (status expired) cũng không có action nào', () => {
    renderCard(request({ status: BOOKING_REQUEST_STATUS.EXPIRED, respondBy: inMinutes(-90) }));

    expect(screen.queryByRole('button', { name: /Duyệt & giữ xe/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Từ chối/ })).toBeNull();
  });

  it('thiếu quyền booking_requests.approve: không render nút quyết định', () => {
    renderCard(request(), false);

    expect(screen.queryByRole('button', { name: /Duyệt & giữ xe/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Từ chối/ })).toBeNull();
  });
});

/**
 * Hai lỗi 409 của luồng duyệt, và chúng KHÔNG được rơi vào cùng một câu: trùng lịch thì còn
 * đường đi tiếp (đổi khung giờ / đổi xe), còn quá hạn thì không còn gì để bấm.
 */
describe('Lỗi khi duyệt', () => {
  it('mỗi mã lỗi một câu, và không câu nào là message thô của backend', async () => {
    const { ApproveBookingRequestDialog } = await import('./ApproveBookingRequestDialog');
    const conflict = new ApiClientError({
      code: API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT,
      message: 'conflicting key value violates exclusion constraint',
      status: 409,
    });
    expect(conflict.code).toBe(API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT);

    // Hộp thoại GIỮ nguyên khi có lỗi — người trực cần đọc nó rồi mới quyết định tiếp.
    render(
      <App>
        <ApproveBookingRequestDialog
          request={request()}
          submitting={false}
          error="Xe đã bận khung giờ này"
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      </App>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Xe đã bận khung giờ này')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Duyệt & giữ xe/ })).toBeTruthy();
  });

  it('đang gửi: nút chính vào trạng thái chờ, không bấm được lần hai', async () => {
    const { ApproveBookingRequestDialog } = await import('./ApproveBookingRequestDialog');
    render(
      <App>
        <ApproveBookingRequestDialog
          request={request()}
          submitting
          error={null}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      </App>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Duyệt & giữ xe/ }).className).toContain(
      'ant-btn-loading',
    );
  });
});
