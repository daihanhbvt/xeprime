import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addDateKeyDays, API_ERROR_CODE, vnDateKey } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';

import { RequestBookingModal } from './RequestBookingModal';

/**
 * Test đặc tả cho luồng ĐẶT XE — workflow rủi ro cao nhất của khu khách.
 *
 * State machine sống trong `RequestBookingFlow` (`trip → [otp] → review → done`),
 * `RequestBookingModal` chỉ là vỏ. Test đi qua vỏ để khoá cả hai cùng lúc: payload gửi lên API,
 * nhánh OTP, giao xe tận nơi, chặn gửi trùng và điều hướng.
 *
 * **Hai bước (20/08)**: `Thời gian` và `Liên hệ` gộp thành MỘT bước `Chuyến đi` — thời gian là
 * một trường, ô liên hệ chỉ dựng khi hệ thống chưa biết khách. OTP vẫn là trạng thái xen giữa,
 * không phải một bước. Payload gửi lên API **không đổi** — đó là hợp đồng thật, và mọi assert về
 * body ở đây giữ nguyên từ bản ba bước.
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
  verifyOtp: vi.fn(),
  sendAsync: vi.fn(),
  send: vi.fn(),
  reset: vi.fn(),
}));
const media = vi.hoisted(() => ({ isMobile: false }));

const me = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => me }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
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
/** Dùng đúng map rỗng của production (đủ mọi chiều), không phải `{}` — mock sai làm test dối. */
vi.mock('@/features/catalog/use-catalog', async () => {
  const { EMPTY_CATALOG } = await import('@/features/catalog/types');
  return { useCatalog: () => ({ catalog: EMPTY_CATALOG, isLoading: false }) };
});

/**
 * Public quote: mặc định lỗi — các test này khoá luồng đặt xe, không khoá khối giá; query lỗi
 * thì khối giá rơi về bảng niêm yết. KHÔNG mock kiểu treo vô hạn: `invalidateQueries()` sau khi
 * gửi thành công sẽ đợi refetch của chính query này và làm test kẹt ở bước done.
 */
const quote = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/features/rental-policies/api', () => ({
  fetchPublicQuote: () =>
    quote.data ? Promise.resolve(quote.data) : Promise.reject(new Error('quote offline (test)')),
}));

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

vi.mock('@/features/phone-verification/api', () => ({
  verifyOtp: (...a: unknown[]) => api.verifyOtp(...a),
  sendOtp: vi.fn(),
}));

vi.mock('@/features/phone-verification/hooks/use-phone-verify', () => ({
  usePhoneVerify: () => ({
    status: 'idle',
    cooldown: 0,
    devCode: null,
    error: null,
    sending: false,
    sendAsync: api.sendAsync,
    send: api.send,
    reset: api.reset,
  }),
}));

/** OTP input thật là 6 ô rời; test chỉ cần đẩy giá trị nên thay bằng một input đơn giản. */
vi.mock('@/features/phone-verification/components/OtpCodeInput', () => ({
  OtpCodeInput: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
  }) => (
    <input
      aria-label="Mã OTP"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

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
  const utils = render(
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
    </QueryClientProvider>,
  );
  return { ...utils, onClose, queryClient };
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

/** Điền liên hệ ngay tại bước Chuyến đi (khách vãng lai). */
function fillContact(phone = '0901234567', name = '  Nguyễn Văn A  ') {
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: phone } });
}

/** trip → otp (khách vãng lai): kiểm khung giờ rồi gửi mã, tất cả trong một cú Tiếp tục. */
async function advanceToOtp(phone = '0901234567') {
  api.checkAvailability.mockResolvedValue({ available: true });
  api.sendAsync.mockResolvedValue(undefined);
  fillContact(phone);
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByLabelText('Mã OTP');
}

/** otp → review. */
async function advanceToReview(code = '123456') {
  api.verifyOtp.mockResolvedValue({});
  fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực' }));
  await screen.findByRole('button', { name: 'Gửi yêu cầu thuê' });
}

/** trip → review thẳng (tài khoản đã đăng nhập, SĐT đã xác thực → không qua OTP). */
async function advanceToReviewAsMember() {
  api.checkAvailability.mockResolvedValue({ available: true });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByRole('button', { name: 'Gửi yêu cầu thuê' });
}

