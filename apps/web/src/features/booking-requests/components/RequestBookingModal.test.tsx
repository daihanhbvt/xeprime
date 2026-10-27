import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_ERROR_CODE,
  BOOKING_REQUEST_RESPOND_WINDOW,
  BOOKING_REQUEST_STATUS,
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
/** Hộp xác minh SĐT của vỏ site khách (`AccountPhoneReminderProvider`, ADR 0071) — cũng ở vỏ. */
const phonePrompt = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/features/auth/components/AccountPhoneGate', () => ({
  useAccountPhonePrompt: () => phonePrompt.open,
  useSuppressAccountPhoneReminder: () => undefined,
}));

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
 * Nút "Nhắn tin cho chủ xe" thật cần `AuthModalProvider` (nó tự mở modal đăng nhập khi khách chưa
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
 * "Khách nhắn được chủ xe cá nhân chưa" (ADR 0073) — câu trả lời của server. Mặc định CHƯA (chưa có
 * đơn); gian hàng tuyến gói bỏ qua câu hỏi này (`shopChatOpen`).
 */
const chatEligibility = vi.hoisted(() => ({ canChat: false }));
vi.mock('@/features/chat/hooks/use-chat-eligibility', () => ({
  useChatEligibility: () => ({ data: { canChat: chatEligibility.canChat } }),
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
    vehicleProtectionSelected: false,
    personalAccidentSelected: false,
    note: '',
    customerName: LOGGED_IN_ME.displayName,
    customerPhone: LOGGED_IN_ME.phone,
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
 * của thẻ (`prefill`) — cách nhận xe, địa chỉ giao, mã khuyến mãi.
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

/**
 * Hộp KHÔNG còn bước "Chuyến đi" (27/10/2026): mở ra là tự kiểm khung giờ (mặc định rảnh), soát
 * bằng lái (mặc định hợp lệ) rồi vào thẳng màn Xem lại. Helper chỉ còn chờ màn đó xuất hiện.
 */
async function advanceToReview() {
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
  chatEligibility.canChat = false;
  quote.data = null;
  Object.values(api).forEach((fn) => fn.mockReset());
  authModal.open.mockReset();
  phonePrompt.open.mockReset();
  // Bản nháp chờ đăng nhập sống ở `sessionStorage` — không được rò từ test này sang test khác.
  window.sessionStorage.clear();
  api.fetchDriverLicenceOverview.mockResolvedValue({
    verified: VERIFIED_LICENCE,
    latest: VERIFIED_LICENCE,
  });
  // Xe rảnh trơn là mặc định — test nào cần lịch bận thì tự đặt lại TRƯỚC khi mở hộp.
  api.fetchVehicleBusyDays.mockResolvedValue({ days: [], from: TODAY_KEY, to: TODAY_KEY });
  api.checkAvailability.mockResolvedValue({ available: true });
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
     * chủ xe nhận và trả tiền giữ chỗ. Chặng "Chọn chuyến" đã ra trang chi tiết (27/10/2026), nên
     * hộp đứng ở chặng 1 "Gửi yêu cầu". Bằng lái và màn kết quả không bao giờ là một chặng riêng.
     */
    it('tiến trình kể cả hành trình — mở ra ở chặng 1/3 "Gửi yêu cầu", không có chặng "Chọn chuyến"', async () => {
      renderModal();
      await advanceToReview();
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      const items = within(steps).getAllByRole('listitem');
      expect(items).toHaveLength(3);
      expect(items[0]!.getAttribute('aria-current')).toBe('step');
      expect(screen.getByText('Bước 1 / 3 · Gửi yêu cầu')).toBeTruthy();
      expect(within(steps).queryByText(/Chọn chuyến/)).toBeNull();
      expect(within(steps).queryByText('Liên hệ')).toBeNull();
    });
  });

  /*
   * KHÔNG còn bước "Chuyến đi" (27/10/2026): chuyến được chọn ở thẻ đặt xe của trang chi tiết, hộp
   * mở ra là tự chạy lượt kiểm mà nút "Tiếp tục" cũ từng chạy rồi vào thẳng màn Xem lại.
   */
  describe('lượt kiểm khi mở — không có bước Chuyến đi', () => {
    it('mở ra là kiểm khung giờ của ĐÚNG chuyến thẻ đưa sang (vehicleId + ISO), rồi vào Xem lại', async () => {
      renderModal();

      await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(1));
      const payload = api.checkAvailability.mock.calls[0]![0];
      expect(payload.vehicleId).toBe('V1');
      expect(payload.pickupAt).toBe('2026-09-01T02:00:00.000Z');
      expect(payload.returnAt).toBe('2026-09-03T02:00:00.000Z');

      await advanceToReview();
      // Không có biểu mẫu chọn lại chuyến nào trong hộp.
      expect(screen.queryByRole('button', { name: /Thời gian thuê:/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
    });

    it('KHÔNG khả dụng → lời báo, "Chọn lại chuyến" đóng hộp; không soát bằng lái, không có nút gửi', async () => {
      api.checkAvailability.mockResolvedValue({ available: false });
      const { onClose } = renderModal();

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(screen.getByText('Chưa thể tiếp tục với chuyến này')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      // Lỗi của DỮ LIỆU — thử lại không đổi được gì, nên không có nút "Thử lại".
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      expect(api.fetchDriverLicenceOverview).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Chọn lại chuyến' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('lỗi API khi kiểm tra → lời báo theo MÃ lỗi + "Thử lại" chạy lại lượt kiểm', async () => {
      api.checkAvailability.mockRejectedValueOnce(new Error('hỏng mạng'));
      renderModal();
      // Chữ đến từ MÃ lỗi (ADR 0012) — không phải `message` tiếng Việt của backend.
      expect(await screen.findByText(/Đã có lỗi xảy ra|Không kết nối/)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      await advanceToReview();
      expect(api.checkAvailability).toHaveBeenCalledTimes(2);
    });

    /**
     * Lịch bận giờ nằm ở ô chọn ngày của THẺ ĐẶT XE (`useVehicleBusyDays`) — hộp không có lịch nào
     * để khoá ngày, nên nó không tải lịch bận nữa. Chốt thật vẫn là lượt kiểm khung giờ ở trên.
     */
    it('hộp không tải lịch bận — không có ô chọn ngày nào để dùng nó', async () => {
      renderModal();
      await advanceToReview();
      expect(api.fetchVehicleBusyDays).not.toHaveBeenCalled();
    });
  });

  describe('màn Xem lại — xác nhận & gửi (thuê theo ngày)', () => {
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

    it('gửi payload đúng (họ tên/SĐT từ tài khoản, KHÔNG có trường giao nhận)', async () => {
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
        // Danh tính người thuê mặc định từ tài khoản (ADR 0063) — khách không sửa thì gửi nguyên.
        customerName: LOGGED_IN_ME.displayName,
        customerPhone: LOGGED_IN_ME.phone,
      });
      // Chủ xe không có điều khoản riêng ⇒ ô đồng ý chỉ là văn bản của XePrime: KHÔNG khai
      // `acceptedTerms` (server hiểu nó là "đã đồng ý điều khoản thuê của chủ xe").
      expect(payload).not.toHaveProperty('acceptedTerms');
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
    it('thẻ chuyến đi: xe + mốc nhận/trả + chủ xe; KHÔNG có lối "Chỉnh sửa"', async () => {
      listing.data = LISTING;
      renderModal();
      await advanceToReview();

      const trip = screen.getByRole('region', { name: 'Thông tin chuyến đi' });
      expect(within(trip).getByText('Toyota Vios 2022')).toBeTruthy();
      expect(within(trip).getByText('01/09/2026 09:00')).toBeTruthy();
      expect(within(trip).getByText('03/09/2026 09:00')).toBeTruthy();
      expect(within(trip).getByText('Tự nhận và trả xe tại chủ xe')).toBeTruthy();
      expect(within(trip).getByText('Gian hàng Demo XePrime')).toBeTruthy();
      expect(within(trip).getByText('Thuê theo ngày · 2 ngày')).toBeTruthy();

      // Muốn đổi chuyến thì đóng hộp và chọn lại ở thẻ đặt xe — hộp không có bước nào để quay về.
      expect(
        within(trip).queryByRole('button', { name: 'Chỉnh sửa thông tin chuyến đi' }),
      ).toBeNull();
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
     * Người thuê mặc định là TÀI KHOẢN đang đăng nhập (ADR 0063), cho phép sửa họ tên và SĐT
     * liên hệ cho chuyến mà không cần OTP.
     */
    it('thẻ người thuê điền sẵn từ tài khoản, cho phép sửa họ tên và SĐT liên hệ', async () => {
      renderModal();
      await advanceToReview();
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByDisplayValue('Nguyễn Văn A')).toBeTruthy();
      expect(within(renter).getByDisplayValue('0901234567')).toBeTruthy();
      expect(within(renter).getByText('Đã xác thực')).toBeTruthy();
      // Có 3 ô nhập: họ tên, SĐT liên hệ, lời nhắn cho chủ xe
      expect(within(renter).getAllByRole('textbox')).toHaveLength(3);
    });

    it('khách sửa họ tên và SĐT khác số tài khoản (không cần OTP) → gửi đúng thông tin mới', async () => {
      renderModal();
      await advanceToReview();
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });

      fireEvent.change(within(renter).getByDisplayValue('Nguyễn Văn A'), {
        target: { value: 'Lê Thuỳ Trang' },
      });
      fireEvent.change(within(renter).getByDisplayValue('0901234567'), {
        target: { value: '0988776655' },
      });

      // Nhập số khác số tài khoản ⇒ báo khách rằng chủ xe sẽ thấy thêm số tài khoản.
      expect(
        within(renter).getByText(/Số liên hệ chưa xác thực — chủ xe sẽ thấy thêm số tài khoản/i),
      ).toBeTruthy();

      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();
      await screen.findByText('Đã gửi yêu cầu');
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload).toMatchObject({
        customerName: 'Lê Thuỳ Trang',
        customerPhone: '0988776655',
      });
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
  /*
   * Ô địa chỉ giao xe (bản đồ, debounce, gõ dở) sống ở THẺ ĐẶT XE (27/10/2026) — hộp nhận địa chỉ
   * ĐÃ XÁC NHẬN qua `prefill.delivery`. Ở đây chỉ còn: payload đúng, ước tính quãng đường/phí ở màn
   * Xem lại nói đúng từng ngả rẽ, và chính sách tắt giao xe kéo về nhận tại điểm hẹn.
   */
  describe('giao xe tận nơi', () => {
    /** Mở hộp với địa chỉ giao xe thẻ đưa sang (mặc định có ghim) rồi chờ màn Xem lại. */
    async function openWithDelivery(
      addressLine = '12 Nguyễn Huệ, Quận 1, TP.HCM',
      pin: { latitude: number; longitude: number } | null = { latitude: 10.79, longitude: 106.71 },
    ) {
      renderModalWithPrefill({
        pickupMethod: PICKUP_METHOD.DELIVERY,
        delivery: { addressLine, placeId: pin ? 'place-1' : null, ...pin },
      });
      await advanceToReview();
    }

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

    beforeEach(() => {
      listing.data = LISTING;
    });

    /**
     * Chưa cấu hình bản đồ (mặc định của mock) — màn hình giữ NGUYÊN hành vi trước đây: nói hai bên
     * tự trao đổi phí. Khoá lời hứa "bản đồ vắng mặt không làm gãy luồng đặt xe".
     */
    it('chưa cấu hình bản đồ → câu giải thích như cũ, vẫn gửi được', async () => {
      await openWithDelivery();

      expect(
        await screen.findByText(
          'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.',
        ),
      ).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('trong bán kính → hiện quãng đường một chiều và phí DỰ KIẾN', async () => {
      respondWith({
        status: 'auto',
        distanceKm: 3.4,
        maxRadiusKm: 20,
        fee: '30000',
        origin: { lat: 10.7721, lng: 106.698 },
        destination: { lat: 10.79, lng: 106.71 },
        formattedAddress: '12 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM',
      });
      await openWithDelivery();

      // Quãng đường giữ một chữ số thập phân: bậc phí cắt ở đúng 3 km, làm tròn thành "3 km"
      // sẽ hiện một con số mâu thuẫn với mức phí ngay cạnh nó.
      expect(await screen.findByText(/3,4 km/)).toBeTruthy();
      expect(screen.getByText(/12 Nguyễn Huệ, Bến Nghé/)).toBeTruthy();
    });

    /**
     * Ước tính phải CÓ MẶT ở lần soát cuối: đây là khoản duy nhất có thể phát sinh thêm trước chuyến
     * mà không nằm trong "Tổng bạn trả".
     */
    it('màn Xem lại nói quãng đường và phí giao DỰ KIẾN', async () => {
      respondWith({
        status: 'auto',
        distanceKm: 9.7,
        maxRadiusKm: 10,
        fee: '50000',
        origin: { lat: 21.03, lng: 105.79 },
        destination: { lat: 20.99, lng: 105.86 },
      });
      await openWithDelivery();

      /*
       * Soi TRONG khối ước tính chứ không tìm "50.000" trên cả màn: giá gạch ngang của xe là
       * "650.000 ₫" và cũng khớp chuỗi đó.
       */
      const estimate = (await screen.findByText(/9,7 km/)).closest('div');
      expect(estimate?.textContent).toMatch(/Phí giao nhận/);
      expect(estimate?.textContent).toMatch(/50.000/);
    });

    /**
     * Phí giao nhận KHÔNG nằm trong tổng, nhưng "không nằm trong tổng" ≠ "miễn phí". Chủ xe chốt phí
     * lúc duyệt (ADR 0018 + Wave 9); khối giá chỉ được nói đúng chừng đó.
     */
    it('màn Xem lại KHÔNG hứa giao xe miễn phí, và KHÔNG có bước khách duyệt phí', async () => {
      respondWith({ status: 'auto', distanceKm: 9.7, maxRadiusKm: 10, fee: '50000' });
      await openWithDelivery();
      await screen.findByText(/9,7 km/);

      expect(screen.queryByText(/Phí giao nhận: Miễn phí/)).toBeNull();
      expect(screen.queryByText(/Delivery fee: Free/)).toBeNull();
      expect(screen.queryByText(/Chờ chủ xe báo giá/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /Xác nhận phí/i })).toBeNull();
    });

    it('ngoài bán kính → nói chủ xe sẽ báo phí, KHÔNG hiện một con số nào', async () => {
      respondWith({ distanceKm: 42.5, origin: { lat: 10.7721, lng: 106.698 } });
      await openWithDelivery('Khu công nghiệp Sóng Thần, Dĩ An, Bình Dương');

      expect(await screen.findByText(/ngoài phạm vi báo giá tự động/)).toBeTruthy();
      expect(screen.queryByText(/^30\.000/)).toBeNull();
    });

    /**
     * BA LÝ DO rơi về báo giá thủ công, ba câu khác nhau (21/09/2026 — mở rộng ADR 0018 §4). Không
     * ca nào trong ba được phép chặn nút gửi.
     */
    it('ngoài bán kính: cảnh báo nêu ĐÚNG bán kính chủ xe đặt, và vẫn gửi được', async () => {
      respondWith({ manualReason: 'outside_auto_radius', straightLineKm: 42.5, maxRadiusKm: 20 });
      await openWithDelivery();

      expect(await screen.findByText('Ngoài phạm vi giao xe tự động')).toBeTruthy();
      // Đường CHIM BAY phải được gọi đúng tên — nó không phải quãng đường lái xe.
      expect(screen.getByText(/theo đường chim bay/)).toBeTruthy();
      expect(screen.getByText(/42,5 km/)).toBeTruthy();
      expect(screen.getByText(/20 km/)).toBeTruthy();
      expect(screen.getByText(/vẫn gửi được yêu cầu/)).toBeTruthy();
      // Ngoài phạm vi KHÔNG chặn (ADR 0018).
      expect(
        (screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('đo được đường BỘ mà vượt bậc phí: gọi đúng là quãng đường đường bộ', async () => {
      respondWith({ manualReason: 'outside_auto_radius', distanceKm: 42.5, maxRadiusKm: 20 });
      await openWithDelivery();

      expect(await screen.findByText(/42,5 km đường bộ/)).toBeTruthy();
      expect(screen.queryByText(/chim bay/)).toBeNull();
    });

    it('không có tuyến đường: KHÔNG nói là ngoài phạm vi', async () => {
      respondWith({ manualReason: 'route_unavailable' });
      await openWithDelivery('123 Đường không có tuyến, Cần Giờ');

      expect(await screen.findByText('Chưa ước tính được quãng đường')).toBeTruthy();
      expect(screen.queryByText('Ngoài phạm vi giao xe tự động')).toBeNull();
      expect(screen.getByText(/vẫn gửi được yêu cầu/)).toBeTruthy();
    });

    it('nhà cung cấp bản đồ lỗi: im lặng rơi về câu cũ, không đổ lỗi cho khách', async () => {
      respondWith({ manualReason: 'provider_unavailable' });
      await openWithDelivery('123 Nguyễn Văn Linh, Đà Nẵng');

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
      // Địa chỉ gõ tay khách đã chốt (không ghim) — server tra bằng chữ.
      await openWithDelivery('chỗ nào đó không có thật', null);

      expect(await screen.findByText('Chưa tìm thấy địa chỉ này')).toBeTruthy();
      expect(screen.getByText(/ghi rõ hơn/)).toBeTruthy();
      expect(screen.queryByText('Ngoài phạm vi giao xe tự động')).toBeNull();
    });

    it('API lỗi: không treo loading, không vỡ luồng', async () => {
      deliveryDistance.fn = vi.fn(() => Promise.reject(new Error('mạng hỏng'))) as unknown as (
        ...args: unknown[]
      ) => Promise<unknown>;
      await openWithDelivery();

      expect(
        await screen.findByText(
          'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('Đang tính quãng đường…')).toBeNull();
    });

    it('gửi kèm địa chỉ và deliveryRequested — KHÔNG kèm bất kỳ số phí nào', async () => {
      // Gõ tay, không ghim, không mã tỉnh — mã tỉnh rơi về tỉnh của CHÍNH CHIẾC XE.
      await openWithDelivery('  123 Nguyễn Văn Linh  ', null);

      api.submitBookingRequest.mockResolvedValue({ id: 'R2', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload.deliveryRequested).toBe(true);
      // Client gửi MÃ + phần chi tiết; chuỗi hiển thị do server ghép (ADR 0035 điều 3).
      expect(payload.deliveryProvinceCode).toBe('48');
      // Một chuỗi mã xã rỗng sẽ bị `@Length(5, 5)` bên API từ chối — không gửi.
      expect(payload).not.toHaveProperty('deliveryWardCode');
      expect(payload.deliveryAddressLine).toBe('123 Nguyễn Văn Linh');
      expect(payload).not.toHaveProperty('deliveryAddress');
      expect(payload).not.toHaveProperty('deliveryFee');
      expect(payload).not.toHaveProperty('distanceKm');
    });

    /**
     * Backend chặn `deliveryRequested` theo CHÍNH SÁCH hiệu lực. Chính sách tắt giao xe mà thẻ vẫn
     * đưa sang giao tận nơi (vd tin đăng vừa đổi) ⇒ hộp kéo về nhận tại điểm hẹn, payload không mang
     * `deliveryRequested` — nếu không khách ăn `DELIVERY_NOT_SUPPORTED` ở đúng nút cuối cùng.
     */
    it('chính sách tắt giao xe → kéo về nhận tại điểm hẹn, payload KHÔNG mang deliveryRequested', async () => {
      listing.data = { ...LISTING, deliveryAvailable: false };
      await openWithDelivery();

      const trip = screen.getByRole('region', { name: 'Thông tin chuyến đi' });
      expect(within(trip).getByText('Tự nhận và trả xe tại chủ xe')).toBeTruthy();

      api.submitBookingRequest.mockResolvedValue({ id: 'R2', status: 'pending_host_approval' });
      submitFromReview();
      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      expect(api.submitBookingRequest.mock.calls[0]![0]).not.toHaveProperty('deliveryRequested');
    });

    it('tự nhận xe + có điểm nhận xe → thẻ chuyến hiện ĐỊA CHỈ thật của điểm nhận', async () => {
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
      await advanceToReview();

      expect(await screen.findByText(/12 Nguyễn Văn Linh, Đà Nẵng/)).toBeTruthy();
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

    /*
     * Hạn phản hồi ĐỘNG theo giờ nhận (ADR 0066) — hộp nói TRẦN của cửa sổ từ hằng số dùng chung
     * với server, không tự tính một mốc giờ (mốc thật hiện ở trang chuyến).
     */
    it('nói trần hạn phản hồi của chủ xe theo hằng số dùng chung', async () => {
      renderModal();
      await advanceToReview();
      await reachDone();

      expect(
        screen.getByText(
          new RegExp(
            `phản hồi trong tối đa ${BOOKING_REQUEST_RESPOND_WINDOW.MAX_MINUTES / 60} giờ`,
          ),
        ),
      ).toBeTruthy();
    });

    it('mã yêu cầu chép được', async () => {
      renderModal();
      await advanceToReview();
      await reachDone();

      expect(screen.getByRole('button', { name: 'Sao chép mã yêu cầu' })).toBeTruthy();
    });

    it('kể lại chuyến vừa gửi bằng cùng thẻ "Thông tin chuyến đi" của màn Xem lại', async () => {
      renderModal();
      await advanceToReview();
      await reachDone();

      const trip = screen.getByRole('region', { name: 'Thông tin chuyến đi' });
      expect(within(trip).getByText('Nhận xe')).toBeTruthy();
      expect(within(trip).getByText('Trả xe')).toBeTruthy();
      // Thẻ của hộp đã gửi KHÔNG còn lối "Chỉnh sửa" — yêu cầu đã đi rồi.
      expect(within(trip).queryByRole('button', { name: /Chỉnh sửa/ })).toBeNull();
    });

    /*
     * Hệ thống tự nhận và tạo đơn ngay (chuyến không thu tiền giữ chỗ): gọi đó là "đã gửi yêu cầu"
     * kèm lời nhắc "xe chưa được giữ chỗ" là nói sai với khách.
     */
    it('tự nhận + có đơn ngay ⇒ "Chuyến đã được xác nhận", không có lời nhắc chưa giữ chỗ', async () => {
      api.submitBookingRequest.mockResolvedValue({
        id: 'R2',
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        autoAccepted: true,
        bookingId: 'B2',
      });
      renderModal();
      await advanceToReview();
      submitFromReview();

      expect(await screen.findByText('Chuyến đã được xác nhận')).toBeTruthy();
      expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull();
      expect(screen.queryByText(/Xe chưa được giữ chỗ/)).toBeNull();
      expect(screen.getByText(/R2/)).toBeTruthy();
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

    it('gian hàng tuyến gói: có lối liên hệ, và nó đóng overlay trước khi rời trang', async () => {
      listing.data = { ...LISTING, shopChatOpen: true };
      const { onClose } = renderModal();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Nhắn tin cho chủ xe' }));
      expect(onClose).toHaveBeenCalled();
    });

    // ADR 0073: chủ xe cá nhân chỉ nhắn được khi đã có ĐƠN — vừa gửi yêu cầu thì chưa.
    it('chủ xe cá nhân, chưa có đơn: KHÔNG có nút nhắn tin', async () => {
      listing.data = { ...LISTING, shopChatOpen: false };
      chatEligibility.canChat = false;
      renderModal();
      await advanceToReview();
      await reachDone();

      expect(screen.queryByRole('button', { name: 'Nhắn tin cho chủ xe' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Xem chi tiết' })).toBeTruthy();
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

    it('"Xem chi tiết" đóng modal và mở trang chi tiết CHÍNH chuyến vừa gửi', async () => {
      const { onClose } = renderModal();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/trips/R1');
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

      // Người thuê là THẺ có thể sửa thông tin người liên hệ cho chuyến (ADR 0063).
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByText('Đã xác thực')).toBeTruthy();
      expect(within(renter).getByDisplayValue('Trần Minh Tuấn')).toBeTruthy();
      expect(within(renter).getByDisplayValue('0901234567')).toBeTruthy();

      submitFromReview();
      await screen.findByText('Đã gửi yêu cầu');
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload).toMatchObject({
        customerName: 'Trần Minh Tuấn',
        customerPhone: '0901234567',
      });
    });

    /**
     * Vừa vào bằng Google/Facebook (ADR 0071): đi hết tới màn Xem lại như thường — KHÔNG hỏi số ở
     * "Tiếp tục". Bấm GỬI mới mở hộp xác minh SĐT, điền sẵn số liên hệ vừa gõ; "Để sau" thì không
     * gửi gì; xác minh xong thì lượt gửi đó đi tiếp.
     */
    it('SĐT tài khoản CHƯA xác minh → tới Xem lại bình thường, bấm GỬI mới hỏi số, xác minh xong thì gửi', async () => {
      me.data = { ...verifiedMe, phoneVerified: false };
      const { rerenderTree } = renderModal();
      await advanceToReview();
      expect(phonePrompt.open).not.toHaveBeenCalled();

      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      fireEvent.change(within(renter).getByDisplayValue('0901234567'), {
        target: { value: '0988776655' },
      });
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(phonePrompt.open).toHaveBeenCalledTimes(1));
      const options = phonePrompt.open.mock.calls[0]![0] as {
        phone: string;
        onVerified: () => void;
      };
      expect(options.phone).toBe('0988776655');
      expect(api.submitBookingRequest).not.toHaveBeenCalled();

      // Xác minh xong: hộp báo về, rồi `/auth/me` làm mới mang số đã xác minh.
      act(() => options.onVerified());
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      me.data = verifiedMe;
      rerenderTree();

      await screen.findByText('Đã gửi yêu cầu');
      expect(api.submitBookingRequest).toHaveBeenCalledTimes(1);
      expect(api.submitBookingRequest.mock.calls[0]![0]).toMatchObject({
        customerPhone: '0988776655',
      });
    });

    it('SĐT tài khoản CHƯA xác minh, bấm GỬI rồi "Để sau" → không gửi, ở lại Xem lại; bấm lại thì hỏi lại', async () => {
      me.data = { ...verifiedMe, phoneVerified: false };
      renderModal();
      await advanceToReview();

      submitFromReview();
      await waitFor(() => expect(phonePrompt.open).toHaveBeenCalledTimes(1));
      // "Để sau" = hộp đóng mà không gọi `onVerified`.
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();

      submitFromReview();
      await waitFor(() => expect(phonePrompt.open).toHaveBeenCalledTimes(2));
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
    });
  });

  /**
   * CHƯA ĐĂNG NHẬP — ADR 0060. Không có khách vãng lai, không có OTP trong hộp này: khách vẫn chọn
   * chuyến và kiểm khung giờ được (công khai), nhưng "Tiếp tục" chỉ GIỮ bản nháp và hiện LỜI MỜI
   * đăng nhập — hộp đăng nhập chỉ mở khi khách bấm "Đăng nhập", không chồng hai hộp. Có phiên rồi thì luồng TỰ đi tiếp — kiểm lại khung giờ, bằng lái, Xác nhận — và
   * KHÔNG BAO GIỜ tự gửi: nút "Gửi yêu cầu" vẫn do khách bấm.
   */
  describe('chưa đăng nhập — mời đăng nhập, giữ dữ liệu (ADR 0060)', () => {
    beforeEach(() => {
      me.data = undefined;
    });

    /** Mở hộp khi chưa đăng nhập: lượt kiểm tự chạy rồi hiện lời mời — chờ tới lúc đó. */
    async function continueAsGuest() {
      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
    }

    it('chưa đăng nhập → KHÔNG có ô liên hệ nào, chỉ lời mời đăng nhập — danh tính đến từ tài khoản', async () => {
      renderModal();
      await continueAsGuest();

      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
      expect(screen.queryByLabelText('Họ và tên')).toBeNull();
      expect(screen.queryByLabelText('Số điện thoại')).toBeNull();
      expect(screen.queryByLabelText(/Email/)).toBeNull();
    });

    it('mở hộp: kiểm khung giờ, GIỮ bản nháp, hiện lời mời — hộp đăng nhập chỉ mở khi bấm', async () => {
      renderModal();
      await continueAsGuest();

      // Khung giờ kiểm TRƯỚC: xe bận thì mời đăng nhập chỉ để báo bận là bắt khách làm việc thừa.
      expect(api.checkAvailability).toHaveBeenCalledTimes(1);
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      // Chưa có tài khoản thì chưa có bằng lái nào để soát.
      expect(api.fetchDriverLicenceOverview).not.toHaveBeenCalled();
      // Chỉ LỜI MỜI, không phải biểu mẫu — và hộp đăng nhập KHÔNG tự bật chồng lên nó.
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(authModal.open).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(authModal.open).toHaveBeenCalledTimes(1);
      expect(authModal.open).toHaveBeenCalledWith({
        mode: AUTH_MODE.LOGIN,
        context: AUTH_CONTEXT.BOOKING,
      });

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
      api.checkAvailability.mockResolvedValue({ available: false });
      renderModal();

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
      expect(authModal.open).not.toHaveBeenCalled();
      // Luồng đã đi tiếp — bản nháp không được mở lại hộp ở lần ghé trang sau.
      expect(hasBookingDraft('V1')).toBe(false);
      const renter = screen.getByRole('region', { name: 'Thông tin người thuê' });
      expect(within(renter).getByDisplayValue('Nguyễn Văn A')).toBeTruthy();
    });

    /**
     * Vào bằng Google/Facebook ⇒ có phiên nhưng chưa có SĐT đã xác minh. Luồng đi tiếp tới Xem lại
     * như mọi phiên khác — số được hỏi ở nút GỬI (ADR 0071), không phải ngay khi vừa đăng nhập.
     */
    it('đăng nhập mà SĐT CHƯA xác minh → vẫn tự đi tiếp tới Xem lại, KHÔNG hỏi số lúc này', async () => {
      const { rerenderTree } = renderModal();
      await continueAsGuest();

      me.data = { ...LOGGED_IN_ME, phone: null, phoneVerified: false };
      rerenderTree();

      expect(await screen.findByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(phonePrompt.open).not.toHaveBeenCalled();
      expect(api.checkAvailability).toHaveBeenCalledTimes(2);
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
    });

    it('còn bản nháp của xe này → dựng lại ĐÚNG thứ đã nhập, thắng mốc từ URL', async () => {
      saveBookingDraft('V1', { values: draftValues(), rentalMode: 'daily', promoCode: null });
      const { rerenderTree } = renderModal();

      // Chưa đăng nhập: hộp đăng nhập KHÔNG tự bật — lời mời có nút để khách tự mở nó.
      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
      expect(api.checkAvailability).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(authModal.open).toHaveBeenCalledTimes(1);

      me.data = LOGGED_IN_ME;
      rerenderTree();
      await advanceToReview();
      // Khoảng 3 ngày của bản nháp — không phải 2 ngày của link đang mở hộp.
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
    it('gửi bị 401 (phiên vừa mất) → giữ bản nháp, mời đăng nhập lại — không gửi lần hai', async () => {
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

      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
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

      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
      // Vài lượt render nữa vẫn không đi tiếp — không kiểm lại khung giờ, không tự mở hộp đăng nhập.
      rerenderTree();
      rerenderTree();
      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
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
      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
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
     * Server nói SĐT chưa xác minh trong khi `/auth/me` còn giữ bản cũ. Làm mới nó và mở hộp xác
     * minh SĐT của vỏ site; chữ hiện cho khách đi theo MÃ lỗi (ADR 0012), không phải `message` của
     * backend.
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
      await waitFor(() => expect(phonePrompt.open).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
    });
  });

  /**
   * BẰNG LÁI (ADR 0057) — thuê tự lái phải có bằng đã xác thực, hợp lệ cho CHÍNH chuyến này.
   * Bằng gắn với TÀI KHOẢN, nên chỉ soát khi đã có phiên — ngay trong lượt kiểm khi mở hộp.
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
      const { onClose } = renderModal();

      await screen.findByRole('heading', { name: 'Xác thực bằng lái' });
      expect(await screen.findByText('Kéo thả hoặc bấm để chọn ảnh')).toBeTruthy();
      const next = screen.getByRole('button', { name: 'Tiếp tục' });
      expect((next as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      // Bằng lái nằm TRƯỚC màn Xem lại, không phải một chặng riêng: thanh vẫn sáng chặng Gửi yêu cầu.
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      expect(within(steps).getAllByRole('listitem')[0]?.getAttribute('aria-current')).toBe('step');
      // Không có bước nào phía trước để "quay lại" — nút phụ là Huỷ, đóng hộp.
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('máy đọc xong ngay tại bước và bằng hợp lệ → TỰ sang bước Xác nhận, kèm lời báo', async () => {
      api.fetchDriverLicenceOverview.mockResolvedValue({
        verified: null,
        latest: { ...VERIFIED_LICENCE, id: 'L2', status: 'processing' },
      });
      renderModal();

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

    it('chưa chạm trần ⇒ đặt xe như thường', async () => {
      unpaid.data = { limit: 3, limitReached: false, items: [HOLD(1)] };
      renderModal();
      await advanceToReview();

      expect(screen.queryByText(/chuyến chưa thanh toán/)).toBeNull();
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
   * Mở từ THẺ ĐẶT XE (Figma: Details → Confirm). Khách vừa chọn xong lịch, cách nhận xe và mã ở
   * trang chi tiết — hộp tự chạy lượt kiểm và vào thẳng màn Xem lại; chuyến không đi tiếp được thì
   * một lời báo mời chọn lại ở thẻ. KHÔNG BAO GIỜ tự gửi (ADR 0060).
   */
  describe('mở từ thẻ đặt xe (prefill)', () => {
    it('đã đăng nhập, xe rảnh, bằng hợp lệ ⇒ tới THẲNG màn Xem lại — không gửi gì', async () => {
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModalWithPrefill({});

      // Trong lúc kiểm: trạng thái chờ, không có biểu mẫu nào hiện ra rồi bị rút đi.
      expect(screen.getByText('Đang kiểm tra lịch xe…')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();

      expect(await screen.findByRole('heading', { name: 'Xem lại yêu cầu thuê xe' })).toBeTruthy();
      expect(screen.getByText('Bước 1 / 3 · Gửi yêu cầu')).toBeTruthy();
      expect(api.checkAvailability).toHaveBeenCalledTimes(1);
      expect(api.fetchDriverLicenceOverview).toHaveBeenCalled();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(authModal.open).not.toHaveBeenCalled();
    });

    it('khung giờ đã bận ⇒ lời báo + lối chọn lại ở thẻ, không mời đăng nhập', async () => {
      api.checkAvailability.mockResolvedValue({ available: false });
      renderModalWithPrefill({});

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Chọn lại chuyến' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toBeNull();
      expect(authModal.open).not.toHaveBeenCalled();
    });

    it('CHƯA đăng nhập ⇒ kiểm khung giờ, giữ bản nháp, mời đăng nhập — đăng nhập xong tới Xem lại', async () => {
      me.data = undefined;
      api.checkAvailability.mockResolvedValue({ available: true });
      const { rerenderTree } = renderModalWithPrefill({});

      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
      expect(authModal.open).not.toHaveBeenCalled();
      expect(hasBookingDraft('V1')).toBe(true);
      expect(api.submitBookingRequest).not.toHaveBeenCalled();

      me.data = LOGGED_IN_ME;
      rerenderTree();
      expect(await screen.findByRole('heading', { name: 'Xem lại yêu cầu thuê xe' })).toBeTruthy();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(authModal.open).not.toHaveBeenCalled();
    });

    it('thẻ chọn giao tận nơi ⇒ Xem lại nói giao tận nơi và payload mang ĐÚNG địa chỉ đã xác nhận', async () => {
      listing.data = LISTING;
      api.checkAvailability.mockResolvedValue({ available: true });
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      renderModalWithPrefill({
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
      renderModalWithPrefill({ promoCode: 'GIAM50' });

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
      const { rerenderTree } = renderModalWithPrefill({ promoCode: 'GIAM50' });

      expect(await screen.findByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
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
      const { unmount } = renderModalWithPrefill({});
      await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(1));

      unmount();
      await act(async () => release({ available: true }));

      expect(authModal.open).not.toHaveBeenCalled();
      expect(hasBookingDraft('V1')).toBe(false);
    });

    /**
     * Thẻ chọn giao tận nơi mà chưa có địa chỉ (thẻ chặn ca này — đây là lưới an toàn): GIỮ lựa chọn
     * và nói thiếu địa chỉ, không âm thầm đổi thành tự nhận rồi vào thẳng màn Xem lại.
     */
    it('giao tận nơi chưa có địa chỉ ⇒ lời báo thiếu địa chỉ, KHÔNG vào màn Xem lại', async () => {
      // Khách CHƯA từng giao xe: không có địa chỉ lần trước để điền hộ (ca bên trên gửi thành công
      // một chuyến giao tận nơi và luồng đã nhớ địa chỉ đó).
      window.localStorage.clear();
      listing.data = LISTING;
      api.checkAvailability.mockResolvedValue({ available: true });
      renderModalWithPrefill({ pickupMethod: PICKUP_METHOD.DELIVERY });

      expect(await screen.findByText('Nhập địa chỉ giao xe')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Chọn lại chuyến' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Xem lại yêu cầu thuê xe' })).toBeNull();
      // Dữ liệu chuyến chưa đủ thì chưa hỏi lịch trống.
      expect(api.checkAvailability).not.toHaveBeenCalled();
    });
  });

  describe('đóng & reset', () => {
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

    it('vỏ chỉ dựng flow khi mở (cơ chế reset) — đóng thì không kiểm gì', async () => {
      renderModal(false);
      await act(async () => {});
      expect(screen.queryByText('Đang kiểm tra lịch xe…')).toBeNull();
      expect(api.checkAvailability).not.toHaveBeenCalled();
    });
  });

  /**
   * Bố cục màn Xem lại: không có footer nút chung, không có bảng giá thu/mở của bước Chuyến đi cũ —
   * hai thẻ tiền đọc từ báo giá server.
   */
  describe('bố cục & khối giá', () => {
    it('vòng chờ trong lúc kiểm, rồi màn Xem lại KHÔNG có footer nút chung', async () => {
      renderModal();
      // Trong lúc kiểm: trạng thái chờ, không có biểu mẫu nào hiện ra rồi bị rút đi.
      expect(screen.getByText('Đang kiểm tra lịch xe…')).toBeTruthy();

      // Nút gửi nằm trong thẻ đồng ý điều khoản — không có hàng nút thứ hai nào.
      await advanceToReview();
      expect(document.querySelectorAll('footer')).toHaveLength(0);
      expect(screen.getAllByRole('button', { name: 'Gửi yêu cầu thuê xe' })).toHaveLength(1);
      expect(screen.queryByText('Chi tiết giá thuê (dự kiến)')).toBeNull();
    });

    /**
     * Màn Xem lại có HAI thẻ tiền của design v2 (Figma `19727:56092` + `19727:56117`). Mọi số đến từ
     * báo giá server: tổng là số KHÁCH TRẢ (đã gồm phụ phí, đã trừ mã), thuế do chủ xe chịu không
     * hiện, tiền giữ chỗ + cọc nằm ở thẻ riêng.
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

      const costs = await screen.findByRole('region', { name: 'Chi phí thuê xe' });
      expect(await within(costs).findByText('Tiền thuê gốc')).toBeTruthy();
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
      // Cọc thế chấp là ĐIỀU KIỆN nhận xe — nằm ở thẻ giấy tờ bên trái, thẻ tiền không nhắc lại.
      expect(within(others).queryByText('Cọc thế chấp khi nhận xe')).toBeNull();
      expect(within(others).queryByText('5.000.000 ₫')).toBeNull();
      const requirements = screen.getByRole('region', { name: 'Giấy tờ & điều kiện nhận xe' });
      expect(within(requirements).getByText('Cọc thế chấp khi nhận xe')).toBeTruthy();
      expect(within(requirements).getByText('5.000.000 ₫')).toBeTruthy();

      expect(screen.queryByText('Chi tiết giá thuê (dự kiến)')).toBeNull();
      // Có tiền giữ chỗ ⇒ sau khi gửi là chờ chủ xe nhận rồi trả trong 120 phút.
      expect(screen.getByText(/bạn có tối đa 120 phút để thanh toán tiền giữ chỗ/)).toBeTruthy();
    });

    /**
     * Hộp là mốc "đang đặt xe nào", KHÔNG phải bản sao trang chi tiết xe mà khách vừa rời khỏi —
     * gallery, chip tiện ích và danh sách đánh giá không dựng lại.
     */
    it('màn Xem lại gọn: có xe + gian hàng, KHÔNG dựng lại gallery/đánh giá', async () => {
      listing.data = LISTING;
      renderModal();
      await advanceToReview();

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

    it('mobile hiện thẳng thông tin xe — không có nút gấp/mở', async () => {
      media.isMobile = true;
      listing.data = LISTING;
      renderModal();
      await advanceToReview();

      expect(await screen.findByText('Gian hàng Demo XePrime')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Xem thông tin xe/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Ẩn thông tin xe/ })).toBeNull();
    });
  });
});
