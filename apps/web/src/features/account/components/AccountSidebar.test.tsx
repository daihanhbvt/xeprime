import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

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
    // Pha vòng đời gói (15/09/2026): `current` = gói còn hạn. Khai tường minh vì `planEndsAt`
    // một mình không phân biệt "còn ân hạn" với "hết hẳn", và hai cái đó cho hai menu khác nhau.
    billingPhase: BILLING_PHASE.CURRENT,
    graceEndsAt: null,
    publicVehicleCount: 2,
    /*
     * Ép kiểu qua `unknown`, KHÔNG ép thẳng (16/09/2026).
     *
     * `MeDto.tenant` mọc thêm trường theo từng đợt sản phẩm (gần nhất: tên gói và % phí dịch vụ
     * cho nhãn tuyến). Một phép ép thẳng buộc fixture này phải liệt kê ĐỦ mọi trường, nên mỗi lần
     * DTO lớn lên là một lần test đỏ ở chỗ không liên quan gì tới thứ nó đang kiểm — menu.
     *
     * Fixture chỉ cần khai những trường mà `resolveAccountNav` thật sự đọc; các khẳng định bên
     * dưới mới là thứ bảo vệ hành vi.
     */
  } as unknown as NonNullable<CurrentUser['tenant']>;
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
  });

  /*
   * Lối vào cổng quản lý phụ thuộc TUYẾN, không phụ thuộc vai (F7, sửa 15/09/2026).
   *
   * `tenant()` mặc định là tuyến HOA HỒNG, và gian hàng đó không có bộ quản lý đầy đủ — dẫn nhân
   * viên tới `/manage` là dẫn tới một cánh cửa đóng. Chỉ gian hàng TUYẾN GÓI mới có lối đó.
   */
  it('nhân viên gian hàng TUYẾN GÓI: có lối "Quản lý gian hàng" trỏ đúng /manage', () => {
    render(
      <AccountSidebar
        user={user({
          tenant: {
            ...tenant(TENANT_ROLE.SHOP_STAFF),
            billingMode: BILLING_MODE.PACKAGE,
          } as NonNullable<CurrentUser['tenant']>,
        })}
      />,
    );

    expect(screen.getByRole('link', { name: /Quản lý gian hàng/ }).getAttribute('href')).toBe(
      '/manage',
    );
    // Hồ sơ PHÁP NHÂN là mục riêng, không gọi là "Tài khoản của tôi".
    expect(screen.getByRole('link', { name: /Hồ sơ gian hàng/ }).getAttribute('href')).toBe(
      '/manage/shop',
    );
    /*
     * KHÔNG còn "Tài khoản của tôi" ở đây (15/09/2026).
     *
     * Hồ sơ con người của thành viên gian hàng sống ở `/manage/account`. Để lại mục này trong khu
     * khách là để lại một liên kết mà `AccountShell` chuyển hướng ngay khi bấm — một vòng tròn.
     */
    expect(screen.queryByText('Tài khoản của tôi')).toBeNull();
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
  /* Bố cục gọn (16/09/2026): chín mục, MỘT nhóm, không tiêu đề nhóm nào. */
  it('hiện đúng chín mục của bố cục gọn, trong một nhóm không tiêu đề', () => {
    render(<AccountSidebar user={user({ tenant: tenant() })} />);

    for (const label of [
      'Danh sách xe',
      'Lịch xe',
      'Cẩm nang cho thuê xe',
      'Chuyến của tôi',
      'Thông tin khai thuế',
      'Hợp đồng & Chứng từ',
      'Chính sách bảo vệ dữ liệu',
      'Tài khoản của tôi',
      'Đổi mật khẩu',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByRole('heading')).toBeNull();
  });

  /*
   * Bảy mục đã rời khỏi menu — xem docblock `OWNER_NAV`. Route của chúng vẫn sống; đây là hàng
   * rào để chúng không lặng lẽ quay lại thành mục menu trong đợt sau.
   */
  it('không còn mục tiền, hộp thư, hồ sơ chủ xe, gói dịch vụ hay đăng xuất', () => {
    render(<AccountSidebar user={user({ tenant: tenant() })} />);

    for (const gone of [
      /Tiền cho thuê xe/,
      /Tin nhắn với khách/,
      /Hồ sơ chủ xe/,
      /Gói dịch vụ/,
      /Lịch sử thanh toán/,
      /Tài khoản nhận tiền/,
      /Yêu cầu xoá tài khoản/,
    ]) {
      expect(screen.queryByRole(`link`, { name: gone })).toBeNull();
    }
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

  /*
   * ĐĂNG XUẤT KHÔNG còn ở menu này (16/09/2026) — nó ở menu avatar trên header, thứ đứng trên
   * mọi trang của khu này. Hai nút đăng xuất trên cùng một màn là hai luồng phải giữ cho giống
   * nhau; và trên điện thoại, menu này là một dải cuộn ngang, nơi một nút đăng xuất lọt giữa các
   * mục điều hướng vừa dễ bấm nhầm vừa khó tìm khi cần.
   */
  it('KHÔNG có nút đăng xuất — lối đó nằm ở menu avatar trên header', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.queryByText('Đăng xuất')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });
});
