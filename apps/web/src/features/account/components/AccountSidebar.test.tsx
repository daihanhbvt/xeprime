import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

import { AccountSidebar } from './AccountSidebar';

/**
 * Menu khu tài khoản.
 *
 * Bất biến quan trọng nhất của bản 08/09/2026: **menu đổi theo VAI**. Chủ gian hàng thấy nhóm
 * quản lý xe; khách thuê và nhân viên gian hàng thì không — cho họ thấy là dẫn họ tới những màn
 * mà guard backend sẽ từ chối, và một menu dẫn tới 403 còn tệ hơn một menu ngắn.
 *
 * Bất biến cũ vẫn giữ: mọi mục trong menu phải BẤM ĐƯỢC (không mục "Sắp có" chết), và đăng xuất
 * đi qua hook dùng chung chứ không tự gọi API.
 */

const logout = vi.hoisted(() => vi.fn(async () => undefined));
const pathname = vi.hoisted(() => ({ value: '/account' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

vi.mock('@/features/auth/hooks/use-market-logout', () => ({
  useMarketLogout: () => logout,
}));

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    displayName: 'Minh Đức',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: false,
    hasPassword: true,
    tenant: null,
    platformRole: null,
    permissions: [],
    ...overrides,
  } as CurrentUser;
}

/**
 * Gian hàng ĐÃ đi hết vòng đăng ký: hồ sơ `active` **và** có xe trên chợ.
 *
 * `publicVehicleCount` phải khác 0 mới là bậc `owner` (`resolveOwnerStage`) — đó chính là bất
 * biến mới của bản 14/09/2026, nên fixture mặc định phải khai nó tường minh thay vì mượn giá trị
 * mặc định của một kiểu nào đó.
 */
function tenant(roleKey: string = TENANT_ROLE.SHOP_OWNER) {
  return {
    id: 't1',
    name: 'Việt Car Hà Nội',
    slug: 'viet-car',
    status: 'active',
    roleKey,
    features: [],
    // Gói mặc định của MỌI gian hàng mới là bậc `commission` (`assignDefaultPlanWithinTx`) — đây
    // là hình dạng thật của một chủ xe tuyến hoa hồng, không phải "không có gói".
    planCode: 'BASIC',
    billingMode: BILLING_MODE.COMMISSION,
    planEndsAt: null,
    publicVehicleCount: 2,
  } as NonNullable<CurrentUser['tenant']>;
}

/** Chủ xe MỚI: hồ sơ chưa duyệt xong, chưa có xe nào lên chợ. */
function registeringTenant(overrides: Record<string, unknown> = {}) {
  return { ...tenant(), status: 'draft', publicVehicleCount: 0, ...overrides } as NonNullable<
    CurrentUser['tenant']
  >;
}

beforeEach(() => {
  logout.mockReset();
  pathname.value = '/account';
});

afterEach(cleanup);

describe('AccountSidebar — khách thuê', () => {
  it('hiện menu cá nhân, KHÔNG có mục quản lý xe', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.getByText('Tài khoản của tôi')).toBeTruthy();
    expect(screen.getByText('Chuyến của tôi')).toBeTruthy();
    expect(screen.getByText('Đổi mật khẩu')).toBeTruthy();
    expect(screen.getByText('Yêu cầu xoá tài khoản')).toBeTruthy();
    expect(screen.getByText('Trở thành chủ xe')).toBeTruthy();

    expect(screen.queryByText('Danh sách xe')).toBeNull();
    expect(screen.queryByText('Lịch xe')).toBeNull();
    expect(screen.queryByText('Thông tin khai thuế')).toBeNull();
  });

  it('nhân viên gian hàng cũng dùng menu cá nhân — vai của họ không phải chủ xe', () => {
    render(<AccountSidebar user={user({ tenant: tenant(TENANT_ROLE.SHOP_STAFF) })} />);

    expect(screen.queryByText('Danh sách xe')).toBeNull();
    // Đã thuộc một gian hàng ⇒ lối vào là cổng quản lý, không phải lời mời mở gian hàng.
    expect(screen.getByRole('link', { name: /Quản lý gian hàng/ }).getAttribute('href')).toBe(
      '/manage',
    );
  });
});

/**
 * Bậc `registering` (14/09/2026).
 *
 * Bất biến: **có bản ghi tenant KHÔNG làm bạn thành chủ xe.** Trước đây chỉ cần
 * `roleKey === shop_owner` là menu mở đủ bảy mục, nên người vừa điền xong form đăng ký nhìn thấy
 * lịch rỗng, khai thuế rỗng, hợp đồng rỗng — và không có màn nào nói cho họ biết đang chờ gì.
 */
