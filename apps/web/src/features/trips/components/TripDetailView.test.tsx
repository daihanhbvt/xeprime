import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_HOLD_STATUS,
  CUSTOMER_CANCEL_PREVIEW_KIND,
  CUSTOMER_TRIP_STAGE,
  DEPOSIT_STATUS,
  STOREFRONT_KIND,
  TRIP_ROLE,
} from '@xeprime/types';
import { SUPPORT_HOTLINE } from '@/constants/contact';
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

/**
 * Xem trước lượt huỷ (ADR 0064) — server tính; test đặt thẳng kết quả. Mặc định chưa có dữ liệu:
 * hộp xác nhận không vẽ khối tiền nào.
 */
const cancelPreview = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
}));

const cancelMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));
// Thanh toán qua cổng có test riêng (`features/payment-gateway`); ở đây hai khối đó im lặng để không
// kéo truy vấn cấu hình cổng / trạng thái lượt thanh toán thật vào test của trang.
vi.mock('@/features/payment-gateway/components/TripGatewayOptions', () => ({
  TripGatewayOptions: () => null,
}));
vi.mock('@/features/payment-gateway/components/TripGatewayReturn', () => ({
  TripGatewayReturn: () => null,
}));

/** Tin đăng công khai của xe — chỉ màn chờ chủ xe phản hồi đọc (điểm nhận, ảnh chủ xe, điều khoản). */
const listingQuery = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
/** Tài khoản đang xem — thẻ "Thông tin người thuê" của màn chờ chủ xe phản hồi (ADR 0060). */
const me = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => me }));
vi.mock('@/features/marketplace/hooks/use-listing-detail', () => ({
  useListingDetail: () => listingQuery,
}));
vi.mock('@/features/driver-licence/hooks/use-driver-licence', () => ({
  useDriverLicence: () => ({ data: undefined }),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

vi.mock('../hooks', () => ({
  useTrip: () => query,
  useCancelTrip: () => cancelMutation,
  useTripCancelPreview: () => cancelPreview,
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
  // Fixture là chuyến KHÁCH ĐI THUÊ — đúng phía mà màn chi tiết này phục vụ.
  role: TRIP_ROLE.RENTER,
  renter: null,
  respondBy: null,
  canContact: true,
  // GCN bảo hiểm (ADR 0064) — chuyến này chưa bàn giao nên chưa có giấy nào.
  insuranceCertificates: [],
  insuranceCoverage: [],
  // Chuyến đã có đơn ⇒ giá đã chốt, không phải số tạm tính.
  totalIsEstimate: false,
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
    shopKind: STOREFRONT_KIND.SHOP,
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

/** Nút huỷ: "Huỷ chuyến đi" ở các màn hành trình design v2, "Huỷ chuyến" ở bố cục cũ. */
const CANCEL_TRIP = /^Huỷ chuyến( đi)?$/;

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
  listingQuery.data = undefined;
  listingQuery.isLoading = false;
  me.data = undefined;
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

/**
 * Yêu cầu của KHÁCH còn chờ chủ xe phản hồi — màn design v2 (Figma `19727:60694`).
 *
 * Điều được khoá: yêu cầu chờ duyệt KHÔNG giữ xe và KHÔNG thu tiền (ADR 0044 điều 1), tiến trình
 * chỉ hứa bước giữ chỗ khi chuyến thật sự có khoản đó, kênh nhắn tin theo `canContact` của server
 * (chưa mở thì ẩn hẳn), và lối thoát huỷ luôn đi qua hộp xác nhận.
 */
/** Bảng kê của một chuyến chưa thành đơn — có khoản giữ chỗ 500.000đ, phần trả tay 1.327.000đ. */
const ESTIMATE = {
  rows: [
    { key: 'base', label: 'Tiền thuê', sublabel: '2 ngày × 870.000đ / ngày', amount: '1740000' },
  ],
  rentalTotal: '1740000',
  depositAmount: '3000000',
  fees: {
    billingMode: 'commission',
    lines: [
      {
        key: 'service_fee',
        bearer: 'customer',
        beneficiary: 'platform',
        percent: 5,
        amount: '87000',
      },
    ],
    customerTotalAmount: '1827000',
    promoDiscountAmount: '0',
    payAtPickupAmount: '1327000',
    holdAmount: '500000',
  },
} as unknown as NonNullable<CustomerTripDetail['estimate']>;

describe('Chờ chủ xe phản hồi (khách)', () => {
  const PENDING: Partial<CustomerTripDetail> = {
    stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL,
    bookingId: null,
    code: null,
    finance: null,
    totalAmount: null,
    totalIsEstimate: true,
    // Tuyến hoa hồng còn chờ duyệt: chưa mở kênh liên hệ (ADR 0028 điều 9).
    canContact: false,
    vehicle: { ...TRIP.vehicle, plateNumber: null },
  };

  beforeEach(() =>
    setTrip({ ...PENDING, respondBy: new Date(Date.now() + 30 * 60_000).toISOString() }),
  );

  it('KHÔNG dựng dòng thời gian hai mốc', () => {
    renderView();
    expect(timeline()).toBeNull();
  });

  it('thẻ trạng thái: đã tiếp nhận, nhãn chặng chung, kèm đồng hồ hạn phản hồi', () => {
    renderView();
    // `h1` là tiêu đề trang (đầu trang design v2); thẻ trạng thái là `h2` ngay dưới nó.
    expect(screen.getByRole('heading', { level: 1, name: 'Đã gửi yêu cầu thuê xe' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Yêu cầu của bạn đã được tiếp nhận' }),
    ).toBeTruthy();
    // Nhãn chặng đọc từ `Domain` — cùng chữ với danh sách chuyến (ADR 0005).
    expect(screen.getByText('Chờ xác nhận')).toBeTruthy();
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Còn'))).toBe(true);
    // Yêu cầu chờ duyệt KHÔNG giữ xe — không được đọc như "đã đặt được".
    expect(screen.getByText(/Xe chưa được giữ cho bạn/)).toBeTruthy();
  });

  it('chưa báo giá được ⇒ nói thẳng là chưa có giá chốt, vẫn hứa bước giữ chỗ như luồng đặt xe', () => {
    renderView();
    expect(screen.getByText(/Giá chính thức sẽ hiển thị ngay khi chủ xe xác nhận/)).toBeTruthy();
    expect(screen.queryByText('Liên hệ báo giá')).toBeNull();
    const progress = screen.getByRole('region', { name: 'Tiến trình yêu cầu' });
    expect(within(progress).getAllByRole('listitem')).toHaveLength(4);
  });

  it('báo giá còn TẠM TÍNH (`estimateNote`) ⇒ tổng mang nhãn "Tạm tính", không trưng như giá chốt', () => {
    setTrip({
      ...PENDING,
      estimate: { ...ESTIMATE, estimateNote: 'Giá lộ trình chưa niêm yết' },
    });
    renderView();
    expect(screen.getByText('Tạm tính')).toBeTruthy();
    expect(screen.getByText(/Giá lộ trình chưa niêm yết/)).toBeTruthy();
  });

  it('có tiền giữ chỗ ⇒ tiến trình 4 mốc, đang ở mốc chờ chủ xe phản hồi', () => {
    setTrip({ ...PENDING, estimate: ESTIMATE });
    renderView();
    const progress = screen.getByRole('region', { name: 'Tiến trình yêu cầu' });
    const steps = within(progress).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0]?.textContent).toContain('đã xong');
    expect(steps[1]?.getAttribute('aria-current')).toBe('step');
    expect(steps[2]?.textContent).toContain('Hoàn tất giữ chỗ theo hướng dẫn');
  });

  it('KHÔNG có tiền giữ chỗ ⇒ 3 mốc, không hứa một bước thanh toán không bao giờ tới', () => {
    setTrip({
      ...PENDING,
      estimate: { ...ESTIMATE, fees: { ...ESTIMATE.fees!, holdAmount: null } },
    });
    renderView();
    const progress = screen.getByRole('region', { name: 'Tiến trình yêu cầu' });
    expect(within(progress).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Hoàn tất giữ chỗ theo hướng dẫn')).toBeNull();
  });

  it('bảng chi phí tạm tính: tiền giữ chỗ "Chưa cần thanh toán", không có QR nào', () => {
    setTrip({ ...PENDING, estimate: ESTIMATE });
    renderView();
    expect(screen.getByText('Chi phí thuê xe')).toBeTruthy();
    expect(screen.getByText('Chưa cần thanh toán')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /QR/i })).toBeNull();
  });

  it('người thuê đọc từ TÀI KHOẢN, lời nhắn đọc từ chuyến', () => {
    me.data = {
      displayName: 'Lê Quang Huy',
      phone: '0989789799',
      phoneVerified: true,
      email: 'quanghuy@example.com',
    };
    setTrip({ ...PENDING, customerNote: 'Cần ghế trẻ em' });
    renderView();
    expect(screen.getByText('Lê Quang Huy')).toBeTruthy();
    expect(screen.getByText('0989789799')).toBeTruthy();
    expect(screen.getByText('quanghuy@example.com')).toBeTruthy();
    expect(screen.getByText('Cần ghế trẻ em')).toBeTruthy();
  });

  /**
   * `canContact` gác SĐT/biển số (chỉ mở khi đã có đơn — ADR 0028 điều 9), KHÔNG gác chat: kênh
   * chat trong sàn mở cho mọi khách đã gửi yêu cầu tới gian hàng (`ChatService.canCustomerOpenChat`).
   * Ở chặng này `canContact` LUÔN là false — gác nút chat theo nó là nút không bao giờ hiện.
   */
  it('nhắn tin với chủ xe luôn mở sau khi gửi yêu cầu; SĐT chủ xe thì chưa', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Nhắn tin cho chủ xe' })).toBeTruthy();
    expect(screen.queryByText(/Kênh liên hệ mở sau khi/)).toBeNull();
    expect(screen.queryByText(TRIP.shop.phone!)).toBeNull();
  });

  it('lối ra: tìm xe khác, chính sách huỷ, hotline gọi được', () => {
    renderView();
    expect(screen.getByRole('link', { name: 'Tìm xe khác' }).getAttribute('href')).toBe('/search');
    expect(screen.getByRole('link', { name: 'Xem chính sách áp dụng' }).getAttribute('href')).toBe(
      '/legal/cancellation',
    );
    expect(screen.getByRole('link', { name: SUPPORT_HOTLINE.display }).getAttribute('href')).toBe(
      `tel:${SUPPORT_HOTLINE.tel}`,
    );
  });

  it('tin đăng không còn công khai ⇒ thẻ chuyến vẫn có xe và chủ xe, đọc từ chuyến', () => {
    renderView();
    expect(screen.getByText('Toyota Camry 2024')).toBeTruthy();
    expect(screen.getByText('Gian hàng Minh Tuấn')).toBeTruthy();
  });

  it('đang tải tin đăng ⇒ khung chờ, không vẽ thẻ dự phòng rồi nhảy', () => {
    listingQuery.isLoading = true;
    renderView();
    expect(screen.queryByText('Gian hàng Minh Tuấn')).toBeNull();
  });
});

/**
 * Chủ xe đã nhận chuyến, chờ khách trả tiền giữ chỗ — màn design v2 (Figma `19737:23904`).
 *
 * Điều được khoá: chưa có đơn cho tới khi tiền về (ADR 0044 điều 2) nên màn chỉ DẪN sang trang
 * thanh toán, sau khi khách xác nhận đã đọc chính sách; hết hạn thì không mời trả nữa (ADR 0044
 * điều 3/7); khoản đã khép thì nói kết cục thay vì một nút trả tiền chết; và huỷ ở chặng này nói
 * đúng hệ quả (nhả xe, hoàn đủ phần đã chuyển) chứ không phải "huỷ đơn".
 */
describe('Đã được nhận, chờ giữ chỗ (khách)', () => {
  const AWAITING: Partial<CustomerTripDetail> = {
    stage: CUSTOMER_TRIP_STAGE.AWAITING_HOLD,
    bookingId: null,
    code: null,
    finance: null,
    totalAmount: null,
    totalIsEstimate: false,
    // Tuyến hoa hồng chưa có đơn: SĐT/biển số chưa mở (ADR 0056).
    canContact: false,
    vehicle: { ...TRIP.vehicle, plateNumber: null },
    estimate: ESTIMATE,
  };

  function awaitingHold(patch: Partial<NonNullable<CustomerTripDetail['hold']>> = {}) {
    const now = Date.now();
    return {
      id: '01HOLD',
      code: 'XPH23456789',
      status: BOOKING_HOLD_STATUS.PENDING,
      outcome: null,
      amount: '500000',
      paidAmount: '0',
      remainingAmount: '500000',
      expiresAt: new Date(now + 90 * 60_000).toISOString(),
      freeCancelUntil: new Date(now + 4 * 60 * 60_000).toISOString(),
      freeCancelAvailable: true,
      lateCancelRefundAmount: '0',
      paidAt: null,
      allocation: [],
      refund: null,
      paymentInfo: {
        configured: true,
        bankCode: 'VCB',
        accountNumber: '0123456789',
        accountName: 'CONG TY XEPRIME',
      },
      ...patch,
    } as NonNullable<CustomerTripDetail['hold']>;
  }

  function payCard(): HTMLElement {
    return screen.getByRole('region', { name: 'Khoản giữ chỗ cần thực hiện' });
  }

  beforeEach(() => setTrip({ ...AWAITING, hold: awaitingHold() }));

  it('thẻ trạng thái: chủ xe đã đồng ý, nhãn chặng chung, không có dòng thời gian hai mốc', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: 'Chủ xe đã đồng ý' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sẵn sàng cho bước giữ chỗ' }),
    ).toBeTruthy();
    // Tiến trình hành trình ở đầu trang: đang ở chặng thanh toán giữ chỗ.
    expect(screen.getByText('Bước 3 / 4 · Thanh toán giữ chỗ')).toBeTruthy();
    // Nhãn chặng đọc từ `Domain` — cùng chữ với danh sách chuyến (ADR 0005).
    expect(screen.getByText('Đã được nhận · chờ thanh toán')).toBeTruthy();
    expect(screen.getByText(/Gian hàng Minh Tuấn đã đồng ý với yêu cầu thuê xe/)).toBeTruthy();
    expect(timeline()).toBeNull();
  });

  it('tiến trình 4 mốc: hai mốc đầu xong, đang ở mốc giữ chỗ với câu nói việc cần làm ngay', () => {
    renderView();
    const progress = screen.getByRole('region', { name: 'Tiến trình yêu cầu' });
    const steps = within(progress).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0]?.textContent).toContain('đã xong');
    expect(steps[1]?.textContent).toContain('đã xong');
    expect(steps[2]?.getAttribute('aria-current')).toBe('step');
    expect(steps[2]?.textContent).toContain('Thanh toán tiền giữ chỗ trước khi hết hạn');
    expect(steps[3]?.textContent).toContain('chưa tới');
  });

  it('bảng kê thiếu `holdAmount` vẫn KHÔNG xoá mất mốc giữ chỗ khách đang đứng', () => {
    setTrip({
      ...AWAITING,
      estimate: { ...ESTIMATE, fees: { ...ESTIMATE.fees!, holdAmount: null } },
      hold: awaitingHold(),
    });
    renderView();
    const progress = screen.getByRole('region', { name: 'Tiến trình yêu cầu' });
    const steps = within(progress).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[2]?.getAttribute('aria-current')).toBe('step');
  });

  it('thẻ giữ chỗ: số tiền, đồng hồ, phần còn lại trả tay chủ xe — không có QR nào', () => {
    renderView();
    const card = payCard();
    // Số tiền đứng riêng một dòng (nhãn nút cũng mang số này, nhưng bắt đầu bằng "Thanh toán").
    expect(within(card).getByText(/^500\.000/)).toBeTruthy();
    expect(
      within(card)
        .getAllByRole('status')
        .some((el) => el.textContent?.includes('Còn lại để thanh toán')),
    ).toBe(true);
    expect(within(card).getByText(/Phần còn lại 1\.327\.000/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /QR/i })).toBeNull();
    // Không có nút tự khai đã trả — tiền về thì realtime tự lật trang.
    expect(screen.queryByText('Tôi đã chuyển khoản')).toBeNull();
  });

  it('nút thanh toán khoá tới khi khách xác nhận đã đọc chính sách, rồi dẫn sang trang thanh toán', () => {
    renderView();
    const card = payCard();
    const locked = within(card).getByRole('button', { name: /Thanh toán giữ chỗ/ });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(card)
        .getByRole('link', { name: 'chính sách giữ chỗ, huỷ & hoàn tiền' })
        .getAttribute('href'),
    ).toBe('/legal/cancellation');

    fireEvent.click(within(card).getByRole('checkbox'));

    const pay = within(card).getByRole('link', { name: /Thanh toán giữ chỗ/ });
    expect(pay.getAttribute('href')).toBe('/payment/RQ1');
  });

  it('đã chuyển một phần ⇒ số trên nút là phần CÒN THIẾU, kèm số đã nhận', () => {
    setTrip({
      ...AWAITING,
      hold: awaitingHold({
        status: BOOKING_HOLD_STATUS.UNDERPAID,
        paidAmount: '200000',
        remainingAmount: '300000',
      }),
    });
    renderView();
    const card = payCard();
    expect(within(card).getByText(/Đã nhận 200\.000/)).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: /Thanh toán giữ chỗ · 300\.000/ }),
    ).toBeTruthy();
  });

  it('quá hạn thanh toán ⇒ đồng hồ báo hết hạn, không mời trả nữa kể cả khi đã tích xác nhận', () => {
    setTrip({
      ...AWAITING,
      hold: awaitingHold({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    });
    renderView();
    const card = payCard();
    expect(within(card).getByText(/Đã hết hạn thanh toán/)).toBeTruthy();
    expect((within(card).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(card).getByRole('checkbox'));
    expect(within(card).queryByRole('link', { name: /Thanh toán giữ chỗ/ })).toBeNull();
    expect(
      (within(card).getByRole('button', { name: /Thanh toán giữ chỗ/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('khoản giữ chỗ đã khép mà chặng chưa kịp đổi ⇒ nói kết cục, KHÔNG có nút trả tiền', () => {
    setTrip({ ...AWAITING, hold: awaitingHold({ status: BOOKING_HOLD_STATUS.EXPIRED }) });
    renderView();
    expect(screen.queryByRole('region', { name: 'Khoản giữ chỗ cần thực hiện' })).toBeNull();
    expect(screen.getByText(/Hết hạn thanh toán tiền giữ chỗ/)).toBeTruthy();
    expect(screen.queryByText('Cần thanh toán')).toBeNull();
  });

  it('bảng chi phí: tiền giữ chỗ mang nhãn "Cần thanh toán", không còn "Chưa cần thanh toán"', () => {
    renderView();
    expect(screen.getByText('Chi phí thuê xe')).toBeTruthy();
    expect(screen.getByText('Cần thanh toán')).toBeTruthy();
    expect(screen.queryByText('Chưa cần thanh toán')).toBeNull();
  });

  it('nhắn tin với chủ xe vẫn mở; SĐT chủ xe thì chưa (chưa có đơn)', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Nhắn tin cho chủ xe' })).toBeTruthy();
    expect(screen.queryByText(TRIP.shop.phone!)).toBeNull();
  });

  it('lối ra: chính sách huỷ, hotline gọi được, hạn huỷ miễn phí đọc từ mốc của server', () => {
    renderView();
    expect(screen.getByRole('link', { name: 'Xem chính sách áp dụng' }).getAttribute('href')).toBe(
      '/legal/cancellation',
    );
    expect(screen.getByRole('link', { name: SUPPORT_HOTLINE.display }).getAttribute('href')).toBe(
      `tel:${SUPPORT_HOTLINE.tel}`,
    );
    expect(screen.getByText(/Sau khi thanh toán: Huỷ trước .+ được hoàn 100%/)).toBeTruthy();
  });

  it('huỷ: nói đúng hệ quả của chặng — nhả xe đang giữ, không phải "huỷ đơn"', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: CANCEL_TRIP }));
    expect(screen.getByText('Huỷ chuyến đi?')).toBeTruthy();
    expect(screen.getByText(/Chủ xe đang giữ xe cho bạn/)).toBeTruthy();
    expect(screen.queryByText(/Đơn thuê sẽ bị huỷ/)).toBeNull();
    expect(cancelMutation.mutate).not.toHaveBeenCalled();
  });

  it('huỷ sau khi đã chuyển một phần ⇒ báo trước khoản đó được XePrime hoàn đủ', () => {
    setTrip({
      ...AWAITING,
      hold: awaitingHold({
        status: BOOKING_HOLD_STATUS.UNDERPAID,
        paidAmount: '200000',
        remainingAmount: '300000',
      }),
    });
    cancelPreview.data = {
      allowed: true,
      kind: CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND,
      paidAmount: '200000',
      refundAmount: '200000',
      insuranceRefundAmount: '0',
      forfeitAmount: '0',
      ownerCompensationAmount: '0',
      freeCancelUntil: null,
      freeCancelAvailable: true,
      deferred: false,
    };
    renderView();
    fireEvent.click(screen.getByRole('button', { name: CANCEL_TRIP }));
    expect(screen.getByText(/Bạn đã chuyển 200\.000.* tiền giữ chỗ/)).toBeTruthy();
    expect(screen.getByText(/Bạn được hoàn 200.000.* vào Ví điểm/)).toBeTruthy();
    cancelPreview.data = undefined;
  });
});

/**
 * Chuyến đã xác nhận, chờ ngày nhận xe — màn design v2 (Figma `19879:72913`).
 *
 * Điều được khoá: đầu trang nói "đã xác nhận" với tiến trình 4/4 đều xong; tiền là số ĐÃ ĐÓNG BĂNG
 * của đơn — bảng kê chỉ khi server nói nó còn khớp (`finance.breakdown`), không thì thẻ tiền đầy
 * đủ; checklist nhận xe chỉ dặn những gì áp dụng cho CHÍNH chuyến này; không có lối "Chỉnh sửa".
 */
describe('Đã xác nhận, chờ ngày nhận xe (khách)', () => {
  const PAID_HOLD = {
    id: '01HOLD',
    code: 'XPH23456789',
    status: BOOKING_HOLD_STATUS.RELEASED,
    outcome: 'settled',
    amount: '500000',
    paidAmount: '500000',
    remainingAmount: '0',
    expiresAt: '2026-08-01T03:00:00.000Z',
    freeCancelUntil: '2026-08-01T05:00:00.000Z',
    freeCancelAvailable: true,
    lateCancelRefundAmount: '0',
    paidAt: '2026-08-01T02:30:00.000Z',
    paidVia: 'vnpay',
    allocation: [],
    refund: null,
    paymentInfo: {
      configured: true,
      bankCode: 'VCB',
      accountNumber: '0123456789',
      accountName: 'XE PRIME',
    },
  } as unknown as NonNullable<CustomerTripDetail['hold']>;

  const BREAKDOWN = {
    rows: [{ key: 'base', label: 'Tiền thuê', sublabel: '3 ngày × 1.050.000đ', amount: '3150000' }],
    depositAmount: '3000000',
    fees: ESTIMATE.fees,
    longTerm: null,
  } as unknown as NonNullable<NonNullable<CustomerTripDetail['finance']>['breakdown']>;

  beforeEach(() =>
    setTrip({
      hold: PAID_HOLD,
      contact: { name: 'Người nhà Huy', phone: '0911222333' },
      finance: { ...TRIP.finance!, depositRequired: '3000000.00', breakdown: BREAKDOWN },
    }),
  );

  it('đầu trang: đã xác nhận, tiến trình 4/4 đều xong; thẻ trạng thái kể xe + chủ xe', () => {
    renderView();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chuyến đi đã được xác nhận' }),
    ).toBeTruthy();
    expect(screen.getByText('Bước 4 / 4 · Đã xác nhận')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Hẹn bạn vào ngày nhận xe' }),
    ).toBeTruthy();
    expect(screen.getByText('Đã xác nhận chuyến đi')).toBeTruthy();
    expect(
      screen.getByText(/Toyota Camry 2024 với chủ xe Gian hàng Minh Tuấn đã được xác nhận/),
    ).toBeTruthy();
    // Dòng thời gian hai mốc của bố cục cũ không còn — tiến trình nằm ở đầu trang.
    expect(timeline()).toBeNull();
  });

  it('"Xem hướng dẫn nhận xe" dẫn tới checklist trên CHÍNH trang này', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Xem hướng dẫn nhận xe' });
    const target = link.getAttribute('href')!.slice(1);
    expect(document.getElementById(target)?.textContent).toContain('Checklist nhận xe');
  });

  it('checklist: tự lái cần GPLX, cọc đúng số của đơn, xe xăng thì "mức nhiên liệu"', () => {
    renderView();
    const list = screen.getByRole('region', { name: 'Checklist nhận xe' });
    expect(within(list).getByText('Mang GPLX hợp lệ')).toBeTruthy();
    expect(within(list).getByText(/Nộp cọc xe 3\.000\.000/)).toBeTruthy();
    expect(within(list).getByText(/mức nhiên liệu/)).toBeTruthy();
  });

  it('checklist: có tài xế thì không dặn GPLX; không cọc thì không có mục cọc', () => {
    setTrip({
      serviceType: 'with_driver',
      hold: PAID_HOLD,
      finance: { ...TRIP.finance!, breakdown: BREAKDOWN },
    });
    renderView();
    const list = screen.getByRole('region', { name: 'Checklist nhận xe' });
    expect(within(list).queryByText('Mang GPLX hợp lệ')).toBeNull();
    expect(within(list).queryByText(/Nộp cọc xe/)).toBeNull();
  });

  it('chi phí: bảng kê đóng băng của đơn, tiền giữ chỗ "Đã thanh toán"', () => {
    renderView();
    expect(screen.getByText('Chi phí thuê xe')).toBeTruthy();
    expect(screen.getByText('Đã thanh toán')).toBeTruthy();
    expect(screen.queryByText('Cần thanh toán')).toBeNull();
  });

  it('số trên đơn đã đổi (server không trả bảng kê) ⇒ thẻ tiền đầy đủ, không bảng cũ', () => {
    setTrip({ hold: PAID_HOLD, finance: { ...TRIP.finance!, breakdown: null } });
    renderView();
    expect(screen.queryByText('Chi phí thuê xe')).toBeNull();
    expect(screen.queryByText('Đã thanh toán')).toBeNull();
  });

  it('liên hệ: nút tròn nhắn tin + gọi cạnh tên chủ xe; tên chủ xe dẫn tới mặt tiền', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Nhắn tin cho chủ xe' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gọi chủ xe 0909123456' }).getAttribute('href')).toBe(
      'tel:0909123456',
    );
    expect(screen.getByRole('link', { name: 'Gian hàng Minh Tuấn' }).getAttribute('href')).toBe(
      '/shops/minh-tuan',
    );
  });

  it('chuyển THỪA tiền giữ chỗ ⇒ báo khoản hoàn và mời khai tài khoản nhận ngay ở chặng này', () => {
    setTrip({
      hold: {
        ...PAID_HOLD,
        paidAmount: '1000000',
        refund: {
          id: '01REFUND',
          status: 'pending',
          reason: 'overpaid',
          amount: '500000',
          hasAccount: false,
          accountHint: null,
          paidAt: null,
          bankReference: null,
        },
      } as unknown as NonNullable<CustomerTripDetail['hold']>,
      finance: { ...TRIP.finance!, breakdown: BREAKDOWN },
    });
    renderView();
    expect(screen.getByText(/Có 500.000.* chờ hoàn/)).toBeTruthy();
  });

  it('không có khoản hoàn ⇒ không có khối hoàn tiền', () => {
    renderView();
    expect(screen.queryByText(/chờ hoàn/)).toBeNull();
  });

  it('chuyến đã xác nhận không có đường sửa ⇒ không có lối "Chỉnh sửa"', () => {
    renderView();
    expect(screen.queryByText('Chỉnh sửa')).toBeNull();
  });

  it('người thuê: đọc đúng liên hệ đã để lại cho CHÍNH chuyến này', () => {
    me.data = { displayName: 'Lê Quang Huy', phone: '0989789799', phoneVerified: true };
    renderView();
    expect(screen.getByText('Người nhà Huy')).toBeTruthy();
    expect(screen.getByText('0911222333')).toBeTruthy();
  });

  it('huỷ: trước mốc huỷ miễn phí nói hoàn 100%, sau mốc thì theo chính sách', () => {
    setTrip({
      hold: { ...PAID_HOLD, freeCancelUntil: new Date(Date.now() + 3600_000).toISOString() },
      finance: { ...TRIP.finance!, breakdown: BREAKDOWN },
    });
    const { unmount } = renderView();
    expect(screen.getByText(/vẫn được hoàn 100% tiền giữ chỗ/)).toBeTruthy();
    unmount();

    setTrip({ hold: PAID_HOLD, finance: { ...TRIP.finance!, breakdown: BREAKDOWN } });
    renderView();
    expect(screen.getByText(/Đã qua mốc huỷ miễn phí/)).toBeTruthy();
    expect(screen.getByRole('button', { name: CANCEL_TRIP })).toBeTruthy();
  });
});

