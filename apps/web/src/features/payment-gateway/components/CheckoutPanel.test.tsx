import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_GATEWAY_CLIENT } from '@xeprime/types';
import type { PaymentGatewayMethods } from '../types';
import { CheckoutPanel } from './CheckoutPanel';

/**
 * Thân TRANG THANH TOÁN — chung cho tiền giữ chỗ và hoá đơn gói.
 *
 * Bốn điều được khoá, và cả bốn đều hỏng thành TIỀN nếu sai:
 *
 *  1. **QR mang sẵn số tiền + nội dung**, và nội dung luôn hiện, chép được — nó là khoá đối soát;
 *     chưa cấu hình tài khoản nhận thì KHÔNG dựng QR trỏ vào hư không, ảnh hỏng thì nói thẳng.
 *  2. **Không có nút tự khai "Tôi đã chuyển khoản"** — tiền về thì realtime tự lật trang, giao
 *     dịch hỏng là hỏng; một nút "báo đã trả" không thay được tiền (ADR 0044 điều 2).
 *  3. **Ví điện tử chỉ hiện khi server nói có kênh mở** — không có nút xám "sắp có".
 *  4. **Mở phiên cổng chỉ gửi kênh** — số tiền và mã do server đọc từ DB, không đi từ đây.
 */
const api = vi.hoisted(() => ({
  fetchGatewayMethods: vi.fn(),
  startGatewayCheckout: vi.fn(),
  fetchGatewayOrder: vi.fn(),
}));

vi.mock('../api', () => api);

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true }),
}));

const ACCOUNT = {
  configured: true,
  bankCode: 'VCB',
  accountNumber: '0123456789',
  accountName: 'CONG TY XEPRIME',
};

const NO_WALLETS: PaymentGatewayMethods = { target: 'booking_hold', sandbox: false, methods: [] };
const VNPAY: PaymentGatewayMethods = {
  target: 'booking_hold',
  sandbox: true,
  methods: [{ provider: 'vnpay', minAmount: null, maxAmount: null }],
} as PaymentGatewayMethods;

function renderPanel(props: Partial<Parameters<typeof CheckoutPanel>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <CheckoutPanel
      target={{ kind: 'trip', tripId: '01TRIP' }}
      amount="140800"
      code="XPH23456789"
      account={ACCOUNT}
      amountLabel="Tiền giữ chỗ"
      details={<p>Hyundai Accent 2021</p>}
      {...props}
    />,
    { wrapper },
  );
}

beforeEach(() => {
  api.fetchGatewayMethods.mockReset().mockResolvedValue(NO_WALLETS);
  api.startGatewayCheckout.mockReset();
});

describe('CheckoutPanel — chuyển khoản VietQR', () => {
  it('mở sẵn chuyển khoản: QR mang sẵn số tiền + nội dung, mã hiện cả ở thẻ tóm tắt', () => {
    const { container } = renderPanel();

    const src = container.querySelector('img')!.getAttribute('src')!;
    // QR phải mang SẴN số tiền và nội dung — khách không gõ gì (ADR 0016 điều 5).
    expect(src).toContain('acc=0123456789');
    expect(src).toContain('bank=VCB');
    expect(src).toContain('amount=140800');
    expect(src).toContain('des=XPH23456789');
    // Một lần trong bảng chuyển khoản, một lần ở "Mã thanh toán" của thẻ tóm tắt.
    expect(screen.getAllByText('XPH23456789')).toHaveLength(2);
  });

  it('chưa cấu hình tài khoản nhận ⇒ KHÔNG có QR nhưng vẫn có mã + số tiền', () => {
    const { container } = renderPanel({
      account: { configured: false, bankCode: null, accountNumber: null, accountName: null },
    });

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/chưa có mã qr/i)).toBeTruthy();
    expect(screen.getAllByText('XPH23456789').length).toBeGreaterThan(0);
  });

  it('ảnh QR lỗi ⇒ nói thẳng và chỉ sang thông tin chuyển tay', () => {
    const { container } = renderPanel();

    fireEvent.error(container.querySelector('img')!);

    expect(screen.getByText(/không tải được mã qr/i)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText('XPH23456789').length).toBeGreaterThan(0);
  });

  /**
   * Không có nút tự khai đã trả: chuyển khoản do webhook đối soát xác nhận, và thông báo realtime
   * lật trang ngay khi tiền về. Một nút "Tôi đã chuyển khoản" chỉ là lời mời hiểu nhầm rằng bấm nó
   * thay được cho tiền.
   */
  it('chuyển khoản KHÔNG có nút "Tôi đã chuyển khoản" — chỉ nói hệ thống tự xác nhận', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /đã chuyển khoản/i })).toBeNull();
    expect(screen.getByText(/tự xác nhận ngay khi tiền về/i)).toBeTruthy();
  });
});

