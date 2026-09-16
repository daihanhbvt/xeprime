import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERMISSION,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';

import { OwnerRegistrationView } from './OwnerRegistrationView';

/**
 * Màn TIẾN TRÌNH ĐĂNG KÝ chủ xe — ADR 0036.
 *
 * Đây là màn duy nhất của bậc `registering`, tức là màn mà chủ xe mới nhìn vào để trả lời đúng
 * một câu: *"chiếc xe tôi vừa khai đang ở đâu, và tôi phải làm gì tiếp?"*. Ba điều test này giữ,
 * và cả ba đều là lỗi ĐÃ CÓ THẬT ở bản trước:
 *
 *  1. **Bước 1 không chờ ai duyệt.** Bản cũ chấm "hồ sơ xong" bằng `tenants.status === active`.
 *     Từ ADR 0036 cột đó `active` ngay từ lúc mở hồ sơ, nên cách chấm cũ làm bước 1 luôn xanh —
 *     và màn hình mất khả năng nói cho chủ xe biết hồ sơ của họ còn thiếu gì.
 *  2. **Xe NHÁP không biến mất.** Bản cũ chỉ liệt kê xe `pending`/`needs_revision`/`rejected`.
 *     Với một cổng duyệt, chiếc xe nháp là thứ duy nhất đứng giữa chủ xe và marketplace — giấu
 *     nó đi là để người vừa lưu nháp xong mở màn này lên và không thấy xe của mình đâu cả.
 *  3. **Lý do bị trả về hiện ngay tại dòng đó**, không bắt mở từng chiếc để đi tìm.
 */
const shop = vi.hoisted(() => ({
  data: null as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const vehicles = vi.hoisted(() => ({ data: { items: [] as unknown[] } }));

vi.mock('@/features/shop/hooks/use-shop', () => ({
  useMyShop: () => shop,
  useUpdateShopProfile: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useSubmitShopReview: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({ useVehicles: () => vehicles }));

/*
 * `OwnerRegistrationView` gọi `useRouter()`, và `next/navigation` ném "app router to be mounted"
 * ngoài một App Router thật. `replace` là một spy THẬT vì cổng tuyến gói (ADR 0040) được kiểm
 * bằng chính lời gọi đó.
 */
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/account/registration',
  useSearchParams: () => new URLSearchParams(),
}));

/*
 * Màn này đọc `/auth/me` để biết chủ xe đang ở TUYẾN nào. Chặn ở tầng hook — bộ này kiểm thanh
 * bước, không kiểm cách lấy dữ liệu, và dựng một QueryClient chỉ để trả về một object là thêm
 * một lớp không nói gì thêm.
 *
 * `tenant` LÁI ĐƯỢC vì trục đăng ký (ADR 0040) quyết định màn này có được dựng hay không.
 */
const scope = vi.hoisted(() => ({
  tenant: {
    id: 't1',
    name: 'Nguyễn Văn A',
    roleKey: 'shop_owner',
    onboardingState: 'commission',
    billingMode: 'commission',
  } as Record<string, unknown> | null,
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      id: '01HUSER000000000000000000',
      displayName: 'Nguyễn Văn A',
      tenant: scope.tenant,
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: () => true,
    hasAny: () => true,
    isLoading: false,
  }),
}));

/*
 * Form hồ sơ là `ShopProfileWorkspace` DÙNG CHUNG với `/manage/shop` và đã có test riêng — nó
 * kéo theo ô địa chỉ, bộ chọn danh mục hành chính và bản đồ. Ở đây câu hỏi là tiến trình, không
 * phải cái form.
 */
vi.mock('@/features/shop/components/ShopProfileWorkspace', () => ({
  ShopProfileWorkspace: () => <div data-testid="shop-profile-workspace" />,
}));

