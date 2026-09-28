import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  SHOP_VERIFICATION,
  PERMISSION,
  TENANT_STATUS,
  TENANT_TYPE,
  type Permission,
  type TenantStatus,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { locationsApi } from '@/features/locations/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { tenantsApi, type MyShop } from './api';
import { ShopProfileScreen } from './ShopProfileScreen';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

/** Thanh trên cần context Drawer — không thuộc phạm vi test màn hồ sơ. */
jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function currentUser(
  permissions: Permission[],
  tenant: authApi.CurrentUser['tenant'] = {
    id: '01JQZX0000000000000000000T',
    name: 'Cho thuê xe Bình Minh',
    slug: 'binh-minh',
    status: TENANT_STATUS.DRAFT,
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
  },
): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant,
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  };
}

function shop(overrides: Partial<MyShop> = {}, profile: Partial<MyShop['profile']> = {}): MyShop {
  return {
    id: '01JQZX0000000000000000000T',
    code: 'SHOP01',
    slug: 'binh-minh',
    name: 'Cho thuê xe Bình Minh',
    tenantType: TENANT_TYPE.INDIVIDUAL,
    status: TENANT_STATUS.DRAFT,
    verification: SHOP_VERIFICATION.UNVERIFIED,
    onboardingState: 'commission',
    phone: null,
    email: null,
    profile: {
      displayName: 'Bình Minh Car',
      bio: null,
      logoUrl: null,
      coverUrl: null,
      address: null,
      provinceCode: '48',
      provinceName: 'Đà Nẵng',
      taxCode: null,
      businessLicenseNo: null,
      ...profile,
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
    ...overrides,
  };
}

const ACTIVE = { status: TENANT_STATUS.ACTIVE } as const;

async function renderScreen(
  permissions: Permission[],
  data: MyShop = shop(),
  tenantStatus: TenantStatus = data.status as TenantStatus,
  variant: 'settings' | 'profileForm' = 'settings',
  /** `GET /tenants/current/shop` hỏng — dựng trạng thái lỗi tải. */
  loadFails = false,
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(
    currentUser(permissions, {
      id: '01JQZX0000000000000000000T',
      name: 'Cho thuê xe Bình Minh',
      slug: 'binh-minh',
      status: tenantStatus,
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
    }),
  );
  jest
    .spyOn(locationsApi, 'provinces')
    .mockResolvedValue([
      { code: '48', name: 'Đà Nẵng', administrativeType: 'municipality', slug: 'da-nang' },
    ]);
  const shopSpy = jest.spyOn(tenantsApi, 'myShop');
  if (loadFails) shopSpy.mockRejectedValue(new Error('network down'));
  else shopSpy.mockResolvedValue(data);
  const updateSpy = jest.spyOn(tenantsApi, 'updateProfile').mockResolvedValue(data);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ShopProfileScreen variant={variant} />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, shopSpy, updateSpy };
}

/** Hồ sơ ĐỦ HẾT — bốn mục bắt buộc (tên chủ + SĐT đọc từ tài khoản) và bốn mục nên có. */
const COMPLETE_PROFILE = {
  bio: 'Xe đời mới, giao tận nơi',
  address: '12 Bạch Đằng, Hải Châu, Đà Nẵng',
  logoUrl: 'https://cdn.example/logo.png',
  coverUrl: 'https://cdn.example/cover.png',
} as const;

beforeEach(() => jest.restoreAllMocks());

describe('ShopProfileScreen — quyền', () => {
  it('thiếu `tenant.view`: màn thiếu quyền và KHÔNG gọi API hồ sơ', async () => {
    const view = await renderScreen([PERMISSION.VEHICLE_VIEW]);

    expect(await view.findByText('Không có quyền truy cập')).toBeTruthy();
    expect(view.shopSpy).not.toHaveBeenCalled();
  });

  it('có xem, thiếu `tenant.update`: form chỉ-đọc và KHÔNG có nút Lưu', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Bạn chỉ có quyền xem hồ sơ gian hàng.')).toBeTruthy();
    expect(view.queryByText('Lưu thông tin')).toBeNull();
    // Bảng "còn thiếu gì" không có nghĩa với người chỉ xem — đúng như web (`!readOnly`).
    expect(view.queryByText('Hoàn thiện hồ sơ')).toBeNull();
  });
});

