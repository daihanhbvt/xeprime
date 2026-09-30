import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE, SHOP_VERIFICATION, TENANT_TYPE } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
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

async function renderScreen(tenant: authApi.CurrentUser['tenant'] = null) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(customerUser(tenant));
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
          <ShopOnboardingScreen />
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
    // Vẫn có đường lui về marketplace — tài khoản khách dùng chợ được mà không cần gian hàng.
    // Câu chữ lấy từ web (khoá page.back), không phải nhãn "Quay lại" chung của app.
    expect(view.getByRole('button', { name: 'Quay lại marketplace' })).toBeTruthy();
  });

  it('đã có gian hàng: không dựng form, đưa thẳng tới hồ sơ gian hàng', async () => {
    const view = await renderScreen({
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      onboardingState: 'commission',
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
