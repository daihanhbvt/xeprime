import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, TENANT_STATUS } from '@xeprime/types';
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
  shop: null as MyShop | null,
  permissions: [] as string[],
}));

vi.mock('@/hooks/use-tenant-scope', () => ({
  useTenantScope: () => ({
    tenant: state.tenantStatus
      ? { id: 'T1', name: 'Shop', slug: 's', status: state.tenantStatus, roleKey: 'shop_owner' }
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

function makeShop(profile: Partial<MyShop['profile']> = {}): MyShop {
  return {
    id: '01HSHOP00000000000000000A',
    code: 'SHOP-1',
    slug: 'demo',
    name: 'Demo',
    tenantType: 'individual',
    status: state.tenantStatus ?? TENANT_STATUS.DRAFT,
    phone: null,
    email: null,
    latestApproval: null,
    defaultBranch: {
      id: '01HBRANCH0000000000000000',
      code: 'CN01',
      name: 'Chi nhánh',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
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
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      qrUrl: null,
      ownerFullName: 'Nguyễn Văn A',
      ownerPhone: '84901234567',
      ownerEmail: null,
      ...profile,
    },
  };
}

/** Ô hành động của một bước: "Xong" · "Đang chờ duyệt" · hoặc nút đi tới. */
function stepRow(title: string): HTMLElement {
  const row = screen.getByText(title).closest('li');
  if (!row) throw new Error(`Không tìm thấy dòng cho bước "${title}"`);
  return row;
}

beforeEach(() => {
  state.tenantStatus = TENANT_STATUS.DRAFT;
  state.shop = null;
  state.permissions = [PERMISSION.TENANT_VIEW];
});

afterEach(cleanup);

describe('Thẻ ba bước — chấm theo dữ liệu thật', () => {
  it('hồ sơ còn thiếu mục bắt buộc: bước hồ sơ CHƯA xong, mời điền', () => {
    state.shop = makeShop({ ownerPhone: null });
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).toContain('Điền hồ sơ');
    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).not.toContain('Xong');
  });

  it('hồ sơ đủ mục bắt buộc: bước hồ sơ xong, nhưng bước gửi duyệt thì chưa', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).toContain('Xong');
    expect(stepRow('Gửi hồ sơ cho XePrime duyệt').textContent).toContain('Gửi duyệt');
  });

  it('đang chờ duyệt: bước gửi duyệt chuyển sang trạng thái CHỜ, không phải một nút bấm lại', () => {
    state.tenantStatus = TENANT_STATUS.PENDING_REVIEW;
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Gửi hồ sơ cho XePrime duyệt').textContent).toContain('Đang chờ duyệt');
    // Và thêm xe vẫn làm được ngay trong lúc chờ — đó là điểm của bước thứ ba.
    expect(stepRow('Thêm chiếc xe đầu tiên').textContent).toContain('Thêm xe');
  });

  it('đã có xe: bước xe xong', () => {
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={3} />);

    expect(stepRow('Thêm chiếc xe đầu tiên').textContent).toContain('Xong');
  });

  it('gian hàng đang hoạt động và đã có xe: thẻ biến mất hoàn toàn', () => {
    state.tenantStatus = TENANT_STATUS.ACTIVE;
    state.shop = makeShop();
    const { container } = render(<ShopOnboardingCard vehicleCount={2} />);

    expect(container.textContent).toBe('');
  });

  it('đang hoạt động nhưng chưa có xe: thẻ vẫn ở lại cho bước cuối', () => {
    state.tenantStatus = TENANT_STATUS.ACTIVE;
    state.shop = makeShop();
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Thêm chiếc xe đầu tiên').textContent).toContain('Thêm xe');
    expect(stepRow('Gửi hồ sơ cho XePrime duyệt').textContent).toContain('Xong');
  });

  it('thiếu quyền `tenant.view`: vẫn thấy ba bước, chỉ là không chấm được bước hồ sơ', () => {
    state.permissions = [];
    state.shop = null;
    render(<ShopOnboardingCard vehicleCount={0} />);

    expect(stepRow('Hoàn thiện hồ sơ gian hàng').textContent).toContain('Điền hồ sơ');
  });
});
