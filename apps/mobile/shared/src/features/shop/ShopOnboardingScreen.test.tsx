import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { render, waitFor } from '@testing-library/react-native';
import { PERMISSION, REGISTRATION_TRACK, type Permission, type RegistrationTrack } from '@xeprime/types';
import { appConfigApi } from '@/api/app-config/api';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ROUTES } from '@/navigation/routes';
import { store } from '@/store';
import { ShopOnboardingScreen } from './ShopOnboardingScreen';

const mockReplace = jest.fn();
/* Đổi khu đi bằng `dismissTo` (POP_TO) — không dựng `(tabs)` thứ hai trên ngăn xếp gốc. */
const mockDismissTo = jest.fn();
/** Ghi lại đích của `<Redirect>` - chưa có gian hàng thì màn chuyển sang form đăng ký một trang. */
const mockRedirect = jest.fn();

// Màn chờ kích hoạt nghe số chưa đọc của bản chiếu huy hiệu (`usePackageActivationWatch`).
jest.mock('@/features/badges/hooks/use-badges', () => ({
  useBadges: jest.fn(() => ({ chatCustomer: 0, chatShop: 0, notificationsUnread: 0 })),
}));

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    dismissTo: mockDismissTo,
    back: jest.fn(),
  }),
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
  /** `usePartnerAppConfig` đọc lại cờ khi màn được focus; ở test chạy callback một lần sau mount. */
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => callback(), [callback]);
  },
}));

/** Người dùng đã đăng nhập nhưng CHƯA có gian hàng — đúng đối tượng của SHP-01. */
function customerUser(
  tenant: authApi.CurrentUser['tenant'] = null,
  permissions: Permission[] = [],
): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Khách thuê xe',
    email: 'khach@xeprime.test',
    avatarUrl: null,
    phone: '0903333333',
    phoneVerified: true,
    hasPassword: true,
    tenant,
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  };
}

const PENDING_TENANT = {
  id: '01JQZX0000000000000000000T',
  name: 'Gian hàng Đà Nẵng',
  slug: 'da-nang',
  status: 'draft',
  onboardingState: 'package_pending',
  branchScope: 'all',
  logoUrl: null,
  roleKey: 'shop_owner',
  features: [],
  planCode: null,
  planName: null,
  serviceFeePercent: null,
  billingMode: null,
  planEndsAt: null,
  billingPhase: null,
  graceEndsAt: null,
  publicVehicleCount: 0,
} as unknown as authApi.CurrentUser['tenant'];

async function renderScreen(
  tenant: authApi.CurrentUser['tenant'] = null,
  {
    isPlanPromotionEnabled = false,
    track,
    permissions = [],
  }: { isPlanPromotionEnabled?: boolean; track?: RegistrationTrack; permissions?: Permission[] } = {},
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(customerUser(tenant, permissions));
  jest.spyOn(appConfigApi, 'partner').mockResolvedValue({ isPlanPromotionEnabled, version: 1, supportHotline: null });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ShopOnboardingScreen {...(track ? { track } : {})} />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
  mockDismissTo.mockClear();
  mockRedirect.mockClear();
  delete process.env.EXPO_PUBLIC_PARTNER_WEB_URL;
});

