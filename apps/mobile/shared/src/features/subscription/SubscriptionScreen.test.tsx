import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import viSubscription from '@xeprime/domain/messages/vi/subscription.json';
import * as authApi from '@/features/auth/api';
// Đích lui so qua builder của app đang chạy — app Partner không đăng ký khu tài khoản.
import { ROUTES } from '@/navigation/routes';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { appConfigApi } from '@/api/app-config/api';
import { subscriptionApi, type MySubscription } from '@/api/subscription/api';
import { SubscriptionScreen, SubscriptionWorkspace } from './SubscriptionScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]);
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => false,
  }),
}));

async function renderScreen() {
  // Người chưa có gian hàng: khối gói tự vẽ trạng thái của nó, thứ bài này kiểm là VỎ màn.
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: '01JQZX00000000000000000USR',
    displayName: 'Chủ xe',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: true,
    hasPassword: true,
    tenant: null,
    openRenterTripCount: 0,
    platformRole: null,
    permissions: [],
  } as unknown as authApi.CurrentUser);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <SubscriptionScreen shell="account" />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
});

/*
 * `/account/subscription` trước đây dựng `ManageHeader` — hook của nó ném lỗi ngoài
 * `ManageDrawerHost`, nên chủ xe tuyến hoa hồng mở "Gói dịch vụ" là gặp màn lỗi.
 */
describe('SubscriptionScreen — vỏ khu tài khoản', () => {
  it('dựng được KHÔNG cần sidebar quản lý, tiêu đề "Gói & hạn mức" đứng một lần ở thanh trên', async () => {
    const view = await renderScreen();

    expect(await view.findByText(viSubscription.mobilePlan.title)).toBeTruthy();
    expect(view.getAllByText(viSubscription.mobilePlan.title)).toHaveLength(1);
  });

  it('nút lui về trang Tài khoản khi không còn gì để lui', async () => {
    const view = await renderScreen();

    await fireEvent.press(await view.findByLabelText('Quay lại'));
    expect(mockReplace).toHaveBeenCalledWith(ROUTES.account.home());
  });
});

/*
 * App Partner không bán gói (không IAP): màn chỉ còn THÔNG TIN; danh sách gói + "Liên hệ tư vấn"
 * theo cờ `isPlanPromotionEnabled`.
 */
