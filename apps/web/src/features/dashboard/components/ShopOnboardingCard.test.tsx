import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERMISSION,
  SHOP_ONBOARDING_STATE,
  SHOP_VERIFICATION,
  TENANT_STATUS,
} from '@xeprime/types';
import type { MyShop } from '@/features/shop/types';
import { ShopOnboardingCard } from './ShopOnboardingCard';

/**
 * Thẻ ba bước ở đầu dashboard.
 *
 * Nó tồn tại vì gian hàng vừa mở rơi vào một bảng số liệu toàn `0` không nói được việc gì tiếp
 * theo. Nên thứ phải khoá lại là: nó chấm từng bước theo DỮ LIỆU THẬT (không phải một cờ "đã
 * xem hướng dẫn"), và nó tự biến mất khi hết việc — một thẻ hướng dẫn đứng mãi trên dashboard
 * của gian hàng đang chạy là rác chiếm chỗ.
 */
// `vi.hoisted` chạy TRƯỚC mọi import, nên không tham chiếu được hằng từ `@xeprime/types` ở đây
// — giá trị thật do `beforeEach` đặt, và nhờ vậy không có string literal nghiệp vụ nào trong test.
const state = vi.hoisted(() => ({
  tenantStatus: null as MyShop['status'] | null,
  verification: null as MyShop['verification'] | null,
  /** Số xe ĐANG trên chợ — mốc thẻ biến mất từ ADR 0036, thay cho `status === active`. */
  publicVehicleCount: 0,
  shop: null as MyShop | null,
  permissions: [] as string[],
}));

vi.mock('@/hooks/use-tenant-scope', () => ({
  useTenantScope: () => ({
    tenant: state.tenantStatus
      ? {
          id: 'T1',
          name: 'Shop',
          slug: 's',
          status: state.tenantStatus,
          onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
          roleKey: 'shop_owner',
          publicVehicleCount: state.publicVehicleCount,
        }
      : null,
    hasNoTenant: state.tenantStatus === null,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => state.permissions.includes(p),
    hasAny: (...ps: string[]) => ps.some((p) => state.permissions.includes(p)),
    isLoading: false,
  }),
}));

vi.mock('@/features/shop/hooks/use-shop', () => ({
  useMyShop: () => ({ data: state.shop }),
}));

function makeShop(
  profile: Partial<MyShop['profile']> = {},
  owner: Partial<MyShop['ownerAccount']> = {},
): MyShop {
  return {
    id: '01HSHOP00000000000000000A',
    code: 'SHOP-1',
    slug: 'demo',
    name: 'Demo',
    tenantType: 'individual',
    status: state.tenantStatus ?? TENANT_STATUS.DRAFT,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    verification: state.verification ?? SHOP_VERIFICATION.UNVERIFIED,
    phone: null,
    email: null,
    latestApproval: null,
    /*
     * Chủ gian hàng đọc từ TÀI KHOẢN (16/09/2026) — ba cột `tenant_profiles.owner_*` đã drop,
     * và thẻ này chấm "hồ sơ đủ chưa" bằng đúng nguồn mà cổng gửi duyệt ở backend dùng.
     */
    ownerAccount: {
      userId: '01HUSER000000000000000000',
      displayName: 'Nguyễn Văn A',
      email: null,
      phone: '84901234567',
      emailVerified: false,
      phoneVerified: true,
      ...owner,
    },
    defaultBranch: {
      id: '01HBRANCH0000000000000000',
      code: 'CN01',
      name: 'Chi nhánh',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      needsLocationReview: false,
    },
    profile: {
      displayName: 'Demo',
      bio: null,
      logoUrl: null,
      coverUrl: null,
      address: null,
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      taxCode: null,
      businessLicenseNo: null,
      ...profile,
    },
  };
}

/** Ô hành động của một bước: "Xong" · "Đang chờ XePrime" · hoặc nút đi tới. */
function stepRow(title: string): HTMLElement {
  const row = screen.getByText(title).closest('li');
  if (!row) throw new Error(`Không tìm thấy dòng cho bước "${title}"`);
  return row;
}

beforeEach(() => {
  // ADR 0036: gian hàng mở ra đã ĐANG HOẠT ĐỘNG; vòng duyệt duy nhất là duyệt XE.
  state.tenantStatus = TENANT_STATUS.ACTIVE;
  state.publicVehicleCount = 0;
  state.shop = null;
  state.permissions = [PERMISSION.TENANT_VIEW];
});

afterEach(cleanup);

describe('Thẻ ba bước — chấm theo dữ liệu thật', () => {
  it('hồ sơ còn thiếu mục bắt buộc: bước hồ sơ CHƯA xong, mời điền', () => {
    state.shop = makeShop({}, { phone: null });
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).toContain('Điền hồ sơ');
    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).not.toContain('Xong');
  });

  it('hồ sơ đủ mục bắt buộc: bước hồ sơ xong, việc còn lại là thêm xe', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).toContain('Xong');
    expect(stepRow('Thêm chiếc xe đầu tiên').textContent).toContain('Thêm xe');
  });

  /*
   * Bước giữa KHÔNG còn là "gửi hồ sơ gian hàng cho XePrime duyệt" (ADR 0036) — vòng duyệt duy
   * nhất là duyệt XE. Giữ nguyên bước cũ nghĩa là gửi người dùng đi chờ một cái gật đầu không
   * còn tồn tại.
   */
  it('không còn bước "gửi hồ sơ gian hàng cho XePrime duyệt"', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(screen.queryByText('Gửi hồ sơ cho XePrime duyệt')).toBeNull();
  });

  it('đã khai xe nhưng chưa xe nào lên chợ: bước duyệt XE ở trạng thái CHỜ', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={1} />);

    expect(stepRow('XePrime duyệt xe').textContent).toContain('Đang chờ XePrime');
  });

  it('đã có xe: bước xe xong', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={3} />);

    expect(stepRow('Thêm chiếc xe đầu tiên').textContent).toContain('Xong');
  });

  it('đã có xe TRÊN CHỢ: thẻ biến mất hoàn toàn', () => {
    state.publicVehicleCount = 2;
    state.shop = makeShop();
    const { container } = render(<ShopOnboardingCard vehicleCount={2} />);

    expect(container.textContent).toBe('');
  });

  it('chưa xe nào lên chợ: thẻ vẫn ở lại, bước duyệt xe chưa xong', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Thêm chiếc xe đầu tiên').textContent).toContain('Thêm xe');
    expect(stepRow('XePrime duyệt xe').textContent).not.toContain('Xong');
  });

  it('thiếu quyền `tenant.view`: vẫn thấy ba bước, chỉ là không chấm được bước hồ sơ', () => {
    state.permissions = [];
    state.shop = null;
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).toContain('Điền hồ sơ');
  });
});
