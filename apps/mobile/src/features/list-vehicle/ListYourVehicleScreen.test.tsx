import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TENANT_ROLE } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ListYourVehicleScreen } from './ListYourVehicleScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const SESSION: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000U',
  displayName: 'Nguyễn Văn An',
  email: 'an@xeprime.test',
  avatarUrl: null,
  phone: '0901234567',
  phoneVerified: true,
  hasPassword: true,
  tenant: null,
  openRenterTripCount: 0,
  platformRole: null,
  permissions: [],
};

const TENANT = {
  id: '01JQZX0000000000000000000T',
  name: 'Việt Car Hà Nội',
  slug: 'viet-car',
  status: 'active',
  onboardingState: 'commission',
  logoUrl: null,
  roleKey: TENANT_ROLE.SHOP_OWNER,
  features: [],
  planCode: null,
  planName: null,
  serviceFeePercent: null,
  billingMode: 'package',
  planEndsAt: null,
  billingPhase: 'current',
  graceEndsAt: null,
  publicVehicleCount: 1,
} as NonNullable<authApi.CurrentUser['tenant']>;

/** `session = null` = khách VÃNG LAI: `/auth/me` trả 401, và đó là trạng thái hợp lệ. */
async function renderScreen(session: authApi.CurrentUser | null) {
  if (session) jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(session);
  else jest.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(new Error('401'));

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ListYourVehicleScreen />
      </QueryClientProvider>,
    ),
  );
}

/**
 * Bấm CTA sau khi phiên đã về.
 *
 * Trước đó nút ở trạng thái `loading` nên `Pressable` bị khoá — bấm vào đó là test tự đua với
 * chính truy vấn nó vừa dựng, và thắng thua đổi theo máy.
 */
async function pressTrack(view: Awaited<ReturnType<typeof render>>, name: string) {
  const cta = view.getByRole('button', { name });
  await waitFor(() => expect(cta.props.accessibilityState?.disabled).toBe(false));
  await fireEvent.press(cta);
}

const PERSONAL_CTA = 'Đăng xe đầu tiên';
const SHOP_CTA = 'Tìm hiểu và tạo gian hàng';
const SUBTITLE =
  'Đăng chiếc xe đầu tiên thật đơn giản; khi cần quản lý quy mô lớn hơn, bạn có thể nâng cấp lên gian hàng mà vẫn giữ tài khoản và xe.';

/**
 * Landing "Đăng ký xe" — cửa vào CÔNG KHAI của chủ xe mới.
 *
 * Bộ này khoá đúng thứ khiến màn hình tồn tại: nó **xem được khi chưa đăng nhập**, và CTA rẽ theo
 * trạng thái THẬT thay vì ném mọi người vào cùng một form. Gộp ba nhánh lại là mất bước "đọc
 * trước khi khai" mà web đã thêm lại ngày 09/09/2026.
 */
/**
 * Đích của tuyến CÁ NHÂN — wizard đăng xe nhanh ở khu KHÁCH.
 *
 * KHÔNG phải `/manage/vehicles/new`: màn đó nằm sau `ScopeGuard` đòi phải có gian hàng, nên chủ
 * xe tuyến hoa hồng bấm vào là ăn "Bạn không còn quyền truy cập gian hàng này". Sai cả quyền lẫn
 * tuyến — ADR 0028 nói tuyến hoa hồng đăng xe từ khu khách và không bước vào cổng quản lý.
 */
const QUICK_REGISTER = {
  pathname: '/list-your-vehicle/register',
  params: { from: 'marketplace' },
};

describe('ListYourVehicleScreen', () => {
  beforeEach(() => mockPush.mockClear());

  it('khách chưa đăng nhập vẫn đọc được CẢ HAI tuyến', async () => {
    const view = await renderScreen(null);

    expect(await view.findByText(SUBTITLE)).toBeTruthy();
    expect(view.getByText('Đăng xe cá nhân')).toBeTruthy();
    expect(view.getByText('Mở gian hàng cho thuê')).toBeTruthy();
    expect(view.getByText('Linh hoạt nâng cấp khi cần')).toBeTruthy();
  });

  /*
   * MỘT cú chạm mỗi test. `useNavigateOnce` khoá 700ms sau lần điều hướng đầu để nuốt double-tap,
   * nên bấm nút thứ hai trong cùng một lượt render là bị chính cái khoá đó chặn — không phải lỗi
   * của màn hình.
   */
  it('chưa đăng nhập: tuyến CÁ NHÂN dừng ở đăng nhập', async () => {
    const view = await renderScreen(null);
    await view.findByText(SUBTITLE);

    await pressTrack(view, PERSONAL_CTA);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('chưa đăng nhập: tuyến GIAN HÀNG cũng dừng ở đăng nhập', async () => {
    const view = await renderScreen(null);
    await view.findByText(SUBTITLE);

    await pressTrack(view, SHOP_CTA);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  /**
   * Hai tuyến của ADR 0028 là hai lựa chọn ĐỘC LẬP — trang không được tự chuyển lựa chọn này
   * thành lựa chọn kia. Đây là bất biến quan trọng nhất của màn: bấm "Đăng xe cá nhân" mà rơi vào
   * form tạo gian hàng là đẩy người dùng sang tuyến thu phí khác hẳn.
   */
  it('đã đăng nhập, chưa có gian hàng: tuyến cá nhân vào WIZARD ĐĂNG XE, không vào khu quản lý', async () => {
    const view = await renderScreen(SESSION);
    await view.findByText(SUBTITLE);

    await pressTrack(view, PERSONAL_CTA);
    expect(mockPush).toHaveBeenCalledWith(QUICK_REGISTER);
  });

  it('đã đăng nhập, chưa có gian hàng: tuyến gian hàng vào form TẠO GIAN HÀNG', async () => {
    const view = await renderScreen(SESSION);
    await view.findByText(SUBTITLE);

    await pressTrack(view, SHOP_CTA);
    expect(mockPush).toHaveBeenCalledWith('/manage/onboarding');
  });

  it('đã có gian hàng: tuyến cá nhân vẫn vào thẳng màn đăng xe', async () => {
    const view = await renderScreen({ ...SESSION, tenant: TENANT });
    await view.findByText(SUBTITLE);

    await pressTrack(view, PERSONAL_CTA);
    expect(mockPush).toHaveBeenCalledWith(QUICK_REGISTER);
  });
});
