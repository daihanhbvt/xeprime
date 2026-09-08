import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  PAYMENT_METHOD,
  PERMISSION,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { financeApi, receiptsApi, type Receipt } from '@/features/finance/api';
import { CustomerFinancePanel } from './CustomerFinancePanel';

/**
 * ĐỒNG HỒ GIẢ — bắt buộc ở mọi file test có RENDER biểu đồ.
 *
 * `BarChart` hẹn một `setTimeout(labelsAppear, animationDuration)` lúc gắn rồi chạy tiếp một
 * `Animated.timing` 500ms, và không prop nào tắt được (`isAnimated={false}` chỉ tắt animation của
 * cột). Cái hẹn đó sống lâu hơn cả môi trường jest: test xong, môi trường bị dỡ, callback mới
 * chạy — worker chết kèm một stack không trỏ vào test nào, hoặc jest treo không thoát.
 */
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const mockPush = jest.fn();
const CUSTOMER_ID = '01JQZX0000000000000000000C';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  /* Chạy callback lúc mount, cleanup lúc unmount — đủ để mô phỏng "màn đang focus". */
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: '01JQZX0000000000000000000R',
    receiptNo: 'PT-0009',
    type: RECEIPT_TYPE.INCOME,
    status: RECEIPT_STATUS.APPROVED,
    source: RECEIPT_SOURCE.PAYMENT,
    amount: '2000000',
    paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
    categoryId: 'cat-1',
    categoryName: 'Thanh toán đơn',
    bookingId: 'b1',
    bookingCode: 'BK-0042',
    vehicleId: 'v1',
    vehicleName: 'Vios',
    plateNumber: '51A-12345',
    tenantCustomerId: CUSTOMER_ID,
    customerName: 'Trần Thị Bình',
    description: null,
    occurredAt: '2026-09-02T02:00:00.000Z',
    createdAt: '2026-09-02T02:00:00.000Z',
    ...over,
  } as Receipt;
}

async function renderPanel(options: { total?: number } = {}) {
  const total = options.total ?? 1;

  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: 'u1',
    displayName: 'Kế toán',
    email: 'ketoan@xeprime.test',
    avatarUrl: null,
    phone: '0902222222',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: 't1',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_staff',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions: [PERMISSION.FINANCE_VIEW, PERMISSION.CUSTOMER_VIEW],
  } as authApi.CurrentUser);

  const summarySpy = jest.spyOn(financeApi, 'summary').mockResolvedValue({
    totalIncome: '2000000',
    totalExpense: '0',
    balance: '2000000',
    revenue: '2000000',
    cost: '0',
    unassignedCost: '0',
    unassignedRevenue: '0',
    profit: '2000000',
    profitMarginPercent: 100,
    depositHeld: '0',
    depositHeldBookings: 0,
    totalDebt: '500000',
    debtBookings: 1,
    trips: 3,
  } as never);
  jest.spyOn(financeApi, 'series').mockResolvedValue({ granularity: 'day', buckets: [] });
  const listSpy = jest.spyOn(receiptsApi, 'list').mockResolvedValue({
    items: [receipt()],
    meta: { page: 1, limit: 10, total, hasNext: total > 10 },
  });
  const detailSpy = jest.spyOn(receiptsApi, 'detail').mockResolvedValue({
    ...receipt(),
    referenceCode: null,
    requestedByName: 'Nhân viên A',
    approvedByName: null,
    approvedAt: null,
    cancelledByName: null,
    cancelledAt: null,
    attachments: [],
    updatedAt: '2026-09-02T02:00:00.000Z',
  } as never);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <CustomerFinancePanel customerId={CUSTOMER_ID} />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, summarySpy, listSpy, detailSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/**
 * Tab "Thu chi" của hồ sơ khách — nợ kỹ thuật CUS đóng ở đợt Finance.
 *
 * Hai điều được khoá lại: thẻ phiếu mở CHÍNH màn chi tiết dùng chung (không có bản riêng cho
 * khách), và "Xem tất cả" mang theo đúng phạm vi khách sang sổ Thu-Chi.
 */
describe('CustomerFinancePanel', () => {
  it('khối tiền theo kỳ dùng ĐÚNG endpoint tổng quan, chỉ thêm mệnh đề thu hẹp', async () => {
    const { summarySpy } = await renderPanel();

    await waitFor(() => expect(summarySpy).toHaveBeenCalled());
    expect(summarySpy.mock.calls[0]![1]).toEqual({ tenantCustomerId: CUSTOMER_ID });
  });

  it('khách hiện Doanh thu · Còn nợ · Số chuyến — KHÔNG hiện chi phí/lợi nhuận', async () => {
    const { findByText, queryByText } = await renderPanel();

    expect(await findByText('Doanh thu')).toBeTruthy();
    expect(await findByText('Còn nợ')).toBeTruthy();
    expect(await findByText('Số chuyến')).toBeTruthy();
    expect(queryByText('Chi phí')).toBeNull();
    expect(queryByText('Lợi nhuận')).toBeNull();
  });

  it('nói rõ con số này khác "Tổng giá trị thuê" ở đầu hồ sơ', async () => {
    const { findByText } = await renderPanel();
    expect(await findByText(/Tổng giá trị thuê/)).toBeTruthy();
  });

  it('thẻ phiếu mở CHI TIẾT dùng chung — không dựng màn chi tiết riêng cho khách', async () => {
    const { findByLabelText, detailSpy, findByText } = await renderPanel();

    await fireEvent.press(await findByLabelText('PT-0009 · + 2.000.000 ₫'));

    await waitFor(() => expect(detailSpy).toHaveBeenCalledWith('01JQZX0000000000000000000R'));
    // Đúng khối "Dấu vết" của `ReceiptDetailSheet`, không phải một bản chép tay.
    /* `BlockTitle` viết hoa tiêu đề khối — HOA/thường là trình bày, message vẫn giữ chữ thường. */
    expect(await findByText('DẤU VẾT')).toBeTruthy();
  });

  it('"Xem tất cả" mang theo ĐÚNG phạm vi khách sang sổ Thu-Chi', async () => {
    const { findByText } = await renderPanel({ total: 12 });

    await fireEvent.press(await findByText(/Xem tất cả/));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/receipts',
      params: { tenantCustomerId: CUSTOMER_ID },
    });
  });

  it('"Xem trên sổ Thu-Chi" mang phạm vi + kỳ + đã duyệt, KHÔNG mang độ mịn biểu đồ', async () => {
    const { findByText } = await renderPanel();

    await fireEvent.press(await findByText('Xem trên sổ Thu-Chi'));

    const href = mockPush.mock.calls[0]![0] as { params: Record<string, string> };
    expect(href.params.tenantCustomerId).toBe(CUSTOMER_ID);
    expect(href.params.status).toBe('approved');
    expect(href.params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(href.params.granularity).toBeUndefined();
  });

  it('hồ sơ khách KHÔNG có lối tạo phiếu — tiền của khách luôn đi qua một chuyến', async () => {
    const { queryByText, findByText } = await renderPanel();

    await findByText('Doanh thu');
    expect(queryByText('Tạo phiếu thu/chi')).toBeNull();
  });
});