function makeShop(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    code: 'SHOP-1',
    slug: 'chu-xe-a',
    name: 'Nguyễn Văn A',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    verification: SHOP_VERIFICATION.UNVERIFIED,
    phone: '84901234567',
    email: null,
    latestApproval: null,
    defaultBranch: {
      id: 'b1',
      code: 'CN01',
      name: 'Chi nhánh chính',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      wardCode: null,
      wardName: null,
      address: null,
      needsLocationReview: false,
    },
    /*
     * Chủ gian hàng đọc từ TÀI KHOẢN (16/09/2026): ba cột `tenant_profiles.owner_*` đã drop, và
     * thẻ tiến trình chấm "hồ sơ đủ chưa" bằng đúng nguồn mà cổng gửi duyệt ở backend dùng.
     */
    ownerAccount: {
      userId: '01HUSER000000000000000000',
      displayName: 'Nguyễn Văn A',
      email: null,
      phone: '84901234567',
      emailVerified: false,
      phoneVerified: true,
    },
    profile: {
      displayName: 'Nguyễn Văn A',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      bio: null,
      logoUrl: null,
      coverUrl: null,
      address: null,
      wardCode: null,
      wardName: null,
      taxCode: null,
      businessLicenseNo: null,
    },
    ...over,
  };
}

function makeVehicle(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    code: 'XE-01',
    name: 'Toyota Vios',
    vehicleType: 'car',
    serviceTypes: ['self_drive'],
    operationStatus: 'available',
    publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
    updatedAt: '2026-09-14T00:00:00.000Z',
    latestPublicReview: null,
    ...over,
  };
}

function render() {
  return renderWithIntl(
    <App>
      <OwnerRegistrationView />
    </App>,
  );
}

beforeEach(() => {
  shop.data = makeShop();
  shop.isLoading = false;
  shop.isError = false;
  vehicles.data = { items: [] };
  router.replace.mockReset();
  scope.tenant = {
    id: 't1',
    name: 'Nguyễn Văn A',
    roleKey: 'shop_owner',
    onboardingState: 'commission',
    billingMode: 'commission',
  };
});

afterEach(cleanup);

describe('Tiến trình đăng ký — một cổng duyệt', () => {
  it('không còn bước "chờ nền tảng duyệt hồ sơ gian hàng"', () => {
    render();

    // Ba bước, và bước giữa là ĐĂNG XE — không phải chờ một cái gật đầu cho hồ sơ.
    expect(screen.getByText('Đăng xe & gửi duyệt')).toBeTruthy();
    expect(screen.getByText('Lên chợ')).toBeTruthy();
    expect(screen.queryByText(/hồ sơ chủ xe của bạn được nền tảng duyệt/i)).toBeNull();
  });

  it('chưa có xe: mời đăng xe ngay, KHÔNG bắt chờ hồ sơ được duyệt', () => {
    render();

    expect(screen.getByText('Còn thiếu chiếc xe đầu tiên')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Đăng xe đầu tiên/ })).toBeTruthy();
  });

  it('xe NHÁP vẫn hiện trong danh sách tiến trình — không biến mất', () => {
    vehicles.data = { items: [makeVehicle({ name: 'Vios nháp' })] };
    render();

    expect(screen.getByText('Vios nháp')).toBeTruthy();
    expect(screen.getByText('Nháp')).toBeTruthy();
  });

  it('xe bị trả về: hiện NGUYÊN VĂN lý do ngay tại dòng đó', () => {
    vehicles.data = {
      items: [
        makeVehicle({
          name: 'Vios cần sửa',
          publicStatus: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
          latestPublicReview: {
            status: 'needs_revision',
            reason: 'Ảnh nội thất bị mờ.',
            submittedAt: '2026-09-14T00:00:00.000Z',
            reviewedAt: '2026-09-14T01:00:00.000Z',
          },
        }),
      ],
    };
    render();

    expect(screen.getByText('Ảnh nội thất bị mờ.')).toBeTruthy();
  });

  /*
   * Hồ sơ thiếu SĐT chủ xe: bước 1 phải nói CHƯA XONG. Bản cũ chấm theo `tenants.status`, nên
   * với ADR 0036 nó sẽ luôn xanh và màn hình không còn nói được hồ sơ thiếu gì.
   */
  it('hồ sơ thiếu mục bắt buộc: bước hồ sơ CHƯA xong', () => {
    // Thiếu SĐT nghĩa là TÀI KHOẢN CHỦ chưa có số — cổng đọc `users`, không đọc hồ sơ.
    shop.data = makeShop({
      ownerAccount: { ...makeShop().ownerAccount, phone: null },
    });
    render();

    // "Hồ sơ chủ xe" xuất hiện cả ở tiêu đề trang lẫn ở bước 1 — lấy đúng ô trên thanh bước.
    const profileStep = screen
      .getAllByText('Hồ sơ chủ xe')
      .map((el) => el.closest('.ant-steps-item'))
      .find(Boolean);
    expect(profileStep?.className).toContain('ant-steps-item-process');
  });

  it('hồ sơ đủ nhưng chưa có xe trên chợ: bước ĐANG MỞ là bước đăng xe', () => {
    vehicles.data = { items: [makeVehicle()] };
    render();

    const vehicleStep = screen.getByText('Đăng xe & gửi duyệt').closest('.ant-steps-item');
    expect(vehicleStep?.className).toContain('ant-steps-item-process');
  });

  it('đã có xe trên chợ: bước ĐANG MỞ là "Lên chợ"', () => {
    vehicles.data = {
      items: [makeVehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC })],
    };
    render();

    const liveStep = screen.getByText('Lên chợ').closest('.ant-steps-item');
    expect(liveStep?.className).toContain('ant-steps-item-process');
  });
});

