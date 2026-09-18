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
  const shopSpy = jest.spyOn(tenantsApi, 'myShop').mockResolvedValue(data);
  const updateSpy = jest.spyOn(tenantsApi, 'updateProfile').mockResolvedValue(data);
  const submitSpy = jest.spyOn(tenantsApi, 'submitReview').mockResolvedValue(data);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ShopProfileScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, shopSpy, updateSpy, submitSpy };
}

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
  });

  it('thiếu `tenant.submit_review`: đọc được dải xác minh nhưng KHÔNG có nút gửi lại', async () => {
    const view = await renderScreen(
      [PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE],
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.NEEDS_REVISION }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByText('Nền tảng yêu cầu bổ sung hồ sơ')).toBeTruthy();
    expect(view.queryByText('Gửi lại xác minh')).toBeNull();
  });
});

describe('ShopProfileScreen — trục TRẠNG THÁI gian hàng (tenants.status)', () => {
  const all: Permission[] = [
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.TENANT_SUBMIT_REVIEW,
  ];

  /*
   * Từ ADR 0036 trục này chỉ còn trả lời "gian hàng còn được hoạt động không?". Khi nó KHÔNG bình
   * thường, dải nói về nó và không mời gửi xác minh — tin xe đang biến khỏi chợ quan trọng hơn.
   */
  it('suspended: nói rõ đang bị khoá, KHÔNG mời gửi xác minh', async () => {
    const view = await renderScreen(
      all,
      shop({ status: TENANT_STATUS.SUSPENDED }),
      TENANT_STATUS.SUSPENDED,
    );

    expect(await view.findByText('Gian hàng đang bị khoá')).toBeTruthy();
    expect(view.queryByText('Hồ sơ đang chờ nền tảng xác minh')).toBeNull();
    expect(view.queryByText('Gửi lại xác minh')).toBeNull();
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

describe('ShopProfileScreen — trục XÁC MINH (ADR 0036)', () => {
  const all: Permission[] = [
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.TENANT_SUBMIT_REVIEW,
  ];

  /**
   * CHƯA XÁC MINH = KHÔNG CÓ TIN GÌ, KHÔNG CÓ VIỆC GÌ (ADR 0040).
   *
   * Tới 16/09/2026 trạng thái này mang một dải kèm nút "Gửi xác minh", và câu chữ hứa rằng xác
   * minh là điều kiện để MUA GÓI. ADR 0040 gỡ cổng đó — nút không còn đổi lấy được gì cho người
   * bấm, trong khi nó vẫn KHOÁ hồ sơ khỏi việc sửa suốt thời gian chờ. Nên dải im lặng hẳn.
   *
   * Checklist thì VẪN còn: hồ sơ vẫn gửi xác minh được (`SHOP_VERIFICATION_SUBMITTABLE` không
   * đổi), và nó là bảng kiểm kê cho cả cổng gửi duyệt xe.
   */
  it('chưa xác minh: KHÔNG dựng dải nào, nhưng checklist vẫn còn', async () => {
    const view = await renderScreen(all, shop(ACTIVE), TENANT_STATUS.ACTIVE);

    expect(await view.findByText('Hoàn thiện hồ sơ')).toBeTruthy();
    expect(view.queryByText('Gian hàng chưa được xác minh')).toBeNull();
    expect(view.queryByText('Hồ sơ đang chờ nền tảng xác minh')).toBeNull();
    expect(view.queryByText('Gửi xác minh')).toBeNull();
    expect(view.queryByText('Gửi lại xác minh')).toBeNull();
  });

  it('đang chờ xác minh: KHOÁ form vì backend từ chối ghi, KHÔNG phải vì thiếu quyền', async () => {
    const view = await renderScreen(
      all,
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.PENDING }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByText('Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa.')).toBeTruthy();
    // Câu của "thiếu quyền" phải KHÁC hẳn — hai tình huống, hai lối ra.
    expect(view.queryByText('Bạn chỉ có quyền xem hồ sơ gian hàng.')).toBeNull();
    expect(view.queryByText('Gửi lại xác minh')).toBeNull();
    expect(view.queryByText('Hoàn thiện hồ sơ')).toBeNull();
    /*
     * Dải nói VÌ SAO đang khoá — xe không bị ảnh hưởng. Đây là khác biệt so với nhánh trạng thái
     * vận hành: ở đó tin là "gian hàng không chạy", ở đây là "hồ sơ đang trong hàng đợi".
     */
    expect(view.getByText('Hồ sơ đang chờ nền tảng xác minh')).toBeTruthy();
  });

  it('bị trả về: hiện NGUYÊN VĂN lý do của đội duyệt + nút gửi lại', async () => {
    const view = await renderScreen(
      all,
      shop({
        ...ACTIVE,
        verification: SHOP_VERIFICATION.NEEDS_REVISION,
        onboardingState: 'commission',
        latestApproval: {
          status: 'needs_revision',
          reason: 'Thiếu ảnh giấy phép kinh doanh',
          submittedAt: '2026-09-01T02:00:00.000Z',
          reviewedAt: '2026-09-02T02:00:00.000Z',
        },
      }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByText(/Thiếu ảnh giấy phép kinh doanh/)).toBeTruthy();
    expect(view.getByText('Gửi lại xác minh')).toBeTruthy();
  });

  it('đã xác minh: không còn checklist, không còn nút gửi', async () => {
    const view = await renderScreen(
      all,
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.VERIFIED }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByLabelText('Tên hiển thị')).toBeTruthy();
    /*
     * Một dải xanh "mọi thứ đều ổn" chiếm trọn bề ngang chỉ dạy người dùng bỏ qua vùng ấy — và
     * đúng lúc có tin xấu thì họ cũng không đọc nữa. Nhãn trạng thái cạnh tên gian hàng đã đủ.
     */
    expect(view.queryByText('Gian hàng đã được xác minh')).toBeNull();
    expect(view.queryByText('Hoàn thiện hồ sơ')).toBeNull();
    expect(view.queryByText('Gửi lại xác minh')).toBeNull();
  });
});

describe('ShopProfileScreen — gửi xác minh', () => {
  const all: Permission[] = [
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.TENANT_SUBMIT_REVIEW,
  ];

  /**
   * Cổng CLIENT là schema của chính biểu mẫu, không phải `missingShopProfileRequirements`.
   *
   * Hai bộ khác nhau có chủ đích, và web gác đúng như vậy (`openSubmitConfirm = handleSubmit(...)`):
   * họ tên + SĐT chủ đọc từ TÀI KHOẢN (16/09/2026), không còn là ô trong form này, nên màn không có
   * cách nào bắt người dùng sửa chúng ở đây — cổng thật cho nhóm đó là backend
   * (`PROFILE_INCOMPLETE`), và checklist ngay trên nút mới là chỗ nói ra chúng còn thiếu.
   *
   * Thứ màn này chặn được là ô của chính nó: thiếu tên hiển thị thì không mở hộp xác nhận, không
   * gọi API, và toast đếm đúng số ô hỏng.
   */
  it('ô bắt buộc của form còn trống: chặn ngay, không mở hộp xác nhận và không gọi API', async () => {
    const view = await renderScreen(
      all,
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.NEEDS_REVISION }, { displayName: '' }),
      TENANT_STATUS.ACTIVE,
    );

    await fireEvent.press(await view.findByText('Gửi lại xác minh'));

    await waitFor(() => expect(view.submitSpy).not.toHaveBeenCalled());
    expect(view.queryByText('Gửi hồ sơ cho nền tảng duyệt?')).toBeNull();
  });

  it('hồ sơ đủ: xác nhận rồi mới gửi', async () => {
    const view = await renderScreen(
      all,
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.NEEDS_REVISION }),
      TENANT_STATUS.ACTIVE,
    );

    await fireEvent.press(await view.findByText('Gửi lại xác minh'));
    expect(await view.findByText('Gửi hồ sơ cho nền tảng duyệt?')).toBeTruthy();
    expect(view.submitSpy).not.toHaveBeenCalled();

    await fireEvent.press(view.getByText('Gửi duyệt'));
    await waitFor(() => expect(view.submitSpy).toHaveBeenCalled());
  });

  it('còn thay đổi chưa lưu: LƯU trước rồi mới gửi (backend snapshot từ DB)', async () => {
    const view = await renderScreen(
      all,
      shop({ ...ACTIVE, verification: SHOP_VERIFICATION.NEEDS_REVISION }),
      TENANT_STATUS.ACTIVE,
    );

    await fireEvent.changeText(await view.findByLabelText('Tên hiển thị'), 'Bình Minh Xe');
    await fireEvent.press(view.getByText('Gửi lại xác minh'));
    await fireEvent.press(await view.findByText('Gửi duyệt'));

    await waitFor(() => expect(view.updateSpy).toHaveBeenCalled());
    expect(view.updateSpy.mock.calls[0]?.[0]).toMatchObject({ displayName: 'Bình Minh Xe' });
    await waitFor(() => expect(view.submitSpy).toHaveBeenCalled());
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
