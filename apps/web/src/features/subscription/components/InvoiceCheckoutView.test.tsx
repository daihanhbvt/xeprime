import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, SHOP_ONBOARDING_STATE, SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import type { SubscriptionInvoice } from '../types';
import { InvoiceCheckoutView } from './InvoiceCheckoutView';

/**
 * TRANG THANH TOÁN một hoá đơn gói — `partner.xeprime.vn/payment/:invoiceId` (13/10/2026).
 *
 * Điều được khoá: trang nói đúng kết cục của CHÍNH hoá đơn trên đường dẫn — còn chờ thì mời trả
 * (không có nút tự khai đã trả), đã trả thì báo gói đã bật, đã huỷ thì mời chọn gói lại ở đúng chỗ
 * theo tuyến — và gói chỉ "đã kích hoạt" khi hoá đơn thật sự `paid` (ADR 0040 điều 3).
 */
const invoice = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const user = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('../hooks/use-subscription', () => ({
  useSubscriptionInvoice: () => invoice,
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
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/features/payment-gateway/api', () => ({
  fetchGatewayMethods: vi
    .fn()
    .mockResolvedValue({ target: 'subscription_invoice', sandbox: false, methods: [] }),
  fetchGatewayOrder: vi.fn(),
  startGatewayCheckout: vi.fn(),
}));

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
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<InvoiceCheckoutView invoiceId="01HINVOICE" />, { wrapper });
}

beforeEach(() => {
  invoice.data = undefined;
  invoice.isPending = false;
  invoice.isError = false;
  invoice.error = null;
  user.data = undefined;
});

describe('InvoiceCheckoutView', () => {
  it('hoá đơn chờ ⇒ mời trả: đang mua gì, đúng mã, QR mang sẵn số + mã', () => {
    invoice.data = makeInvoice();
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Thanh toán gói dịch vụ' })).toBeTruthy();
    expect(screen.getByText('Gói nâng cao')).toBeTruthy();
    expect(screen.getAllByText('XPGWYZZ8TZY').length).toBeGreaterThan(0);
    const qr = Array.from(container.querySelectorAll('img')).find((img) =>
      img.getAttribute('src')?.includes('qr.sepay.vn'),
    );
    expect(qr?.getAttribute('src')).toContain('amount=650000');
    expect(qr?.getAttribute('src')).toContain('des=XPGWYZZ8TZY');
    // Hoá đơn gói KHÔNG có nút tự khai đã trả — gói chỉ bật khi tiền về.
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

  it('hoá đơn đã trả ⇒ gói đã kích hoạt, không còn kênh trả nào', () => {
    invoice.data = makeInvoice({ status: SUBSCRIPTION_INVOICE_STATUS.PAID, paidAmount: '650000' });
    renderPage();

    expect(screen.getByText('Gói đã được kích hoạt')).toBeTruthy();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Vào trang quản lý' })).toBeTruthy();
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
