import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LONG_TERM_PACKAGE_MONTHS, PICKUP_PREFERENCE, SERVICE_TYPE } from '@xeprime/types';
import { AUTH_CONTEXT, AUTH_MODE } from '@/features/auth/post-auth-destination';
import { readBookingDraft } from '../booking-draft';
import type { RequestBookingPrefill } from '../types';
import { RequestBookingModal } from './RequestBookingModal';

/**
 * Đặc tả UI của luồng THUÊ DÀI HẠN theo GÓI CỐ ĐỊNH (ADR 0011).
 *
 * Gói và nguyện vọng được chọn ở THẺ ĐẶT XE (27/10/2026); hộp yêu cầu thuê mở thẳng ở màn Xem lại.
 * Những gì phải KHÔNG có trong hộp: biểu mẫu chọn gói, ô chọn khoảng ngày, ngày trả do khách nhập,
 * giá tự lái và khuyến mãi tự lái. Những gì phải CÓ: đúng gói thẻ đưa sang (gói lạ ⇒ gói nhỏ nhất),
 * và payload gửi lên mang gói + nguyện vọng chứ không mang lịch (ADR 0011).
 */
const nav = vi.hoisted(() => ({ push: vi.fn() }));
const api = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  fetchVehicleBusyDays: vi.fn(),
  submitBookingRequest: vi.fn(),
  fetchDriverLicenceOverview: vi.fn(),
}));

/**
 * Gửi yêu cầu cần TÀI KHOẢN KHÁCH đã đăng nhập (ADR 0060) — mặc định của spec này. Đổi `me.data`
 * rồi vẽ lại cùng cây là mô phỏng cú đăng nhập xong.
 */
const LOGGED_IN_ME = {
  id: 'U1',
  displayName: 'Nguyễn Văn A',
  phone: '0901234567',
  phoneVerified: true,
};
const me = vi.hoisted(() => ({ data: undefined as unknown }));
// `dataUpdatedAt`: có người dùng ⇒ coi như vừa nạp (xem bản đầy đủ ở RequestBookingModal.test).
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: me.data,
    dataUpdatedAt: me.data ? Number.MAX_SAFE_INTEGER : 0,
  }),
}));
/** Có phiên thì flow đọc lời nhắc thanh toán — spec này không khoá nó, nên cho rỗng. */
vi.mock('@/features/trips/hooks', () => ({ useUnpaidHolds: () => ({ data: undefined }) }));
/** Hook thật ném lỗi khi nằm ngoài `AuthModalProvider` — flow chỉ cần biết hộp được MỞ. */
const authModal = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/features/auth/components/AuthModalProvider', () => ({ useAuthModal: () => authModal }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('../api', () => ({
  BUSY_DAYS_LOOKAHEAD: 366,
  checkAvailability: (...a: unknown[]) => api.checkAvailability(...a),
  fetchVehicleBusyDays: (...a: unknown[]) => api.fetchVehicleBusyDays(...a),
  submitBookingRequest: (...a: unknown[]) => api.submitBookingRequest(...a),
}));