describe('Sẵn sàng và Đang thuê', () => {
  it('đang thuê dùng đúng hai mốc, không sinh mốc thứ ba', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE });
    renderView();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Đã xác nhận')).toBeTruthy();
    expect(screen.getByText('Hoàn thành')).toBeTruthy();
  });

  it('chủ xe mở chuyến sẵn sàng ⇒ vẫn bố cục cũ với dòng thời gian hai mốc', () => {
    setTrip({ role: TRIP_ROLE.HOST });
    renderView();
    expect(timeline()).not.toBeNull();
    expect(screen.queryByText('Checklist nhận xe')).toBeNull();
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
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE });
    renderView();
    expect(screen.getByText('Nhắn tin cho cửa hàng')).toBeTruthy();
  });
});

describe('Bố cục theo có/không QR chuyển khoản', () => {
  const HOLD_BASE = {
    id: '01HOLD',
    code: 'XPH23456789',
    outcome: null,
    amount: '100000',
    paidAmount: '0',
    remainingAmount: '100000',
    expiresAt: '2026-09-08T03:00:00.000Z',
    freeCancelUntil: '2026-09-16T03:00:00.000Z',
    freeCancelAvailable: true,
    lateCancelRefundAmount: '0',
    paidAt: null,
    allocation: [],
    refund: null,
    paymentInfo: {
      configured: true,
      bankCode: 'VCB',
      accountNumber: '0123456789',
      accountName: 'CONG TY XEPRIME',
    },
  };

  /**
   * Báo cáo 24/09/2026: đang có QR thì tóm tắt chuyến tách riêng full-width phía trên là hợp lý
   * (nhường `.main` cho đúng QR, ngang tầm "Chi tiết giá"). KHÔNG có QR (hold đã huỷ/hết hạn,
   * hoặc không có hold nào) thì việc này chỉ đẩy "Chi tiết giá" xuống dưới một khối tóm tắt cao
   * mà không được gì — phải quay lại bố cục hai cột kinh điển.
   */
  // Bố cục cũ của trang chuyến — chặng đang thuê (chặng sẵn sàng của khách đã sang màn design v2).
  beforeEach(() => setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE }));

  it('đang chờ chuyển khoản (còn QR) ⇒ tóm tắt chuyến tách riêng, full-width', () => {
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.ACTIVE,
      hold: { ...HOLD_BASE, status: BOOKING_HOLD_STATUS.PENDING },
    });
    const { container } = renderView();
    expect(container.querySelector('[class*="summary"]')).not.toBeNull();
  });

  it('hold đã hết hạn (hết QR, chỉ còn Alert) ⇒ KHÔNG tách tóm tắt ra riêng nữa', () => {
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.ACTIVE,
      hold: { ...HOLD_BASE, status: BOOKING_HOLD_STATUS.EXPIRED },
    });
    const { container } = renderView();
    expect(container.querySelector('[class*="summary"]')).toBeNull();
  });

  it('không có khoản giữ chỗ nào ⇒ KHÔNG tách tóm tắt ra riêng', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE, hold: null });
    const { container } = renderView();
    expect(container.querySelector('[class*="summary"]')).toBeNull();
  });
});

