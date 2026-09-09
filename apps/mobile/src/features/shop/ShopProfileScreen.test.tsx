import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
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
    roleKey: 'shop_owner',
    features: [],
    planCode: null,
    planEndsAt: null,
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
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      qrUrl: null,
      ownerFullName: 'Nguyễn Văn A',
      ownerPhone: '84901111111',
      ownerEmail: null,
      ...profile,
    },
    latestApproval: null,
    defaultBranch: {
      id: '01JQZX0000000000000000000B',
      code: 'CN01',
      name: 'Chi nhánh chính',
      provinceCode: '48',
      provinceName: 'Đà Nẵng',
    },
    ...overrides,
  };
}

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
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planEndsAt: null,
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

  it('thiếu `tenant.submit_review`: KHÔNG có nút gửi duyệt dù hồ sơ đang ở bản nháp', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE]);

    expect(await view.findByText('Hồ sơ chưa được gửi duyệt')).toBeTruthy();
    expect(view.queryByText('Gửi duyệt')).toBeNull();
  });
});

describe('ShopProfileScreen — ma trận trạng thái gian hàng', () => {
  const all: Permission[] = [
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.TENANT_SUBMIT_REVIEW,
  ];

  it('draft: nút "Gửi duyệt" + checklist hoàn thiện hồ sơ', async () => {
    const view = await renderScreen(all);

    expect(await view.findByText('Gửi duyệt')).toBeTruthy();
    expect(view.getByText('Hoàn thiện hồ sơ')).toBeTruthy();
  });

  it('pending_review: KHOÁ form vì backend từ chối ghi, KHÔNG phải vì thiếu quyền', async () => {
    const view = await renderScreen(
      all,
      shop({ status: TENANT_STATUS.PENDING_REVIEW }),
      TENANT_STATUS.PENDING_REVIEW,
    );

    expect(await view.findByText('Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa.')).toBeTruthy();
    // Câu của "thiếu quyền" phải KHÁC hẳn — hai tình huống, hai lối ra.
    expect(view.queryByText('Bạn chỉ có quyền xem hồ sơ gian hàng.')).toBeNull();
    expect(view.queryByText('Gửi duyệt')).toBeNull();
    // Chờ duyệt là lúc đề nghị thêm xe — xe khai được ngay, chỉ chưa lên chợ.
    expect(view.getByText('Thêm xe')).toBeTruthy();
  });

  it('needs_revision: hiện NGUYÊN VĂN lý do của đội duyệt + nút gửi lại', async () => {
    const view = await renderScreen(
      all,
      shop({
        status: TENANT_STATUS.NEEDS_REVISION,
        latestApproval: {
          status: 'needs_revision',
          reason: 'Thiếu ảnh giấy phép kinh doanh',
          submittedAt: '2026-09-01T02:00:00.000Z',
          reviewedAt: '2026-09-02T02:00:00.000Z',
        },
      }),
      TENANT_STATUS.NEEDS_REVISION,
    );

    expect(await view.findByText(/Thiếu ảnh giấy phép kinh doanh/)).toBeTruthy();
    expect(view.getByText('Gửi lại duyệt')).toBeTruthy();
  });

  it('active: không còn checklist, không còn nút gửi duyệt', async () => {
    const view = await renderScreen(
      all,
      shop({ status: TENANT_STATUS.ACTIVE }),
      TENANT_STATUS.ACTIVE,
    );

    expect(await view.findByText('Gian hàng đang hoạt động')).toBeTruthy();
    expect(view.queryByText('Hoàn thiện hồ sơ')).toBeNull();
    expect(view.queryByText('Gửi duyệt')).toBeNull();
  });

  it('suspended: nói rõ đang bị khoá, KHÔNG mời gửi duyệt', async () => {
    const view = await renderScreen(
      all,
      shop({ status: TENANT_STATUS.SUSPENDED }),
      TENANT_STATUS.SUSPENDED,
    );

    expect(await view.findByText('Gian hàng đang bị khoá')).toBeTruthy();
    expect(view.queryByText('Gửi duyệt')).toBeNull();
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

describe('ShopProfileScreen — gửi duyệt', () => {
  const all: Permission[] = [
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.TENANT_SUBMIT_REVIEW,
  ];

  it('hồ sơ THIẾU mục bắt buộc: chặn ngay, không mở hộp xác nhận và không gọi API', async () => {
    const view = await renderScreen(
      all,
      shop({}, { ownerFullName: null, ownerPhone: null }),
    );

    await fireEvent.press(await view.findByText('Gửi duyệt'));

    await waitFor(() => expect(view.submitSpy).not.toHaveBeenCalled());
    expect(view.queryByText('Gửi hồ sơ cho nền tảng duyệt?')).toBeNull();
  });

  it('hồ sơ đủ: xác nhận rồi mới gửi', async () => {
    const view = await renderScreen(all);

    await fireEvent.press(await view.findByText('Gửi duyệt'));
    expect(await view.findByText('Gửi hồ sơ cho nền tảng duyệt?')).toBeTruthy();
    expect(view.submitSpy).not.toHaveBeenCalled();

    await fireEvent.press(view.getAllByText('Gửi duyệt')[1] as never);
    await waitFor(() => expect(view.submitSpy).toHaveBeenCalled());
  });

  it('còn thay đổi chưa lưu: LƯU trước rồi mới gửi (backend snapshot từ DB)', async () => {
    const view = await renderScreen(all);

    await fireEvent.changeText(await view.findByLabelText('Tên hiển thị'), 'Bình Minh Xe');
    await fireEvent.press(view.getByText('Gửi duyệt'));
    await fireEvent.press((await view.findAllByText('Gửi duyệt'))[1] as never);

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
          },
        },
        // Bản sao CŨ trên hồ sơ trỏ tỉnh khác — nó KHÔNG được thắng.
        { provinceCode: '79', provinceName: 'Hồ Chí Minh' },
      ),
    );

    expect(await view.findByText('Đà Nẵng')).toBeTruthy();
    expect(view.queryByText('Hồ Chí Minh')).toBeNull();
  });
});
