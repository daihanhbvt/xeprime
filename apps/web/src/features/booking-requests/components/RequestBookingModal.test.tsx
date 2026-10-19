import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDateKeyDays,
  API_ERROR_CODE,
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  vnDateKey,
} from '@xeprime/types';
import { AUTH_CONTEXT, AUTH_MODE } from '@/features/auth/post-auth-destination';
import { appWallClockToIso, toAppTz } from '@/lib/datetime';
import { ApiClientError } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';

import { hasBookingDraft, readBookingDraft, saveBookingDraft } from '../booking-draft';
import { PICKUP_METHOD, type RequestFormValues } from '../schema';
import type { RequestBookingPrefill } from '../types';
import { RequestBookingModal } from './RequestBookingModal';

/**
 * Test đặc tả cho luồng ĐẶT XE — workflow rủi ro cao nhất của khu khách.
 *
 * State machine sống trong `RequestBookingFlow` (`trip → [licence] → review → done`),
 * `RequestBookingModal` chỉ là vỏ. Test đi qua vỏ để khoá cả hai cùng lúc: payload gửi lên API,
 * lời mời đăng nhập, giao xe tận nơi, chặn gửi trùng và điều hướng.
 *
 * **Không còn liên hệ, không còn OTP (ADR 0060)**: gửi yêu cầu cần TÀI KHOẢN KHÁCH đã đăng nhập,
 * họ tên + SĐT đã xác minh do server đọc từ tài khoản — payload không mang chúng. Mặc định của
 * suite vì thế là một khách ĐÃ đăng nhập, SĐT đã xác minh: đó là đường duy nhất gửi được yêu cầu.
 * Khách chưa đăng nhập có nhóm riêng — kiểm khung giờ, giữ bản nháp, mời đăng nhập, tự đi tiếp.
 *
 * **Hai bước (20/08)**: `Thời gian` và `Liên hệ` gộp thành MỘT bước `Chuyến đi`; từ ADR 0060 bước
 * đó chỉ còn chuyến đi. Bằng lái là trạng thái xen giữa, không phải một bước.
 *
 * **Wave 9**: giao tận nơi chỉ hỏi ĐỊA CHỈ — không khoảng cách, không báo giá, không bước khách
 * duyệt phí; và lựa chọn đó chỉ tồn tại khi CHÍNH SÁCH cho phép (`listing.deliveryAvailable`).
 */
/**
 * Hôm nay theo NGÀY LỊCH Việt Nam. Lịch bận trong test phải bám ngày THẬT: hằng cứng sẽ nằm
 * trong quá khứ vào một ngày nào đó và ô lịch bị khoá vì lý do khác hẳn thứ đang kiểm.
 */
const TODAY_KEY = vnDateKey(new Date());

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const api = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  fetchVehicleBusyDays: vi.fn(),
  submitBookingRequest: vi.fn(),
  fetchDriverLicenceOverview: vi.fn(),
}));
const media = vi.hoisted(() => ({ isMobile: false }));

/**
 * `useCurrentUser` đọc object này ở MỖI lần render — đổi `me.data` rồi `rerenderTree()` là mô
 * phỏng đúng cú đăng nhập xong: cùng một flow, state còn nguyên, chỉ `/auth/me` đổi.
 *
 * `updatedAt` là `dataUpdatedAt` của query: bỏ trống ⇒ "vừa nạp" (luôn mới hơn mọi lượt mời đăng
 * nhập); đặt một mốc cũ ⇒ mô phỏng cache còn giữ người dùng CŨ sau khi phiên đã chết.
 */
const me = vi.hoisted(() => ({
  data: undefined as unknown,
  updatedAt: undefined as number | undefined,
}));
/** Lời nhắc thanh toán (`useUnpaidHolds`) — mặc định chưa có dữ liệu: không chặn gì. */
const unpaid = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/features/trips/hooks', () => ({ useUnpaidHolds: () => unpaid }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: me.data,
    dataUpdatedAt: me.updatedAt ?? (me.data ? Number.MAX_SAFE_INTEGER : 0),
  }),
}));

/**
 * Hộp đăng nhập/đăng ký dùng chung của site khách (ADR 0060). Flow chỉ cần biết nó được MỞ với
 * đúng ngữ cảnh; bản thân hộp có spec riêng (`AuthModal.test.tsx`). Hook thật ném lỗi khi nằm
 * ngoài `AuthModalProvider`, nên mock là bắt buộc chứ không chỉ cho gọn.
 */
const authModal = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/features/auth/components/AuthModalProvider', () => ({ useAuthModal: () => authModal }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
/*
 * Danh mục hành chính + bản đồ: stub cố định.
 *
 * Màn này kiểm LUỒNG đặt xe (giao tận nơi, đăng nhập, payload), không kiểm ô địa chỉ — hành vi hai
 * cấp danh mục nằm ở `components/form/AddressField.test.tsx`. Để chúng gọi thật thì mỗi lần
 * render sẽ đòi một QueryClientProvider cộng một khoá bản đồ, hai thứ không liên quan gì tới
 * thứ đang test.
 */
const PROVINCE = {
  code: '48',
  name: 'Đà Nẵng',
  administrativeType: 'municipality',
  slug: 'da-nang',
};
const WARD = {
  code: '20242',
  provinceCode: '48',
  name: 'Phường Hải Châu',
  shortName: 'Hải Châu',
  administrativeType: 'ward',
};

/*
 * Cả `useProvinces`/`useWards` (dạng thô) lẫn hai hook `*Options` đều phải có mặt: ô nhập dùng
 * bản Options, còn chuỗi xem trước ở bước Xác nhận (`useAddressPreview`) đọc bản thô để ghép
 * bằng chính `formatAddress` mà server dùng.
 */
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinces: () => ({ data: [PROVINCE] }),
  useProvinceOptions: () => ({
    options: [{ value: '48', label: 'TP Đà Nẵng' }],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWards: () => ({ data: { items: [WARD], total: 1 } }),
  useWardOptions: () => ({
    options: [{ value: '20242', label: 'Phường Hải Châu' }],
    items: [WARD],
    total: 1,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
/**
 * Gợi ý địa chỉ. Mặc định HỎNG (`available: false` — môi trường không có key), nên ô địa chỉ là ô
 * chữ tự do. Ca cần kỷ luật xác nhận (gợi ý sống, rỗng) thì bật `places.available`.
 */
const places = vi.hoisted(() => ({ available: false }));
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  placeMapSrc: (placeId: string) => `/api/places/map?placeId=${placeId}`,
  usePlaceSearch: (query: string) => ({
    data: { items: [], available: places.available },
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPlaceholderData: false,
    debouncedQuery: query.trim(),
  }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => media.isMobile,
  useIsTablet: () => false,
  useIsDesktop: () => !media.isMobile,
  useMediaQuery: () => media.isMobile,
}));

vi.mock('../api', () => ({
  BUSY_DAYS_LOOKAHEAD: 366,
  checkAvailability: (...a: unknown[]) => api.checkAvailability(...a),
  fetchVehicleBusyDays: (...a: unknown[]) => api.fetchVehicleBusyDays(...a),
  submitBookingRequest: (...a: unknown[]) => api.submitBookingRequest(...a),
}));

/**
 * Cột hồ sơ xe. Mặc định LỖI: phần lớn test ở đây khoá luồng đặt, và một cột trái rỗng chứng
 * minh luôn rằng luồng không phụ thuộc nó. Test nào cần dữ liệu thật thì tự đặt `listing.data`.
 */
const listing = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/features/marketplace/api', () => ({
  fetchListingDetailClient: () =>
    listing.data ? Promise.resolve(listing.data) : Promise.reject(new Error('listing offline')),
  fetchListingReviewsClient: () => Promise.reject(new Error('reviews off')),
}));
/** Danh mục dùng chung của bộ test (`test-catalog`) — đúng shape module thật, gồm cả `useCatalogLabels`. */
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

/**
 * Public quote: mặc định lỗi — các test này khoá luồng đặt xe, không khoá khối giá; query lỗi
 * thì khối giá rơi về bảng niêm yết. KHÔNG mock kiểu treo vô hạn: `invalidateQueries()` sau khi
 * gửi thành công sẽ đợi refetch của chính query này và làm test kẹt ở bước done.
 */
const quote = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/features/rental-policies/api', () => ({
  fetchPublicQuote: () =>
    quote.data ? Promise.resolve(quote.data) : Promise.reject(new Error('quote offline (test)')),
  fetchDeliveryDistance: (...args: unknown[]) => deliveryDistance.fn(...args),
}));

/**
 * Tra khoảng cách giao xe. Mặc định là `unavailable` — tức CHƯA cấu hình bản đồ, đúng trạng thái
 * của một môi trường không có key. Test nào cần trạng thái khác thì gán lại `fn` trong chính nó,
 * nên phần lớn suite vẫn kiểm được luồng đặt xe khi bản đồ vắng mặt.
 */
const deliveryDistance = {
  fn: vi.fn(() =>
    Promise.resolve({
      status: 'unavailable',
      distanceKm: null,
      fee: null,
      origin: null,
      destination: null,
      formattedAddress: null,
    }),
  ) as unknown as (...args: unknown[]) => Promise<unknown>,
};

/**
 * Nút "Nhắn chủ xe" thật cần `AuthModalProvider` (nó tự mở modal đăng nhập khi khách chưa
 * đăng nhập) và tự điều hướng sang khu tin nhắn. Overlay này chỉ mở từ route group `(public)`
 * — nơi provider luôn có — nên ở test thay bằng nút giả, đủ để khoá việc nó CÓ MẶT và gọi
 * `onNavigate` để đóng overlay trước khi rời trang.
 */
vi.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: ({ label, onNavigate }: { label?: string; onNavigate?: () => void }) => (
    <button type="button" onClick={onNavigate}>
      {label}
    </button>
  ),
}));

/**
 * Bằng lái (ADR 0057). Mặc định ĐÃ XÁC THỰC, còn hạn, lái được ô tô — phần lớn test ở đây khoá
 * luồng đặt xe, không phải bước bằng lái; ca nào cần bằng thiếu thì tự đặt lại.
 */
vi.mock('@/features/driver-licence/api', () => ({
  fetchDriverLicenceOverview: (...a: unknown[]) => api.fetchDriverLicenceOverview(...a),
  fetchDriverLicenceImage: vi.fn(),
  requestDriverLicenceReview: vi.fn(),
  submitDriverLicence: vi.fn(),
}));

/**
 * Xem trước mã khuyến mãi (ADR 0046). Kết quả phụ thuộc NGƯỜI đang xem, nên các ca ở đây chỉ đếm
 * xem mã được đánh giá lúc nào và mấy lần — không quan tâm số giảm.
 */
const promoApi = vi.hoisted(() => ({ previewPromoCode: vi.fn() }));
vi.mock('@/features/promo-codes/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/promo-codes/api')>()),
  previewPromoCode: (...a: unknown[]) => promoApi.previewPromoCode(...a),
}));

const VERIFIED_LICENCE = {
  id: 'L1',
  status: 'verified',
  kind: 'vn',
  licenceNumber: '790123456789',
  fullName: 'NGUYỄN VĂN A',
  dateOfBirth: '1990-01-01',
  classes: ['B2'],
  issuedOn: '2021-01-01',
  expiresOn: '2099-01-01',
  noExpiry: false,
  issuingCountry: 'VN',
  coversCar: true,
  coversMotorbike: false,
  rejectionReason: null,
  reviewNote: null,
  qualityIssues: [],
  canRequestReview: false,
  reviewRequestedAt: null,
  decisionSource: 'auto',
  decidedAt: '2026-01-01T00:00:00.000Z',
  submittedAt: '2026-01-01T00:00:00.000Z',
};
const NO_LICENCE = { verified: null, latest: null };
/**
 * Tài khoản khách đã đăng nhập, SĐT đã xác minh — mặc định của suite (ADR 0060). Họ tên + SĐT ở
 * bước Xác nhận đọc từ ĐÂY, không từ form nào.
 */
const LOGGED_IN_ME = {
  id: 'U9',
  displayName: 'Nguyễn Văn A',
  phone: '0901234567',
  phoneVerified: true,
};

/**
 * Bản nháp mẫu: một khoảng thuê 3 ngày KHÁC hẳn khoảng 2 ngày của link (`renderModal`), để biết
 * chắc màn hình đang hiện thứ đã khôi phục chứ không phải thứ điền từ URL.
 */
