import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  API_ERROR_CODE,
  REGISTRATION_TRACK,
  SHOP_VERIFICATION,
  TENANT_TYPE,
  type RegistrationTrack,
} from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import { appConfigApi } from '@/api/app-config/api';
import * as authApi from '@/features/auth/api';
import { locationsApi } from '@/features/locations/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { tenantsApi, type MyShop } from './api';
import { ShopOnboardingScreen } from './ShopOnboardingScreen';

const mockReplace = jest.fn();
/* Đổi khu đi bằng `dismissTo` (POP_TO) — không dựng `(tabs)` thứ hai trên ngăn xếp gốc. */
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    dismissTo: mockDismissTo,
    back: jest.fn(),
  }),
}));

/** Người dùng đã đăng nhập nhưng CHƯA có gian hàng — đúng đối tượng của SHP-01. */
function customerUser(tenant: authApi.CurrentUser['tenant'] = null): authApi.CurrentUser {
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
    permissions: [],
  };
}

const SHOP: MyShop = {
  id: '01JQZX0000000000000000000T',
  code: 'SHOP01',
  slug: 'binh-minh',
  name: 'Cho thuê xe Bình Minh',
  tenantType: TENANT_TYPE.INDIVIDUAL,
  status: 'draft',
  // ADR 0036: trục XÁC MINH tách khỏi `status`. Fixture giữ nguyên `draft` (dữ liệu cũ).
  verification: SHOP_VERIFICATION.UNVERIFIED,
  onboardingState: 'commission',
  phone: null,
  email: null,
  profile: {
    displayName: null,
    bio: null,
    logoUrl: null,
    coverUrl: null,
    address: null,
    provinceCode: '48',
    provinceName: 'Đà Nẵng',
    taxCode: null,
    businessLicenseNo: null,
  },
  ownerAccount: {
    userId: '01JQZX00000000000000000OW',
    displayName: 'Nguyễn Văn A',
    email: null,
    phone: '84901111111',
    emailVerified: false,
    phoneVerified: true,
  },
  latestApproval: null,
  defaultBranch: {
    id: '01JQZX0000000000000000000B',
    code: 'CN01',
    name: 'Chi nhánh chính',
    provinceCode: '48',
    provinceName: 'Đà Nẵng',
    needsLocationReview: false,
  },
};

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
  { isPlanPromotionEnabled = false, track }: { isPlanPromotionEnabled?: boolean; track?: RegistrationTrack } = {},
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(customerUser(tenant));
  jest.spyOn(appConfigApi, 'partner').mockResolvedValue({ isPlanPromotionEnabled, version: 1 });
  jest
    .spyOn(locationsApi, 'provinces')
    .mockResolvedValue([
      { code: '48', name: 'Đà Nẵng', administrativeType: 'municipality', slug: 'da-nang' },
    ]);

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
});

