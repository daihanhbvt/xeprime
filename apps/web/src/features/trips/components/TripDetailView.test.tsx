import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TRIP_STAGE, DEPOSIT_STATUS } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';

import { TripDetailView } from './TripDetailView';
import type { CustomerTripDetail } from '../types';

/**
 * Chi tiết chuyến — MỘT kiến trúc, các khối bật/tắt theo chặng.
 *
 * Điều được khoá ở đây là mấy chỗ dễ trôi nhất khi mở rộng vòng đời: yêu cầu chờ duyệt không
 * được có dòng thời gian, chuyến hỏng không được hiện như đã đi hết, và khách không bao giờ có
 * nút xác nhận giao/nhận xe (đó là việc của chủ xe — Wave 10).
 */
const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

const cancelMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));
vi.mock('../hooks', () => ({
  useTrip: () => query,
  useCancelTrip: () => cancelMutation,
  // Khối bằng chứng bàn giao có test riêng (`TripHandoverEvidence.test.tsx`); ở đây chỉ cần
  // nó im lặng để không kéo một truy vấn thật vào test của trang.
  useTripHandoverEvidence: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: undefined,
  }),
  useTripHandoverPhotos: () => ({ data: undefined, isFetching: false }),
  photoKey: (type: string, slot: string) => type + ':' + slot,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useParams: () => ({ id: 'RQ1' }),
}));

vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
  useNextFromCurrentPath: () => () => '/trips/RQ1',
}));

vi.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: ({ label }: { label?: string }) => <button type="button">{label}</button>,
}));

const TRIP: CustomerTripDetail = {
  id: 'RQ1',
  bookingId: 'BK1',
  code: 'XP-2026-0042',
  stage: CUSTOMER_TRIP_STAGE.READY,
  vehicle: {
    id: 'V1',
    name: 'Toyota Camry 2024',
    imageUrl: null,
    seatCount: 5,
    transmission: 'Tự động',
    fuelType: 'Xăng',
    plateNumber: '43A-123.45',
  },
  shop: {
    name: 'Gian hàng Minh Tuấn',
    slug: 'minh-tuan',
    ratingAvg: 4.8,
    ratingCount: 12,
    phone: '0909123456',
  },
  pickupAt: '2026-08-09T14:00:00.000Z',
  returnAt: '2026-08-12T14:00:00.000Z',
  serviceType: 'self_drive',
  deliveryRequested: true,
  deliveryAddress: '123 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
  totalAmount: '2772000.00',
  canReview: false,
  hasReview: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  customerNote: null,
  rejectReason: null,
  actualPickupAt: null,
  actualReturnAt: null,
  review: null,
  finance: {
    currency: 'VND',
    baseAmount: '3150000.00',
    discountAmount: '378000.00',
    deliveryFee: '0.00',
    rentalTotal: '2772000.00',
    surcharges: [],
    surchargeTotal: '0.00',
    finalTotal: '2772000.00',
    rentalPaid: '0.00',
    depositRequired: '0.00',
    depositReceived: '0.00',
    depositDeducted: '0.00',
    additionalDue: '0.00',
    expectedRefund: '0.00',
    depositStatus: DEPOSIT_STATUS.NONE,
    refundAmount: null,
    refundMethod: null,
    refundedAt: null,
    refundReference: null,
    legacyPricing: false,
  },
};

function setTrip(patch: Partial<CustomerTripDetail>) {
  query.data = { ...TRIP, ...patch };
}

beforeEach(() => {
  query.isLoading = false;
  query.isError = false;
  query.error = undefined;
  cancelMutation.mutate.mockReset();
  cancelMutation.isPending = false;
  cancelMutation.isError = false;
  cancelMutation.error = undefined;
  setTrip({});
});

afterEach(cleanup);

function renderView() {
  return render(
    <App>
      <TripDetailView tripId="RQ1" />
    </App>,
  );
}

function timeline(): HTMLElement | null {
  return screen.queryByLabelText(/Tiến trình chuyến/);
}