describe('CheckoutPanel — ví điện tử', () => {
  it('server không mở kênh nào ⇒ KHÔNG có nhóm ví điện tử', async () => {
    renderPanel();
    await waitFor(() => expect(api.fetchGatewayMethods).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /ví điện tử/i })).toBeNull();
  });

  it('có VNPAY ⇒ chọn ví rồi bấm — chỉ gửi KÊNH, không gửi số tiền hay mã', async () => {
    api.fetchGatewayMethods.mockResolvedValue(VNPAY);
    api.startGatewayCheckout.mockResolvedValue({ id: 'ORDER1', checkoutUrl: null });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /ví điện tử/i }));
    expect(screen.getByText('Môi trường thử')).toBeTruthy();

    // Chưa chọn ví thì nút thanh toán chưa bấm được.
    const submit = screen.getByRole('button', { name: /^thanh toán$/i });
    expect(submit.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /vnpay/i }));
    fireEvent.click(screen.getByRole('button', { name: /thanh toán qua vnpay/i }));

    await waitFor(() => expect(api.startGatewayCheckout).toHaveBeenCalled());
    expect(api.startGatewayCheckout).toHaveBeenCalledWith(
      { kind: 'trip', tripId: '01TRIP' },
      { provider: 'vnpay', client: PAYMENT_GATEWAY_CLIENT.WEB, locale: 'vi' },
    );
    // Cổng không trả liên kết ⇒ nói thẳng, không im lặng quay nút.
    expect(await screen.findByText(/chưa trả về liên kết thanh toán/i)).toBeTruthy();
  });

  /**
   * Logo CHÍNH THỨC của từng ví, đúng file gốc (`provider-logos.ts`). VNPAY đổi bản theo ngôn ngữ
   * ("Cổng thanh toán" / "Payment Gateway") — đúng logo khách thấy ở trang cổng ngay sau đó.
   */
  it('thẻ ví mang logo chính thức của cổng, kèm tên ví làm nhãn', async () => {
    api.fetchGatewayMethods.mockResolvedValue({
      ...VNPAY,
      methods: [
        { provider: 'momo', minAmount: null, maxAmount: null },
        { provider: 'vnpay', minAmount: null, maxAmount: null },
      ],
    });
    const { container } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /ví điện tử/i }));

    // PNG đi qua bộ tối ưu ảnh của Next (`/_next/image?url=…`) — giải mã trước khi so.
    const sources = Array.from(container.querySelectorAll('img')).map((img) =>
      decodeURIComponent(img.getAttribute('src') ?? ''),
    );
    expect(sources.some((src) => src.includes('/payment-methods/momo.png'))).toBe(true);
    expect(sources.some((src) => src.includes('/payment-methods/vnpay-vi.svg'))).toBe(true);
    expect(screen.getByRole('radio', { name: /ví momo/i })).toBeTruthy();
  });

  it('số tiền vượt hạn mức của ví ⇒ nói hạn mức, nút không bấm được', async () => {
    api.fetchGatewayMethods.mockResolvedValue({
      ...VNPAY,
      methods: [{ provider: 'vnpay', minAmount: '200000', maxAmount: '50000000' }],
    });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /ví điện tử/i }));
    fireEvent.click(screen.getByRole('radio', { name: /vnpay/i }));

    expect(screen.getByText(/chỉ nhận từ/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /thanh toán qua vnpay/i }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('hạn giữ chỗ còn quá ngắn ⇒ không mời mở phiên ví, chỉ sang chuyển khoản', async () => {
    api.fetchGatewayMethods.mockResolvedValue(VNPAY);
    renderPanel({ deadline: new Date(Date.now() + 60_000).toISOString() });

    fireEvent.click(await screen.findByRole('button', { name: /ví điện tử/i }));

    expect(screen.getByText(/còn quá ngắn/i)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /vnpay/i })).toBeNull();
  });

  it('`gatewayEnabled=false` (đang có lượt cổng dở) ⇒ không hỏi kênh, không có nhóm ví', () => {
    api.fetchGatewayMethods.mockResolvedValue(VNPAY);
    renderPanel({ gatewayEnabled: false });

    expect(api.fetchGatewayMethods).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /ví điện tử/i })).toBeNull();
  });
});
