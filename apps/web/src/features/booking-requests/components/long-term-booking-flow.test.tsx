import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LONG_TERM_PACKAGE_MONTHS } from '@xeprime/types';
import { RequestBookingModal } from './RequestBookingModal';

/**
 * Đặc tả UI của luồng THUÊ DÀI HẠN theo GÓI CỐ ĐỊNH (ADR 0011).
 *
 * Những gì phải KHÔNG còn: ô chọn khoảng ngày, ngày trả do khách nhập, badge phần trăm nổi trên
 * gói, giá tự lái và khuyến mãi tự lái trong panel, dòng "tiết kiệm so với thuê theo ngày".
 * Những gì phải CÓ: đúng sáu gói kèm tiền thật, hai nguyện vọng nhận xe, và payload gửi lên
 * mang gói + nguyện vọng chứ không mang lịch.
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

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('../api', () => ({
  checkAvailability: (...a: unknown[]) => api.checkAvailability(...a),
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
vi.mock('@/features/catalog/use-catalog', async () => {
  const { EMPTY_CATALOG } = await import('@/features/catalog/types');
  return { useCatalog: () => ({ catalog: EMPTY_CATALOG, isLoading: false }) };
});

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
vi.mock('@/features/phone-verification/components/OtpCodeInput', () => ({
  OtpCodeInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Mã OTP" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App>
        <RequestBookingModal
          vehicleId="V1"
          vehicleName="Kia Carnival 2025"
          open
          onClose={vi.fn()}
        />
      </App>
    </QueryClientProvider>,
  );
}

/** Chờ hồ sơ xe về rồi chuyển sang tab Thuê dài hạn. */
async function openLongTerm() {
  renderModal();
  const tab = await screen.findByText('Thuê dài hạn');
  fireEvent.click(tab);
  await screen.findByRole('radiogroup', { name: 'Gói thuê dài hạn' });
}

beforeEach(() => {
  nav.push.mockReset();
  quoteCalls.length = 0;
  Object.values(api).forEach((fn) => fn.mockReset());
});

afterEach(cleanup);

describe('Thuê dài hạn — chọn GÓI thay cho chọn khoảng ngày', () => {
  it('không có ô chọn khoảng thuê và không có ngày trả để khách nhập', async () => {
    await openLongTerm();

    expect(screen.queryByText('Thời gian thuê')).toBeNull();
    expect(screen.queryByText('TRẢ XE')).toBeNull();
    // "Tuỳ chỉnh" (thời lượng tự do) đã bị bỏ hẳn khỏi mô hình gói.
    expect(screen.queryByText(/Tuỳ chỉnh/)).toBeNull();
  });

  it('đúng SÁU gói, mỗi gói mang % ƯU ĐÃI CAM KẾT của chính gói đó', async () => {
    await openLongTerm();

    const group = screen.getByRole('radiogroup', { name: 'Gói thuê dài hạn' });
    const options = within(group).getAllByRole('radio');
    expect(options).toHaveLength(LONG_TERM_PACKAGE_MONTHS.length);
    // % trên thẻ là mốc ưu đãi thời hạn của gói (server tính), KHÔNG phải so với giá thuê ngày.
    expect(options.map((o) => o.textContent)).toEqual([
      '-5%1 tháng',
      '-5%2 tháng',
      '-15%3 tháng',
      '-20%6 tháng',
      '-20%9 tháng',
      '-20%12 tháng',
    ]);
  });

  /**
   * Tiền của gói nằm ở khối giá dùng chung dưới đáy cột (một chỗ duy nhất cho cả luồng), không
   * còn ở một khối "Tóm tắt lựa chọn" riêng của bước dài hạn — trước đây hai khối cùng dựng từ
   * một `quote` nên cùng một con số hiện hai lần cạnh nhau.
   */
  it('chọn gói → khối giá hiện TIỀN THẬT của gói đó', async () => {
    await openLongTerm();
    fireEvent.click(screen.getByRole('radio', { name: /9 tháng/ }));

    // Thu gọn: chỉ tổng của gói.
    expect(await screen.findByText('86.400.000 ₫')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Chi tiết/ }));

    const detail = await screen.findByLabelText('Chi tiết giá gói 9 tháng');
    expect(within(detail).getByText('Giá cơ sở gói 9 tháng')).toBeTruthy();
    expect(within(detail).getByText('108.000.000 ₫')).toBeTruthy();
    expect(within(detail).getByText('Ưu đãi cam kết 9 tháng (20%)')).toBeTruthy();
    expect(within(detail).getByText('-21.600.000 ₫')).toBeTruthy();
  });

  it('không có gói 4/5/7/8/10/11 tháng', async () => {
    await openLongTerm();
    const group = screen.getByRole('radiogroup', { name: 'Gói thuê dài hạn' });
    for (const invalid of [4, 5, 7, 8, 10, 11]) {
      expect(within(group).queryByText(`${invalid} tháng`)).toBeNull();
    }
  });

  it('chọn gói → báo giá hỏi SERVER theo gói, không gửi ngày nào', async () => {
    await openLongTerm();
    fireEvent.click(screen.getByRole('radio', { name: /9 tháng/ }));

    await waitFor(() => expect(quoteCalls.length).toBeGreaterThan(0));
    expect(quoteCalls.at(-1)).toEqual({ serviceType: 'long_term', packageMonths: 9 });
  });

  it('câu "tiết kiệm" so với GIÁ GỐC CỦA GÓI, không so với giá thuê theo ngày', async () => {
    await openLongTerm();
    fireEvent.click(screen.getByRole('radio', { name: /9 tháng/ }));

    fireEvent.click(await screen.findByRole('button', { name: /Chi tiết/ }));
    await screen.findByLabelText('Chi tiết giá gói 9 tháng');
    expect(screen.getByText(/Tiết kiệm .* nhờ ưu đãi thời hạn 9 tháng/)).toBeTruthy();
    expect(screen.queryByText(/so với thuê theo ngày/)).toBeNull();
    // Con số "tiết kiệm" bịa từ chênh lệch giá ngày (67.500.000) không được xuất hiện.
    expect(screen.queryByText(/67\.500\.000/)).toBeNull();
  });

  it('panel xe KHÔNG hiện giá tự lái hay khuyến mãi tự lái khi đang chọn dài hạn', async () => {
    await openLongTerm();

    expect(screen.queryByText('585.000 ₫')).toBeNull();
    expect(screen.queryByText('-10%')).toBeNull();
    // Panel nói giá của GÓI đang chọn (mặc định 1 tháng), không phải giá tự lái theo ngày.
    expect(screen.getAllByText('11.400.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByText('/1 tháng')).toBeTruthy();
  });

  it('badge % chỉ nằm trên THẺ GÓI — tab dịch vụ sạch', async () => {
    await openLongTerm();

    // Badge suy từ chênh lệch giá ngày ↔ giá tháng (mô hình cũ) không được tồn tại ở đâu cả.
    expect(screen.queryByText('-38%')).toBeNull();

    const tab = screen.getByText('Thuê dài hạn').closest('label');
    expect(tab?.textContent).toBe('Thuê dài hạn');

    // Còn trên thẻ gói thì badge % là hợp lệ: đó là mốc ưu đãi cam kết của gói.
    const group = screen.getByRole('radiogroup', { name: 'Gói thuê dài hạn' });
    expect(within(group).getAllByText('-20%').length).toBe(3);
  });
});