describe('Chờ chủ xe xác nhận', () => {
  beforeEach(() =>
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL,
      bookingId: null,
      code: null,
      finance: null,
      totalAmount: null,
      vehicle: { ...TRIP.vehicle, plateNumber: null },
    }),
  );

  it('KHÔNG dựng dòng thời gian hai mốc', () => {
    renderView();
    expect(timeline()).toBeNull();
  });

  it('nói rõ đang chờ và chưa có giá chốt', () => {
    renderView();
    expect(screen.getByText('Đang chờ chủ xe xác nhận')).toBeTruthy();
    expect(screen.getByText(/Giá chính thức sẽ hiển thị ngay khi chủ xe xác nhận/)).toBeTruthy();
  });
});

describe('Sẵn sàng và Đang thuê', () => {
  it('cả hai dùng đúng hai mốc, không sinh mốc thứ ba', () => {
    for (const stage of [CUSTOMER_TRIP_STAGE.READY, CUSTOMER_TRIP_STAGE.ACTIVE]) {
      setTrip({ stage });
      const { unmount } = renderView();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByText('Đã xác nhận')).toBeTruthy();
      expect(screen.getByText('Hoàn thành')).toBeTruthy();
      unmount();
    }
  });

  it('Đang thuê là BADGE trạng thái, không phải một mốc trên dòng thời gian', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE });
    renderView();
    expect(screen.getByText('Đang thuê')).toBeTruthy();
    expect(timeline()?.textContent).not.toContain('Đang thuê');
  });

  it('khách KHÔNG có nút xác nhận giao/nhận xe', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE });
    renderView();
    const labels = screen.queryAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(labels.some((label) => /xác nhận.*(giao|nhận) xe/i.test(label))).toBe(false);
  });

  it('vẫn liên hệ được chủ xe', () => {
    renderView();
    expect(screen.getByText('Nhắn tin cho cửa hàng')).toBeTruthy();
  });
});

describe('Hoàn thành', () => {
  beforeEach(() =>
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.COMPLETED,
      canReview: true,
      actualPickupAt: '2026-08-09T14:00:00.000Z',
      actualReturnAt: '2026-08-12T15:30:00.000Z',
    }),
  );

  it('đóng cả hai mốc', () => {
    renderView();
    const items = screen.getAllByRole('listitem');
    expect(items.every((item) => item.textContent?.includes('đã xong'))).toBe(true);
  });

  it('hiện hành trình thực tế và mở nút đánh giá', () => {
    renderView();
    expect(screen.getByText('Hành trình thực tế')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đánh giá/ })).toBeTruthy();
  });

  it('đã đánh giá rồi thì hiện lại đánh giá, không mời đánh giá lần hai', () => {
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.COMPLETED,
      canReview: false,
      hasReview: true,
      review: {
        id: 'RV1',
        rating: 5,
        comment: 'Xe cực kỳ mới',
        createdAt: '2026-08-13T00:00:00.000Z',
      },
    });
    renderView();
    expect(screen.getByText('Xe cực kỳ mới')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đánh giá/ })).toBeNull();
  });
});

describe('Kết cục hỏng', () => {
  it('bị từ chối: có khối riêng, KHÔNG có dòng thời gian', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.REJECTED, rejectReason: 'Xe bận lịch khác' });
    renderView();
    expect(timeline()).toBeNull();
    expect(screen.getByText('Yêu cầu bị từ chối')).toBeTruthy();
    expect(screen.getByText('Xe bận lịch khác')).toBeTruthy();
  });

  it('đã hủy và không-nhận-xe là hai câu khác nhau, không cái nào hiện như đi hết chuyến', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.CANCELLED });
    const cancelled = renderView();
    expect(screen.getByText('Chuyến đi đã hủy')).toBeTruthy();
    expect(timeline()).toBeNull();
    cancelled.unmount();

    setTrip({ stage: CUSTOMER_TRIP_STAGE.NO_SHOW });
    renderView();
    expect(screen.getByText('Khách không nhận xe')).toBeTruthy();
    expect(timeline()).toBeNull();
  });
});