describe('ShopOnboardingScreen (SHP-01)', () => {
  it('chưa có gian hàng: hiện form tạo, KHÔNG ép ai phải mở shop', async () => {
    const view = await renderScreen();

    expect(await view.findByRole('button', { name: 'Tạo gian hàng' })).toBeTruthy();
    /*
     * Lối ra (neo ở thanh đáy, dưới nút chính) là ĐĂNG XUẤT, không còn "Quay lại marketplace" (06/10/2026).
     *
     * Nút cũ dẫn về `/manage`, mà ở app Partner KHÔNG có marketplace nào để về — chợ xe nằm ở app
     * XePrime, một realm khác (ADR 0053). Với tuyến gói chưa trả tiền nó còn chết hẳn:
     * `partnerPathRedirect` chỉ cho họ ở đúng màn này (ADR 0040 điều 3) nên `ScopeGuard` ném
     * ngược lại ngay.
     */
    expect(view.queryByRole('button', { name: 'Quay lại marketplace' })).toBeNull();
    expect(view.getByRole('button', { name: new RegExp('Đăng xuất$') })).toBeTruthy();
  });

  it('bước 2 (package_pending): màn CHỜ KÍCH HOẠT, không bộ chọn gói, không QR, không hoá đơn', async () => {
    const view = await renderScreen(PENDING_TENANT);

    expect(await view.findByText('Đăng ký gian hàng thành công!')).toBeTruthy();
    expect(
      view.getByText('Tài khoản Gian hàng Đà Nẵng đã được tạo và đang chờ kích hoạt.'),
    ).toBeTruthy();
    expect(
      view.getByText(
        'XePrime sẽ liên hệ với bạn qua 0903333333 và gửi hướng dẫn tới khach@xeprime.test trong thời gian sớm nhất.',
      ),
    ).toBeTruthy();
    expect(view.getByRole('button', { name: 'Về trang chính' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Làm mới trạng thái' })).toBeTruthy();
    // Không có một bước thanh toán nào.
    expect(view.queryByText(/hoá đơn|QR|chuyển khoản/i)).toBeNull();
    expect(view.queryByRole('button', { name: 'Tạo gian hàng' })).toBeNull();
    // Cờ tắt (mặc định) ⇒ không có "Liên hệ tư vấn".
    expect(view.queryByRole('button', { name: 'Liên hệ tư vấn' })).toBeNull();
    expect(view.getByRole('button', { name: new RegExp('Đăng xuất$') })).toBeTruthy();
  });

  it('bước 2 + isPlanPromotionEnabled bật: có nút "Liên hệ tư vấn"', async () => {
    const view = await renderScreen(PENDING_TENANT, { isPlanPromotionEnabled: true });

    expect(await view.findByRole('button', { name: 'Liên hệ tư vấn' })).toBeTruthy();
  });

  it('Làm mới trạng thái: gói đã kích hoạt trên web ⇒ vào Manage', async () => {
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
    await fireEvent.press(view.getByRole('button', { name: 'Làm mới trạng thái' }));

    await waitFor(() =>
      expect(mockDismissTo).toHaveBeenCalledWith({
        pathname: '/manage/shop',
        params: { welcome: '1' },
      }),
    );
  });

  it('tuyến gói: bước 2 là "Chờ kích hoạt", không có bước chọn gói/thanh toán', async () => {
    const view = await renderScreen(null, { track: REGISTRATION_TRACK.PACKAGE });

    expect(await view.findByRole('button', { name: 'Đăng ký gian hàng' })).toBeTruthy();
    expect(view.getByText('Chờ kích hoạt')).toBeTruthy();
    expect(view.queryByText('Gói và thanh toán')).toBeNull();
    expect(view.queryByText(/QR|hoá đơn/i)).toBeNull();

    // Đăng ký xong (`/auth/me` về `package_pending`) ⇒ thẳng màn chờ, không qua bước trả tiền.
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(customerUser(PENDING_TENANT));
    await view.queryClient.invalidateQueries();

    expect(await view.findByText('Đăng ký gian hàng thành công!')).toBeTruthy();
    expect(view.queryByText(/QR|hoá đơn|chuyển khoản/i)).toBeNull();
  });

  it('đã có gian hàng: không dựng form, đưa thẳng tới hồ sơ gian hàng', async () => {
    const view = await renderScreen({
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
     * xong, và dải chào một-lần sống ở màn hồ sơ (ADR 0040). Tham số không mở/khoá gì — chính
     * `ShopProfileScreen` còn lọc lại theo `isEstablishedPackageShop`.
     */
    await waitFor(() =>
      expect(mockDismissTo).toHaveBeenCalledWith({
        pathname: '/manage/shop',
        params: { welcome: '1' },
      }),
    );
    expect(view.queryByRole('button', { name: 'Tạo gian hàng' })).toBeNull();
  });

  it('thiếu tên/tỉnh: chặn ở client, KHÔNG gọi API', async () => {
    const registerSpy = jest.spyOn(tenantsApi, 'register').mockResolvedValue(SHOP);
    const view = await renderScreen();

    /*
     * Xoá TRẮNG ô tên trước khi gửi: form điền sẵn tên tài khoản (đúng như web), nên bấm gửi ngay
     * sẽ qua được luật `nameRequired` và test không còn kiểm thứ nó định kiểm.
     */
    await fireEvent.changeText(await view.findByLabelText('Tên gian hàng'), '');
    await fireEvent.press(await view.findByRole('button', { name: 'Tạo gian hàng' }));

    expect(await view.findByText('Tên gian hàng là bắt buộc')).toBeTruthy();
    expect(view.getByText('Chọn tỉnh/thành nơi đặt gian hàng')).toBeTruthy();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('tạo thành công: gửi đúng payload và làm mới phiên để vỏ app thấy gian hàng mới', async () => {
    const registerSpy = jest.spyOn(tenantsApi, 'register').mockResolvedValue(SHOP);
    const view = await renderScreen();

    await fireEvent.changeText(
      await view.findByLabelText('Tên gian hàng'),
      'Cho thuê xe Bình Minh',
    );
    await fireEvent.press(view.getByLabelText('Tỉnh/thành phố'));
    await fireEvent.press(await view.findByText('TP Đà Nẵng'));
    await fireEvent.press(view.getByRole('button', { name: 'Tạo gian hàng' }));

    await waitFor(() => expect(registerSpy).toHaveBeenCalled());
    expect(registerSpy.mock.calls[0]?.[0]).toMatchObject({
      name: 'Cho thuê xe Bình Minh',
      provinceCode: '48',
      tenantType: TENANT_TYPE.INDIVIDUAL,
    });
    // Client KHÔNG gửi trạng thái — backend quyết định gian hàng ra đời ở `draft`.
    expect(registerSpy.mock.calls[0]?.[0]).not.toHaveProperty('status');
  });

  it('backend từ chối (đã có gian hàng): giữ nguyên dữ liệu đã nhập để gửi lại', async () => {
    jest.spyOn(tenantsApi, 'register').mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: API_ERROR_CODE.CONFLICT,
        message: 'Bạn đã có gian hàng',
      }),
    );
    const view = await renderScreen();

    const nameField = await view.findByLabelText('Tên gian hàng');
    await fireEvent.changeText(nameField, 'Cho thuê xe Bình Minh');
    await fireEvent.press(view.getByLabelText('Tỉnh/thành phố'));
    await fireEvent.press(await view.findByText('TP Đà Nẵng'));
    await fireEvent.press(view.getByRole('button', { name: 'Tạo gian hàng' }));

    // Form KHÔNG bị reset: người dùng chỉ cần đọc lỗi rồi bấm lại.
    await waitFor(() =>
      expect(view.getByLabelText('Tên gian hàng').props.value).toBe('Cho thuê xe Bình Minh'),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });
});