describe('Thuê dài hạn — nguyện vọng nhận xe', () => {
  it('mặc định là khoảng linh hoạt; bấm "ngày cụ thể" mở LỊCH ngay, không thêm ô nhập', async () => {
    await openLongTerm();

    expect(screen.getByRole('radio', { name: 'Trong 7 ngày tới' })).toBeTruthy();
    expect(
      screen.getByText('Gian hàng sẽ xác nhận ngày và giờ nhận xe trong 7 ngày tới.'),
    ).toBeTruthy();
    // Chưa bấm: không có lịch nào đang mở.
    expect(document.querySelector('.ant-picker-dropdown')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Chọn ngày cụ thể' }));

    expect(screen.getByText('Gian hàng sẽ xác nhận giờ nhận xe.')).toBeTruthy();
    // Lịch bật ra ngay từ cú bấm đó — khách không phải bấm thêm một ô nhập nữa.
    await waitFor(() => expect(document.querySelector('.ant-picker-dropdown')).toBeTruthy());
  });

  it('gửi yêu cầu: payload mang GÓI + nguyện vọng, KHÔNG mang ngày nhận/trả', async () => {
    api.submitBookingRequest.mockResolvedValue({ id: 'R1', status: 'pending_host_approval' });
    api.sendAsync.mockResolvedValue(undefined);
    api.verifyOtp.mockResolvedValue({});
    await openLongTerm();

    fireEvent.click(screen.getByRole('radio', { name: /6 tháng/ }));
    // Gói và liên hệ nằm cùng MỘT bước — một cú Tiếp tục là sang thẳng xác thực.
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    fireEvent.change(await screen.findByLabelText('Mã OTP'), { target: { value: '123456' } });
    // Dài hạn KHÔNG gọi check-availability: chưa có khung giờ nào để kiểm (ADR 0006).
    expect(api.checkAvailability).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác thực' }));
    await screen.findByRole('button', { name: 'Gửi yêu cầu thuê' });

    // Bước xác nhận nói GÓI và NGUYỆN VỌNG, không hiện một lịch giả.
    expect(screen.getByText('Gói thuê')).toBeTruthy();
    expect(screen.getByText('Nguyện vọng nhận xe')).toBeTruthy();
    expect(screen.queryByText('Trả xe')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' }));

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
    expect(payload.pickupWindowEndDate).toBeUndefined();
  });

  it('gói 1 tháng được chọn sẵn — mở ra là đã có giá thật để so', async () => {
    await openLongTerm();

    const group = screen.getByRole('radiogroup', { name: 'Gói thuê dài hạn' });
    const checked = within(group)
      .getAllByRole('radio')
      .filter((o) => o.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]!.textContent).toContain('1 tháng');

    // Và báo giá của gói mặc định được hỏi ngay, không đợi khách bấm.
    await waitFor(() => expect(quoteCalls.length).toBeGreaterThan(0));
    expect(quoteCalls[0]).toEqual({ serviceType: 'long_term', packageMonths: 1 });
  });
});