describe('SubscriptionWorkspace — Gói & hạn mức', () => {
  const COMMISSION_USER = {
    id: '01JQZX00000000000000000USR',
    displayName: 'Chủ xe Hương',
    email: 'chuxe@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Xe Hương',
      onboardingState: 'commission',
      billingMode: 'commission',
      billingPhase: 'current',
      serviceFeePercent: 10,
      features: [],
    },
    openRenterTripCount: 0,
    platformRole: null,
    permissions: ['subscription.view'],
  } as unknown as authApi.CurrentUser;

  async function renderWorkspace(isPlanPromotionEnabled: boolean) {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(COMMISSION_USER);
    jest.spyOn(appConfigApi, 'partner').mockResolvedValue({ isPlanPromotionEnabled, version: 1 });
    jest.spyOn(subscriptionApi, 'me').mockResolvedValue({
      currentPlan: {
        subscriptionId: 's1',
        planId: 'p0',
        planCode: 'commission',
        planName: 'Chủ xe cá nhân',
        billingMode: 'commission',
        commissionPercent: 10,
        quota: null,
        endsAt: '2099-01-01T00:00:00.000Z',
      },
      usage: {
        car: { used: 2, limit: null, listed: 2 },
        motorbike: { used: 1, limit: null, listed: 1 },
      },
      fleetQuota: { kind: 'total', totalLimit: 3, reason: 'owner_lite', totalUsed: 3 },
      freeTrips: { used: 0, limit: 0, remaining: 0 },
    } as unknown as MySubscription);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      withIntl(
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <SubscriptionWorkspace />
          </QueryClientProvider>
        </ReduxProvider>,
      ),
    );
    return { ...view, queryClient };
  }

  it('cờ TẮT: chỉ thông tin + hạn mức, không tư vấn, không hoá đơn/thanh toán', async () => {
    const view = await renderWorkspace(false);

    expect(await view.findByText('Chủ xe cá nhân')).toBeTruthy();
    expect(view.getByText(viSubscription.mobilePlan.subtitleHidden)).toBeTruthy();
    expect(view.getByText('3/3')).toBeTruthy();
    expect(view.getByText('10% / chuyến')).toBeTruthy();
    expect(
      view.getByText(viSubscription.mobilePlan.commissionLimitReached.replace('{limit}', '3')),
    ).toBeTruthy();
    expect(view.queryByText(viSubscription.usage.atLimitBuyPlan)).toBeNull();

    expect(view.queryByText(viSubscription.features.unlockTitle)).toBeNull();
    expect(view.queryByRole('button', { name: 'Liên hệ tư vấn' })).toBeNull();
    expect(view.queryByText(viSubscription.current.renewButton)).toBeNull();
    expect(view.queryByText(viSubscription.invoices.title)).toBeNull();
    expect(view.queryByText(viSubscription.invoices.showHistory)).toBeNull();
    expect(view.queryByText(/QR|Hoá đơn/)).toBeNull();
  });

  it('cờ BẬT: CHỈ thêm "Liên hệ tư vấn" — không danh sách gói, không khối mở khoá tính năng', async () => {
    const view = await renderWorkspace(true);

    expect(await view.findByRole('button', { name: 'Liên hệ tư vấn' })).toBeTruthy();
    expect(view.queryByText(/Các gói gian hàng|Tối đa 3 xe/)).toBeNull();
    expect(view.queryByText(viSubscription.features.unlockTitle)).toBeNull();
    expect(view.getByText(viSubscription.mobilePlan.subtitleShown)).toBeTruthy();
    expect(view.queryByText(viSubscription.purchase.submit)).toBeNull();
    expect(view.queryByText(/QR|Hoá đơn/)).toBeNull();
  });

  it('Liên hệ tư vấn: điền sẵn từ tài khoản, gửi, hiện lời cảm ơn; cờ tắt ⇒ tấm và nút biến mất', async () => {
    const submit = jest
      .spyOn(appConfigApi, 'planConsultation')
      .mockResolvedValue({
        caseId: 'c1',
        code: 'SC1',
        emailQueued: true,
        // Server gửi tới email TÀI KHOẢN — có thể khác ô email vừa gõ.
        emailedTo: 'tai-khoan@xeprime.test',
      });
    const view = await renderWorkspace(true);

    await fireEvent.press(await view.findByRole('button', { name: 'Liên hệ tư vấn' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Gửi yêu cầu' }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      fullName: 'Chủ xe Hương',
      phone: '0901111111',
      email: 'chuxe@xeprime.test',
      locale: 'vi',
    });
    expect(
      await view.findByText(/Hướng dẫn chi tiết đã được gửi tới email tai-khoan@xeprime.test/),
    ).toBeTruthy();

    await act(async () => {
      view.queryClient.setQueryData(['app-config', 'partner'], { isPlanPromotionEnabled: false, version: 2 });
    });
    await waitFor(() => expect(view.queryByText(/Hướng dẫn chi tiết/)).toBeNull());
    expect(view.queryByRole('button', { name: 'Liên hệ tư vấn' })).toBeNull();
    expect(view.getByText(viSubscription.mobilePlan.subtitleHidden)).toBeTruthy();
  });

  it('Liên hệ tư vấn: server không gửi thư (emailedTo = null) ⇒ cảm ơn, KHÔNG nhắc email', async () => {
    jest
      .spyOn(appConfigApi, 'planConsultation')
      .mockResolvedValue({ caseId: 'c2', code: 'SC2', emailQueued: false, emailedTo: null });
    const view = await renderWorkspace(true);
    await fireEvent.press(await view.findByRole('button', { name: 'Liên hệ tư vấn' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await view.findByText(viSubscription.mobilePlan.consult.successBodyNoEmail)).toBeTruthy();
    expect(view.queryByText(/Hướng dẫn chi tiết/)).toBeNull();
  });
});