describe('AccountSidebar — chủ xe đang đăng ký', () => {
  it('chỉ mở màn tiến trình, KHÔNG mở lịch/khai thuế/hợp đồng', () => {
    render(<AccountSidebar user={user({ tenant: registeringTenant() })} />);

    expect(screen.getByText('Hồ sơ đăng ký')).toBeTruthy();
    expect(screen.getByText('Danh sách xe')).toBeTruthy();
    expect(screen.getByText('Chuyến của tôi')).toBeTruthy();

    expect(screen.queryByText('Lịch xe')).toBeNull();
    expect(screen.queryByText('Thông tin khai thuế')).toBeNull();
    expect(screen.queryByText('Hợp đồng & Chứng từ')).toBeNull();
  });

  it('hồ sơ đã duyệt nhưng chưa có xe trên chợ VẪN là đang đăng ký', () => {
    render(
      <AccountSidebar
        user={user({ tenant: registeringTenant({ status: 'active', publicVehicleCount: 0 }) })}
      />,
    );

    expect(screen.getByText('Hồ sơ đăng ký')).toBeTruthy();
    expect(screen.queryByText('Lịch xe')).toBeNull();
  });

  it('KHÔNG có mục nào trỏ vào cổng quản lý — tuyến hoa hồng không vào /manage', () => {
    const { container } = render(<AccountSidebar user={user({ tenant: registeringTenant() })} />);

    const hrefs = [...container.querySelectorAll('nav a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => href.startsWith('/manage'))).toEqual([]);
  });
});

describe('AccountSidebar — chủ gian hàng', () => {
  it('hiện đủ nhóm chủ xe và nhóm Tài khoản', () => {
    render(<AccountSidebar user={user({ tenant: tenant() })} />);

    expect(screen.getByText('Danh sách xe')).toBeTruthy();
    expect(screen.getByText('Lịch xe')).toBeTruthy();
    expect(screen.getByText('Cẩm nang cho thuê xe')).toBeTruthy();
    expect(screen.getByText('Thông tin khai thuế')).toBeTruthy();
    expect(screen.getByText('Hợp đồng & Chứng từ')).toBeTruthy();
    expect(screen.getByText('Chính sách bảo vệ dữ liệu')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tài khoản' })).toBeTruthy();
  });

  it('hộp thư và gói dịch vụ nằm trong /account, không dẫn sang cổng quản lý', () => {
    render(<AccountSidebar user={user({ tenant: tenant() })} />);

    expect(screen.getByRole('link', { name: /Tin nhắn với khách/ }).getAttribute('href')).toBe(
      '/account/messages',
    );
    expect(screen.getByRole('link', { name: /Gói dịch vụ/ }).getAttribute('href')).toBe(
      '/account/subscription',
    );
  });

  it('thẻ người dùng hiện tên và NHÃN VAI thật, không phải danh hiệu bịa', () => {
    render(<AccountSidebar user={user({ tenant: tenant() })} />);

    expect(screen.getByText('Minh Đức')).toBeTruthy();
    expect(screen.getByText('Chủ gian hàng')).toBeTruthy();
    expect(screen.queryByText(/Premium/i)).toBeNull();
  });
});

describe('AccountSidebar — hành vi chung', () => {
  it('mọi mục trong menu đều là liên kết bấm được — không có mục "Sắp có"', () => {
    const { container } = render(<AccountSidebar user={user({ tenant: tenant() })} />);

    const items = container.querySelectorAll('nav li');
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.querySelector('a')).not.toBeNull();
    }
    expect(screen.queryByText('Sắp có')).toBeNull();
  });

  it('mục đã dựng là liên kết thật', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.getByRole('link', { name: /Chuyến của tôi/ }).getAttribute('href')).toBe('/trips');
  });

  it('đánh dấu mục đang mở bằng aria-current, kể cả route ngoài /account', () => {
    pathname.value = '/trips';
    render(<AccountSidebar user={user()} />);

    expect(screen.getByRole('link', { name: /Chuyến của tôi/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      screen.getByRole('link', { name: /Tài khoản của tôi/ }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('trang con của mục chủ xe vẫn sáng đúng mục cha', () => {
    pathname.value = '/account/vehicles/abc';
    render(<AccountSidebar user={user({ tenant: tenant() })} />);

    expect(screen.getByRole('link', { name: /Danh sách xe/ }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('đăng xuất đi qua hook dùng chung, không tự gọi API', () => {
    render(<AccountSidebar user={user()} />);

    fireEvent.click(screen.getByText('Đăng xuất'));

    return waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
