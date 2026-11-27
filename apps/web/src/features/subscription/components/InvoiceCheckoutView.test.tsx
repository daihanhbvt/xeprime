import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, SHOP_ONBOARDING_STATE, SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';
import type { SubscriptionInvoice } from '../types';
import { CheckoutPaymentView, InvoiceCheckoutView } from './InvoiceCheckoutView';

/**
 * TRANG THANH TOÁN một hoá đơn gói - `partner.xeprime.vn/payment/:invoiceId` (13/10/2026).
 *
 * Điều được khoá: trang nói đúng kết cục của CHÍNH hoá đơn trên đường dẫn - còn chờ thì mời trả
 * (không có nút tự khai đã trả), đã trả thì báo gói đã bật, đã huỷ thì mời chọn gói lại ở đúng chỗ
 * theo tuyến - và gói chỉ "đã kích hoạt" khi hoá đơn thật sự `paid` (ADR 0040 điều 3).
 */
const invoice = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const checkout = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const gatewayApi = vi.hoisted(() => ({
  fetchGatewayMethods: vi.fn(),
  fetchGatewayOrder: vi.fn(),
  startGatewayCheckout: vi.fn(),
}));
const user = vi.hoisted(() => ({ data: undefined as unknown }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));

vi.mock('../hooks/use-subscription', () => ({
  useSubscriptionInvoice: () => invoice,
  // Trang hoá đơn lẻ không đọc phiếu gộp - hook vẫn được gọi (tắt) theo luật hooks.
  useSubscriptionCheckout: () => checkout,
  usePaymentInfo: () => ({
    data: {
      configured: true,
      bankCode: 'VCB',
      accountNumber: '0123456789',
      accountName: 'XE PRIME',
    },
  }),
  useTenantPlans: () => ({ data: [{ id: 'plan-advanced', name: 'Gói nâng cao' }] }),
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => user }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ has: () => true }) }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => router,
}));
vi.mock('@/features/payment-gateway/api', () => gatewayApi);

const NO_WALLETS = { target: 'subscription_invoice', sandbox: false, methods: [] };
const BOTH_WALLETS = {
  target: 'subscription_invoice',
  sandbox: true,
  methods: [
    { provider: 'momo', minAmount: '1000', maxAmount: '50000000' },
    { provider: 'vnpay', minAmount: '5000', maxAmount: null },
  ],
};

function makeInvoice(over: Partial<SubscriptionInvoice> = {}): SubscriptionInvoice {
  return {
    id: '01HINVOICE',
    code: 'XPGWYZZ8TZY',
    planId: 'plan-advanced',
    planCode: 'shop-advanced',
    termMonths: 3,
    quota: { maxVehicles: 10, maxBranches: 3, maxMembers: null },
    status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
    totalAmount: '650000',
    paidAmount: '0',
    subtotal: '650000',
    discountAmount: '0',
    periodFrom: '2026-12-22T00:00:00.000Z',
    periodTo: '2027-03-22T00:00:00.000Z',
    expiresAt: '2026-10-16T02:07:00.000Z',
    createdAt: '2026-10-13T02:07:00.000Z',
    ...over,
  } as SubscriptionInvoice;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
  return render(<InvoiceCheckoutView invoiceId="01HINVOICE" />, { wrapper });
}

function renderCheckoutPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <App>{children}</App>
    </QueryClientProvider>
  );
  return render(<CheckoutPaymentView checkoutId="01HCHECKOUT" />, { wrapper });
}

beforeEach(() => {
  invoice.data = undefined;
  invoice.isPending = false;
  invoice.isError = false;
  invoice.error = null;
  checkout.data = undefined;
  user.data = undefined;
  router.replace.mockClear();
  gatewayApi.fetchGatewayMethods.mockReset().mockResolvedValue(NO_WALLETS);
  gatewayApi.startGatewayCheckout.mockReset();
});