describe('Không tìm thấy / lỗi', () => {
  it('chuyến của người khác và chuyến không tồn tại nói CÙNG một câu', () => {
    query.isError = true;
    query.data = undefined;
    query.error = new ApiClientError({
      code: 'NOT_FOUND',
      message: 'Không tìm thấy chuyến đi này',
      status: 404,
    });
    renderView();
    // Không có chỗ nào phân biệt "có tồn tại nhưng không phải của bạn".
    expect(screen.getByText('Chuyến đi không tồn tại hoặc đã bị xóa')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  /**
   * Wave 11.1 — nhánh theo MÃ lỗi có cấu trúc. Đổi một chữ trong câu tiếng Việt ở backend không
   * được phép biến màn "không tìm thấy" thành màn "lỗi tải, thử lại".
   */
  it('nhận diện 404 theo mã, không theo câu tiếng Việt', () => {
    query.isError = true;
    query.data = undefined;
    query.error = new ApiClientError({
      code: 'NOT_FOUND',
      message: 'Trip could not be resolved',
      status: 404,
    });
    renderView();
    expect(screen.getByText('Chuyến đi không tồn tại hoặc đã bị xóa')).toBeTruthy();
  });

  it('lỗi khác 404 thì vẫn mời thử lại', () => {
    query.isError = true;
    query.data = undefined;
    query.error = new ApiClientError({ code: 'INTERNAL', message: 'Sập mạng', status: 500 });
    renderView();
    expect(screen.getByText('Không tải được chuyến đi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('hết phiên mời đăng nhập lại', () => {
    query.isError = true;
    query.data = undefined;
    query.error = new ApiClientError({
      code: 'UNAUTHENTICATED',
      message: 'Hết phiên',
      status: 401,
    });
    renderView();
    expect(screen.getByText('Phiên đăng nhập đã hết hạn')).toBeTruthy();
  });
});

/**
 * Khách tự huỷ chuyến (20/08). Nút này là LỐI THOÁT khi gian hàng im lặng — trước đó
 * `cancelled_by_customer` là trạng thái chỉ đọc được mà không endpoint nào ghi ra được.
 *
 * Ranh giới khoá ở đây: **xe chưa rời bãi**. Sau khi đã giao xe thì việc cần làm là gọi chủ xe,
 * và một nút "Huỷ" ở đó chỉ là lời hứa hão.
 */
describe('Huỷ chuyến', () => {
  it('chờ duyệt → có nút huỷ', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL });
    renderView();
    expect(screen.getByRole('button', { name: 'Huỷ chuyến' })).toBeTruthy();
  });

  it('đã duyệt, chưa giao xe → vẫn huỷ được', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.READY });
    renderView();
    expect(screen.getByRole('button', { name: 'Huỷ chuyến' })).toBeTruthy();
  });

  it('ĐANG THUÊ → không còn nút huỷ', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE });
    renderView();
    expect(screen.queryByRole('button', { name: 'Huỷ chuyến' })).toBeNull();
  });

  it('đã hoàn thành / đã huỷ → không có nút huỷ', () => {
    for (const stage of [CUSTOMER_TRIP_STAGE.COMPLETED, CUSTOMER_TRIP_STAGE.CANCELLED] as const) {
      cleanup();
      setTrip({ stage });
      renderView();
      expect(screen.queryByRole('button', { name: 'Huỷ chuyến' })).toBeNull();
    }
  });

  it('bấm huỷ mở hộp xác nhận, KHÔNG gọi API ngay', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL });
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến' }));

    expect(screen.getByText('Huỷ chuyến đi?')).toBeTruthy();
    expect(cancelMutation.mutate).not.toHaveBeenCalled();
  });

  /**
   * XePrime không có cổng thanh toán (design 14 §5): huỷ KHÔNG hoàn lại đồng nào một cách tự
   * động. Nói trước khi khách bấm, không để họ phát hiện ra sau.
   */
  it('đã thanh toán thì cảnh báo trước, và nói rõ hệ thống không tự chuyển tiền', () => {
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.READY,
      finance: { ...TRIP.finance!, rentalPaid: '500000.00', depositReceived: '1000000.00' },
    });
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến' }));

    expect(screen.getByText('Bạn đã thanh toán cho chuyến này')).toBeTruthy();
    expect(screen.getByText(/không tự chuyển tiền/)).toBeTruthy();
  });
});
