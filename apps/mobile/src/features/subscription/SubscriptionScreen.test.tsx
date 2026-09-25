import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import viSubscription from '@xeprime/domain/messages/vi/subscription.json';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { SubscriptionScreen } from './SubscriptionScreen';

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
  it('dựng được KHÔNG cần sidebar quản lý, có tiêu đề + mô tả như trang web của khu tài khoản', async () => {
    const view = await renderScreen();

    expect(await view.findByText(viSubscription.page.accountSubtitle)).toBeTruthy();
    expect(view.getAllByText(viSubscription.page.title)).toHaveLength(1);
  });

  it('nút lui về trang Tài khoản khi không còn gì để lui', async () => {
    const view = await renderScreen();

    await fireEvent.press(await view.findByLabelText('Quay lại'));
    expect(mockReplace).toHaveBeenCalledWith('/account');
  });
});
