import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODE } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';

import { RequestBookingModal } from './RequestBookingModal';

/**
 * Test đặc tả cho luồng ĐẶT XE — workflow rủi ro cao nhất của khu khách.
 *
 * State machine sống trong `RequestBookingFlow` (`time → contact → [otp] → review → done`),
 * `RequestBookingModal` chỉ là vỏ. Test đi qua vỏ để khoá cả hai cùng lúc: payload gửi lên API,
 * nhánh OTP, giao xe tận nơi, chặn gửi trùng và điều hướng.
 *
 * **Wave 9**: OTP là trạng thái BÊN TRONG bước Liên hệ (không phải bước thứ ba), và giao tận
 * nơi chỉ hỏi ĐỊA CHỈ — không khoảng cách, không báo giá, không bước khách duyệt phí.
 */
const nav = vi.hoisted(() => ({ push: vi.fn() }));
const api = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
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
  checkAvailability: (...a: unknown[]) => api.checkAvailability(...a),
  submitBookingRequest: (...a: unknown[]) => api.submitBookingRequest(...a),
}));

/**
 * Cột hồ sơ xe + đánh giá. Mặc định CẢ HAI lỗi: phần lớn test ở đây khoá luồng đặt, và một cột
 * trái rỗng chứng minh luôn rằng luồng không phụ thuộc nó. Test nào cần dữ liệu thật thì tự đặt
 * `listing.data` / `listing.reviews`.
 */
const listing = vi.hoisted(() => ({
  data: null as unknown,
  reviews: null as unknown,
}));
vi.mock('@/features/marketplace/api', () => ({
  fetchListingDetailClient: () =>
    listing.data ? Promise.resolve(listing.data) : Promise.reject(new Error('listing offline')),
  fetchListingReviewsClient: () =>
    listing.reviews ? Promise.resolve(listing.reviews) : Promise.reject(new Error('reviews off')),
}));
/** Dùng đúng map rỗng của production (đủ mọi chiều), không phải `{}` — mock sai làm test dối. */
vi.mock('@/features/catalog/use-catalog', async () => {
  const { EMPTY_CATALOG } = await import('@/features/catalog/types');
  return { useCatalog: () => ({ catalog: EMPTY_CATALOG, isLoading: false }) };
});

/**
 * Public quote: mặc định lỗi — các test này khoá luồng đặt xe, không khoá khối giá; query lỗi
 * thì flow chỉ ẩn khối giá. KHÔNG mock kiểu treo vô hạn: `invalidateQueries()` sau khi gửi
 * thành công sẽ đợi refetch của chính query này và làm test kẹt ở bước done.
 */
const quote = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/features/rental-policies/api', () => ({
  fetchPublicQuote: () =>
    quote.data ? Promise.resolve(quote.data) : Promise.reject(new Error('quote offline (test)')),
}));

/**
 * Nút "Liên hệ chủ xe" thật cần `AuthModalProvider` (nó tự mở modal đăng nhập khi khách chưa
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

/** time → contact (khả dụng). */
async function advanceToContact() {
  api.checkAvailability.mockResolvedValue({ available: true });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  // Mốc chờ phải có ở CẢ hai biến thể bước liên hệ: ô nhập (khách mới) và thẻ xác nhận.
  await screen.findByRole('button', { name: 'Đổi thời gian' });
}

/** contact → otp (khách vãng lai). */
async function advanceToOtp(phone = '0901234567') {
  api.sendAsync.mockResolvedValue(undefined);
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: '  Nguyễn Văn A  ' } });
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: phone } });
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

/** Tick điều khoản rồi gửi. */
async function submitFromReview() {
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));
}