describe('ShopProfileScreen — dải trạng thái chỉ nói về trạng thái VẬN HÀNH', () => {
  const all: Permission[] = [PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE];

  it('suspended: dải cảnh báo vẫn hiện — xe đang rời chợ ngay lúc này', async () => {
    const view = await renderScreen(
      all,
      shop({ status: TENANT_STATUS.SUSPENDED }),
      TENANT_STATUS.SUSPENDED,
    );

    expect(await view.findByText('Gian hàng đang bị khoá')).toBeTruthy();
  });

  it('expired: hết hạn GÓI vẫn xem được hồ sơ của chính mình (ADR 0027 điều 3)', async () => {
    const view = await renderScreen(
      all,
      shop({ status: TENANT_STATUS.EXPIRED }),
      TENANT_STATUS.EXPIRED,
    );

    expect(await view.findByText('Gói dịch vụ đã hết hạn')).toBeTruthy();
    expect(view.getByLabelText('Tên hiển thị')).toBeTruthy();
  });
});

/*
 * 24/09/2026 — web gỡ HẲN luồng xin xác minh gian hàng (`/manage/shop` lẫn
 * `/account/registration`): nền tảng tạm ngừng xác minh, màn duyệt của nền tảng chỉ nhận phiếu
 * XE, nên một phiếu gửi đi không có ai ở đầu kia. Backend gỡ luôn cái khoá "đang chờ" ở
 * `TenantsService.updateProfile`. App theo đúng như vậy.
 */
describe('ShopProfileScreen — không còn luồng xin xác minh gian hàng', () => {
  const all: Permission[] = [
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.TENANT_SUBMIT_REVIEW,
  ];

  it.each([
    SHOP_VERIFICATION.UNVERIFIED,
    SHOP_VERIFICATION.PENDING,
    SHOP_VERIFICATION.NEEDS_REVISION,
    SHOP_VERIFICATION.REJECTED,
    SHOP_VERIFICATION.VERIFIED,
  ])('trạng thái %s: KHÔNG có nút gửi xác minh, KHÔNG có dải về xác minh', async (verification) => {
    const view = await renderScreen(
      all,
      shop({
        ...ACTIVE,
        verification,
        latestApproval: {
          status: 'needs_revision',
          reason: 'Ảnh giấy phép kinh doanh bị mờ',
          submittedAt: '2026-09-01T02:00:00.000Z',
          reviewedAt: '2026-09-02T02:00:00.000Z',
        },
      }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByLabelText('Tên hiển thị')).toBeTruthy();
    expect(view.queryByText('Gửi xác minh')).toBeNull();
    expect(view.queryByText('Gửi lại xác minh')).toBeNull();
    expect(view.queryByText('Hồ sơ đang chờ nền tảng xác minh')).toBeNull();
    expect(view.queryByText('Nền tảng yêu cầu bổ sung hồ sơ')).toBeNull();
    expect(view.queryByText(/Ảnh giấy phép kinh doanh bị mờ/)).toBeNull();
  });

  it('còn phiếu xác minh chờ (dữ liệu cũ): VẪN sửa và lưu được, không có câu "tạm khoá"', async () => {
    const view = await renderScreen(
      all,
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.PENDING }),
      TENANT_STATUS.ACTIVE,
    );

    await fireEvent.changeText(await view.findByLabelText('Tên hiển thị'), 'Bình Minh Xe');
    expect(view.queryByText('Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa.')).toBeNull();

    await fireEvent.press(view.getByText('Lưu thông tin'));
    await waitFor(() => expect(view.updateSpy).toHaveBeenCalledTimes(1));
    expect(view.updateSpy.mock.calls[0]?.[0]).toMatchObject({ displayName: 'Bình Minh Xe' });
  });

  it('đang hoạt động: KHÔNG dựng dải nào — nhãn cạnh tên gian hàng đã nói điều đó', async () => {
    const view = await renderScreen(all, shop(ACTIVE), TENANT_STATUS.ACTIVE);

    expect(await view.findByLabelText('Tên hiển thị')).toBeTruthy();
    expect(view.queryByText('Gian hàng đang bị khoá')).toBeNull();
    expect(view.queryByText('Gói dịch vụ đã hết hạn')).toBeNull();
  });
});