/** Gửi yêu cầu từ bước Xác nhận. Không còn ô tick điều khoản chắn trước nút gửi. */
function submitFromReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));
}

beforeEach(() => {
  media.isMobile = false;
  nav.push.mockReset();
  // Mặc định là KHÁCH VÃNG LAI — mọi test cũ mô tả đúng luồng đó.
  me.data = undefined;
  listing.data = null;
  quote.data = null;
  Object.values(api).forEach((fn) => fn.mockReset());
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

    it('HAI bước biểu mẫu; OTP và Hoàn tất KHÔNG chiếm ô trên thanh tiến trình', () => {
      renderModal();
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
      expect(within(steps).getByText('Chuyến đi')).toBeTruthy();
      expect(within(steps).getByText('Xác nhận')).toBeTruthy();
      expect(within(steps).queryByText('Liên hệ')).toBeNull();
      expect(within(steps).queryByText('Hoàn tất')).toBeNull();
    });

    it('OTP vẫn nằm TRONG bước Chuyến đi trên thanh tiến trình', async () => {
      renderModal();
      await advanceToOtp();
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      const items = within(steps).getAllByRole('listitem');
      expect(items[0]?.getAttribute('aria-current')).toBe('step');
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
      fillContact();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      await waitFor(() => expect(api.checkAvailability).toHaveBeenCalledTimes(1));
      const payload = api.checkAvailability.mock.calls[0]![0];
      expect(payload.vehicleId).toBe('V1');
      expect(payload.pickupAt).toBe('2026-09-01T02:00:00.000Z');
      expect(payload.returnAt).toBe('2026-09-03T02:00:00.000Z');
    });

    it('KHÔNG khả dụng → báo lỗi, ở lại bước Chuyến đi và KHÔNG gửi mã', async () => {
      renderModal();
      api.checkAvailability.mockResolvedValue({ available: false });
      fillContact();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
      expect(api.sendAsync).not.toHaveBeenCalled();
    });

    it('lỗi API khi kiểm tra → hiện thông báo lỗi', async () => {
      renderModal();
      api.checkAvailability.mockRejectedValue(new Error('hỏng mạng'));
      fillContact();
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

    it('thời gian và liên hệ nằm CÙNG một bước — không phải hai lần bấm Tiếp tục', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
      expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
    });

    /**
     * Liên hệ chỉ còn tên + SĐT. SĐT là thứ luồng này xác thực bằng OTP và gian hàng dùng để
     * gọi lại; ô email "không bắt buộc" chỉ làm dài thêm một bước vốn đã dài.
     */
    it('liên hệ chỉ hỏi tên + SĐT — không có ô email', () => {
      renderModal();
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
      expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
      expect(screen.queryByLabelText(/Email/)).toBeNull();
    });
  });

  describe('liên hệ & OTP', () => {
    it('SĐT sai định dạng thì không kiểm lịch và không gửi OTP', async () => {
      renderModal();
      fillContact('123', 'A');
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
      expect(api.checkAvailability).not.toHaveBeenCalled();
      expect(api.sendAsync).not.toHaveBeenCalled();
    });

    it('hợp lệ → gửi OTP tới đúng số và vào trạng thái OTP', async () => {
      renderModal();
      await advanceToOtp();
      expect(api.sendAsync).toHaveBeenCalledWith('0901234567');
    });

    it('gửi OTP lỗi thì ở lại bước Chuyến đi', async () => {
      renderModal();
      api.checkAvailability.mockResolvedValue({ available: true });
      api.sendAsync.mockRejectedValue(new Error('Quá nhiều yêu cầu'));
      fillContact();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      await waitFor(() => expect(api.sendAsync).toHaveBeenCalled());
      expect(screen.queryByLabelText('Mã OTP')).toBeNull();
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
    });

    it('mã chưa đủ 6 số thì nút xác thực bị vô hiệu và không gọi API', async () => {
      renderModal();
      await advanceToOtp();

      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123' } });
      const submit = screen.getByRole('button', { name: 'Xác thực' });
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(submit);
      expect(api.verifyOtp).not.toHaveBeenCalled();
    });

    it('OTP sai → báo lỗi, giữ nguyên màn OTP, KHÔNG sang bước xác nhận', async () => {
      renderModal();
      await advanceToOtp();

      api.verifyOtp.mockRejectedValue(
        new ApiClientError({
          code: API_ERROR_CODE.OTP_INVALID,
          message: 'Mã xác thực không đúng',
          status: 400,
        }),
      );
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Xác thực' }));

      await waitFor(() => expect(api.verifyOtp).toHaveBeenCalled());
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Mã OTP')).toBeTruthy();
    });

    it('"Sửa số điện thoại" quay lại bước Chuyến đi và xoá mã', async () => {
      renderModal();
      await advanceToOtp();

      fireEvent.click(screen.getByRole('button', { name: 'Sửa số điện thoại' }));
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
      expect(api.reset).toHaveBeenCalled();
    });

    it('"Gửi lại mã" gửi lại đúng số đã xác nhận', async () => {
      renderModal();
      await advanceToOtp();

      fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
      expect(api.send).toHaveBeenCalledWith('0901234567');
    });
  });

  describe('bước 2 — xác nhận & gửi (khách vãng lai, thuê theo ngày)', () => {
    /**
     * Ô tick điều khoản đã bỏ (20/08): nó chặn nút gửi bằng một thao tác không ai đọc, trong khi
     * chính nhãn nút đã nói đây là gửi YÊU CẦU. Soát xong là gửi được ngay.
     */
    it('bước Xác nhận không còn ô tick nào chắn trước nút gửi', async () => {
      renderModal();
      await advanceToOtp();
      await advanceToReview();

      expect(screen.queryByRole('checkbox')).toBeNull();
      const submit = screen.getByRole('button', { name: 'Gửi yêu cầu thuê' });
      expect((submit as HTMLButtonElement).disabled).toBe(false);
    });

    it('gửi payload đúng (SĐT đã xác minh, tên đã trim, KHÔNG có trường giao nhận)', async () => {
      renderModal();
      await advanceToOtp();
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      expect(api.verifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '0901234567', code: '123456' }),
      );
      expect(api.submitBookingRequest.mock.calls[0]![0]).toEqual({
        vehicleId: 'V1',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0901234567',
        pickupAt: '2026-09-01T02:00:00.000Z',
        returnAt: '2026-09-03T02:00:00.000Z',
        // Dịch vụ của chuyến luôn đi kèm (17/08) — mặc định tự lái.
        serviceType: 'self_drive',
      });
    });

    it('có dòng "Người thuê" ngay trên bảng xác nhận', async () => {
      renderModal();
      await advanceToOtp();
      await advanceToReview();
      expect(screen.getByText('Người thuê')).toBeTruthy();
      expect(screen.getByText(/Nguyễn Văn A · 0901234567/)).toBeTruthy();
    });
  });

  /**
   * Wave 9 — giao xe tận nơi. Điều cần khoá: CHỈ hỏi địa chỉ, nói rõ miễn phí, tuyệt đối không
   * có khoảng cách / báo giá / bước khách duyệt phí, và lựa chọn chỉ tồn tại khi CHÍNH SÁCH
   * cho phép.
   */
  describe('giao xe tận nơi', () => {
    async function chooseDelivery() {
      fireEvent.click(await screen.findByRole('radio', { name: /Giao xe tận nơi/ }));
      await screen.findByLabelText('Địa chỉ giao xe');
    }

    beforeEach(() => {
      listing.data = LISTING;
    });

    it('mặc định là nhận tại điểm hẹn — KHÔNG hỏi địa chỉ', async () => {
      renderModal();
      await screen.findByRole('radio', { name: /Nhận tại điểm hẹn/ });
      expect(screen.queryByLabelText('Địa chỉ giao xe')).toBeNull();
    });

    it('chọn giao tận nơi → hiện ô địa chỉ, ghi Miễn phí và câu giải thích', async () => {
      renderModal();
      await chooseDelivery();

      expect(screen.getByText('Miễn phí')).toBeTruthy();
      expect(
        screen.getByText(
          'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.',
        ),
      ).toBeTruthy();
    });

    it('KHÔNG có khoảng cách, báo giá hay bước khách duyệt phí', async () => {
      renderModal();
      await chooseDelivery();

      expect(screen.queryByLabelText(/Khoảng cách/i)).toBeNull();
      expect(screen.queryByText(/Chờ chủ xe báo giá/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /Xác nhận phí/i })).toBeNull();
    });

    it('thiếu địa chỉ thì không đi tiếp được', async () => {
      renderModal();
      await chooseDelivery();
      fillContact();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(await screen.findByText('Nhập địa chỉ giao xe')).toBeTruthy();
      expect(api.sendAsync).not.toHaveBeenCalled();
    });

    it('gửi kèm địa chỉ và deliveryRequested — KHÔNG kèm bất kỳ số phí nào', async () => {
      renderModal();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText('Địa chỉ giao xe'), {
        target: { value: '  123 Nguyễn Văn Linh, Đà Nẵng  ' },
      });
      await advanceToOtp();
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R2', status: 'pending_host_approval' });
      submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload.deliveryRequested).toBe(true);
      expect(payload.deliveryAddress).toBe('123 Nguyễn Văn Linh, Đà Nẵng');
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
      expect(screen.queryByLabelText('Địa chỉ giao xe')).toBeNull();
      expect(screen.getByText('Nhận tại điểm hẹn')).toBeTruthy();
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
      await screen.findByText('Yêu cầu đã được gửi');
    }

    it('hiện màn thành công kèm mã yêu cầu', async () => {
      renderModal();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      expect(screen.getByText('Yêu cầu đã được gửi')).toBeTruthy();
      expect(screen.getByText(/R1/)).toBeTruthy();
      expect(screen.getByText(/Xe chưa được giữ chỗ/)).toBeTruthy();
    });

    it('có lối liên hệ chủ xe, và nó đóng overlay trước khi rời trang', async () => {
      const { onClose } = renderModal();
      await advanceToOtp();
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
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      expect(screen.getAllByText('1.800.000 ₫').length).toBeGreaterThan(0);
      expect(screen.queryByText('1800000')).toBeNull();
    });

    it('"Chuyến của tôi" đóng modal và điều hướng tới /trips', async () => {
      const { onClose } = renderModal();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Chuyến của tôi' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/trips');
    });

    it('"Quay lại" chỉ đóng, không điều hướng', async () => {
      const { onClose } = renderModal();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).not.toHaveBeenCalled();
    });
  });

  /**
   * Luồng nhận biết đăng nhập. Điều kiện thật do backend (`canSkipBookingOtp`) quyết; ở đây
   * khoá phần FE: hiện màn nào và gọi API nào.
   */
  describe('khách đã đăng nhập', () => {
    const verifiedMe = {
      id: 'U1',
      displayName: 'Trần Minh Tuấn',
      phone: '0901234567',
      phoneVerified: true,
    };

    it('KHÔNG hỏi lại thứ hệ thống đã biết — bước Chuyến đi không có ô liên hệ nào', () => {
      me.data = verifiedMe;
      renderModal();

      expect(screen.queryByLabelText('Họ và tên')).toBeNull();
      expect(screen.queryByLabelText('Số điện thoại')).toBeNull();
    });

    it('SĐT tài khoản đã xác thực → BỎ QUA OTP, đi thẳng bước xác nhận', async () => {
      me.data = verifiedMe;
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      renderModal();
      await advanceToReviewAsMember();

      // Người thuê là MỘT DÒNG ở bước xác nhận, không còn là cả một bước.
      expect(screen.getByText('Đã xác thực')).toBeTruthy();
      expect(screen.getByText(/Trần Minh Tuấn · 0901234567/)).toBeTruthy();

      submitFromReview();
      await screen.findByText('Yêu cầu đã được gửi');
      expect(api.sendAsync).not.toHaveBeenCalled();
      expect(api.verifyOtp).not.toHaveBeenCalled();
      expect(api.submitBookingRequest).toHaveBeenCalledWith(
        expect.objectContaining({ customerPhone: '0901234567' }),
      );
    });

    it('nút "Đổi" ở bước xác nhận mở lại ô nhập liên hệ ở bước Chuyến đi', async () => {
      me.data = verifiedMe;
      renderModal();
      await advanceToReviewAsMember();

      fireEvent.click(screen.getByRole('button', { name: /Đổi/ }));
      expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
      expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe(
        '0901234567',
      );
    });

    it('dùng SĐT KHÁC số tài khoản → vẫn phải xác thực OTP', async () => {
      me.data = verifiedMe;
      renderModal();
      await advanceToReviewAsMember();

      fireEvent.click(screen.getByRole('button', { name: /Đổi/ }));
      api.checkAvailability.mockResolvedValue({ available: true });
      api.sendAsync.mockResolvedValue(undefined);
      fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0987654321' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      await screen.findByLabelText('Mã OTP');

      expect(api.sendAsync).toHaveBeenCalledWith('0987654321');
    });

    it('SĐT tài khoản CHƯA xác thực → vẫn phải qua OTP', () => {
      me.data = { ...verifiedMe, phoneVerified: false };
      renderModal();

      expect(screen.queryByText('Đã xác thực')).toBeNull();
      expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
    });

    it('phiên hết hạn giữa chừng → lùi về OTP, GIỮ nguyên dữ liệu đã nhập', async () => {
      me.data = verifiedMe;
      api.submitBookingRequest.mockRejectedValue(
        new ApiClientError({
          code: API_ERROR_CODE.PHONE_NOT_VERIFIED,
          message: 'Vui lòng xác thực số điện thoại',
          status: 403,
        }),
      );
      renderModal();
      await advanceToReviewAsMember();
      submitFromReview();

      await screen.findByLabelText('Mã OTP');
      expect(
        screen.getByText('Phiên đăng nhập đã hết hạn. Vui lòng xác thực lại số điện thoại.'),
      ).toBeTruthy();
      // Không đá về bước đầu: ngày giờ và SĐT vẫn còn; mã mới gửi bằng `send` (không ném lỗi).
      expect(api.send).toHaveBeenCalledWith('0901234567');
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
      await advanceToOtp();
      await advanceToReview();
      submitFromReview();

      expect(await screen.findByText('Yêu cầu trùng lặp')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Xem chuyến của tôi' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    });
  });

  describe('đóng & reset', () => {
    it('nút Huỷ ở bước Chuyến đi gọi onClose', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    /**
     * Trong lúc xác minh OTP / gửi yêu cầu, Esc và bấm nền bị khoá — đóng giữa chừng làm khách
     * mất dấu yêu cầu đã gửi hay chưa.
     */
    it('đang xác thực OTP thì Esc KHÔNG đóng được', async () => {
      const { onClose } = renderModal();
      await advanceToOtp();

      // Giữ request treo để trạng thái "đang gửi" tồn tại trong lúc bấm Esc.
      api.verifyOtp.mockReturnValue(new Promise(() => {}));
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Xác thực' }));

      await waitFor(() => expect(api.verifyOtp).toHaveBeenCalled());
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('vỏ chỉ dựng flow khi mở (cơ chế reset)', () => {
      renderModal(false);
      expect(screen.queryByText(/Chọn thời gian thuê để kiểm tra/)).toBeNull();
      expect(screen.queryByLabelText('Họ và tên')).toBeNull();
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

      // Sang bước sau, vẫn CÙNG một footer đổi nhãn — không sinh hàng nút thứ hai.
      await advanceToOtp();
      expect(document.querySelectorAll('footer')).toHaveLength(1);
      expect(
        within(document.querySelector('footer') as HTMLElement).getByRole('button', {
          name: 'Quay lại',
        }),
      ).toBeTruthy();
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

    it('chưa có khoảng thuê → nói rõ phải bấm vào ô để mở lịch', () => {
      renderModalWithoutPrefill();
      expect(screen.getByText('Bấm vào ô trên để mở lịch và chọn khoảng thuê.')).toBeTruthy();
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
     * xe và ô liên hệ. Bản trước mở nó ngay trong khối dính đáy nên nó nở ngược lên che phần
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

    it('bước Xác nhận mở sẵn bảng đầy đủ, và chỉ đúng một bảng', async () => {
      quote.data = {
        breakdown: {
          rows: [{ key: 'base', label: 'Tiền thuê xe', amount: '1170000', sublabel: '2 ngày' }],
          totalAmount: '1170000',
          depositAmount: '5000000',
        },
        delivery: { enabled: true, maxRadiusKm: 10 },
      };
      renderModal();
      await advanceToOtp();
      await advanceToReview();

      expect(screen.getAllByText('Chi tiết giá thuê (dự kiến)')).toHaveLength(1);
      expect(screen.getByText('Tiền thuê xe')).toBeTruthy();
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
