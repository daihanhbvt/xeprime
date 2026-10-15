import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
} from '@xeprime/types';
import { paymentGatewayApi, type PaymentOrder } from '@/api/payment-gateway/api';
import { withIntl } from '@/i18n/test-utils';
import { recallTripOrder, rememberTripOrder } from '../trip-order-memory';
import {
  GatewayOrderNotice,
  TripGatewayNotice,
  TripGatewayPay,
  useTripGateway,
} from './TripGatewayPay';

const mockSetParams = jest.fn();
let mockRouteParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    setParams: mockSetParams,
  }),
}));

const mockOpenAuth = jest.fn(async () => ({ type: 'dismiss' }));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuth(...(args as [])),
}));

const TRIP = '01JQZX0000000000000000000R';
const HOLD_DEADLINE = new Date(Date.now() + 90 * 60_000).toISOString();

function makeOrder(over: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    id: '01JTESTORDER0000000000000A',
    provider: 'momo',
    targetType: PAYMENT_ORDER_TARGET.BOOKING_HOLD,
    targetCode: 'XPH2K9ADFG',
    tripId: TRIP,
    invoiceId: null,
    amount: '300000',
    status: PAYMENT_ORDER_STATUS.PENDING,
    viewState: PAYMENT_ORDER_VIEW_STATE.AWAITING,
    applyOutcome: null,
    checkoutUrl: 'https://momo.example.test/pay/1',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    paidAt: null,
    sandbox: false,
    createdAt: new Date().toISOString(),
    ...over,
  } as PaymentOrder;
}

const clients: QueryClient[] = [];

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