const DRAFT_PICKUP_ISO = '2026-12-10T02:00:00.000Z';
const DRAFT_RETURN_ISO = '2026-12-13T02:00:00.000Z';
function draftValues(): RequestFormValues {
  return {
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    routeType: ROUTE_TYPE.IN_CITY,
    pickupProvinceCode: '',
    pickupWardCode: '',
    pickupAddressLine: '',
    pickupPlaceId: null,
    pickupLatitude: null,
    pickupLongitude: null,
    pickupLocationSource: null,
    destination: '',
    pickupAt: toAppTz(DRAFT_PICKUP_ISO),
    returnAt: toAppTz(DRAFT_RETURN_ISO),
    longTermPackageMonths: LONG_TERM_PACKAGE_MONTHS[0],
    pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
    requestedPickupDate: null,
    pickupMethod: PICKUP_METHOD.SELF,
    deliveryProvinceCode: '',
    deliveryWardCode: '',
    deliveryAddressLine: '',
    deliveryPlaceId: null,
    deliveryLatitude: null,
    deliveryLongitude: null,
    deliveryLocationSource: null,
    acceptedTerms: false,
    note: '',
  };
}

/** Hồ sơ xe đủ dùng cho các test cần cột trái / chính sách giao xe / điểm nhận xe. */
const LISTING = {
  id: 'V1',
  name: 'Toyota Vios 2022',
  vehicleType: 'car',
  serviceTypes: ['self_drive'],
  seatCount: 5,
  manufactureYear: 2022,
  bodyType: 'sedan',
  fuelType: 'gasoline',
  mainImageUrl: null,
  weekdayPrice: '585000',
  weekendPrice: '650000',
  hourlyPrice: '90000',
  discountPercent: 10,
  deliveryEnabled: true,
  deliveryAvailable: true,
  /** Tỉnh nơi xe đang đỗ — khối địa chỉ của khách lấy nó làm ngữ cảnh và làm mã tỉnh dự phòng. */
  provinceCode: '48',
  pickupPoint: null,
  noCollateral: false,
  shopName: 'Gian hàng Demo XePrime',
  shopSlug: 'demo',
  shopProvince: 'TP. Hồ Chí Minh',
  shopLogoUrl: null,
  shopBio: null,
  ratingAvg: '4.5',
  ratingCount: 2,
  images: [],
  features: ['bluetooth'],
  description: null,
  color: null,
  brand: null,
  model: null,
  longTermPackages: [],
};

function renderModal(open = true, onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <App>
        <RequestBookingModal
          vehicleId="V1"
          vehicleName="Toyota Vios"
          pickupAt="2026-09-01T02:00:00.000Z"
          returnAt="2026-09-03T02:00:00.000Z"
          open={open}
          onClose={onClose}
        />
      </App>
    </QueryClientProvider>
  );
  const utils = render(tree());
  /** Vẽ lại CÙNG cây — flow giữ nguyên state, chỉ đọc lại `me.data` (đăng nhập xong / mất phiên). */
  const rerenderTree = () => utils.rerender(tree());
  return { ...utils, onClose, queryClient, rerenderTree };
}

/**
 * Mở overlay từ THẺ ĐẶT XE của trang chi tiết: chuyến đã đủ (ngày giờ từ URL) cộng những lựa chọn
 * của thẻ (`prefill`) — cách nhận xe, địa chỉ giao, mã khuyến mãi, và cờ tự đi tiếp.
 */
function renderModalWithPrefill(prefill: RequestBookingPrefill) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <App>
        <RequestBookingModal
          vehicleId="V1"
          vehicleName="Toyota Vios"
          pickupAt="2026-09-01T02:00:00.000Z"
          returnAt="2026-09-03T02:00:00.000Z"
          prefill={prefill}
          open
          onClose={vi.fn()}
        />
      </App>
    </QueryClientProvider>
  );
  const utils = render(tree());
  return { ...utils, queryClient, rerenderTree: () => utils.rerender(tree()) };
}

/** Mở overlay từ một chỗ KHÔNG có sẵn ngày giờ (thẻ xe chưa lọc theo thời gian). */
function renderModalWithoutPrefill() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App>
        <RequestBookingModal vehicleId="V1" vehicleName="Toyota Vios" open onClose={vi.fn()} />
      </App>
    </QueryClientProvider>,
  );
}

/**
 * trip → review của khách ĐÃ đăng nhập: một cú Tiếp tục kiểm khung giờ, soát bằng lái (mặc định
 * đã hợp lệ nên không dừng ở bước bằng lái) rồi sang Xác nhận.
 */
async function advanceToReview() {
  api.checkAvailability.mockResolvedValue({ available: true });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' });
}

/** Tick ô "Tôi đã đọc và đồng ý…" của màn Xem lại — bắt buộc trước khi gửi (design v2). */
function acceptTerms() {
  const box = screen.getByRole('checkbox', { name: /Tôi đã đọc và đồng ý/ }) as HTMLInputElement;
  if (!box.checked) fireEvent.click(box);
}

/** Gửi yêu cầu từ màn Xem lại: tick ô đồng ý rồi bấm gửi. */
function submitFromReview() {
  acceptTerms();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }));
}

beforeEach(() => {
  media.isMobile = false;
  nav.push.mockReset();
  // Mặc định là khách ĐÃ đăng nhập, SĐT đã xác minh — đường duy nhất gửi được yêu cầu (ADR 0060).
  me.data = LOGGED_IN_ME;
  me.updatedAt = undefined;
  unpaid.data = undefined;
  promoApi.previewPromoCode.mockReset();
  promoApi.previewPromoCode.mockResolvedValue({ applicable: false, code: 'GIAM50', reason: null });
  listing.data = null;
  quote.data = null;
  Object.values(api).forEach((fn) => fn.mockReset());
  authModal.open.mockReset();
  // Bản nháp chờ đăng nhập sống ở `sessionStorage` — không được rò từ test này sang test khác.
  window.sessionStorage.clear();
  api.fetchDriverLicenceOverview.mockResolvedValue({
    verified: VERIFIED_LICENCE,
    latest: VERIFIED_LICENCE,
  });
  // Xe rảnh trơn là mặc định — test nào cần lịch bận thì tự đặt lại.
  api.fetchVehicleBusyDays.mockResolvedValue({ days: [], from: TODAY_KEY, to: TODAY_KEY });
});

afterEach(cleanup);