/** Xe demo: đăng dài hạn + tự lái, có giá ngày và khuyến mãi tự lái 10% (KHÔNG được lộ ra). */
const LISTING = {
  id: 'V1',
  name: 'Kia Carnival 2025',
  vehicleType: 'car',
  serviceTypes: ['long_term', 'self_drive'],
  weekdayPrice: '585000',
  weekendPrice: null,
  hourlyPrice: null,
  monthlyPrice: '12000000',
  withDriverDailyPrice: null,
  withDriverInterCityPrice: null,
  withDriverOneWayPrice: null,
  discountPercent: 10,
  deliveryEnabled: false,
  noCollateral: false,
  images: [],
  features: [],
  shopName: 'Shop A',
  shopSlug: 'shop-a',
  shopProvince: null,
  provinceCode: null,
  shopLogoUrl: null,
  shopBio: null,
  description: null,
  color: null,
  manufactureYear: null,
  brand: null,
  model: null,
  seatCount: null,
  fuelType: null,
  bodyType: null,
  mainImageUrl: null,
  ratingAvg: null,
  ratingCount: 0,
  // Giá gói do SERVER tính — FE chỉ hiển thị (mốc 1 tháng 5%, 3 tháng 15%, từ 6 tháng 20%).
  longTermPackages: [
    {
      packageMonths: 1,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '12000000',
      durationDiscountPercent: 5,
      durationDiscountAmount: '600000',
      finalPackageAmount: '11400000',
      effectiveMonthlyAmount: '11400000',
    },
    {
      packageMonths: 2,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '24000000',
      durationDiscountPercent: 5,
      durationDiscountAmount: '1200000',
      finalPackageAmount: '22800000',
      effectiveMonthlyAmount: '11400000',
    },
    {
      packageMonths: 3,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '36000000',
      durationDiscountPercent: 15,
      durationDiscountAmount: '5400000',
      finalPackageAmount: '30600000',
      effectiveMonthlyAmount: '10200000',
    },
    {
      packageMonths: 6,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '72000000',
      durationDiscountPercent: 20,
      durationDiscountAmount: '14400000',
      finalPackageAmount: '57600000',
      effectiveMonthlyAmount: '9600000',
    },
    {
      packageMonths: 9,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '108000000',
      durationDiscountPercent: 20,
      durationDiscountAmount: '21600000',
      finalPackageAmount: '86400000',
      effectiveMonthlyAmount: '9600000',
    },
    {
      packageMonths: 12,
      baseMonthlyPrice: '12000000',
      basePackageAmount: '144000000',
      durationDiscountPercent: 20,
      durationDiscountAmount: '28800000',
      finalPackageAmount: '115200000',
      effectiveMonthlyAmount: '9600000',
    },
  ],
};

vi.mock('@/features/marketplace/api', () => ({
  fetchListingDetailClient: () => Promise.resolve(LISTING),
  fetchListingReviewsClient: () => Promise.reject(new Error('reviews off')),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

/** Quote gói 9 tháng — breakdown thật của server, dùng để khoá phần hiển thị ưu đãi. */
const quoteCalls: unknown[] = [];
vi.mock('@/features/rental-policies/api', () => ({
  fetchPublicQuote: (vehicleId: string, params: unknown) => {
    quoteCalls.push(params);
    return Promise.resolve({
      breakdown: {
        days: null,
        longTerm: {
          packageMonths: 9,
          baseMonthlyPrice: '12000000',
          basePackageAmount: '108000000',
          durationDiscountPercent: 20,
          durationDiscountAmount: '21600000',
          finalPackageAmount: '86400000',
          effectiveMonthlyAmount: '9600000',
        },
        rows: [
          { key: 'base', label: 'Giá cơ sở gói 9 tháng', sublabel: null, amount: '108000000' },
          {
            key: 'discount',
            label: 'Ưu đãi cam kết 9 tháng (20%)',
            sublabel: null,
            amount: '-21600000',
          },
          { key: 'subtotal', label: 'Giá gói sau ưu đãi', sublabel: null, amount: '86400000' },
        ],
        totalAmount: '86400000',
        depositAmount: '5000000',
        policySource: 'shop',
        policyUpdatedAt: null,
        estimateNote: null,
      },
      delivery: { enabled: false, maxRadiusKm: null, tiers: [] },
    });
  },
}));

vi.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: () => <button type="button">Liên hệ</button>,
}));
/*
 * Dài hạn là thuê TỰ LÁI (ADR 0057): có phiên rồi mới soát bằng lái của tài khoản.
 * Bằng mặc định đã hợp lệ — spec này khoá gói + nguyện vọng, không phải bước bằng lái.
 */