// Lượt còn chờ thì truy vấn tự hỏi lại định kỳ — dọn hẳn để jest thoát gọn.
afterEach(async () => {
  await cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function noticeProps(order: PaymentOrder | undefined) {
  return {
    order,
    loading: false,
    failed: false,
    onRetry: jest.fn(),
    onContinue: jest.fn(),
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockSetParams.mockReset();
  mockOpenAuth.mockClear();
  mockRouteParams = {};
});

describe('GatewayOrderNotice (native)', () => {
  it('đang chờ cổng, còn liên kết: mời TIẾP TỤC trên chính phiên đó', async () => {
    const props = noticeProps(makeOrder());
    await render(wrap(<GatewayOrderNotice {...props} />));
    expect(screen.getByText(/Đang chờ Ví MoMo xác nhận thanh toán/)).toBeTruthy();
    fireEvent.press(screen.getByText('Tiếp tục thanh toán'));
    expect(props.onContinue).toHaveBeenCalledWith('https://momo.example.test/pay/1');
  });

  it('liên kết đã hết hạn dùng: không còn nút tiếp tục', async () => {
    await render(wrap(<GatewayOrderNotice {...noticeProps(makeOrder({ checkoutUrl: null }))} />));
    expect(screen.getByText('Phiên thanh toán qua Ví MoMo đã hết hạn')).toBeTruthy();
    expect(screen.queryByText('Tiếp tục thanh toán')).toBeNull();
  });

  it('đã ghi nhận: báo nơi gọi MỘT lần dù render lại', async () => {
    const onSettled = jest.fn();
    const done = makeOrder({
      status: PAYMENT_ORDER_STATUS.SUCCEEDED,
      viewState: PAYMENT_ORDER_VIEW_STATE.COMPLETED,
      checkoutUrl: null,
    });
    const view = await render(
      wrap(<GatewayOrderNotice {...noticeProps(done)} onSettled={onSettled} />),
    );
    expect(screen.getByText(/Đã nhận/)).toBeTruthy();
    await view.rerender(
      wrap(<GatewayOrderNotice {...noticeProps({ ...done })} onSettled={onSettled} />),
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('cần hỗ trợ: nói rõ và đưa mã lượt, không mời trả lại', async () => {
    const order = makeOrder({
      status: PAYMENT_ORDER_STATUS.SUCCEEDED,
      viewState: PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT,
      checkoutUrl: null,
    });
    await render(wrap(<GatewayOrderNotice {...noticeProps(order)} />));
    expect(screen.getByText(/chưa thể ghi nhận tự động/)).toBeTruthy();
    expect(screen.getByText(new RegExp(order.id))).toBeTruthy();
    expect(screen.queryByText('Tiếp tục thanh toán')).toBeNull();
  });
});

function Harness({
  tripId = TRIP,
  holdAwaitingPayment = true,
}: {
  tripId?: string;
  holdAwaitingPayment?: boolean;
}) {
  const gateway = useTripGateway(tripId);
  return (
    <>
      <TripGatewayNotice gateway={gateway} holdAwaitingPayment={holdAwaitingPayment} />
      <TripGatewayPay gateway={gateway} amount="300000" deadline={HOLD_DEADLINE} />
    </>
  );
}

function mockMethods() {
  jest.spyOn(paymentGatewayApi, 'methods').mockResolvedValue({
    sandbox: false,
    methods: [{ provider: 'momo', minAmount: null, maxAmount: null }],
  } as never);
}

describe('TripGatewayPay', () => {
  it('chưa chọn ví ⇒ nút trả tắt và nhắc chọn ví; không mở phiên nào', async () => {
    mockMethods();
    const startSpy = jest.spyOn(paymentGatewayApi, 'startTripCheckout');

    await render(wrap(<Harness />));
    expect(await screen.findByText('Chọn một ví điện tử để tiếp tục.')).toBeTruthy();
    fireEvent.press(screen.getByText('Thanh toán'));
    expect(startSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Thanh toán qua Ví MoMo')).toBeNull();
  });

  it('chạm dồn hai lần chỉ mở MỘT phiên cổng', async () => {
    mockMethods();
    const created = makeOrder();
    let resolve: (o: PaymentOrder) => void = () => undefined;
    const startSpy = jest
      .spyOn(paymentGatewayApi, 'startTripCheckout')
      .mockImplementation(() => new Promise((r) => (resolve = r)));
    jest.spyOn(paymentGatewayApi, 'order').mockResolvedValue(created);

    await render(wrap(<Harness />));
    // CHỌN ví trước rồi mới trả, như `CheckoutPanel` của web.
    fireEvent.press(await screen.findByLabelText('Ví MoMo'));
    const button = await screen.findByText('Thanh toán qua Ví MoMo');
    // Hai lần chạm TRONG một lượt act: chạm ngoài act khi mutation còn treo để lại hàng đợi act
    // lệch, và hiệu ứng của các test sau trong file không chạy.
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await waitFor(() => expect(startSpy).toHaveBeenCalled());
    expect(startSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(created);
    });
    await waitFor(() => expect(mockOpenAuth).toHaveBeenCalledTimes(1));
    // Lượt được ghi lên route (như `?paymentOrder=` của web) VÀ xuống kho bền theo chuyến.
    expect(mockSetParams).toHaveBeenCalledWith({ paymentOrder: created.id });
    expect(await recallTripOrder(TRIP)).toBe(created.id);
    // Như web: lượt còn chờ vẫn để thẻ "Ví điện tử" dưới VietQR — chọn ví khác là mở phiên MỚI.
    expect(screen.getByLabelText('Ví MoMo')).toBeTruthy();
  });

  it('mở lại màn sau khi tiến trình bị giết: đọc lượt đã nhớ, KHÔNG mời trả lần hai', async () => {
    mockMethods();
    const refunded = makeOrder({
      status: PAYMENT_ORDER_STATUS.SUCCEEDED,
      // DTO sinh chưa liệt kê chặng này dù server đã trả nó (`PAYMENT_ORDER_VIEW_STATE`).
      viewState: PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED as never,
      checkoutUrl: null,
    });
    await rememberTripOrder(TRIP, refunded.id, refunded.expiresAt);
    jest.spyOn(paymentGatewayApi, 'order').mockResolvedValue(refunded);

    await render(wrap(<Harness />));
    // Thông báo của lượt đã nhớ hiện lại, và lối trả không mở thêm phiên nào.
    expect(await screen.findByText(/bị trả trùng/)).toBeTruthy();
    expect(screen.queryByLabelText('Ví MoMo')).toBeNull();
  });

  it('khoản giữ chỗ đã trả bằng đường khác: lượt cổng còn chờ KHÔNG mời trả tiếp và bị quên', async () => {
    mockMethods();
    const awaiting = makeOrder();
    await rememberTripOrder(TRIP, awaiting.id, awaiting.expiresAt);
    jest.spyOn(paymentGatewayApi, 'order').mockResolvedValue(awaiting);

    await render(wrap(<Harness holdAwaitingPayment={false} />));
    // Đợi lượt hiện ra trong cache rồi mới soát kho bền.
    await waitFor(() => expect(paymentGatewayApi.order).toHaveBeenCalled(), { timeout: 5000 });
    await waitFor(async () => expect(await recallTripOrder(TRIP)).toBeNull(), { timeout: 5000 });
    expect(screen.queryByText('Tiếp tục thanh toán')).toBeNull();
  });

  it('khoản còn chờ tiền: lượt cổng còn chờ vẫn mời tiếp tục', async () => {
    mockMethods();
    const awaiting = makeOrder();
    await rememberTripOrder(TRIP, awaiting.id, awaiting.expiresAt);
    jest.spyOn(paymentGatewayApi, 'order').mockResolvedValue(awaiting);

    await render(wrap(<Harness />));
    expect(
      await screen.findByText('Tiếp tục thanh toán', undefined, { timeout: 5000 }),
    ).toBeTruthy();
    expect(await recallTripOrder(TRIP)).toBe(awaiting.id);
  });
});