describe('ShopOnboardingScreen (SHP-01)', () => {
  /*
   * Form tạo hồ sơ cũ (tên/tỉnh/"Loại hình") đã gỡ 13/11/2026: chưa có gian hàng thì màn chuyển
   * sang form đăng ký MỘT TRANG `/manage/register?track=` - y như web chuyển tới
   * `partnerSignupHref(track)`.
   */
  it('chưa có gian hàng (mặc định tuyến hoa hồng): chuyển tới form đăng ký một trang', async () => {
    const view = await renderScreen();

    await waitFor(() =>
      expect(mockRedirect).toHaveBeenCalledWith(ROUTES.manage.register(REGISTRATION_TRACK.COMMISSION)),
    );
    expect(mockRedirect).toHaveBeenLastCalledWith({
      pathname: '/manage/register',
      params: { track: REGISTRATION_TRACK.COMMISSION },
    });
    expect(view.queryByRole('button', { name: 'Tạo gian hàng' })).toBeNull();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('chưa có gian hàng, tuyến gói: chuyển tới form đăng ký mang `?track=package`', async () => {
    await renderScreen(null, { track: REGISTRATION_TRACK.PACKAGE });

    await waitFor(() =>
      expect(mockRedirect).toHaveBeenCalledWith({
        pathname: '/manage/register',
        params: { track: REGISTRATION_TRACK.PACKAGE },
      }),
    );
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('bước 2 (package_pending): màn CHỜ KÍCH HOẠT, không bộ chọn gói, không QR, không hoá đơn', async () => {
    const view = await renderScreen(PENDING_TENANT);

    expect(await view.findByText('Đăng ký gian hàng thành công!')).toBeTruthy();
    expect(view.getByText('Đang chờ kích hoạt')).toBeTruthy();
    expect(view.getByText('XePrime sẽ liên hệ tư vấn gói phù hợp cho gian hàng của bạn.')).toBeTruthy();
    expect(view.getByText('Bạn sẽ nhận được thông báo ngay khi gian hàng được kích hoạt.')).toBeTruthy();
    expect(view.getByText('Màn này tự cập nhật khi gian hàng được kích hoạt.')).toBeTruthy();
    // Footer chỉ còn Đăng xuất - không có nút làm mới / về trang chính.
    expect(view.queryByRole('button', { name: 'Về trang chính' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Làm mới trạng thái' })).toBeNull();
    // Không có một bước thanh toán nào.
    expect(view.queryByText(/hoá đơn|QR|chuyển khoản/i)).toBeNull();
    // Cờ khuyến mãi gói TẮT ⇒ không lối mua gói, không "Liên hệ tư vấn".
    expect(view.queryByRole('button', { name: 'Chọn gói trên website' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Liên hệ tư vấn' })).toBeNull();
    expect(view.getByRole('button', { name: new RegExp('Đăng xuất$') })).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('bước 2 + cờ khuyến mãi gói BẬT, có quyền mua gói: lối chọn gói trên web và "Liên hệ tư vấn"', async () => {
    process.env.EXPO_PUBLIC_PARTNER_WEB_URL = 'https://partner.example.test';
    const view = await renderScreen(PENDING_TENANT, {
      isPlanPromotionEnabled: true,
      permissions: [PERMISSION.SUBSCRIPTION_PURCHASE],
    });

    expect(await view.findByRole('button', { name: 'Chọn gói trên website' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Liên hệ tư vấn' })).toBeTruthy();
  });

  it('bước 2 + cờ BẬT nhưng KHÔNG có quyền mua gói: chỉ còn "Liên hệ tư vấn"', async () => {
    process.env.EXPO_PUBLIC_PARTNER_WEB_URL = 'https://partner.example.test';
    const view = await renderScreen(PENDING_TENANT, { isPlanPromotionEnabled: true });

    expect(await view.findByRole('button', { name: 'Liên hệ tư vấn' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Chọn gói trên website' })).toBeNull();
  });

  it('tự cập nhật: gói đã kích hoạt trên web ⇒ vào Manage', async () => {
    const view = await renderScreen(PENDING_TENANT);
    await view.findByText('Đăng ký gian hàng thành công!');

    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(
      customerUser({
        ...PENDING_TENANT,
        status: 'active',
        onboardingState: 'package_active',
        billingMode: 'package',
        billingPhase: 'current',
      } as unknown as authApi.CurrentUser['tenant']),
    );
    await view.queryClient.invalidateQueries();

    await waitFor(() =>
      expect(mockDismissTo).toHaveBeenCalledWith({
        pathname: '/manage/shop',
        params: { welcome: '1' },
      }),
    );
  });

  it('đã có gian hàng: không chuyển sang form đăng ký, đưa thẳng tới hồ sơ gian hàng', async () => {
    await renderScreen({
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      onboardingState: 'commission',
      branchScope: 'all',
      logoUrl: null,
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planName: null,
      serviceFeePercent: null,
      billingMode: 'package',
      planEndsAt: null,
      billingPhase: 'current',
      graceEndsAt: null,
      publicVehicleCount: 1,
    });

    /*
     * `?welcome=1`: gian hàng tuyến gói đã có thuê bao hiệu lực tới đây nghĩa là vừa thanh toán
     * xong, và dải chào một-lần sống ở màn hồ sơ (ADR 0040). Tham số không mở/khoá gì - chính
     * `ShopProfileScreen` còn lọc lại theo `isEstablishedPackageShop`.
     */
    await waitFor(() =>
      expect(mockDismissTo).toHaveBeenCalledWith({
        pathname: '/manage/shop',
        params: { welcome: '1' },
      }),
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