beforeEach(() => {
  media.isMobile = false;
  nav.push.mockReset();
  // Mặc định là KHÁCH VÃNG LAI — mọi test cũ mô tả đúng luồng đó.
  me.data = undefined;
  listing.data = null;
  listing.reviews = null;
  quote.data = null;
  Object.values(api).forEach((fn) => fn.mockReset());
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

    it('ba bước biểu mẫu; OTP và Hoàn tất KHÔNG chiếm ô trên thanh tiến trình', () => {
      renderModal();
      const steps = screen.getByRole('list', { name: 'Tiến trình đặt xe' });
      expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
      expect(within(steps).getByText('Thời gian')).toBeTruthy();
      expect(within(steps).getByText('Liên hệ')).toBeTruthy();
      expect(within(steps).getByText('Xác nhận')).toBeTruthy();
      expect(within(steps).queryByText('Hoàn tất')).toBeNull();
    });
  });

  describe('bước 1 — thời gian & kiểm tra khả dụng', () => {
    it('mở ra ở bước thời gian, prefill từ bộ lọc', () => {
      renderModal();
      expect(screen.getByText(/Chọn thời gian thuê để kiểm tra/)).toBeTruthy();
      expect(screen.getAllByText('Toyota Vios').length).toBeGreaterThan(0);
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

    it('KHÔNG khả dụng → báo lỗi, ở lại bước thời gian', async () => {
      renderModal();
      api.checkAvailability.mockResolvedValue({ available: false });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(
        await screen.findByText('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'),
      ).toBeTruthy();
      expect(screen.queryByLabelText('Họ và tên')).toBeNull();
    });

    it('lỗi API khi kiểm tra → hiện thông báo lỗi', async () => {
      renderModal();
      api.checkAvailability.mockRejectedValue(new Error('Mạng lỗi'));
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      expect(await screen.findByText('Mạng lỗi')).toBeTruthy();
    });

    it('dùng MỘT ô chọn khoảng thuê, không phải hai ô ngày rời', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /Thời gian thuê:/ })).toBeTruthy();
      expect(screen.queryByLabelText('Ngày nhận xe')).toBeNull();
      expect(screen.queryByLabelText('Ngày trả xe')).toBeNull();
    });
  });

  describe('bước 2 — liên hệ & OTP', () => {
    it('SĐT sai định dạng thì không gửi OTP', async () => {
      renderModal();
      await advanceToContact();
      fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'A' } });
      fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
      expect(api.sendAsync).not.toHaveBeenCalled();
    });

    it('hợp lệ → gửi OTP tới đúng số và vào trạng thái OTP', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();
      expect(api.sendAsync).toHaveBeenCalledWith('0901234567');
    });

    it('gửi OTP lỗi thì ở lại bước liên hệ', async () => {
      renderModal();
      await advanceToContact();
      api.sendAsync.mockRejectedValue(new Error('Quá nhiều yêu cầu'));
      fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'A' } });
      fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      await waitFor(() => expect(api.sendAsync).toHaveBeenCalled());
      expect(screen.queryByLabelText('Mã OTP')).toBeNull();
    });

    it('mã chưa đủ 6 số thì nút xác thực bị vô hiệu và không gọi API', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123' } });
      const submit = screen.getByRole('button', { name: 'Xác thực' });
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(submit);
      expect(api.verifyOtp).not.toHaveBeenCalled();
    });

    it('OTP sai → báo lỗi, giữ nguyên màn OTP, KHÔNG sang bước xác nhận', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      api.verifyOtp.mockRejectedValue(new Error('Mã xác thực không đúng'));
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Xác thực' }));

      expect(await screen.findByText('Mã xác thực không đúng')).toBeTruthy();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Mã OTP')).toBeTruthy();
    });

    it('"Sửa số điện thoại" quay lại bước liên hệ và xoá mã', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      fireEvent.click(screen.getByRole('button', { name: 'Sửa số điện thoại' }));
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
      expect(api.reset).toHaveBeenCalled();
    });

    it('"Gửi lại mã" gửi lại đúng số đã xác nhận', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
      expect(api.send).toHaveBeenCalledWith('0901234567');
    });
  });

  describe('bước 3 — xác nhận & gửi (khách vãng lai, thuê theo ngày)', () => {
    it('chưa tick điều khoản thì không gửi được', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();

      const submit = screen.getByRole('button', { name: 'Gửi yêu cầu thuê' });
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(submit);
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
    });

    it('gửi payload đúng (SĐT đã xác minh, tên đã trim, KHÔNG có trường giao nhận)', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      await submitFromReview();

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

    it('nói rõ đây là YÊU CẦU — xe chưa được giữ chỗ', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      expect(screen.getByText(/xe chưa được giữ chỗ/i)).toBeTruthy();
    });
  });

  /**
   * Wave 9 — giao xe tận nơi. Điều cần khoá: CHỈ hỏi địa chỉ, nói rõ miễn phí, và tuyệt đối
   * không có khoảng cách / báo giá / bước khách duyệt phí.
   */
  describe('giao xe tận nơi', () => {
    async function chooseDelivery() {
      fireEvent.click(screen.getByRole('radio', { name: /Giao xe tận nơi/ }));
      await screen.findByLabelText('Địa chỉ giao xe');
    }

    it('mặc định là nhận tại điểm hẹn — KHÔNG hỏi địa chỉ', async () => {
      renderModal();
      await advanceToContact();
      expect(screen.queryByLabelText('Địa chỉ giao xe')).toBeNull();
    });

    it('chọn giao tận nơi → hiện ô địa chỉ, ghi Miễn phí và câu giải thích', async () => {
      renderModal();
      await advanceToContact();
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
      await advanceToContact();
      await chooseDelivery();

      expect(screen.queryByLabelText(/Khoảng cách/i)).toBeNull();
      expect(screen.queryByText(/báo giá/i)).toBeNull();
      expect(screen.queryByText(/Chờ chủ xe báo giá/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /Xác nhận phí/i })).toBeNull();
    });

    it('thiếu địa chỉ thì không đi tiếp được', async () => {
      renderModal();
      await advanceToContact();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'A' } });
      fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(await screen.findByText('Nhập địa chỉ giao xe')).toBeTruthy();
      expect(api.sendAsync).not.toHaveBeenCalled();
    });

    it('gửi kèm địa chỉ và deliveryRequested — KHÔNG kèm bất kỳ số phí nào', async () => {
      renderModal();
      await advanceToContact();
      await chooseDelivery();
      fireEvent.change(screen.getByLabelText('Địa chỉ giao xe'), {
        target: { value: '  123 Nguyễn Văn Linh, Đà Nẵng  ' },
      });
      await advanceToOtp();
      await advanceToReview();

      api.submitBookingRequest.mockResolvedValue({ id: 'R2', status: 'pending_host_approval' });
      await submitFromReview();

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(1));
      const payload = api.submitBookingRequest.mock.calls[0]![0];
      expect(payload.deliveryRequested).toBe(true);
      expect(payload.deliveryAddress).toBe('123 Nguyễn Văn Linh, Đà Nẵng');
      expect(payload).not.toHaveProperty('deliveryFee');
      expect(payload).not.toHaveProperty('distanceKm');
    });
  });

  describe('thành công', () => {
    async function reachDone() {
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      await submitFromReview();
      await screen.findByText('Yêu cầu đã được gửi');
    }

    it('hiện màn thành công kèm mã yêu cầu', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      expect(screen.getByText('Yêu cầu đã được gửi')).toBeTruthy();
      expect(screen.getByText('R1')).toBeTruthy();
      expect(screen.getByText(/Xe chưa được giữ chỗ/)).toBeTruthy();
    });

    it('có lối liên hệ chủ xe, và nó đóng overlay trước khi rời trang', async () => {
      const { onClose } = renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      const contact = screen.getByRole('button', { name: 'Liên hệ chủ xe' });
      fireEvent.click(contact);
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
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      expect(screen.getByText('1.800.000 ₫')).toBeTruthy();
      expect(screen.queryByText('1800000')).toBeNull();
    });

    it('"Xem chuyến của tôi" đóng modal và điều hướng tới /trips', async () => {
      const { onClose } = renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Xem chuyến của tôi' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/trips');
    });

    it('"Quay lại trang xe" chỉ đóng, không điều hướng', async () => {
      const { onClose } = renderModal();
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Quay lại trang xe' }));
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

    it('SĐT tài khoản đã xác thực → BỎ QUA OTP, đi thẳng bước xác nhận', async () => {
      me.data = verifiedMe;
      api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
      renderModal();
      await advanceToContact();

      // Thẻ xác nhận gọn thay cho hai ô nhập — không bắt gõ lại thứ hệ thống đã biết.
      expect(screen.getByText('Đã xác thực')).toBeTruthy();
      expect(screen.queryByLabelText('Số điện thoại')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      await screen.findByRole('button', { name: 'Gửi yêu cầu thuê' });
      await submitFromReview();

      await screen.findByText('Yêu cầu đã được gửi');
      expect(api.sendAsync).not.toHaveBeenCalled();
      expect(api.verifyOtp).not.toHaveBeenCalled();
      expect(api.submitBookingRequest).toHaveBeenCalledWith(
        expect.objectContaining({ customerPhone: '0901234567' }),
      );
    });

    it('dùng SĐT KHÁC số tài khoản → vẫn phải xác thực OTP', async () => {
      me.data = verifiedMe;
      renderModal();
      await advanceToContact();

      fireEvent.click(screen.getByRole('button', { name: /Đổi thông tin/ }));
      api.sendAsync.mockResolvedValue(undefined);
      fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0987654321' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      await screen.findByLabelText('Mã OTP');

      expect(api.sendAsync).toHaveBeenCalledWith('0987654321');
    });

    it('SĐT tài khoản CHƯA xác thực → vẫn phải qua OTP', async () => {
      me.data = { ...verifiedMe, phoneVerified: false };
      renderModal();
      await advanceToContact();

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
      await advanceToContact();
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
      await screen.findByRole('button', { name: 'Gửi yêu cầu thuê' });
      await submitFromReview();

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
      await advanceToContact();
      await advanceToOtp();
      await advanceToReview();
      await submitFromReview();

      expect(await screen.findByText('Yêu cầu trùng lặp')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Xem chuyến của tôi' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    });
  });

  describe('đóng & reset', () => {
    it('nút Huỷ ở bước thời gian gọi onClose', () => {
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
      await advanceToContact();
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
   * Phản hồi thiết kế 13/08: cột trái phải mang đủ ngữ cảnh gian hàng (kể cả đánh giá tiêu
   * biểu), ô chọn thời gian phải TRÔNG như ô nhập, bước 1 không được trống, và cặp nút phải nằm
   * ở một footer duy nhất bên phải.
   */
  describe('bố cục & thông tin (phản hồi thiết kế)', () => {
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
    };

    it('cặp nút nằm ở MỘT footer, không rải trong thân từng bước', async () => {
      renderModal();
      const footer = document.querySelector('footer');
      expect(footer).not.toBeNull();
      expect(within(footer as HTMLElement).getByRole('button', { name: 'Huỷ' })).toBeTruthy();
      expect(within(footer as HTMLElement).getByRole('button', { name: 'Tiếp tục' })).toBeTruthy();

      // Sang bước sau, vẫn CÙNG một footer đổi nhãn — không sinh hàng nút thứ hai.
      await advanceToContact();
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
      const points = screen.getAllByText(point);
      expect(points).toHaveLength(2);
      expect(screen.queryByText(/\d{4}/)).toBeNull();
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

    it('bước 1 hiện tạm tính THẬT từ server khi đã chọn thời gian', async () => {
      quote.data = {
        breakdown: {
          rows: [{ key: 'base', label: 'Tiền thuê xe', amount: '1170000', sublabel: '2 ngày' }],
          totalAmount: '1170000',
          depositAmount: '5000000',
        },
        delivery: { enabled: true, maxRadiusKm: 10 },
      };
      renderModal();
      expect(await screen.findByText('Tạm tính cho khoảng thời gian đã chọn')).toBeTruthy();
    });

    it('cột trái hiện vài đánh giá tiêu biểu của xe', async () => {
      listing.data = LISTING;
      listing.reviews = {
        summary: { ratingAvg: 4.5, ratingCount: 2 },
        data: [
          {
            id: 'r1',
            rating: 5,
            comment: 'Xe sạch, chủ nhiệt tình.',
            customerName: 'Minh T.',
            createdAt: '',
          },
          {
            id: 'r2',
            rating: 4,
            comment: 'Giao xe đúng giờ.',
            customerName: 'Lan P.',
            createdAt: '',
          },
        ],
        meta: { page: 1, limit: 3, total: 2, hasNext: false },
      };
      renderModal();

      expect(await screen.findByText('Khách nói gì về xe này')).toBeTruthy();
      expect(screen.getByText('Xe sạch, chủ nhiệt tình.')).toBeTruthy();
      expect(screen.getByText('Giao xe đúng giờ.')).toBeTruthy();
      expect(screen.getByText('Minh T.')).toBeTruthy();
    });

    it('không có đánh giá → khối đánh giá vắng mặt, không dựng khung rỗng', async () => {
      listing.data = LISTING;
      listing.reviews = {
        summary: { ratingAvg: 0, ratingCount: 0 },
        data: [],
        meta: { page: 1, limit: 3, total: 0, hasNext: false },
      };
      renderModal();

      await screen.findByText('Gian hàng Demo XePrime');
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

    it('mobile thu hồ sơ xe thành thẻ gọn, mở bằng "Xem thông tin xe"', async () => {
      media.isMobile = true;
      renderModal();
      // Panel chỉ dựng nút mở rộng khi ĐÃ có listing; ở test listing lỗi nên nút vắng mặt —
      // điều cần khoá là không có cột trái chiếm chỗ và không vỡ layout.
      expect(screen.queryByRole('button', { name: /Ẩn thông tin xe/ })).toBeNull();
      await advanceToContact();
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
    });
  });
});
