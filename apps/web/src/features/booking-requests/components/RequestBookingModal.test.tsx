import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestBookingModal } from './RequestBookingModal';

/**
 * Test đặc tả cho luồng ĐẶT XE — workflow rủi ro cao nhất của khu khách.
 *
 * Viết TRƯỚC khi đổi vỏ overlay. Toàn bộ state machine sống trong `RequestBookingFlow`
 * (`dates → contact → otp → done`), còn `RequestBookingModal` chỉ là vỏ. Test đi qua vỏ để
 * khoá cả hai cùng lúc: payload gửi lên API, chặn gửi trùng, reset khi đóng, và điều hướng.
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

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => media.isMobile,
  useMediaQuery: () => media.isMobile,
}));

vi.mock('../api', () => ({
  checkAvailability: (...a: unknown[]) => api.checkAvailability(...a),
  submitBookingRequest: (...a: unknown[]) => api.submitBookingRequest(...a),
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
          pricePerDay="500000"
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

/** dates → contact (khả dụng). */
async function advanceToContact() {
  api.checkAvailability.mockResolvedValue({ available: true });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByLabelText('Họ và tên');
}

/** contact → otp. */
async function advanceToOtp() {
  api.sendAsync.mockResolvedValue(undefined);
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: '  Nguyễn Văn A  ' } });
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByLabelText('Mã OTP');
}

beforeEach(() => {
  media.isMobile = false;
  nav.push.mockReset();
  Object.values(api).forEach((fn) => fn.mockReset());
});

afterEach(cleanup);