describe('ShopProfileScreen — checklist "Hoàn thiện hồ sơ"', () => {
  const all: Permission[] = [PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE];

  it('còn thiếu: hiện bảng, chữ KHÔNG nhắc tới "gửi duyệt"', async () => {
    const view = await renderScreen(all, shop(ACTIVE, { displayName: '' }), TENANT_STATUS.ACTIVE);

    expect(await view.findByText('Hoàn thiện hồ sơ')).toBeTruthy();
    expect(view.getByText('Thông tin bắt buộc')).toBeTruthy();
    expect(view.queryByText('Bắt buộc để gửi duyệt')).toBeNull();
    expect(view.queryByText(/gửi duyệt/i)).toBeNull();
  });

  it('đủ mục bắt buộc nhưng còn mục nên có: báo đã đủ, vẫn liệt kê phần nên có', async () => {
    // Tenant của `renderScreen` là tuyến GÓI ⇒ logo là mục bắt buộc (ADR 0040 điều 7).
    const view = await renderScreen(
      all,
      shop(ACTIVE, { logoUrl: 'https://cdn.example/logo.png' }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByText('Đã đủ thông tin bắt buộc')).toBeTruthy();
    expect(view.queryByText('Đã đủ điều kiện gửi duyệt')).toBeNull();
  });

  it('hồ sơ đã ĐỦ HẾT: không dựng thẻ 100% thường trực', async () => {
    const view = await renderScreen(all, shop(ACTIVE, COMPLETE_PROFILE), TENANT_STATUS.ACTIVE);

    expect(await view.findByLabelText('Tên hiển thị')).toBeTruthy();
    expect(view.queryByText('Hoàn thiện hồ sơ')).toBeNull();
  });

  it('đang gõ làm hồ sơ thiếu đi: bảng hiện lại ngay (đọc bản ĐANG NHẬP)', async () => {
    const view = await renderScreen(all, shop(ACTIVE, COMPLETE_PROFILE), TENANT_STATUS.ACTIVE);

    await fireEvent.changeText(await view.findByLabelText('Tên hiển thị'), '');
    expect(await view.findByText('Hoàn thiện hồ sơ')).toBeTruthy();
  });
});

/*
 * Hai khu, hai câu — đúng như web: `/manage/shop` nói về gian hàng, còn "Hồ sơ chủ xe" ở khu tài
 * khoản (`OwnerRegistrationView`) nói `Account.registration.loadError`.
 */
describe('ShopProfileScreen — lỗi tải theo khu đang đứng', () => {
  it('trang Cửa hàng: câu về GIAN HÀNG', async () => {
    const view = await renderScreen(
      [PERMISSION.TENANT_VIEW],
      shop(ACTIVE),
      TENANT_STATUS.ACTIVE,
      'settings',
      true,
    );

    expect(await view.findByText('Không tải được hồ sơ gian hàng')).toBeTruthy();
    expect(view.queryByText('Không tải được hồ sơ chủ xe')).toBeNull();
  });

  it('"Hồ sơ chủ xe": câu về HỒ SƠ CHỦ XE', async () => {
    const view = await renderScreen(
      [PERMISSION.TENANT_VIEW],
      shop(ACTIVE),
      TENANT_STATUS.ACTIVE,
      'profileForm',
      true,
    );

    expect(await view.findByText('Không tải được hồ sơ chủ xe')).toBeTruthy();
    expect(view.queryByText('Không tải được hồ sơ gian hàng')).toBeNull();
  });
});

describe('ShopProfileScreen — tỉnh của gian hàng', () => {
  it('tỉnh hiển thị lấy từ CHI NHÁNH MẶC ĐỊNH, không phải bản sao trên hồ sơ', async () => {
    const view = await renderScreen(
      [PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE],
      shop(
        {
          defaultBranch: {
            id: '01JQZX0000000000000000000B',
            code: 'CN01',
            name: 'Chi nhánh chính',
            provinceCode: '48',
            provinceName: 'Đà Nẵng',
            needsLocationReview: false,
          },
        },
        // Bản sao CŨ trên hồ sơ trỏ tỉnh khác — nó KHÔNG được thắng.
        { provinceCode: '79', provinceName: 'Hồ Chí Minh' },
      ),
    );

    expect(await view.findByText('TP Đà Nẵng')).toBeTruthy();
    expect(view.queryByText('Hồ Chí Minh')).toBeNull();
  });
});