vi.mock('@/features/driver-licence/api', () => ({
  fetchDriverLicenceOverview: (...a: unknown[]) => api.fetchDriverLicenceOverview(...a),
  fetchDriverLicenceImage: vi.fn(),
  requestDriverLicenceReview: vi.fn(),
  submitDriverLicence: vi.fn(),
}));
const VALID_LICENCE = {
  status: 'verified',
  // Hạng có mặt như hợp đồng thật — màn Xem lại hiện hạng + hạn của bằng đã xác thực.
  classes: ['B2'],
  expiresOn: '2099-01-01',
  noExpiry: false,
  coversCar: true,
  coversMotorbike: false,
};
function renderModal(prefill: RequestBookingPrefill = { packageMonths: 6 }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <App>
        <RequestBookingModal
          vehicleId="V1"
          vehicleName="Kia Carnival 2025"
          serviceType={SERVICE_TYPE.LONG_TERM}
          prefill={prefill}
          open
          onClose={vi.fn()}
        />
      </App>
    </QueryClientProvider>
  );
  const utils = render(tree());
  /** Vẽ lại CÙNG cây — flow giữ nguyên state, chỉ đọc lại `me.data` (đăng nhập xong). */
  return { ...utils, rerenderTree: () => utils.rerender(tree()) };
}

/** Hộp mở thẳng màn Xem lại — chờ nút gửi xuất hiện. */
async function openReview(prefill?: RequestBookingPrefill) {
  const utils = renderModal(prefill);
  await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' });
  return utils;
}

beforeEach(() => {
  nav.push.mockReset();
  quoteCalls.length = 0;
  Object.values(api).forEach((fn) => fn.mockReset());
  me.data = LOGGED_IN_ME;
  authModal.open.mockReset();
  // Bản nháp chờ đăng nhập sống ở `sessionStorage` — không được rò từ test này sang test khác.
  window.sessionStorage.clear();
  api.fetchDriverLicenceOverview.mockResolvedValue({
    verified: VALID_LICENCE,
    latest: VALID_LICENCE,
  });
  api.fetchVehicleBusyDays.mockResolvedValue({ days: [], from: '2026-01-01', to: '2026-01-01' });
});

afterEach(cleanup);

/*
 * Gói + nguyện vọng được chọn ở THẺ ĐẶT XE của trang chi tiết (27/10/2026) — hộp không còn bước
 * "Chuyến đi" nào để chọn lại. Đặc tả ở đây khoá việc hộp nhận ĐÚNG gói/nguyện vọng thẻ đưa sang.
 */
describe('Thuê dài hạn — hộp nhận gói từ thẻ đặt xe', () => {
  it('mở thẳng màn Xem lại: không có biểu mẫu chọn gói, không có ô khoảng thuê hay ngày trả', async () => {
    await openReview();

    expect(screen.queryByRole('radiogroup', { name: 'Gói thuê dài hạn' })).toBeNull();
    expect(screen.queryByText('Thời gian thuê')).toBeNull();
    expect(screen.queryByText('Trả xe')).toBeNull();
    // Báo giá không thu trước ⇒ hai chặng; hộp đứng ở chặng đầu.
    expect(screen.getByText('Bước 1 / 2 · Gửi yêu cầu')).toBeTruthy();
    // Không có lối "Chỉnh sửa" quay về một bước không còn tồn tại.
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa thông tin chuyến đi' })).toBeNull();
  });

  it('báo giá hỏi SERVER theo GÓI của thẻ, không gửi ngày nào', async () => {
    await openReview();

    await waitFor(() => expect(quoteCalls.length).toBeGreaterThan(0));
    expect(quoteCalls.at(-1)).toEqual({ serviceType: SERVICE_TYPE.LONG_TERM, packageMonths: 6 });
  });

  it('gói ngoài sáu gói của ADR 0011 ⇒ về gói NHỎ NHẤT, không gửi gói 4 tháng', async () => {
    await openReview({ packageMonths: 4 });

    await waitFor(() => expect(quoteCalls.length).toBeGreaterThan(0));
    expect(quoteCalls.at(-1)).toEqual({
      serviceType: SERVICE_TYPE.LONG_TERM,
      packageMonths: LONG_TERM_PACKAGE_MONTHS[0],
    });
  });

  it('màn Xem lại KHÔNG hiện giá tự lái hay khuyến mãi tự lái', async () => {
    await openReview();

    expect(screen.queryByText('585.000 ₫')).toBeNull();
    expect(screen.queryByText('-10%')).toBeNull();
  });
});