describe('Nhãn mặt tiền theo tuyến', () => {
  it('gian hàng tuyến gói ⇒ "Xem gian hàng"', () => {
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.ACTIVE,
      shop: { ...TRIP.shop, shopKind: STOREFRONT_KIND.SHOP },
    });
    renderView();
    expect(screen.getByText('Xem gian hàng →')).toBeTruthy();
    expect(screen.queryByText('Xem chủ xe →')).toBeNull();
  });

  it('chủ xe cá nhân tuyến hoa hồng ⇒ "Xem chủ xe", KHÔNG "Xem gian hàng"', () => {
    setTrip({
      stage: CUSTOMER_TRIP_STAGE.ACTIVE,
      shop: { ...TRIP.shop, shopKind: STOREFRONT_KIND.PERSONAL },
    });
    renderView();
    expect(screen.getByText('Xem chủ xe →')).toBeTruthy();
    expect(screen.queryByText('Xem gian hàng →')).toBeNull();
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
    expect(screen.getByRole('button', { name: CANCEL_TRIP })).toBeTruthy();
  });

  it('đã duyệt, chưa giao xe → vẫn huỷ được', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.READY });
    renderView();
    expect(screen.getByRole('button', { name: CANCEL_TRIP })).toBeTruthy();
  });

  it('ĐANG THUÊ → không còn nút huỷ', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE });
    renderView();
    expect(screen.queryByRole('button', { name: CANCEL_TRIP })).toBeNull();
  });

  it('đã hoàn thành / đã huỷ → không có nút huỷ', () => {
    for (const stage of [CUSTOMER_TRIP_STAGE.COMPLETED, CUSTOMER_TRIP_STAGE.CANCELLED] as const) {
      cleanup();
      setTrip({ stage });
      renderView();
      expect(screen.queryByRole('button', { name: CANCEL_TRIP })).toBeNull();
    }
  });

  it('bấm huỷ mở hộp xác nhận, KHÔNG gọi API ngay', () => {
    setTrip({ stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL });
    renderView();

    fireEvent.click(screen.getByRole('button', { name: CANCEL_TRIP }));

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

    fireEvent.click(screen.getByRole('button', { name: CANCEL_TRIP }));

    expect(screen.getByText('Bạn đã thanh toán cho chuyến này')).toBeTruthy();
    expect(screen.getByText(/không tự chuyển tiền/)).toBeTruthy();
  });
});