describe('RequestBookingModal — luồng đặt xe', () => {
  describe('vỏ overlay', () => {
    it('tiêu đề "Yêu cầu thuê xe" và là dialog có tên khả truy cập', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getAllByText('Yêu cầu thuê xe').length).toBeGreaterThan(0);
    });

    it('chưa mở thì KHÔNG dựng flow (state reset mỗi lần mở)', () => {
      renderModal(false);
      expect(screen.queryByText(/Chọn thời gian thuê để kiểm tra/)).toBeNull();
    });

    /**
     * Thanh tiến trình kể CẢ HÀNH TRÌNH (Figma `19727:55959`): gửi xong chưa phải là xong — còn chờ
     * chủ xe nhận và trả tiền giữ chỗ. Bằng lái và màn kết quả không bao giờ là một chặng riêng.
     */
    it('tiến trình kể cả hành trình — mở ra ở chặng 1/4 "Chọn chuyến", không có ô Liên hệ', () => {
      renderModal();
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      const items = within(steps).getAllByRole('listitem');
      expect(items).toHaveLength(4);
      expect(items[0]!.getAttribute('aria-current')).toBe('step');
      expect(screen.getByText('Bước 1 / 4 · Chọn chuyến')).toBeTruthy();
      expect(within(steps).queryByText('Liên hệ')).toBeNull();
    });
  });

  describe('bước 1 — chuyến đi & kiểm tra khả dụng', () => {
    it('mở ra ở bước Chuyến đi, prefill thời gian từ bộ lọc', () => {
      renderModal();
      expect(screen.getByText('Thời gian thuê')).toBeTruthy();
      expect(screen.getAllByText('Toyota Vios').length).toBeGreaterThan(0);
    });

    /**
     * Xe chỉ phục vụ một dịch vụ thì "Dịch vụ · Tự lái" không phải một lựa chọn, chỉ là một
     * dòng đọc lại thứ khách vừa bấm ở trang chi tiết. Cột trái đã nói xe làm dịch vụ gì.
     */
    it('xe một dịch vụ → KHÔNG dựng dòng "Dịch vụ" nào ở bước Chuyến đi', () => {
      renderModal();
      expect(screen.queryByText('Dịch vụ')).toBeNull();
    });

    it('gửi đúng vehicleId + ISO khi kiểm tra khả dụng', async () => {
      renderModal();
      api.checkAvailability.mockResolvedValue({ available: true });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(1));
      const payload = api.checkAvailability.mock.calls[0]![0];
      expect(payload.vehicleId).toBe('V1');
      expect(payload.pickupAt).toBe('2026-09-01T02:00:00.000Z');
      expect(payload.returnAt).toBe('2026-09-03T02:00:00.000Z');
    });

    it('KHÔNG khả dụng → báo lỗi, ở lại bước Chuyến đi, không soát bằng lái', async () => {
      renderModal();
      api.checkAvailability.mockResolvedValue({ available: false });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(api.fetchDriverLicenceOverview).not.toHaveBeenCalled();
    });

    it('lỗi API khi kiểm tra → hiện thông báo lỗi', async () => {
      renderModal();
      api.checkAvailability.mockRejectedValue(new Error('hỏng mạng'));
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      // Chữ đến từ MÃ lỗi (ADR 0012) — không phải `message` tiếng Việt của backend.
      expect(await screen.findByText(/Đã có lỗi xảy ra|Không kết nối/)).toBeTruthy();
    });

    /**
     * Lịch bận đi thẳng từ API vào hộp chọn thời gian: khách phải thấy ngày kín NGAY trên lịch,
     * không phải chọn xong bấm Tiếp tục rồi mới bị `check-availability` từ chối.
     */
    it('nạp lịch bận của đúng xe đang xem, cửa sổ bắt đầu từ quanh hôm nay', async () => {
      renderModal();

      await waitFor(() => expect(api.fetchVehicleBusyDays).toHaveBeenCalled());
      const [vehicleId, from, to] = api.fetchVehicleBusyDays.mock.calls[0] as [
        string,
        string,
        string,
      ];
      expect(vehicleId).toBe('V1');
      // Lùi một ngày: máy khách ở múi giờ âm có thể đang ở "hôm qua" so với ngày nghiệp vụ.
      expect(from).toBe(addDateKeyDays(TODAY_KEY, -1));
      expect(to).toBe(addDateKeyDays(from, 366));
    });

    it('ngày bận trọn ngày bị khoá ngay trên lịch của hộp chọn', async () => {
      api.fetchVehicleBusyDays.mockResolvedValue({
        days: [{ date: TODAY_KEY, fullyBusy: true, periods: [] }],
        from: TODAY_KEY,
        to: TODAY_KEY,
      });
      // Không prefill: lịch mở đúng THÁNG NÀY, nên ô "hôm nay" chắc chắn nằm trong lưới.
      renderModalWithoutPrefill();

      fireEvent.click(screen.getByRole('button', { name: /Thời gian thuê:/ }));
      // Lịch đôi: một ngày cuối tháng còn hiện lại ở lưới tháng sau dưới dạng ngày ngoài.
      const [busyDay] = await screen.findAllByTitle('Xe đã có lịch cả ngày');
      expect((busyDay as HTMLButtonElement).disabled).toBe(true);
    });

    it('dùng MỘT ô chọn khoảng thuê, không phải hai ô ngày rời', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.queryByLabelText('Ngày nhận xe')).toBeNull();
      expect(screen.queryByLabelText('Ngày trả xe')).toBeNull();
    });
  });

  describe('bước 2 — xác nhận & gửi (thuê theo ngày)', () => {
    /**
     * Ô "Tôi đã đọc và đồng ý…" của design v2 (Figma `19727:56134`) — đặt lại ô tick mà luồng đã bỏ
     * ngày 20/08. Chưa tick thì KHÔNG gửi và nói ngay dưới ô; tick xong lời nhắc tự biến mất. Ba văn
     * bản được viện dẫn là liên kết thật, mở tab mới để không mất biểu mẫu.
     */
    it('ô đồng ý điều khoản BẮT BUỘC: chưa tick thì không gửi, tick xong lời nhắc biến mất', async () => {
      renderModal();
      await advanceToReview();

      const box = screen.getByRole('checkbox', {
        name: /Tôi đã đọc và đồng ý/,
      }) as HTMLInputElement;
      expect(box.checked).toBe(false);
      expect(screen.getByRole('link', { name: 'Chính sách huỷ & hoàn tiền' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Chính sách bảo mật' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }));
      expect(
        await screen.findByText('Bạn cần đồng ý điều khoản trước khi gửi yêu cầu.'),
      ).toBeTruthy();
      await act(async () => {});
      expect(api.submitBookingRequest).not.toHaveBeenCalled();

      fireEvent.click(box);
      expect(screen.queryByText('Bạn cần đồng ý điều khoản trước khi gửi yêu cầu.')).toBeNull();
    });

    /** Xe bắt đồng ý điều khoản riêng của chủ xe ⇒ CÙNG một ô phủ luôn điều khoản đó. */
    it('chủ xe bắt đồng ý điều khoản riêng ⇒ ô đồng ý nói cả điều khoản của chủ xe', async () => {
      listing.data = {
        ...LISTING,
        rentalTerms: [
          {
            serviceType: 'self_drive',
            requiredDocuments: ['cccd'],
            identityVerifyMethod: 'vneid',
            termsText: 'Không hút thuốc trong xe.',
            requireTermsAcceptance: true,
            depositMode: null,
            instantBookEnabled: false,
            minRentalMinutes: null,
          },
        ],
      };
      renderModal();
      await advanceToReview();

      expect(screen.getByText('Không hút thuốc trong xe.')).toBeTruthy();
      expect(
        screen.getByRole('checkbox', { name: /đồng ý với điều khoản thuê của chủ xe/ }),
      ).toBeTruthy();

      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();
      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      expect(api.submitBookingRequest.mock.calls[0]![0]).toMatchObject({ acceptedTerms: true });
    });

    /**
     * Chủ xe CÔNG BỐ điều khoản nhưng không bắt đồng ý: server vẫn đóng băng nội dung đó cùng mốc
     * đồng ý, nên câu của ô phải nhắc tới nó — khai `acceptedTerms` cho một câu không nói gì về
     * điều khoản chủ xe là ghi một lời đồng ý khách chưa từng đưa ra.
     */
    it('chủ xe công bố điều khoản (không bắt buộc) ⇒ câu đồng ý nhắc điều khoản chủ xe', async () => {
      listing.data = {
        ...LISTING,
        rentalTerms: [
          {
            serviceType: 'self_drive',
            requiredDocuments: [],
            identityVerifyMethod: 'vneid',
            termsText: 'Trả xe đúng mức xăng lúc nhận.',
            requireTermsAcceptance: false,
            depositMode: null,
            instantBookEnabled: false,
            minRentalMinutes: null,
          },
        ],
      };
      renderModal();
      await advanceToReview();

      expect(
        screen.getByRole('checkbox', { name: /đồng ý với điều khoản thuê của chủ xe/ }),
      ).toBeTruthy();
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();
      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      expect(api.submitBookingRequest.mock.calls[0]![0]).toMatchObject({ acceptedTerms: true });
    });

    /**
     * HẠN MỨC QUÃNG ĐƯỜNG nhắc lại ở lần soát cuối (21/09/2026).
     *
     * Phí vượt km là khoản duy nhất có thể phát sinh sau chuyến mà không nằm trong bảng giá bên
     * cạnh, nên khách phải đọc nó ngay trước khi cam kết — không phải nhớ lại từ một trang đã
     * cuộn qua. Màn này KHÔNG tự nhân ra tổng km cho cả chuyến: số ngày tính phí là của server.
     */
    it('bước Xác nhận nhắc lại km/ngày và phí mỗi km vượt', async () => {
      listing.data = {
        ...LISTING,
        mileagePolicy: { includedKmPerDay: 200, excessFeePerKm: '3000' },
      };
      renderModal();
      await advanceToReview();

      expect(screen.getByText('Hạn mức quãng đường')).toBeTruthy();
      expect(screen.getByText(/Bao gồm 200 km\/ngày/)).toBeTruthy();
      expect(screen.getByText(/3\.000/)).toBeTruthy();
    });

    it('xe không đặt hạn mức: bước Xác nhận không mọc thêm dòng rỗng', async () => {
      listing.data = LISTING;
      renderModal();
      await advanceToReview();

      expect(screen.queryByText('Hạn mức quãng đường')).toBeNull();
    });

    it('gửi payload đúng (KHÔNG họ tên/SĐT, KHÔNG có trường giao nhận)', async () => {
      renderModal();
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload).toEqual({
        vehicleId: 'V1',
        pickupAt: '2026-09-01T02:00:00.000Z',
        returnAt: '2026-09-03T02:00:00.000Z',
        // Dịch vụ của chuyến luôn đi kèm (17/08) — mặc định tự lái.
        serviceType: 'self_drive',
      });
      // Chủ xe không có điều khoản riêng ⇒ ô đồng ý chỉ là văn bản của XePrime: KHÔNG khai
      // `acceptedTerms` (server hiểu nó là "đã đồng ý điều khoản thuê của chủ xe").
      expect(payload).not.toHaveProperty('acceptedTerms');
      // Danh tính người thuê do SERVER đọc từ tài khoản — client không gửi, server không tin (ADR 0060).
      expect(payload).not.toHaveProperty('customerName');
      expect(payload).not.toHaveProperty('customerPhone');
      // Không gõ lời nhắn ⇒ không có trường `note`, không phải chuỗi rỗng.
      expect(payload).not.toHaveProperty('note');
    });

    it('lời nhắn cho chủ xe đi kèm yêu cầu, đã cắt khoảng trắng hai đầu', async () => {
      renderModal();
      await advanceToReview();

      fireEvent.change(
        screen.getByRole('textbox', { name: 'Lời nhắn cho chủ xe (không bắt buộc)' }),
        { target: { value: '  Tôi cần hướng dẫn nhận xe  ' } },
      );
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      expect(api.submitBookingRequest.mock.calls[0]![0]).toMatchObject({
        note: 'Tôi cần hướng dẫn nhận xe',
      });
    });

    /**
     * Thẻ chuyến của màn Xem lại (Figma `19727:55974`): xe, mốc nhận/trả có NĂM, nơi nhận xe, chủ xe
     * + thời lượng — và "Chỉnh sửa" đưa về bước Chuyến đi, giữ nguyên mọi thứ đã chọn.
     */
    it('thẻ chuyến đi: xe + mốc nhận/trả + chủ xe; "Chỉnh sửa" quay về bước Chuyến đi', async () => {
      listing.data = LISTING;
      renderModal();
      await advanceToReview();

      const trip = screen.getByRole('region', { name: 'Thông tin chuyến đi' });
      expect(within(trip).getByText('Toyota Vios 2022')).toBeTruthy();
      expect(within(trip).getByText('01/09/2026 09:00')).toBeTruthy();
      expect(within(trip).getByText('03/09/2026 09:00')).toBeTruthy();
      expect(within(trip).getByText('Tự nhận và trả xe tại điểm hẹn của chủ xe')).toBeTruthy();
      expect(within(trip).getByText('Gian hàng Demo XePrime')).toBeTruthy();
      expect(within(trip).getByText('Thuê theo ngày · 2 ngày')).toBeTruthy();

      fireEvent.click(within(trip).getByRole('button', { name: 'Chỉnh sửa thông tin chuyến đi' }));
      expect(await screen.findByRole('button', { name: 'Tiếp tục' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
    });

    /**
     * CHUYẾN ĐƯỢC NHẬN NGAY (xe "Đặt ngay" — ADR 0044 điều 2) ⇒ khách sang thẳng TRANG THANH TOÁN
     * của chuyến (`/payment/:id`, 13/10/2026), hộp thoại đóng lại.
     *
     * Lỗi mà ca này chặn: khách thấy một lời cảm ơn rồi rời đi trong khi chỗ đã bị giữ và đồng hồ
     * đang chạy — chuyến chết vì hết hạn chứ không vì khách đổi ý. Trang thanh toán là nơi có đủ
     * kênh trả (VietQR + ví điện tử), và không mất đi khi lỡ tay đóng một hộp thoại.
     */
    it('trả về awaiting_hold: đóng hộp thoại và sang TRANG THANH TOÁN của đúng chuyến', async () => {
      const { onClose } = renderModal();
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R9', status: 'awaiting_hold' });
      submitFromReview();

      await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/payment/R9'));
      expect(onClose).toHaveBeenCalled();
      // Không dựng màn "đã gửi, chờ chủ xe" cho một chuyến đã được nhận.
      expect(screen.queryByText(/sẽ xem xét và phản hồi/i)).toBeNull();
    });

    /**
     * Người thuê là TÀI KHOẢN đang đăng nhập — một dòng CHỈ ĐỌC. Đổi số là việc của trang tài
     * khoản, không phải của một lượt đặt xe, nên không còn nút "Đổi" mở lại ô liên hệ.
     */
    it('thẻ người thuê đọc từ tài khoản — chỉ đọc; ô nhập DUY NHẤT là lời nhắn', async () => {
      renderModal();
      await advanceToReview();
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByText('Nguyễn Văn A')).toBeTruthy();
      expect(within(renter).getByText('0901234567')).toBeTruthy();
      expect(within(renter).getByText('Đã xác thực')).toBeTruthy();
      // Họ tên + SĐT không sửa được ở đây (ADR 0060) — chỉ có ô lời nhắn cho chủ xe.
      expect(within(renter).getAllByRole('textbox')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /Đổi/ })).toBeNull();
    });

    /**
     * Bấm thêm lúc request đầu còn đang bay — hai yêu cầu cho cùng một chuyến là một yêu cầu trùng
     * mà chính khách không cố ý tạo ra. Khoá ở đây là trạng thái "đang gửi" của nút.
     */
    it('đang gửi thì nút gửi KHOÁ — bấm thêm không sinh yêu cầu thứ hai', async () => {
      renderModal();
      await advanceToReview();

      api.submitBookingRequest.mockReturnValue(new Promise(() => {}));
      acceptTerms();
      const submit = screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' });
      fireEvent.click(submit);
      // Đang gửi thì nút khoá (vòng quay của nút gradient) — cùng một phần tử.
      await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));

      fireEvent.click(submit);
      await act(async () => {});
      expect(api.submitBookingRequest).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Wave 9 — giao xe tận nơi. Điều cần khoá: CHỈ hỏi địa chỉ, nói rõ miễn phí, tuyệt đối không
   * có khoảng cách / báo giá / bước khách duyệt phí, và lựa chọn chỉ tồn tại khi CHÍNH SÁCH
   * cho phép.
   */
  describe('giao xe tận nơi', () => {
    /**
     * Chọn "giao tận nơi" rồi chờ ô ĐỊA CHỈ dựng xong.
     *
     * Khối địa chỉ của KHÁCH chỉ còn MỘT ô, nhãn "Địa chỉ giao xe". Không còn bộ chọn tỉnh và bộ
     * chọn xã/phường ở đây: người thuê xe ở tỉnh khác không biết mình đang ở phường nào, còn mã
     * tỉnh thì suy từ địa điểm họ chọn trên bản đồ (xem `RenterAddressBlock`).
     */
    async function chooseDelivery() {
      fireEvent.click(await screen.findByRole('radio', { name: /Giao xe tận nơi/ }));
      await screen.findByLabelText(/Địa chỉ giao xe/);
    }

    beforeEach(() => {
      listing.data = LISTING;
    });

    it('mặc định là nhận tại điểm hẹn — KHÔNG hỏi địa chỉ', async () => {
      renderModal();
      await screen.findByRole('radio', { name: /Nhận tại điểm hẹn/ });
      expect(screen.queryByLabelText(/Địa chỉ giao xe/)).toBeNull();
    });

    /**
     * Chưa cấu hình bản đồ (mặc định của mock) — màn hình phải giữ NGUYÊN hành vi trước đây:
     * hỏi địa chỉ, nói hai bên tự trao đổi phí. Đây là bài kiểm quan trọng nhất của cả nhóm này,
     * vì nó khoá lời hứa "bản đồ vắng mặt không làm gãy luồng đặt xe".
     */
    /**
     * KHÁCH không bị hỏi đơn vị hành chính.
     *
     * Danh mục cấp xã có 3.321 đơn vị và vừa đổi tên hàng loạt từ 01/07/2025; một người đang thuê
     * xe ở tỉnh khác không biết mình sẽ nhận xe ở phường nào. Hai bộ chọn đó là việc của CHỦ XE
     * khai địa chỉ vận hành (`AddressField`), không phải của người đặt xe.
     */
    it('chỉ hỏi MỘT ô địa chỉ — không bộ chọn tỉnh, không bộ chọn xã/phường', async () => {
      renderModal();
      await chooseDelivery();

      expect(screen.queryByLabelText(/Xã\/phường/)).toBeNull();
      expect(screen.queryByLabelText(/Tỉnh\/thành/)).toBeNull();
      // Tỉnh của xe vẫn hiện ra, nhưng là NGỮ CẢNH để đọc chứ không phải một ô để điền.
      expect(screen.getByText(/Xe đang ở TP\. Hồ Chí Minh/)).toBeTruthy();
    });

    it('chưa cấu hình bản đồ → hiện ô địa chỉ và câu giải thích như cũ', async () => {
      renderModal();
      await chooseDelivery();

      expect(
        screen.getByText(
          'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.',
        ),
      ).toBeTruthy();
    });

    it('KHÔNG hỏi bản đồ khi địa chỉ còn quá ngắn — hạn mức không bị đốt vì gõ dở', async () => {
      renderModal();
      await chooseDelivery();

      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), { target: { value: '12 Ng' } });
      await new Promise((r) => setTimeout(r, 1100));

      expect(deliveryDistance.fn).not.toHaveBeenCalled();
    });

    /**
     * Báo giá chỉ tra chữ ĐÃ ỔN ĐỊNH. Gõ đè lên địa chỉ gõ tay đã chốt rồi bấm ra ngoài: ô quay về
     * địa chỉ cũ và nguồn `manual` quay lại NGAY, trong khi chuỗi debounce còn là chữ vừa gõ dở —
     * tra lúc đó là trả tiền cho đúng cái chuỗi không ai xác nhận.
     */
    it('gõ đè địa chỉ gõ tay đã chốt rồi bỏ đi → KHÔNG tra chữ gõ dở', async () => {
      places.available = true;
      const fn = vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          status: 'unavailable',
          distanceKm: null,
          fee: null,
          origin: null,
          destination: null,
          formattedAddress: null,
        }),
      );
      deliveryDistance.fn = fn as unknown as (...args: unknown[]) => Promise<unknown>;
      try {
        renderModal();
        await chooseDelivery();
        const field = screen.getByLabelText(/Địa chỉ giao xe/);

        fireEvent.change(field, { target: { value: 'Hẻm 25 Nguyễn Công Trứ' } });
        fireEvent.mouseDown(field);
        fireEvent.click(await screen.findByText(/Dùng đúng địa chỉ đã nhập/));
        await waitFor(() => expect(fn).toHaveBeenCalledTimes(1), { timeout: 2000 });

        fireEvent.change(field, { target: { value: 'Hẻm 25 Nguyễn Công Trứ, P' } });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        fireEvent.blur(field);
        await waitFor(() =>
          expect((field as HTMLInputElement).value).toBe('Hẻm 25 Nguyễn Công Trứ'),
        );
        await new Promise((resolve) => setTimeout(resolve, 1100));

        expect(fn.mock.calls.map((call) => call[1])).toEqual(['Hẻm 25 Nguyễn Công Trứ']);
      } finally {
        places.available = false;
      }
    }, 15_000);

    it('trong bán kính → hiện quãng đường một chiều và phí DỰ KIẾN', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'auto',
          distanceKm: 3.4,
          fee: '30000',
          origin: { lat: 10.7721, lng: 106.698 },
          destination: { lat: 10.79, lng: 106.71 },
          formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;

      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: '12 Nguyễn Huệ, Quận 1, TP.HCM' },
      });

      // Quãng đường giữ một chữ số thập phân: bậc phí cắt ở đúng 3 km, làm tròn thành "3 km"
      // sẽ hiện một con số mâu thuẫn với mức phí ngay cạnh nó.
      expect(await screen.findByText(/3,4 km/)).toBeTruthy();
      expect(screen.getByText(/12 Nguyễn Huệ, Bến Nghé/)).toBeTruthy();
    });

    it('ngoài bán kính → nói chủ xe sẽ báo phí, KHÔNG hiện một con số nào', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'manual',
          distanceKm: 42.5,
          fee: null,
          origin: { lat: 10.7721, lng: 106.698 },
          destination: { lat: 11.2, lng: 106.9 },
          formattedAddress: null,
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;

      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: 'Khu công nghiệp Sóng Thần, Dĩ An, Bình Dương' },
      });

      expect(await screen.findByText(/ngoài phạm vi báo giá tự động/)).toBeTruthy();
      expect(screen.queryByText(/^30\.000/)).toBeNull();
    });

    it('KHÔNG có bước khách duyệt phí — con số là dự kiến, chủ xe vẫn chốt', async () => {
      renderModal();
      await chooseDelivery();

      expect(screen.queryByText(/Chờ chủ xe báo giá/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /Xác nhận phí/i })).toBeNull();
    });

    it('thiếu địa chỉ thì không đi tiếp được', async () => {
      renderModal();
      await chooseDelivery();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      // Khối chỉ có MỘT ô, nên ô còn thiếu chính là ô địa chỉ — không bộ chọn nào đứng trước nó.
      expect(await screen.findByText('Nhập địa chỉ giao xe')).toBeTruthy();
      // Dữ liệu chuyến chưa đủ thì chưa hỏi lịch trống, càng chưa sang bước sau.
      expect(api.checkAvailability).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
    });

    it('gửi kèm địa chỉ và deliveryRequested — KHÔNG kèm bất kỳ số phí nào', async () => {
      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: '  123 Nguyễn Văn Linh  ' },
      });
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R2', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload.deliveryRequested).toBe(true);
      // Client gửi MÃ + phần chi tiết; chuỗi hiển thị do server ghép (ADR 0035 điều 3), nên
      // `deliveryAddress` KHÔNG còn nằm trong payload.
      // Mã tỉnh lấy từ CHÍNH CHIẾC XE khi bản đồ chưa quy được tỉnh từ địa điểm khách chọn.
      expect(payload.deliveryProvinceCode).toBe('48');
      /*
       * Mã xã KHÔNG còn trong payload: màn hình không hỏi khách xã/phường nữa, và một chuỗi rỗng
       * gửi lên sẽ bị `@Length(5, 5)` bên API từ chối — `@IsOptional` chỉ bỏ qua null/undefined.
       */
      expect(payload).not.toHaveProperty('deliveryWardCode');
      expect(payload.deliveryAddressLine).toBe('123 Nguyễn Văn Linh');
      expect(payload).not.toHaveProperty('deliveryAddress');
      expect(payload).not.toHaveProperty('deliveryFee');
      expect(payload).not.toHaveProperty('distanceKm');
    });

    /**
     * Backend chặn `deliveryRequested` theo CHÍNH SÁCH hiệu lực, không theo chip tiện ích trên
     * hồ sơ xe. Nếu FE vẫn cho chọn thì khách đi hết luồng rồi mới ăn `DELIVERY_NOT_SUPPORTED`
     * ở đúng nút cuối cùng.
     */
    it('chính sách tắt giao xe → KHÔNG có lựa chọn nào để chọn nhầm', async () => {
      listing.data = { ...LISTING, deliveryAvailable: false };
      renderModal();

      await screen.findByText('Gian hàng Demo XePrime');
      expect(screen.queryByRole('radio', { name: /Giao xe tận nơi/ })).toBeNull();
      expect(screen.queryByLabelText(/Địa chỉ giao xe/)).toBeNull();
      expect(screen.getByText('Nhận tại điểm hẹn')).toBeTruthy();
    });

    /**
     * BA LÝ DO rơi về báo giá thủ công, ba câu khác nhau (21/09/2026 — mở rộng ADR 0018 §4).
     *
     * Trước đây cả ba dùng chung một dòng nói "ngoài phạm vi", nên một địa chỉ ngay trong thành
     * phố vẫn bị báo là quá xa chỉ vì nhà cung cấp bản đồ timeout — và khách đi sửa một địa chỉ
     * vốn đã đúng. Không ca nào trong ba được phép chặn nút gửi.
     */
    function respondWith(body: Record<string, unknown>) {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'manual',
          manualReason: null,
          distanceKm: null,
          straightLineKm: null,
          maxRadiusKm: null,
          fee: null,
          origin: null,
          destination: null,
          formattedAddress: null,
          ...body,
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
    }

    async function typeDeliveryAddress(value = 'Khu công nghiệp Sóng Thần, Dĩ An, Bình Dương') {
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), { target: { value } });
    }

    it('ngoài bán kính: cảnh báo nêu ĐÚNG bán kính chủ xe đặt, và vẫn gửi được', async () => {
      respondWith({
        manualReason: 'outside_auto_radius',
        straightLineKm: 42.5,
        maxRadiusKm: 20,
      });
      renderModal();
      await typeDeliveryAddress();

      expect(await screen.findByText('Ngoài phạm vi giao xe tự động')).toBeTruthy();
      // Đường CHIM BAY phải được gọi đúng tên — nó không phải quãng đường lái xe.
      expect(screen.getByText(/theo đường chim bay/)).toBeTruthy();
      expect(screen.getByText(/42,5 km/)).toBeTruthy();
      expect(screen.getByText(/20 km/)).toBeTruthy();
      expect(screen.getByText(/vẫn gửi được yêu cầu/)).toBeTruthy();
      // Ngoài phạm vi KHÔNG chặn: nút đi tiếp vẫn bấm được (ADR 0018).
      expect((screen.getByRole('button', { name: 'Tiếp tục' }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });

    it('đo được đường BỘ mà vượt bậc phí: gọi đúng là quãng đường đường bộ', async () => {
      respondWith({ manualReason: 'outside_auto_radius', distanceKm: 42.5, maxRadiusKm: 20 });
      renderModal();
      await typeDeliveryAddress();

      expect(await screen.findByText(/42,5 km đường bộ/)).toBeTruthy();
      expect(screen.queryByText(/chim bay/)).toBeNull();
    });

    it('không có tuyến đường: KHÔNG nói là ngoài phạm vi', async () => {
      respondWith({ manualReason: 'route_unavailable' });
      renderModal();
      await typeDeliveryAddress('123 Đường không có tuyến, Cần Giờ');

      expect(await screen.findByText('Chưa ước tính được quãng đường')).toBeTruthy();
      expect(screen.queryByText('Ngoài phạm vi giao xe tự động')).toBeNull();
      expect(screen.getByText(/vẫn gửi được yêu cầu/)).toBeTruthy();
    });

    it('nhà cung cấp bản đồ lỗi: im lặng rơi về câu cũ, không đổ lỗi cho khách', async () => {
      respondWith({ manualReason: 'provider_unavailable' });
      renderModal();
      await typeDeliveryAddress('123 Nguyễn Văn Linh, Đà Nẵng');

      expect(
        await screen.findByText(
          'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('Ngoài phạm vi giao xe tự động')).toBeNull();
      expect(screen.queryByText('Chưa ước tính được quãng đường')).toBeNull();
    });

    it('không tìm thấy địa chỉ: mời sửa địa chỉ, KHÔNG gọi là ngoài phạm vi', async () => {
      respondWith({ status: 'address_not_found', manualReason: null });
      renderModal();
      await typeDeliveryAddress('chỗ nào đó không có thật');

      expect(await screen.findByText('Chưa tìm thấy địa chỉ này')).toBeTruthy();
      expect(screen.getByText(/ghi rõ hơn/)).toBeTruthy();
      expect(screen.queryByText('Ngoài phạm vi giao xe tự động')).toBeNull();
    });

    /**
     * Đổi địa chỉ phải XOÁ kết quả cũ trước khi có kết quả mới.
     *
     * Khoá query chỉ đổi sau 900ms debounce, nên nếu không tự dọn thì trong quãng đó màn hình
     * vẫn trưng quãng đường và phí của một địa chỉ khác hẳn chỗ khách đang gõ.
     */
    it('đổi địa chỉ: phí và quãng đường cũ biến mất ngay, không chờ hết debounce', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'auto',
          manualReason: null,
          distanceKm: 3.4,
          straightLineKm: null,
          maxRadiusKm: 20,
          fee: '30000',
          origin: { lat: 10.7721, lng: 106.698 },
          destination: { lat: 10.79, lng: 106.71 },
          formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
      renderModal();
      await typeDeliveryAddress('12 Nguyễn Huệ, Quận 1, TP.HCM');
      expect(await screen.findByText(/3,4 km/)).toBeTruthy();

      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: '999 Một con đường hoàn toàn khác, Hà Nội' },
      });

      expect(screen.queryByText(/3,4 km/)).toBeNull();
      expect(screen.getByText('Đang tính quãng đường…')).toBeTruthy();
    });

    it('xoá trắng địa chỉ: phí cũ biến mất, và KHÔNG treo spinner cho một ô rỗng', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'auto',
          manualReason: null,
          distanceKm: 3.4,
          straightLineKm: null,
          maxRadiusKm: 20,
          fee: '30000',
          origin: null,
          destination: null,
          formattedAddress: null,
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
      renderModal();
      await typeDeliveryAddress('12 Nguyễn Huệ, Quận 1, TP.HCM');
      expect(await screen.findByText(/3,4 km/)).toBeTruthy();

      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), { target: { value: '' } });

      expect(screen.queryByText(/3,4 km/)).toBeNull();
      expect(screen.queryByText('Đang tính quãng đường…')).toBeNull();
    });

    it('API lỗi: không treo loading, không vỡ luồng', async () => {
      deliveryDistance.fn = vi.fn(() => Promise.reject(new Error('mạng hỏng'))) as unknown as (
        ...args: unknown[]
      ) => Promise<unknown>;
      renderModal();
      await typeDeliveryAddress('12 Nguyễn Huệ, Quận 1, TP.HCM');

      expect(
        await screen.findByText(
          'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('Đang tính quãng đường…')).toBeNull();
    });

    /**
     * Phí giao nhận KHÔNG nằm trong tổng, nhưng "không nằm trong tổng" ≠ "miễn phí".
     *
     * Câu cũ ("Phí giao nhận: Miễn phí.") hiện ra với MỌI đơn giao tận nơi, kể cả khi bước trước
     * vừa báo 50.000đ — một lời hứa sai về tiền, đúng loại lỗi mà cả tính năng này sinh ra để
     * dẹp. Chủ xe chốt phí lúc duyệt (ADR 0018 + Wave 9); khối giá chỉ được nói đúng chừng đó.
     */
    it('bước Xác nhận KHÔNG hứa giao xe miễn phí', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'auto',
          manualReason: null,
          distanceKm: 9.7,
          straightLineKm: null,
          maxRadiusKm: 10,
          fee: '50000',
          origin: { lat: 21.03, lng: 105.79 },
          destination: { lat: 20.99, lng: 105.86 },
          formattedAddress: null,
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: '12 Nguyễn Huệ, Quận 1, TP.HCM' },
      });
      await advanceToReview();

      expect(screen.queryByText(/Phí giao nhận: Miễn phí/)).toBeNull();
      expect(screen.queryByText(/Delivery fee: Free/)).toBeNull();
    });

    /**
     * Ước tính phải CÓ MẶT ở lần soát cuối.
     *
     * Đây là khoản duy nhất có thể phát sinh thêm trước chuyến mà không nằm trong "Tổng bạn trả".
     * Chỉ hiện ở bước Chuyến đi rồi biến mất là bắt khách nhớ lại từ một màn đã cuộn qua.
     */
    it('bước Xác nhận nhắc lại quãng đường và phí giao DỰ KIẾN', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'auto',
          manualReason: null,
          distanceKm: 9.7,
          straightLineKm: null,
          maxRadiusKm: 10,
          fee: '50000',
          origin: { lat: 21.03, lng: 105.79 },
          destination: { lat: 20.99, lng: 105.86 },
          formattedAddress: null,
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: '12 Nguyễn Huệ, Quận 1, TP.HCM' },
      });
      expect(await screen.findByText(/9,7 km/)).toBeTruthy();

      await advanceToReview();

      /*
       * Cùng con số, cùng chữ "DỰ KIẾN" — không dựng một cách diễn đạt thứ hai ở bước này.
       *
       * Soi TRONG khối ước tính chứ không tìm "50.000" trên cả màn: giá gạch ngang của xe là
       * "650.000 ₫" và cũng khớp chuỗi đó.
       */
      const estimate = screen.getByText(/9,7 km/).closest('div');
      expect(estimate?.textContent).toMatch(/Phí giao nhận/);
      expect(estimate?.textContent).toMatch(/50.000/);
    });

    /** Ngoài phạm vi: cảnh báo phải còn nguyên ở lần bấm gửi, không chỉ ở bước nhập địa chỉ. */
    it('ngoài phạm vi: bước Xác nhận vẫn cảnh báo trước khi gửi', async () => {
      deliveryDistance.fn = vi.fn(() =>
        Promise.resolve({
          status: 'manual',
          manualReason: 'outside_auto_radius',
          distanceKm: null,
          straightLineKm: 10.3,
          maxRadiusKm: 10,
          fee: null,
          origin: null,
          destination: null,
          formattedAddress: null,
        }),
      ) as unknown as (...args: unknown[]) => Promise<unknown>;
      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText(/Địa chỉ giao xe/), {
        target: { value: 'Ngõ 587 Tam Trinh, Hoàng Mai, Hà Nội' },
      });
      await screen.findByText('Ngoài phạm vi giao xe tự động');

      await advanceToReview();

      expect(screen.getByText('Ngoài phạm vi giao xe tự động')).toBeTruthy();
      expect(screen.getByText(/vẫn gửi được yêu cầu/)).toBeTruthy();
      // Và vẫn gửi được — ngoài phạm vi không bao giờ là một cái chặn (ADR 0018).
      expect(
        (screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('có điểm nhận xe → hiện ĐỊA CHỈ thật thay cho câu gợi ý chung', async () => {
      listing.data = {
        ...LISTING,
        deliveryAvailable: false,
        pickupPoint: {
          branchName: 'Chi nhánh Hải Châu',
          address: '12 Nguyễn Văn Linh, Đà Nẵng',
          provinceName: 'Đà Nẵng',
          phone: '0900000000',
        },
      };
      renderModal();

      expect(await screen.findByText('12 Nguyễn Văn Linh, Đà Nẵng')).toBeTruthy();
      expect(screen.queryByText('Tự tới nhận xe tại địa điểm của chủ xe')).toBeNull();
    });
  });

  describe('thành công', () => {
    async function reachDone() {
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();
      await screen.findByText('Đã gửi yêu cầu');
    }

    it('hiện màn thành công kèm mã yêu cầu', async () => {
      renderModal();
      await advanceToReview();
      await reachDone();

      expect(screen.getByText('Đã gửi yêu cầu')).toBeTruthy();
      expect(screen.getByText(/R1/)).toBeTruthy();
      expect(screen.getByText(/Xe chưa được giữ chỗ/)).toBeTruthy();
    });

    /**
     * ĐƯỜNG MẶC ĐỊNH KHÔNG CÓ QR — ADR 0044 điều 1.
     *
     * Chưa ai nhận chuyến thì chưa chốt được giá, chưa giữ chỗ và chưa có gì để thu. Dựng một
     * mã QR ở đây là mời khách trả tiền cho một chỗ chưa tồn tại — đúng thứ mà đợt này bỏ đi.
     */
    it('chưa ai duyệt ⇒ KHÔNG có mã QR, không có thông tin chuyển khoản', async () => {
      renderModal();
      await advanceToReview();
      await reachDone();

      expect(screen.queryByAltText(/mã qr/i)).toBeNull();
      expect(screen.queryByText(/nội dung chuyển khoản/i)).toBeNull();
      expect(screen.queryByText(/còn lại để thanh toán/i)).toBeNull();
    });

    it('có lối liên hệ chủ xe, và nó đóng overlay trước khi rời trang', async () => {
      const { onClose } = renderModal();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Nhắn chủ xe' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('tổng dự kiến đi qua bộ format tiền, không phải số thô', async () => {
      quote.data = {
        breakdown: {
          rows: [{ key: 'base', label: 'Tiền thuê xe', amount: '1800000', sublabel: null }],
          totalAmount: '1800000',
          depositAmount: '5000000',
        },
        delivery: { enabled: false, maxRadiusKm: null },
      };
      renderModal();
      await advanceToReview();
      await reachDone();

      expect(screen.getAllByText('1.800.000 ₫').length).toBeGreaterThan(0);
      expect(screen.queryByText('1800000')).toBeNull();
    });

    it('"Chuyến của tôi" đóng modal và điều hướng tới /trips', async () => {
      const { onClose } = renderModal();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Chuyến của tôi' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/trips');
    });

    it('"Quay lại" chỉ đóng, không điều hướng', async () => {
      const { onClose } = renderModal();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).not.toHaveBeenCalled();
    });
  });

  /**
   * Người thuê là TÀI KHOẢN đang đăng nhập (ADR 0060). Họ tên + SĐT đã xác minh do server đọc từ
   * tài khoản; ở đây khoá phần FE: bước Xác nhận hiện đúng chúng, và payload KHÔNG mang chúng.
   */
  describe('người thuê là tài khoản đang đăng nhập', () => {
    const verifiedMe = {
      id: 'U1',
      displayName: 'Trần Minh Tuấn',
      phone: '0901234567',
      phoneVerified: true,
    };

    it('bước Xác nhận hiện họ tên + SĐT của TÀI KHOẢN — và payload không mang chúng', async () => {
      me.data = verifiedMe;
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      renderModal();
      await advanceToReview();

      // Người thuê là MỘT THẺ chỉ đọc ở màn Xem lại, không còn là cả một bước.
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByText('Đã xác thực')).toBeTruthy();
      expect(within(renter).getByText('Trần Minh Tuấn')).toBeTruthy();
      expect(within(renter).getByText('0901234567')).toBeTruthy();

      submitFromReview();
      await screen.findByText('Đã gửi yêu cầu');
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload).not.toHaveProperty('customerName');
      expect(payload).not.toHaveProperty('customerPhone');
    });

    /**
     * Vừa vào bằng Google/Facebook nên chưa có SĐT đã xác minh: việc xác minh là của
     * `AccountPhoneGate` ở vỏ site, và server vẫn là chốt (`PHONE_NOT_VERIFIED`). Màn này chỉ
     * không được NÓI là đã xác thực.
     */
    it('SĐT tài khoản CHƯA xác minh → dòng Người thuê KHÔNG gắn nhãn "Đã xác thực"', async () => {
      me.data = { ...verifiedMe, phoneVerified: false };
      renderModal();
      await advanceToReview();

      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByText('Trần Minh Tuấn')).toBeTruthy();
      expect(within(renter).queryByText('Đã xác thực')).toBeNull();
    });
  });

  /**
   * CHƯA ĐĂNG NHẬP — ADR 0060. Không có khách vãng lai, không có OTP trong hộp này: khách vẫn chọn
   * chuyến và kiểm khung giờ được (công khai), nhưng "Tiếp tục" chỉ GIỮ bản nháp và mở hộp đăng
   * nhập/đăng ký. Có phiên rồi thì luồng TỰ đi tiếp — kiểm lại khung giờ, bằng lái, Xác nhận — và
   * KHÔNG BAO GIỜ tự gửi: nút "Gửi yêu cầu" vẫn do khách bấm.
   */
  describe('chưa đăng nhập — mời đăng nhập, giữ dữ liệu (ADR 0060)', () => {
    beforeEach(() => {
      me.data = undefined;
    });

    /** "Tiếp tục" khi chưa đăng nhập, chờ tới lúc hộp đăng nhập được mở. */
    async function continueAsGuest() {
      api.checkAvailability.mockResolvedValue({ available: true });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      await waitFor(() => expect(authModal.open).toHaveBeenCalledTimes(1));
    }

    it('bước Chuyến đi KHÔNG có ô liên hệ nào — danh tính đến từ tài khoản', () => {
      renderModal();

      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.queryByLabelText('Họ và tên')).toBeNull();
      expect(screen.queryByLabelText('Số điện thoại')).toBeNull();
      expect(screen.queryByLabelText(/Email/)).toBeNull();
    });

    it('"Tiếp tục": kiểm khung giờ, GIỮ bản nháp rồi mở hộp đăng nhập — KHÔNG gửi gì', async () => {
      renderModal();
      await continueAsGuest();

      expect(authModal.open).toHaveBeenCalledWith({
        mode: AUTH_MODE.LOGIN,
        context: AUTH_CONTEXT.BOOKING,
      });
      // Khung giờ kiểm TRƯỚC: xe bận thì mời đăng nhập chỉ để báo bận là bắt khách làm việc thừa.
      expect(api.checkAvailability).toHaveBeenCalledTimes(1);
      expect(api.checkAvailability.mock.invocationCallOrder[0]!).toBeLessThan(
        authModal.open.mock.invocationCallOrder[0]!,
      );
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      // Chưa có tài khoản thì chưa có bằng lái nào để soát.
      expect(api.fetchDriverLicenceOverview).not.toHaveBeenCalled();
      // Ở nguyên bước Chuyến đi, nằm sau hộp đăng nhập.
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();

      // Bản nháp giữ ĐÚNG thứ khách vừa chọn — Google/Facebook rời trang, nó là thứ dựng lại hộp.
      expect(hasBookingDraft('V1')).toBe(true);
      const draft = readBookingDraft('V1');
      expect(draft?.values.pickupAt ? appWallClockToIso(draft.values.pickupAt) : null).toBe(
        '2026-09-01T02:00:00.000Z',
      );
      expect(draft?.values.returnAt ? appWallClockToIso(draft.values.returnAt) : null).toBe(
        '2026-09-03T02:00:00.000Z',
      );
      expect(draft?.values.serviceType).toBe(SERVICE_TYPE.SELF_DRIVE);
    });

    it('khung giờ đã bận → báo lỗi, KHÔNG mời đăng nhập, không giữ bản nháp', async () => {
      renderModal();
      api.checkAvailability.mockResolvedValue({ available: false });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
      expect(hasBookingDraft('V1')).toBe(false);
    });

    it('đăng nhập xong → TỰ đi tiếp tới Xác nhận, kiểm lại khung giờ, KHÔNG tự gửi', async () => {
      const { rerenderTree } = renderModal();
      await continueAsGuest();

      // Hộp đăng nhập đóng với một phiên mới — `/auth/me` giờ trả tài khoản.
      me.data = LOGGED_IN_ME;
      rerenderTree();

      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      // Hỏi LẠI khung giờ: trong lúc khách đăng nhập, người khác có thể đã giữ nó.
      expect(api.checkAvailability).toHaveBeenCalledTimes(2);
      expect(api.fetchDriverLicenceOverview).toHaveBeenCalled();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(authModal.open).toHaveBeenCalledTimes(1);
      // Luồng đã đi tiếp — bản nháp không được mở lại hộp ở lần ghé trang sau.
      expect(hasBookingDraft('V1')).toBe(false);
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByText('Nguyễn Văn A')).toBeTruthy();
    });

    /**
     * Vào bằng Google/Facebook ⇒ có phiên nhưng chưa có SĐT đã xác minh. `AccountPhoneGate` của vỏ
     * site đang hỏi số; đi tiếp lúc này chỉ để server từ chối ở nút cuối cùng.
     */
    it('đăng nhập mà SĐT CHƯA xác minh → ĐỢI ở bước Chuyến đi, xác minh xong mới đi tiếp', async () => {
      const { rerenderTree } = renderModal();
      await continueAsGuest();

      me.data = { ...LOGGED_IN_ME, phone: null, phoneVerified: false };
      rerenderTree();
      // Đủ lâu để một lượt đi tiếp (nếu có) kịp hỏi lịch và soát bằng lái.
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(api.checkAvailability).toHaveBeenCalledTimes(1);
      expect(hasBookingDraft('V1')).toBe(true);

      me.data = LOGGED_IN_ME;
      rerenderTree();

      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
    });

    it('còn bản nháp của xe này → dựng lại ĐÚNG thứ đã nhập, thắng mốc từ URL', async () => {
      saveBookingDraft('V1', { values: draftValues(), rentalMode: 'daily', promoCode: null });
      renderModal();

      // Khoảng 3 ngày của bản nháp — không phải 2 ngày của link đang mở hộp.
      expect(screen.getByText('3 ngày')).toBeTruthy();
      expect(screen.queryByText('2 ngày')).toBeNull();
      // Chưa đăng nhập: hộp đăng nhập KHÔNG tự bật — chỉ mở khi khách bấm "Tiếp tục".
      expect(authModal.open).not.toHaveBeenCalled();

      await continueAsGuest();
      expect(api.checkAvailability.mock.calls[0]![0]).toMatchObject({
        pickupAt: DRAFT_PICKUP_ISO,
        returnAt: DRAFT_RETURN_ISO,
      });
    });

    /**
     * Đăng nhập Google/Facebook RỜI TRANG; quay về thì `RequestBookingButton` mở lại hộp từ bản
     * nháp, lúc đó đã có phiên. Luồng đi tiếp NGAY với dữ liệu của bản nháp — vẫn không tự gửi.
     */
    it('quay về sau Google/Facebook (đã có phiên) → tự đi tiếp với dữ liệu của bản nháp', async () => {
      me.data = LOGGED_IN_ME;
      api.checkAvailability.mockResolvedValue({ available: true });
      saveBookingDraft('V1', { values: draftValues(), rentalMode: 'daily', promoCode: null });
      renderModal();

      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(api.checkAvailability).toHaveBeenCalledTimes(1);
      expect(api.checkAvailability.mock.calls[0]![0]).toMatchObject({
        pickupAt: DRAFT_PICKUP_ISO,
        returnAt: DRAFT_RETURN_ISO,
      });
      expect(authModal.open).not.toHaveBeenCalled();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(hasBookingDraft('V1')).toBe(false);
    });

    /**
     * Phiên hết hạn GIỮA CHỪNG — đúng lúc bấm gửi. Mời đăng nhập lại ngay tại đây, giữ nguyên thứ
     * đã nhập; đăng nhập xong thì về lại Xác nhận để khách TỰ bấm gửi lại.
     *
     * Lỗi gửi đồng thời xoá tài khoản khỏi `me.data`: đó là trạng thái `/auth/me` phải có khi phiên
     * đã chết. Flow chỉ biết lượt đăng nhập kế tiếp là MỚI khi `/auth/me` không còn tài khoản; còn
     * giữ bản cũ thì nó tưởng khách vừa đăng nhập lại và tự đi tiếp ngay.
     */
    it('gửi bị 401 (phiên vừa mất) → về Chuyến đi, giữ bản nháp, mời đăng nhập lại — không gửi lần hai', async () => {
      me.data = LOGGED_IN_ME;
      const { rerenderTree } = renderModal();
      await advanceToReview();

      api.submitBookingRequest.mockImplementation(async () => {
        me.data = undefined;
        throw new ApiClientError({
          code: API_ERROR_CODE.UNAUTHENTICATED,
          message: 'x',
          status: 401,
        });
      });
      submitFromReview();

      await waitFor(() =>
        expect(authModal.open).toHaveBeenCalledWith({
          mode: AUTH_MODE.LOGIN,
          context: AUTH_CONTEXT.BOOKING,
        }),
      );
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(hasBookingDraft('V1')).toBe(true);

      // Đăng nhập lại → về Xác nhận; lượt gửi thứ hai là của khách, không phải của flow.
      me.data = LOGGED_IN_ME;
      rerenderTree();
      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(api.submitBookingRequest).toHaveBeenCalledTimes(1);
    });

    /**
     * Phiên chết mà cache `/auth/me` vẫn còn người dùng CŨ (hạn cache chưa tới). Bản cũ đó KHÔNG
     * được tính là "vừa đăng nhập": nếu tính, flow đi tiếp ngay sau lưng hộp đăng nhập, ăn 401 lần
     * nữa, mời lần nữa… — vòng lặp đã đo được trước khi sửa (59 lần mở hộp trong 400ms).
     */
    it('401 mà cache còn người dùng cũ → KHÔNG tự đi tiếp, chỉ mời đăng nhập MỘT lần', async () => {
      me.data = LOGGED_IN_ME;
      me.updatedAt = 1;
      const { rerenderTree } = renderModal();
      await advanceToReview();

      api.submitBookingRequest.mockRejectedValue(
        new ApiClientError({ code: API_ERROR_CODE.UNAUTHENTICATED, message: 'x', status: 401 }),
      );
      submitFromReview();

      await waitFor(() => expect(authModal.open).toHaveBeenCalledTimes(1));
      // Vài lượt render nữa vẫn không đi tiếp — không kiểm lại khung giờ, không mời thêm.
      rerenderTree();
      rerenderTree();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(authModal.open).toHaveBeenCalledTimes(1);
      expect(hasBookingDraft('V1')).toBe(true);

      // Đăng nhập lại thật (`/auth/me` nạp mới) → về Xác nhận, không tự gửi.
      me.updatedAt = undefined;
      rerenderTree();
      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(api.submitBookingRequest).toHaveBeenCalledTimes(1);
    });

    /**
     * Cùng cái bẫy ở lối QUAY LẠI TRANG: 401 lúc gửi → bản nháp được ghi → khách lùi/tới trong app
     * và hộp dựng lại từ bản nháp, trong khi cache vẫn còn người dùng của phiên đã chết. Mốc so là
     * lúc GHI bản nháp, không phải 0 — nếu không, flow đi tiếp sau lưng hộp đăng nhập.
     */
    it('dựng lại từ bản nháp mà cache còn người dùng CŨ → KHÔNG tự đi tiếp, đợi phiên thật', async () => {
      me.data = LOGGED_IN_ME;
      me.updatedAt = 1;
      api.checkAvailability.mockResolvedValue({ available: true });
      saveBookingDraft('V1', { values: draftValues(), rentalMode: 'daily', promoCode: null });
      const { rerenderTree } = renderModal();

      rerenderTree();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(api.checkAvailability).not.toHaveBeenCalled();
      expect(hasBookingDraft('V1')).toBe(true);

      // `/auth/me` nạp mới (đăng nhập thật) → đi tiếp với dữ liệu của bản nháp, vẫn không tự gửi.
      me.updatedAt = undefined;
      rerenderTree();
      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
    });

    /**
     * Mã khuyến mãi phụ thuộc NGƯỜI (khách mới, lượt mỗi khách — ADR 0046 điều 5). Số giảm thấy lúc
     * chưa đăng nhập không phải lời hứa cho tài khoản vừa vào: đánh giá lại ĐÚNG MỘT lần, sau khi
     * đã có phiên — không đánh giá ẩn danh trước rồi bỏ đó.
     */
    it('mã khuyến mãi của bản nháp được đánh giá cho người VỪA đăng nhập, một lần', async () => {
      me.data = undefined;
      api.checkAvailability.mockResolvedValue({ available: true });
      saveBookingDraft('V1', { values: draftValues(), rentalMode: 'daily', promoCode: 'GIAM50' });
      const { rerenderTree } = renderModal();

      // Chưa đăng nhập: chưa đánh giá (kết quả ẩn danh có thể khác kết quả của tài khoản).
      await act(async () => {});
      expect(promoApi.previewPromoCode).not.toHaveBeenCalled();

      me.data = LOGGED_IN_ME;
      rerenderTree();
      await waitFor(() => expect(promoApi.previewPromoCode).toHaveBeenCalledTimes(1));
      expect(promoApi.previewPromoCode.mock.calls[0]![0]).toBe('GIAM50');
      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(promoApi.previewPromoCode).toHaveBeenCalledTimes(1);
    });

    it('quay về sau Google/Facebook với mã trong bản nháp → đánh giá mã đúng MỘT lần', async () => {
      me.data = LOGGED_IN_ME;
      api.checkAvailability.mockResolvedValue({ available: true });
      saveBookingDraft('V1', { values: draftValues(), rentalMode: 'daily', promoCode: 'GIAM50' });
      renderModal();

      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(promoApi.previewPromoCode).toHaveBeenCalledTimes(1);
      expect(promoApi.previewPromoCode.mock.calls[0]![0]).toBe('GIAM50');
    });

    /**
     * Server nói SĐT chưa xác minh trong khi `/auth/me` còn giữ bản cũ. Làm mới nó để
     * `AccountPhoneGate` hiện bước xác minh; chữ hiện cho khách đi theo MÃ lỗi (ADR 0012), không
     * phải `message` của backend.
     */
    it('server trả PHONE_NOT_VERIFIED → câu theo mã lỗi, làm mới /auth/me, ở lại Xác nhận', async () => {
      me.data = LOGGED_IN_ME;
      const { queryClient } = renderModal();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      await advanceToReview();

      api.submitBookingRequest.mockRejectedValue(
        new ApiClientError({
          code: API_ERROR_CODE.PHONE_NOT_VERIFIED,
          message: 'Vui lòng xác thực số điện thoại',
          status: 403,
        }),
      );
      submitFromReview();

      expect(
        await screen.findByText('Cần xác minh số điện thoại trước khi tiếp tục.'),
      ).toBeTruthy();
      expect(screen.queryByText('Vui lòng xác thực số điện thoại')).toBeNull();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.all });
      expect(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
    });
  });

  /**
   * BẰNG LÁI (ADR 0057) — thuê tự lái phải có bằng đã xác thực, hợp lệ cho CHÍNH chuyến này.
   * Bằng gắn với TÀI KHOẢN, nên chỉ soát khi đã có phiên — tức là ngay khi rời bước Chuyến đi.
   */
  describe('bằng lái', () => {
    it('thuê tự lái, bằng đã hợp lệ → soát với server rồi đi thẳng Xác nhận, không dừng ở bước bằng lái', async () => {
      renderModal();
      await advanceToReview();

      expect(api.fetchDriverLicenceOverview).toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Xác thực bằng lái' })).toBeNull();
    });

    it('chưa có bằng lái → dừng ở bước Xác thực bằng lái, KHÔNG đi tới bước gửi', async () => {
      api.fetchDriverLicenceOverview.mockResolvedValue(NO_LICENCE);
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      await screen.findByRole('heading', { name: 'Xác thực bằng lái' });
      expect(await screen.findByText('Kéo thả hoặc bấm để chọn ảnh')).toBeTruthy();
      const next = screen.getByRole('button', { name: 'Tiếp tục' });
      expect((next as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      // Bằng lái nằm GIỮA hai bước: thanh tiến trình vẫn sáng ô Chuyến đi.
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      expect(within(steps).getAllByRole('listitem')[0]?.getAttribute('aria-current')).toBe('step');
    });

    it('máy đọc xong ngay tại bước và bằng hợp lệ → TỰ sang bước Xác nhận, kèm lời báo', async () => {
      api.fetchDriverLicenceOverview.mockResolvedValue({
        verified: null,
        latest: { ...VERIFIED_LICENCE, id: 'L2', status: 'processing' },
      });
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      // Tiến trình hiện ngay trong bước bằng lái…
      expect(await screen.findByText('Đang xác thực bằng lái')).toBeTruthy();
      // …máy đọc xong (lượt hỏi lại kế tiếp) → không cần bấm "Tiếp tục".
      api.fetchDriverLicenceOverview.mockResolvedValue({
        verified: VERIFIED_LICENCE,
        latest: VERIFIED_LICENCE,
      });
      expect(
        await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' }, { timeout: 6000 }),
      ).toBeTruthy();
      // Lời báo của AntD hiện qua portal, bất đồng bộ.
      expect(await screen.findByText('Bằng lái hợp lệ cho chuyến này')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Xác thực bằng lái' })).toBeNull();
    });

    it('bằng ô tô mà đặt xe máy → bước bằng lái nói rõ hạng không phù hợp', async () => {
      listing.data = { ...LISTING, vehicleType: 'motorbike' };
      renderModal();
      await screen.findByText('Toyota Vios 2022');
      api.checkAvailability.mockResolvedValue({ available: true });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(await screen.findByText(/không lái được xe máy/)).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Tiếp tục' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('server từ chối vì bằng lái lúc gửi → lùi về bước bằng lái, giữ nguyên dữ liệu', async () => {
      renderModal();
      await advanceToReview();

      api.fetchDriverLicenceOverview.mockResolvedValue(NO_LICENCE);
      api.submitBookingRequest.mockRejectedValue(
        new ApiClientError({
          code: API_ERROR_CODE.DRIVER_LICENCE_REQUIRED,
          message: 'Bạn cần xác thực bằng lái',
          status: 403,
        }),
      );
      submitFromReview();

      await screen.findByRole('heading', { name: 'Xác thực bằng lái' });
      expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull();
    });
  });

  describe('yêu cầu trùng lặp', () => {
    it('mã BOOKING_REQUEST_DUPLICATE → màn riêng có lối đi tiếp, không phải alert lỗi', async () => {
      api.submitBookingRequest.mockRejectedValue(
        new ApiClientError({
          code: API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE,
          message: 'trùng',
          status: 409,
        }),
      );
      renderModal();
      await advanceToReview();
      submitFromReview();

      expect(await screen.findByText('Yêu cầu trùng lặp')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Xem chuyến của tôi' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    });
  });

  /**
   * ĐÃ GIỮ ĐỦ SỐ CHUYẾN CHƯA THANH TOÁN (13/10/2026) — server từ chối mọi yêu cầu mới bằng
   * `HOLD_LIMIT_REACHED`. Việc cần làm thuộc về KHÁCH (trả hoặc huỷ bớt), nên hộp thoại phải nói
   * điều đó NGAY khi mở — trước khi khách mất công điền form — và đưa họ tới đúng việc đó.
   */
  describe('đã giữ đủ chuyến chưa thanh toán', () => {
    const HOLD = (n: number) => ({
      tripId: `T${n}`,
      code: `XPH0000000${n}`,
      vehicleName: `Xe số ${n}`,
      vehicleImageUrl: null,
      pickupAt: '2026-10-23T10:00:00.000Z',
      returnAt: '2026-10-24T03:00:00.000Z',
      remainingAmount: '176000',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });

    it('mở hộp thoại khi đã chạm trần ⇒ màn nhắc thanh toán, không có form', () => {
      unpaid.data = { limit: 3, limitReached: true, items: [HOLD(1), HOLD(2), HOLD(3)] };
      const { onClose } = renderModal();

      expect(screen.getByText('Bạn đã giữ tối đa 3 chuyến chưa thanh toán')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull();
      const payLinks = screen.getAllByRole('link', { name: /Thanh toán chuyến/ });
      expect(payLinks.map((link) => link.getAttribute('href'))).toEqual([
        '/payment/T1',
        '/payment/T2',
        '/payment/T3',
      ]);

      // Bấm trả ⇒ hộp thoại đóng trước khi rời sang trang thanh toán.
      fireEvent.click(payLinks[0]!);
      expect(onClose).toHaveBeenCalled();
    });

    it('chưa chạm trần ⇒ đặt xe như thường', () => {
      unpaid.data = { limit: 3, limitReached: false, items: [HOLD(1)] };
      renderModal();

      expect(screen.queryByText(/chuyến chưa thanh toán/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Huỷ' })).toBeTruthy();
    });

    /** Lời nhắc chưa về (đọc chậm / lỗi) ⇒ màn chặn tin câu trả lời của server. */
    it('server từ chối lúc gửi (lời nhắc chưa về) ⇒ cùng màn nhắc, có lối sang Chuyến của tôi', async () => {
      api.submitBookingRequest.mockRejectedValue(
        new ApiClientError({
          code: API_ERROR_CODE.HOLD_LIMIT_REACHED,
          message: 'trần',
          status: 409,
        }),
      );
      renderModal();
      await advanceToReview();
      submitFromReview();

      expect(await screen.findByText('Bạn đang có quá nhiều chuyến chờ thanh toán')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Xem chuyến của tôi' }));
      expect(nav.push).toHaveBeenCalledWith('/trips');
    });
  });

  /**
   * Mở từ THẺ ĐẶT XE đã đủ chuyến (Figma: Details → Confirm). Khách vừa chọn xong lịch, cách nhận
   * xe và mã ở trang chi tiết — hộp tự chạy lượt "Tiếp tục" thay vì bắt chọn lại, và kết quả rơi về
   * đúng chỗ lượt bấm tay sẽ rơi. KHÔNG BAO GIỜ tự gửi (ADR 0060).
   */
  describe('mở từ thẻ đặt xe (prefill + tự đi tiếp)', () => {
    it('đã đăng nhập, xe rảnh, bằng hợp lệ ⇒ tới THẲNG màn Xem lại — không gửi gì', async () => {
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModalWithPrefill({ autoContinue: true });

      // Trong lúc kiểm: trạng thái chờ, không có biểu mẫu nào hiện ra rồi bị rút đi.
      expect(screen.getByText('Đang kiểm tra lịch xe…')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();

      expect(await screen.findByRole('heading', { name: 'Xem lại yêu cầu thuê xe' })).toBeTruthy();
      expect(screen.getByText('Bước 2 / 4 · Gửi yêu cầu')).toBeTruthy();
      expect(api.checkAvailability).toHaveBeenCalledTimes(1);
      expect(api.fetchDriverLicenceOverview).toHaveBeenCalled();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(authModal.open).not.toHaveBeenCalled();
    });

    it('khung giờ đã bận ⇒ dừng ở bước Chuyến đi kèm lời báo, không mời đăng nhập', async () => {
      api.checkAvailability.mockResolvedValue({ available: false });
      renderModalWithPrefill({ autoContinue: true });

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(authModal.open).not.toHaveBeenCalled();
    });

    it('CHƯA đăng nhập ⇒ kiểm khung giờ, giữ bản nháp, mời đăng nhập — đăng nhập xong tới Xem lại', async () => {
      me.data = undefined;
      api.checkAvailability.mockResolvedValue({ available: true });
      const { rerenderTree } = renderModalWithPrefill({ autoContinue: true });

      await waitFor(() =>
        expect(authModal.open).toHaveBeenCalledWith({
          mode: AUTH_MODE.LOGIN,
          context: AUTH_CONTEXT.BOOKING,
        }),
      );
      expect(hasBookingDraft('V1')).toBe(true);
      expect(api.submitBookingRequest).not.toHaveBeenCalled();

      me.data = LOGGED_IN_ME;
      rerenderTree();
      expect(await screen.findByRole('heading', { name: 'Xem lại yêu cầu thuê xe' })).toBeTruthy();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(authModal.open).toHaveBeenCalledTimes(1);
    });

    it('thẻ chọn giao tận nơi ⇒ Xem lại nói giao tận nơi và payload mang ĐÚNG địa chỉ đã xác nhận', async () => {
      listing.data = LISTING;
      api.checkAvailability.mockResolvedValue({ available: true });
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      renderModalWithPrefill({
        autoContinue: true,
        pickupMethod: PICKUP_METHOD.DELIVERY,
        delivery: {
          addressLine: '12 Bạch Đằng, Hải Châu, Đà Nẵng',
          provinceCode: '48',
          placeId: 'vm-123',
          latitude: 16.07,
          longitude: 108.22,
        },
      });

      const trip = await screen.findByRole('region', { name: 'Thông tin chuyến đi' });
      expect(within(trip).getByText('Giao xe tận nơi')).toBeTruthy();

      submitFromReview();
      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      expect(api.submitBookingRequest.mock.calls[0]![0]).toMatchObject({
        deliveryRequested: true,
        deliveryProvinceCode: '48',
        deliveryAddressLine: '12 Bạch Đằng, Hải Châu, Đà Nẵng',
        deliveryPlaceId: 'vm-123',
        deliveryLatitude: 16.07,
        deliveryLongitude: 108.22,
      });
    });

    it('mã khuyến mãi của thẻ được server đánh giá lại cho chuyến này, đúng MỘT lần', async () => {
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModalWithPrefill({ autoContinue: true, promoCode: 'GIAM50' });

      await screen.findByRole('heading', { name: 'Xem lại yêu cầu thuê xe' });
      await waitFor(() => expect(promoApi.previewPromoCode).toHaveBeenCalledTimes(1));
      expect(promoApi.previewPromoCode.mock.calls[0]![0]).toBe('GIAM50');
    });

    /**
     * CHƯA đăng nhập + mã của thẻ: mã không được đánh giá ẩn danh rồi rơi mất khi giữ bản nháp —
     * bản nháp mang mã, và mã được đánh giá cho người VỪA đăng nhập, đúng một lần (ADR 0046).
     */
    it('chưa đăng nhập + mã của thẻ ⇒ bản nháp GIỮ mã, đăng nhập xong mới đánh giá — một lần', async () => {
      me.data = undefined;
      api.checkAvailability.mockResolvedValue({ available: true });
      const { rerenderTree } = renderModalWithPrefill({ autoContinue: true, promoCode: 'GIAM50' });

      await waitFor(() => expect(authModal.open).toHaveBeenCalledTimes(1));
      expect(readBookingDraft('V1')?.promoCode).toBe('GIAM50');
      expect(promoApi.previewPromoCode).not.toHaveBeenCalled();

      me.data = LOGGED_IN_ME;
      rerenderTree();
      await screen.findByRole('heading', { name: 'Xem lại yêu cầu thuê xe' });
      await waitFor(() => expect(promoApi.previewPromoCode).toHaveBeenCalledTimes(1));
      expect(promoApi.previewPromoCode.mock.calls[0]![0]).toBe('GIAM50');
    });

    /** Đóng hộp trong lúc vòng chờ còn quay: lượt kiểm không được đi tiếp trên một trang đã bỏ. */
    it('đóng hộp khi đang kiểm ⇒ KHÔNG mời đăng nhập, KHÔNG giữ bản nháp', async () => {
      me.data = undefined;
      let release: (value: { available: boolean }) => void = () => {};
      api.checkAvailability.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const { unmount } = renderModalWithPrefill({ autoContinue: true });
      await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(1));

      unmount();
      await act(async () => release({ available: true }));

      expect(authModal.open).not.toHaveBeenCalled();
      expect(hasBookingDraft('V1')).toBe(false);
    });

    /** Thẻ chọn giao tận nơi mà chưa có địa chỉ: GIỮ lựa chọn và hỏi địa chỉ, không đổi thành tự nhận. */
    it('giao tận nơi chưa có địa chỉ ⇒ dừng ở bước Chuyến đi, hỏi địa chỉ giao xe', async () => {
      // Khách CHƯA từng giao xe: không có địa chỉ lần trước để điền hộ (ca bên trên gửi thành công
      // một chuyến giao tận nơi và luồng đã nhớ địa chỉ đó).
      window.localStorage.clear();
      listing.data = LISTING;
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModalWithPrefill({ autoContinue: true, pickupMethod: PICKUP_METHOD.DELIVERY });

      expect(await screen.findByText('Nhập địa chỉ giao xe')).toBeTruthy();
      expect(
        screen.getByRole('radio', { name: /Giao xe tận nơi/ }).getAttribute('aria-checked'),
      ).toBe('true');
      expect(screen.queryByRole('heading', { name: 'Xem lại yêu cầu thuê xe' })).toBeNull();
    });

    it('không có cờ tự đi tiếp ⇒ mở ở bước Chuyến đi như cũ', async () => {
      renderModalWithPrefill({ pickupMethod: PICKUP_METHOD.SELF });
      expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeTruthy();
      await act(async () => {});
      expect(api.checkAvailability).not.toHaveBeenCalled();
    });
  });

  describe('đóng & reset', () => {
    it('nút Huỷ ở bước Chuyến đi gọi onClose', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    /**
     * Trong lúc gửi yêu cầu, Esc và bấm nền bị khoá — đóng giữa chừng làm khách mất dấu yêu cầu
     * đã gửi hay chưa.
     */
    it('đang gửi yêu cầu thì Esc KHÔNG đóng được', async () => {
      const { onClose } = renderModal();
      await advanceToReview();

      // Giữ request treo để trạng thái "đang gửi" tồn tại trong lúc bấm Esc.
      api.submitBookingRequest.mockReturnValue(new Promise(() => {}));
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalled());
      /*
       * "Đang gửi" leo lên vỏ (RequestBookingModal) qua `onBusyChange`, rồi vỏ mới khoá
       * `keyboard` của Modal — hai vòng render/effect NỐI TIẾP nhau ngoài lần render đã đợi ở
       * `waitFor` trên. Không xả hết ở đây thì Esc bấm ngay sau đó rơi vào khung hình mà khoá
       * Esc chưa kịp tới Modal, làm test không ổn định giữa các máy.
       */
      await act(async () => {});
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('vỏ chỉ dựng flow khi mở (cơ chế reset)', () => {
      renderModal(false);
      expect(screen.queryByText(/Chọn thời gian thuê để kiểm tra/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
    });
  });

  /**
   * Bố cục: cặp nút + tiền ở MỘT khối đáy cột phải, ô thời gian trông như ô nhập, và tiền chỉ
   * xuất hiện đúng MỘT lần trên mỗi bước.
   */
  describe('bố cục & khối giá', () => {
    it('cặp nút nằm ở MỘT footer, không rải trong thân từng bước', async () => {
      renderModal();
      const footer = document.querySelector('footer');
      expect(footer).not.toBeNull();
      expect(within(footer as HTMLElement).getByRole('button', { name: 'Huỷ' })).toBeTruthy();
      expect(within(footer as HTMLElement).getByRole('button', { name: 'Tiếp tục' })).toBeTruthy();

      // Màn Xem lại KHÔNG dùng footer: nút gửi nằm trong thẻ đồng ý điều khoản, lối quay lại là
      // "Chỉnh sửa" của thẻ chuyến — không có hàng nút thứ hai nào.
      await advanceToReview();
      expect(document.querySelectorAll('footer')).toHaveLength(0);
      expect(screen.getAllByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toHaveLength(1);
    });

    it('ô thời gian có nhãn NGAY CẠNH giá trị của từng đầu', () => {
      renderModal();
      expect(screen.getByText('Nhận xe:')).toBeTruthy();
      expect(screen.getByText('Trả xe:')).toBeTruthy();
    });

    /**
     * Định dạng mốc thuê: có THỨ, KHÔNG có năm. Năm chỉ là nhiễu với đơn thuê vài tuần tới, còn
     * thứ mấy lại là thứ người dùng xếp lịch theo — trước đây hiện `14/08/2026`, đúng ngược lại.
     */
    it('mốc thời gian hiện thứ + ngày/tháng + giờ, KHÔNG có năm', () => {
      renderModal();
      /*
       * Khẳng định HÌNH DẠNG, không phải giá trị cụ thể: giá trị phụ thuộc múi giờ của máy chạy
       * test, và ghim "T3, 01/09" sẽ đỏ trên CI chạy UTC trong khi component vẫn đúng.
       */
      const point = /^(CN|T[2-7]), \d{2}\/\d{2} · \d{2}:\d{2}$/;
      expect(screen.getAllByText(point)).toHaveLength(2);
    });

    it('thời lượng hiện ở viên bên phải ô', () => {
      renderModal();
      expect(screen.getByText('2 ngày')).toBeTruthy();
    });

    /*
     * Mở thẳng một chiếc xe (không đi qua bộ lọc có ngày) KHÔNG còn cho ra ô thời gian rỗng: flow
     * điền sẵn khoảng gợi ý từ `rememberedOrDefaultRentalRange`, nên khách thấy ngay một mức giá
     * để so thay vì một ô trống chưa biết bấm vào đâu.
     *
     * Khẳng định HÌNH DẠNG, không phải giá trị: khoảng gợi ý tính từ "bây giờ" nên nó đổi theo
     * ngày chạy test và theo múi giờ của máy chạy.
     */
    it('không có ngày từ bộ lọc → vẫn mở ra với khoảng thuê gợi ý sẵn', () => {
      renderModalWithoutPrefill();
      const point = new RegExp('^(CN|T[2-7]), [0-9]{2}/[0-9]{2} · [0-9]{2}:[0-9]{2}$');
      expect(screen.getAllByText(point)).toHaveLength(2);
      expect(screen.getByText(/Thuê theo ngày · bấm vào ô để đổi/)).toBeTruthy();
      expect(screen.queryByText('Bấm vào ô trên để mở lịch và chọn khoảng thuê.')).toBeNull();
    });

    it('đã có khoảng thuê → dòng gợi ý nói chế độ tính và cách đổi', () => {
      renderModal();
      expect(screen.getByText(/Thuê theo ngày · bấm vào ô để đổi/)).toBeTruthy();
    });

    /**
     * Điều quan trọng nhất của đợt này: bảng giá từng lặp y hệt ở cả ba bước. Bước nhập chỉ được
     * có MỘT dòng tổng; bảng đầy đủ chỉ hiện khi khách chủ động mở.
     */
    it('bước Chuyến đi chỉ có MỘT dòng tổng, bảng chi tiết nằm sau nút Chi tiết', async () => {
      quote.data = {
        breakdown: {
          rows: [{ key: 'base', label: 'Tiền thuê xe', amount: '1170000', sublabel: '2 ngày' }],
          totalAmount: '1170000',
          depositAmount: '5000000',
        },
        delivery: { enabled: true, maxRadiusKm: 10 },
      };
      renderModal();

      expect(await screen.findByText('1.170.000 ₫')).toBeTruthy();
      expect(screen.queryByText('Chi tiết giá thuê (dự kiến)')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Chi tiết/ }));
      expect(await screen.findByText('Chi tiết giá thuê (dự kiến)')).toBeTruthy();
      // Vẫn chỉ MỘT bảng — mở ra là thay hình thái, không phải thêm khối thứ hai.
      expect(screen.getAllByText('Chi tiết giá thuê (dự kiến)')).toHaveLength(1);
    });

    /**
     * Bảng chi tiết phải nằm TRONG thân bước — cùng mạch cuộn với ô thời gian, hình thức nhận
     * xe và địa chỉ giao. Bản trước mở nó ngay trong khối dính đáy nên nó nở ngược lên che phần
     * nhập liệu và tự cuộn trong một vùng riêng: bánh xe chuột kẹt ở đó, nội dung bước không
     * đi đâu được. Kiểm bằng QUAN HỆ CHA–CON, thứ duy nhất nói lên điều đó.
     */
    it('bảng chi tiết nằm trong thân bước, không nằm trong khối dính đáy cùng hàng nút', async () => {
      quote.data = {
        breakdown: {
          rows: [{ key: 'base', label: 'Tiền thuê xe', amount: '1170000', sublabel: '2 ngày' }],
          totalAmount: '1170000',
          depositAmount: '5000000',
        },
        delivery: { enabled: true, maxRadiusKm: 10 },
      };
      renderModal();
      await screen.findByText('1.170.000 ₫');

      // Khối dính đáy = khối bọc hàng nút. Đang thu gọn thì nó mang dòng tổng.
      const dock = screen.getByRole('button', { name: 'Tiếp tục' }).closest('div')!;
      expect(within(dock).getByText('Tổng dự kiến')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /Chi tiết/ }));
      const panel = await screen.findByLabelText('Chi tiết giá thuê (dự kiến)');
      const stepBody = screen.getByRole('button', { name: /Thời gian thuê:/ }).closest('section');

      expect(stepBody).not.toBeNull();
      expect(stepBody!.contains(panel)).toBe(true);
      // Hàng nút vẫn ở khối dính đáy, tức là NGOÀI thân bước.
      expect(stepBody!.contains(screen.getByRole('button', { name: 'Tiếp tục' }))).toBe(false);
      /*
       * Và dòng tổng dính đáy RÚT ĐI khi bảng mở: bảng đã có hàng "TỔNG DỰ KIẾN" của nó, giữ
       * cả hai là cùng một con số hiện hai lần cách nhau vài chục pixel.
       */
      expect(within(dock).queryByText('Tổng dự kiến')).toBeNull();
      expect(within(panel).getByText('Tổng dự kiến')).toBeTruthy();
    });

    /**
     * Màn Xem lại có HAI thẻ tiền của design v2 (Figma `19727:56092` + `19727:56117`), không phải
     * bảng chi tiết của bước Chuyến đi. Mọi số đến từ báo giá server: tổng là số KHÁCH TRẢ (đã gồm
     * phụ phí, đã trừ mã), thuế do chủ xe chịu không hiện, tiền giữ chỗ + cọc nằm ở thẻ riêng.
     */
    it('thẻ chi phí + thẻ các khoản khác đọc từ báo giá server, không có bảng chi tiết cũ', async () => {
      listing.data = LISTING;
      quote.data = {
        breakdown: {
          rows: [
            {
              key: 'base',
              label: 'Tiền thuê gốc',
              amount: '1300000',
              sublabel: '2 ngày × 650.000 ₫/ngày',
            },
            {
              key: 'discount',
              label: 'Khuyến mãi trực tiếp (10%)',
              amount: '-130000',
              sublabel: null,
            },
            { key: 'subtotal', label: 'Giá sau khuyến mãi', amount: '1170000', sublabel: null },
            { key: 'overtime', label: 'Phí phát sinh ngoài giờ', amount: '0', sublabel: null },
          ],
          totalAmount: '1170000',
          depositAmount: '5000000',
          fees: {
            lines: [
              { key: 'service_fee', bearer: 'customer', percent: 10, amount: '117000' },
              { key: 'tax', bearer: 'owner', percent: 5, amount: '58500' },
            ],
            customerTotalAmount: '1287000',
            holdAmount: '400000',
            payAtPickupAmount: '887000',
          },
        },
        delivery: { enabled: true, maxRadiusKm: 10 },
      };
      renderModal();
      await advanceToReview();

      const costs = screen.getByRole('region', { name: 'Chi phí thuê xe' });
      expect(within(costs).getByText('Tiền thuê gốc')).toBeTruthy();
      expect(within(costs).getByText('−130.000 ₫')).toBeTruthy();
      // Dòng tổng phụ và dòng 0đ không vẽ; thuế do CHỦ XE chịu không hiện cho khách (ADR 0032).
      expect(within(costs).queryByText('Giá sau khuyến mãi')).toBeNull();
      expect(within(costs).queryByText('Phí phát sinh ngoài giờ')).toBeNull();
      expect(within(costs).queryByText('58.500 ₫')).toBeNull();
      // "Tổng bạn trả" = B + S + IV + IP − P — không gọi nó là "tiền thuê" (ADR 0028 điều 3).
      expect(within(costs).getByText('Tổng bạn trả')).toBeTruthy();
      expect(within(costs).getByText('1.287.000 ₫')).toBeTruthy();

      const others = screen.getByRole('region', { name: 'Các khoản khác' });
      expect(within(others).getByText('Tiền giữ chỗ (trả trước)')).toBeTruthy();
      expect(within(others).getByText('400.000 ₫')).toBeTruthy();
      expect(within(others).getByText('Trả chủ xe khi nhận xe')).toBeTruthy();
      expect(within(others).getByText('887.000 ₫')).toBeTruthy();
      expect(within(others).getByText('Cọc thế chấp khi nhận xe')).toBeTruthy();
      expect(within(others).getByText('5.000.000 ₫')).toBeTruthy();

      expect(screen.queryByText('Chi tiết giá thuê (dự kiến)')).toBeNull();
      // Có tiền giữ chỗ ⇒ sau khi gửi là chờ chủ xe nhận rồi trả trong 120 phút.
      expect(screen.getByText(/bạn có 120 phút để thanh toán tiền giữ chỗ/)).toBeTruthy();
    });

    /**
     * Cột trái là mốc "đang đặt xe nào", KHÔNG phải bản sao trang chi tiết xe mà khách vừa rời
     * khỏi — gallery, chip tiện ích và danh sách đánh giá đã bỏ hẳn.
     */
    it('cột trái gọn: có xe + gian hàng, KHÔNG dựng lại gallery/đánh giá', async () => {
      listing.data = LISTING;
      renderModal();

      expect(await screen.findByText('Gian hàng Demo XePrime')).toBeTruthy();
      expect(screen.getByText('Toyota Vios 2022')).toBeTruthy();
      expect(screen.queryByText('Khách nói gì về xe này')).toBeNull();
    });
  });

  describe('mobile', () => {
    it('render dạng Drawer ở ≤640px', () => {
      media.isMobile = true;
      renderModal();
      expect(document.querySelector('.ant-drawer')).not.toBeNull();
      expect(document.querySelector('.ant-modal')).toBeNull();
    });

    it('dialog trên mobile vẫn có tên khả truy cập', () => {
      media.isMobile = true;
      renderModal();
      expect(
        within(screen.getByRole('dialog')).getAllByText('Yêu cầu thuê xe').length,
      ).toBeGreaterThan(0);
    });

    it('mobile hiện thẳng hồ sơ xe — không còn nút gấp/mở', async () => {
      media.isMobile = true;
      listing.data = LISTING;
      renderModal();

      expect(await screen.findByText('Gian hàng Demo XePrime')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Xem thông tin xe/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Ẩn thông tin xe/ })).toBeNull();
    });
  });
});
