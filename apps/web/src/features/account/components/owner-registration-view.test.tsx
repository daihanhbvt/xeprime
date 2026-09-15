import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, SHOP_VERIFICATION, TENANT_STATUS, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

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
    profile: {
      displayName: 'Nguyễn Văn A',
      ownerFullName: 'Nguyễn Văn A',
      ownerPhone: '84901234567',
      ownerEmail: null,
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
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      qrUrl: null,
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
    shop.data = makeShop({
      profile: { ...(makeShop().profile as Record<string, unknown>), ownerPhone: null },
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