describe('InvoiceCheckoutView', () => {
  it('hoá đơn chờ ⇒ mời trả: đang mua gì, đúng mã, QR mang sẵn số + mã', () => {
    invoice.data = makeInvoice();
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Thanh toán gói dịch vụ' })).toBeTruthy();
    expect(screen.getByText(/Gói nâng cao/)).toBeTruthy();
    expect(screen.getAllByText('XPGWYZZ8TZY').length).toBeGreaterThan(0);
    const qr = Array.from(container.querySelectorAll('img')).find((img) =>
      img.getAttribute('src')?.includes('qr.sepay.vn'),
    );
    expect(qr?.getAttribute('src')).toContain('amount=650000');
    expect(qr?.getAttribute('src')).toContain('des=XPGWYZZ8TZY');
    // Hoá đơn gói KHÔNG có nút tự khai đã trả - gói chỉ bật khi tiền về.
    expect(screen.queryByRole('button', { name: /đã chuyển khoản/i })).toBeNull();
  });

  it('đã nhận một phần ⇒ số lớn là phần CÒN THIẾU', () => {
    invoice.data = makeInvoice({
      status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
      paidAmount: '150000',
    });
    const { container } = renderPage();

    expect(screen.getByText('Còn phải chuyển')).toBeTruthy();
    const qr = Array.from(container.querySelectorAll('img')).find((img) =>
      img.getAttribute('src')?.includes('qr.sepay.vn'),
    );
    expect(qr?.getAttribute('src')).toContain('amount=500000');
  });

  /*
   * Biên bản họp 19/11/2026: KHÔNG còn màn "Thanh toán thành công" riêng — thông báo góc phải rồi
   * về trang "Gói & hạn mức", nơi gói vừa bật hiện trạng thái mới.
   */
  it('hoá đơn đã trả ⇒ thông báo gói đã bật rồi về trang gói, không còn kênh trả nào', async () => {
    invoice.data = makeInvoice({ status: SUBSCRIPTION_INVOICE_STATUS.PAID, paidAmount: '650000' });
    renderPage();

    expect(await screen.findByText('Gói đã được kích hoạt')).toBeTruthy();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Vào trang quản lý' })).toBeNull();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(shopSectionPath(SHOP_SECTION.PLAN)),
    );
  });

  it('hoá đơn đã huỷ, gian hàng đang nợ bước đầu ⇒ chọn gói lại ở ONBOARDING', () => {
    invoice.data = makeInvoice({ status: SUBSCRIPTION_INVOICE_STATUS.VOID });
    user.data = {
      tenant: {
        id: 'T1',
        status: 'active',
        role: 'shop_owner',
        billingMode: null,
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
      },
      platformRole: null,
    };
    renderPage();

    expect(screen.getByText('Hoá đơn này không còn nhận thanh toán')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chọn gói' }).getAttribute('href')).toBe(
      '/manage/onboarding',
    );
  });

  it('hoá đơn nằm trong PHIẾU GỘP ⇒ chuyển sang trang phiếu, không hiện mã XPG hay số của một gói', () => {
    invoice.data = makeInvoice({ checkoutId: '01HCHECKOUT', checkoutCode: 'XPCABCDEFGH' });
    renderPage();

    expect(router.replace).toHaveBeenCalledWith('/manage/payment/checkout/01HCHECKOUT');
    expect(screen.queryByText('XPGWYZZ8TZY')).toBeNull();
    expect(screen.queryByText(/650.000/)).toBeNull();
  });

  /*
   * QC 27/11/2026 (#22): mua ô tô + xe máy một lần ⇒ phiếu gộp `XPC…` chỉ có VietQR. Từ ADR 0083
   * điều 6 (sửa 27/11) phiếu có đích cổng riêng: ví điện tử hiện như hoá đơn lẻ, và phiên mở cho CẢ
   * phiếu - không bao giờ cho một hoá đơn con (trả nửa lượt mua).
   */
  it('PHIẾU GỘP ⇒ có ví điện tử MoMo/VNPAY, phiên mở theo phiếu chứ không theo hoá đơn con', async () => {
    gatewayApi.fetchGatewayMethods.mockResolvedValue(BOTH_WALLETS);
    gatewayApi.startGatewayCheckout.mockResolvedValue({ id: 'ORDER1', checkoutUrl: null });
    checkout.data = {
      id: '01HCHECKOUT',
      tenantId: 'T1',
      code: 'XPCABCDEFGH',
      totalAmount: '1300000',
      paidAmount: '0',
      status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      expiresAt: '2099-01-01T00:00:00.000Z',
      invoices: [
        makeInvoice({ checkoutId: '01HCHECKOUT' }),
        makeInvoice({ id: '01HINVOICE2', code: 'XPGSECOND01', checkoutId: '01HCHECKOUT' }),
      ],
    };
    renderCheckoutPage();

    fireEvent.click(await screen.findByRole('button', { name: /ví điện tử/i }));
    expect(screen.getByRole('radio', { name: /momo/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /vnpay/i }));
    fireEvent.click(screen.getByRole('button', { name: /thanh toán qua vnpay/i }));

    await waitFor(() => expect(gatewayApi.startGatewayCheckout).toHaveBeenCalled());
    expect(gatewayApi.startGatewayCheckout).toHaveBeenCalledWith(
      { kind: 'checkout', checkoutId: '01HCHECKOUT' },
      expect.objectContaining({ provider: 'vnpay' }),
    );
  });

  it('hoá đơn không thuộc gian hàng này ⇒ không tìm thấy, không thử lại', () => {
    invoice.isError = true;
    invoice.error = new ApiClientError({
      code: API_ERROR_CODE.NOT_FOUND,
      message: 'x',
      status: 404,
    });
    renderPage();

    expect(screen.getByText('Không tìm thấy hoá đơn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /thử lại/i })).toBeNull();
  });
});