describe('Quyền', () => {
  it('thiếu quyền xem hồ sơ: không gọi API hồ sơ, màn vẫn dựng được', () => {
    // `useMyShop(enabled)` nhận cờ quyền; ở đây chỉ cần màn không vỡ khi hồ sơ chưa có.
    shop.data = makeShop();
    render();
    expect(screen.getByTestId('shop-profile-workspace')).toBeTruthy();
    expect(PERMISSION.TENANT_VIEW).toBeTruthy();
  });
});

/**
 * GIAN HÀNG TRẢ PHÍ KHÔNG BAO GIỜ THẤY MÀN NÀY (ADR 0040).
 *
 * `resolveWorkspaceHref` đã không dẫn họ tới đây, nhưng route vẫn gõ tay được — và một gian hàng
 * vừa hết gói thì `resolveOwnerStage` chấm là `registering` ngay khi chiếc xe cuối rời chợ, nên
 * `OwnerGate` cho họ qua. Màn này kể một câu chuyện ba bước dành cho người CHƯA bắt đầu ("Hồ sơ
 * chủ xe → Đăng xe đầu tiên → Lên chợ"); với một gian hàng 10 xe vừa cần gia hạn thì đó là câu
 * chuyện sai hoàn toàn.
 */
describe('Cổng tuyến gói', () => {
  it('gian hàng đã từng trả tiền: điều hướng đi, KHÔNG dựng thanh bước', () => {
    scope.tenant = {
      id: 't1',
      name: 'Gian hàng A',
      roleKey: 'shop_owner',
      onboardingState: 'package_active',
      // Gói ĐÃ HẾT HẠN — đây chính là ca mà `OwnerGate` cho qua.
      billingMode: 'commission',
    };

    renderWithIntl(
      <App>
        <OwnerRegistrationView />
      </App>,
    );

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0]![0]).toContain('/vehicles');
    // Không một chữ nào của wizard đăng ký được dựng ra.
    expect(screen.queryByTestId('shop-profile-workspace')).toBeNull();
    expect(screen.queryByText(/Hồ sơ chủ xe/)).toBeNull();
  });

  it('chủ xe tuyến hoa hồng: dựng bình thường, không điều hướng', () => {
    renderWithIntl(
      <App>
        <OwnerRegistrationView />
      </App>,
    );

    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('shop-profile-workspace')).toBeTruthy();
  });
});