describe('RequestBookingModal — luồng đặt xe', () => {
  describe('vỏ overlay', () => {
    it('tiêu đề "Yêu cầu thuê xe" và là dialog có tên khả truy cập', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByText('Yêu cầu thuê xe')).toBeTruthy();
    });

    it('chưa mở thì KHÔNG dựng flow (state reset mỗi lần mở)', () => {
      renderModal(false);
      expect(screen.queryByText('Chọn thời gian thuê để kiểm tra xe còn trống.')).toBeNull();
    });
  });

  describe('bước 1 — chọn ngày & kiểm tra khả dụng', () => {
    it('mở ra ở bước chọn ngày, prefill từ bộ lọc', () => {
      renderModal();
      expect(screen.getByText('Chọn thời gian thuê để kiểm tra xe còn trống.')).toBeTruthy();
      expect(screen.getByText('Toyota Vios')).toBeTruthy();
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

    it('KHÔNG khả dụng → báo lỗi, ở lại bước ngày', async () => {
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

    it('khả dụng → sang bước liên hệ', async () => {
      renderModal();
      await advanceToContact();
      expect(screen.getByLabelText('Họ và tên')).toBeTruthy();
    });
  });

  describe('bước 2 — liên hệ & gửi OTP', () => {
    it('SĐT sai định dạng thì không gửi OTP', async () => {
      renderModal();
      await advanceToContact();
      fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'A' } });
      fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

      expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
      expect(api.sendAsync).not.toHaveBeenCalled();
    });

    it('hợp lệ → gửi OTP tới đúng số và sang bước OTP', async () => {
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
  });

  describe('bước 3 — OTP, gửi yêu cầu', () => {
    it('mã chưa đủ 6 số thì nút bị vô hiệu và không gọi API', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123' } });
      const submit = screen.getByRole('button', { name: 'Gửi yêu cầu thuê' });
      expect((submit as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(submit);
      expect(api.verifyOtp).not.toHaveBeenCalled();
    });

    it('verify rồi submit với payload đúng (SĐT đã xác minh, tên đã trim)', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      api.verifyOtp.mockResolvedValue({});
      api.submitBookingRequest.mockResolvedValue({ id: 'R1' });
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));

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
      });
    });

    it('OTP sai → báo lỗi, KHÔNG gửi yêu cầu, giữ nguyên bước OTP', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      api.verifyOtp.mockRejectedValue(new Error('Mã xác thực không đúng'));
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));

      expect(await screen.findByText('Mã xác thực không đúng')).toBeTruthy();
      expect(api.submitBookingRequest).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Mã OTP')).toBeTruthy();
    });

    it('OTP đã verify rồi mà submit lỗi → bấm lại CHỈ submit, không verify lần hai', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();

      api.verifyOtp.mockResolvedValue({});
      api.submitBookingRequest.mockRejectedValue(new Error('Hệ thống bận'));
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));
      expect(await screen.findByText('Hệ thống bận')).toBeTruthy();

      api.submitBookingRequest.mockResolvedValue({ id: 'R1' });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));

      await waitFor(() => expect(api.submitBookingRequest).toHaveBeenCalledTimes(2));
      // Không xác minh lại mã đã dùng — đây là bảo vệ chống dùng OTP hai lần.
      expect(api.verifyOtp).toHaveBeenCalledTimes(1);
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

  describe('bước 4 — thành công', () => {
    async function reachDone() {
      api.verifyOtp.mockResolvedValue({});
      api.submitBookingRequest.mockResolvedValue({ id: 'R1' });
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));
      await screen.findByText('Yêu cầu thuê xe đã được gửi');
    }

    it('hiện màn thành công', async () => {
      renderModal();
      await advanceToContact();
      await advanceToOtp();
      await reachDone();
      expect(screen.getByText('Yêu cầu thuê xe đã được gửi')).toBeTruthy();
    });

    it('"Xem chuyến của tôi" đóng modal và điều hướng tới /trips', async () => {
      const { onClose } = renderModal();
      await advanceToContact();
      await advanceToOtp();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Xem chuyến của tôi' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/trips');
    });

    it('"Đóng" chỉ đóng, không điều hướng', async () => {
      const { onClose } = renderModal();
      await advanceToContact();
      await advanceToOtp();
      await reachDone();

      fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
      expect(onClose).toHaveBeenCalled();
      expect(nav.push).not.toHaveBeenCalled();
    });
  });

  describe('đóng & reset', () => {
    it('nút Huỷ ở bước ngày gọi onClose', () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    /**
     * Cơ chế reset là `open ? <RequestBookingFlow/> : null` trong vỏ — đóng thì flow bị gỡ,
     * mở lại là instance mới ở bước `dates`.
     *
     * Chỉ khẳng định được VẾ ĐẦU ở đây: mở với `open={false}` thì flow không tồn tại.
     * Vòng đóng-rồi-mở-lại tại chỗ KHÔNG kiểm được trong jsdom — AntD giữ cây con cũ trong
     * DOM cho tới khi hoạt ảnh đóng kết thúc, mà jsdom không chạy CSS transition (đã thử bắn
     * tay `animationEnd`/`transitionEnd` lên toàn bộ cây modal: không đủ). Phần đó nằm ở
     * mục QA thị giác còn nợ, không giả vờ xanh ở đây.
     */
    /**
     * Thay đổi có chủ đích của Wave 1B: trong lúc xác minh OTP / gửi yêu cầu, Esc và bấm nền
     * bị khoá. Trước đây đóng được giữa chừng, khách mất dấu yêu cầu đã gửi hay chưa.
     */
    it('đang gửi yêu cầu thì Esc KHÔNG đóng được', async () => {
      const { onClose } = renderModal();
      await advanceToContact();
      await advanceToOtp();

      // Giữ request treo để trạng thái "đang gửi" tồn tại trong lúc bấm Esc.
      api.verifyOtp.mockReturnValue(new Promise(() => {}));
      fireEvent.change(screen.getByLabelText('Mã OTP'), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));

      await waitFor(() => expect(api.verifyOtp).toHaveBeenCalled());
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('vỏ chỉ dựng flow khi mở (cơ chế reset)', () => {
      renderModal(false);
      expect(screen.queryByText('Chọn thời gian thuê để kiểm tra xe còn trống.')).toBeNull();
      expect(screen.queryByLabelText('Họ và tên')).toBeNull();
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
      expect(within(screen.getByRole('dialog')).getByText('Yêu cầu thuê xe')).toBeTruthy();
    });
  });
});