describe('Thuê dài hạn — gửi yêu cầu', () => {
  it('payload mang GÓI + nguyện vọng, KHÔNG mang ngày nhận/trả', async () => {
    api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
    await openReview();
    // Dài hạn KHÔNG gọi check-availability: chưa có khung giờ nào để kiểm (ADR 0006).
    expect(api.checkAvailability).not.toHaveBeenCalled();

    // Màn Xem lại nói GÓI và NGUYỆN VỌNG, không hiện một lịch giả.
    expect(screen.getByText('Gói thuê')).toBeTruthy();
    expect(screen.getByText('Nguyện vọng nhận xe')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }));

    await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalled());
    const payload = api.submitBookingRequest.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      vehicleId: 'V1',
      serviceType: 'long_term',
      longTermPackageMonths: 6,
      pickupPreference: 'within_7_days',
    });
    // Không có lịch, và tuyệt đối không có khoảng nhận xe do client tự khai.
    expect(payload.pickupAt).toBeUndefined();
    expect(payload.returnAt).toBeUndefined();
    expect(payload.pickupWindowStartDate).toBeUndefined();
    expect(payload.requestedPickupDate).toBeUndefined();
    // Danh tính người thuê mặc định từ tài khoản (ADR 0063).
    expect(payload).toMatchObject({
      customerName: LOGGED_IN_ME.displayName,
      customerPhone: LOGGED_IN_ME.phone,
    });
  });

  it('ngày nhận CỤ THỂ khách chọn ở thẻ đi nguyên vào payload', async () => {
    api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
    await openReview({
      packageMonths: 3,
      pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
      requestedPickupDate: dayjs('2098-03-15'),
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }));

    await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalled());
    expect(api.submitBookingRequest.mock.calls[0]![0]).toMatchObject({
      longTermPackageMonths: 3,
      pickupPreference: 'specific_date',
      requestedPickupDate: '2098-03-15',
    });
  });

  /**
   * Chưa đăng nhập (ADR 0060): dài hạn không có khung giờ nào để kiểm, nên hộp đi thẳng tới việc GIỮ
   * bản nháp và mời đăng nhập. Thứ phải sống qua lượt đăng nhập là GÓI khách đã chọn ở thẻ.
   */
  it('chưa đăng nhập: giữ GÓI vào bản nháp, mời đăng nhập — đăng nhập xong vào màn Xem lại với đúng gói', async () => {
    me.data = undefined;
    const { rerenderTree } = renderModal();

    // Lời mời, không phải một biểu mẫu — hộp đăng nhập chỉ mở khi khách bấm "Đăng nhập".
    expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
    expect(readBookingDraft('V1')?.values).toMatchObject({
      serviceType: SERVICE_TYPE.LONG_TERM,
      longTermPackageMonths: 6,
    });
    expect(authModal.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(authModal.open).toHaveBeenCalledWith({
      mode: AUTH_MODE.LOGIN,
      context: AUTH_CONTEXT.BOOKING,
    });
    expect(api.submitBookingRequest).not.toHaveBeenCalled();

    me.data = LOGGED_IN_ME;
    rerenderTree();

    await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' });
    expect(screen.getByText('Gói thuê').closest('div')?.textContent).toContain('6 tháng');
    // Không có lịch để kiểm ở CẢ hai lượt — trước và sau đăng nhập.
    expect(api.checkAvailability).not.toHaveBeenCalled();
    expect(api.submitBookingRequest).not.toHaveBeenCalled();
  });
});
