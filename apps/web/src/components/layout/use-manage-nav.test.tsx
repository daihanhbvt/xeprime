import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { FEATURE_STATE, PERMISSION, TENANT_ROLE, type Permission } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NAV_BADGE } from '@/constants/nav';
import { makeStore, type AppStore } from '@/store/make-store';

import { ManageMenu } from './ManageMenu';
import { useManageNav } from './use-manage-nav';

/**
 * Test ĐẶC TẢ cho lớp nối giữa cây menu (`constants/nav`) và giao diện: `useManageNav` lọc
 * theo quyền + scope và quyết định khối nào bung, `ManageMenu` vẽ ra.
 *
 * Đợt sắp lại IA đổi CÁCH GOM (khối gập được + mục cha) chứ không đổi tập chức năng. Bộ này
 * khoá phần không được phép hỏng: mục nào hiện với quyền nào, mục nào đang sáng, và — mới —
 * việc gom nhóm KHÔNG được làm mất lối vào bất kỳ trang nào.
 *
 * Ở đây kiểm qua giao diện thật thay vì `renderHook` vì thứ cần bảo vệ là "người dùng thấy
 * gì" — `items` là cấu trúc nội bộ của AntD Menu, đổi được mà không ai mất chức năng.
 *
 * ⚠️ AntD chỉ dựng mục con của một submenu SAU KHI nó bung. Nên test nào cần thấy mục con thì
 * hoặc đặt `pathname` vào đúng trang đó (mục cha tự bung), hoặc bấm mở mục cha.
 */

const nav = vi.hoisted(() => ({ pathname: '/manage' }));
const user = vi.hoisted(() => ({
  platformRole: null as string | null,
  // Trục SỞ HỮU (ADR 0038 điều 3) — `roleKey` quyết định mục gác bằng `ownerOnly`.
  tenant: null as { roleKey: string } | null,
}));
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const badges = vi.hoisted(() => ({ bookingRequestsPending: 0, chatUnread: 0 }));
/** Trạng thái cờ năng lực (ADR 0027) — trục THỨ HAI, độc lập với `perms`. */
const features = vi.hoisted(() => ({ states: {} as Record<string, string> }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user, isLoading: false }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-feature', () => ({
  useFeatureStates: () => features.states,
}));

// Nguồn đếm huy hiệu là hai query thật (chat + yêu cầu đặt xe); ở đây chỉ quan tâm menu HIỂN
// THỊ con số ra sao, nên chặn ở đúng ranh giới đó thay vì dựng QueryClient giả.
vi.mock('./use-nav-badges', () => ({
  useNavBadges: () => ({
    [NAV_BADGE.BOOKING_REQUESTS_PENDING]: badges.bookingRequestsPending,
    [NAV_BADGE.CHAT_UNREAD]: badges.chatUnread,
  }),
}));

let store: AppStore;

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function Menu({ collapsed = false }: { collapsed?: boolean }) {
  const { items, selectedKey, openKeys, onOpenChange } = useManageNav({ collapsed });
  return (
    <ManageMenu
      items={items}
      selectedKey={selectedKey}
      openKeys={openKeys}
      onOpenChange={onOpenChange}
      collapsed={collapsed}
    />
  );
}

function renderMenu(collapsed = false) {
  store = makeStore();
  return render(
    <Provider store={store}>
      <Menu collapsed={collapsed} />
    </Provider>,
  );
}

/** Nhãn của mọi mục lá đang hiện — mục lá là link, nhãn khối và mục cha thì không. */
function itemLabels(): string[] {
  return screen.queryAllByRole('link').map((link) => link.textContent ?? '');
}

/** Nút gập của một khối, tìm theo nhãn truy cập được. */
function sectionToggle(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`nhóm ${name}$`) });
}

/** Mục đang sáng, theo class công khai của AntD (không phải class sinh từ CSS Module). */
function selectedLabel(container: HTMLElement): string | null {
  const el = container.querySelector('.ant-menu-item-selected');
  return el ? (el.textContent ?? '') : null;
}

beforeEach(() => {
  nav.pathname = '/manage';
  user.platformRole = null;
  user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER };
  badges.bookingRequestsPending = 0;
  badges.chatUnread = 0;
  // Mặc định RỖNG = chưa biết cờ nào ⇒ mọi mục hiện. Đó chính là hành vi phải giữ cho cache
  // `/auth/me` cũ: không khoá ai vì thiếu dữ liệu.
  features.states = {};
  grant();
});

afterEach(cleanup);

describe('useManageNav — hiển thị theo quyền (gian hàng)', () => {
  it('không có quyền nào → menu rỗng, không mục lá nào và không nhãn khối nào', () => {
    renderMenu();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText('Quản lý')).toBeNull();
    expect(screen.queryByText('Cấu hình')).toBeNull();
  });

  it('chỉ TENANT_VIEW → thấy mục cơ bản, KHÔNG thấy Xe/Đơn thuê/Tài chính', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    const labels = itemLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Tổng quan',
        'Cửa hàng',
        'Trò chuyện',
        'Trung tâm hỗ trợ',
      ]),
    );
    expect(labels).not.toContain('Xe của tôi');
    expect(labels).not.toContain('Người dùng & phân quyền');
  });

  it('mục cha biến mất hoàn toàn khi mọi mục con bị lọc', () => {
    grant(PERMISSION.TENANT_VIEW);
    /*
     * NHÂN VIÊN, không phải chủ (sửa 15/09/2026).
     *
     * Nhánh "Tài chính" có hai loại mục con: sổ sách gác bằng QUYỀN, và ví gác bằng SỞ HỮU
     * (`ownerOnly`, ADR 0038 điều 3). Một CHỦ gian hàng chỉ có `tenant.view` vẫn thấy nhánh này
     * vì ví của chính họ vẫn ở đó — đúng, và đó là lý do ca "mọi mục con bị lọc" phải dựng bằng
     * một người KHÔNG phải chủ.
     */
    user.tenant = { roleKey: TENANT_ROLE.SHOP_STAFF };
    renderMenu();

    // Không có `finance.view`, cũng không phải chủ ⇒ không còn mục cha "Tài chính" nào để bấm.
    expect(screen.queryByText('Tài chính')).toBeNull();
  });

  it('FINANCE_VIEW mở mục cha Tài chính; mở ra thì đủ ba mục con', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.FINANCE_VIEW);
    renderMenu();

    fireEvent.click(screen.getByText('Tài chính'));

    expect(itemLabels()).toEqual(
      expect.arrayContaining(['Tổng quan doanh thu', 'Giao dịch thu chi', 'Công nợ']),
    );
  });

  it('MEMBER_VIEW mở "Người dùng & phân quyền"; thiếu nó thì mục biến mất hoàn toàn', () => {
    grant(PERMISSION.TENANT_VIEW);
    const { unmount } = renderMenu();
    expect(itemLabels()).not.toContain('Người dùng & phân quyền');
    unmount();

    grant(PERMISSION.TENANT_VIEW, PERMISSION.MEMBER_VIEW);
    renderMenu();
    expect(itemLabels()).toContain('Người dùng & phân quyền');
  });

  it('khối biến mất khi mọi mục con bị lọc — không để lại nhãn khối rỗng', () => {
    // Chỉ VEHICLE_VIEW: khối "Quản lý" còn đội xe, khối "Cấu hình" không còn mục nào.
    grant(PERMISSION.VEHICLE_VIEW);
    renderMenu();

    expect(screen.getByText('Quản lý')).toBeTruthy();
    expect(screen.queryByText('Cấu hình')).toBeNull();
  });

  // Gỡ ngày 03/09/2026 (R1): 'Khu vực nhận xe' và 'Thùng rác' từng là link thật dẫn tới một
  // trang trống. Giờ menu không được dựng chúng nữa.
  it('không dựng mục nào dẫn tới trang chưa có luồng', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    expect(screen.queryByRole('link', { name: 'Thùng rác' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Khu vực nhận xe' })).toBeNull();
  });
});

describe('useManageNav — gom nhóm KHÔNG làm mất lối vào', () => {
  beforeEach(() => {
    grant(
      PERMISSION.TENANT_VIEW,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.CALENDAR_VIEW,
      PERMISSION.FINANCE_VIEW,
      PERMISSION.MEMBER_VIEW,
      PERMISSION.BRANCH_VIEW,
      PERMISSION.DRIVER_VIEW,
      PERMISSION.CUSTOMER_VIEW,
    );
  });

  it('Trung tâm bảo dưỡng vẫn tới được, qua mục cha "Xe của tôi"', () => {
    renderMenu();
    expect(itemLabels()).not.toContain('Bảo dưỡng');

    fireEvent.click(screen.getByText('Xe của tôi'));

    expect(screen.getByRole('link', { name: 'Bảo dưỡng' }).getAttribute('href')).toBe(
      '/manage/maintenance',
    );
  });

  it('Đơn đặt xe vẫn tới được và GIỮ NGUYÊN route riêng', () => {
    renderMenu();

    fireEvent.click(screen.getByText('Đơn thuê'));

    expect(screen.getByRole('link', { name: 'Yêu cầu đặt xe' }).getAttribute('href')).toBe(
      '/manage/booking-requests',
    );
    expect(screen.getByRole('link', { name: 'Tất cả đơn thuê' }).getAttribute('href')).toBe(
      '/manage/bookings',
    );
  });

  it('mọi link trong menu đều trỏ vào /manage — không có link chết', () => {
    renderMenu();

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\/manage/);
    }
  });
});

describe('useManageNav — khối gập được', () => {
  beforeEach(() => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW, PERMISSION.CALENDAR_VIEW);
  });

  it('bấm nhãn khối thì gập mục con lại và ghi vào state', () => {
    renderMenu();
    expect(itemLabels()).toContain('Lịch thuê');

    fireEvent.click(sectionToggle('Quản lý'));

    expect(store.getState().app.navSectionsCollapsed).toEqual(['operations']);
    expect(itemLabels()).not.toContain('Lịch thuê');
  });

  it('bấm lần nữa thì mở lại', () => {
    renderMenu();

    fireEvent.click(sectionToggle('Quản lý'));
    fireEvent.click(sectionToggle('Quản lý'));

    expect(store.getState().app.navSectionsCollapsed).toEqual([]);
    expect(itemLabels()).toContain('Lịch thuê');
  });

  it('nút gập nói ra trạng thái bằng aria-expanded', () => {
    renderMenu();
    expect(sectionToggle('Quản lý').getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(sectionToggle('Quản lý'));

    expect(sectionToggle('Quản lý').getAttribute('aria-expanded')).toBe('false');
  });

  it('khối CHỨA trang đang mở luôn bung — không giấu mất trang đang xem', () => {
    nav.pathname = '/manage/calendar';
    renderMenu();

    fireEvent.click(sectionToggle('Quản lý'));

    expect(itemLabels()).toContain('Lịch thuê');
  });

  it('Tổng quan và Hỗ trợ không có nút gập — chúng luôn hiện', () => {
    renderMenu();

    expect(screen.queryByRole('button', { name: /nhóm Tổng quan$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /nhóm Hỗ trợ$/ })).toBeNull();
  });

  it('thu gọn còn icon thì MỌI khối bung — không có mục nào mất lối vào', () => {
    renderMenu();
    fireEvent.click(sectionToggle('Quản lý'));
    cleanup();

    // Cùng store rỗng nhưng render ở chế độ thu gọn: khối đã gập vẫn phải hiện mục con, vì
    // lúc này không còn nhãn khối để bấm mở lại.
    renderMenu(true);
    fireEvent.click(sectionToggle('Quản lý'));
    expect(itemLabels()).toContain('Lịch thuê');
  });
});

describe('useManageNav — huy hiệu cần xử lý', () => {
  beforeEach(() => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW);
  });

  it('tin nhắn chưa đọc hiện số VÀ nói thành lời trong tên truy cập được', () => {
    badges.chatUnread = 2;
    renderMenu();

    const chat = screen.getByRole('link', { name: /^Trò chuyện/ });
    expect(chat.getAttribute('aria-label')).toBe('Trò chuyện, 2 việc cần xử lý');
    expect(chat.textContent).toContain('2');
  });

  it('không có việc gì chờ → KHÔNG dựng huy hiệu rỗng', () => {
    renderMenu();

    expect(screen.getByRole('link', { name: 'Trò chuyện' }).textContent).toBe('Trò chuyện');
  });

  it('việc nằm trong mục cha đang ĐÓNG thì con số dồn lên mục cha', () => {
    badges.bookingRequestsPending = 3;
    const { container } = renderMenu();

    const parent = container.querySelector('.ant-menu-submenu-title');
    expect(parent?.textContent).toContain('3');
  });

  it('mở mục cha ra thì con số về đúng mục con, không đếm hai lần', () => {
    badges.bookingRequestsPending = 3;
    const { container } = renderMenu();

    fireEvent.click(screen.getByText('Đơn thuê'));

    expect(container.querySelector('.ant-menu-submenu-title')?.textContent).not.toContain('3');
    expect(screen.getByRole('link', { name: /^Yêu cầu đặt xe/ }).textContent).toContain('3');
  });

  it('thu gọn còn icon: việc cần xử lý vẫn báo được — chấm trên biểu tượng', () => {
    // AntD làm mờ hẳn phần chữ khi thu gọn, nên con số nằm trong đó sẽ biến mất. Tín hiệu
    // chuyển sang biểu tượng; con số đầy đủ vẫn còn ở tên truy cập được.
    badges.chatUnread = 2;
    const { container } = renderMenu(true);

    expect(container.querySelector('[class*="iconDotted"]')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trò chuyện, 2 việc cần xử lý' })).toBeTruthy();
  });

  it('thu gọn mà không có việc gì chờ → không có chấm nào', () => {
    const { container } = renderMenu(true);

    expect(container.querySelector('[class*="iconDotted"]')).toBeNull();
  });

  it('trên 99 thì hiện "99+" thay vì phá vỡ bố cục', () => {
    badges.chatUnread = 120;
    renderMenu();

    expect(screen.getByRole('link', { name: /^Trò chuyện/ }).textContent).toContain('99+');
  });
});

describe('useManageNav — hiển thị theo quyền (nền tảng)', () => {
  it('platformRole → cây nền tảng, KHÔNG có mục gian hàng nào', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW, PERMISSION.PLATFORM_TENANT_MANAGE);
    renderMenu();

    // Từ 23/09/2026 "Gian hàng" nằm trong mục cha "Gian hàng & xe" — mục cha hiện, mục con là
    // link sau khi bung ra (giống nhánh "Tài chính" của gian hàng).
    fireEvent.click(screen.getByText('Gian hàng & xe'));

    const labels = itemLabels();
    expect(labels).toContain('Gian hàng');
    expect(labels).not.toContain('Lịch thuê');
    expect(labels).not.toContain('Công nợ');
  });

  it('platform_staff KHÔNG thấy mục chỉ dành cho super admin', () => {
    user.platformRole = 'platform_staff';
    grant(
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_VEHICLE_VIEW,
      PERMISSION.PLATFORM_BOOKING_VIEW,
      PERMISSION.PLATFORM_CUSTOMER_VIEW,
    );
    renderMenu();

    fireEvent.click(screen.getByText('Gian hàng & xe'));

    const labels = itemLabels();
    expect(labels).toEqual([
      'Tổng quan',
      'Xe toàn hệ thống',
      'Đơn thuê toàn hệ thống',
      'Khách thuê',
    ]);
    // Không có `PLATFORM_TENANT_MANAGE` ⇒ mục cha chỉ còn đúng một mục con.
    expect(labels).not.toContain('Gian hàng');
    expect(labels).not.toContain('Nhân sự nền tảng');
    expect(labels).not.toContain('Nhật ký hệ thống');
  });

  it('có CẢ tenant lẫn platform → vẫn CHỈ cây nền tảng (hiện trạng, brief 00 B2)', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW, PERMISSION.PLATFORM_DASHBOARD_VIEW);
    renderMenu();

    expect(itemLabels()).toEqual(['Tổng quan']);
  });
});

describe('useManageNav — mục đang sáng', () => {
  beforeEach(() => {
    grant(
      PERMISSION.TENANT_VIEW,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.CALENDAR_VIEW,
      PERMISSION.FINANCE_VIEW,
      PERMISSION.MEMBER_VIEW,
    );
  });

  it('route đúng bằng href → mục đó sáng, và mục cha tự bung ra', () => {
    nav.pathname = '/manage/vehicles';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Danh sách xe');
  });

  it('route con → mục cha sáng', () => {
    nav.pathname = '/manage/vehicles/01H/edit';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Danh sách xe');
  });

  it('tiền tố gần giống KHÔNG chọn nhầm: booking-requests ≠ bookings', () => {
    nav.pathname = '/manage/booking-requests';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Yêu cầu đặt xe');
  });

  it('/manage chỉ sáng Tổng quan khi ở ĐÚNG /manage', () => {
    nav.pathname = '/manage';
    const first = renderMenu();
    expect(selectedLabel(first.container)).toBe('Tổng quan');
    first.unmount();

    nav.pathname = '/manage/receipts';
    const second = renderMenu();
    expect(selectedLabel(second.container)).toBe('Giao dịch thu chi');
  });

  it('route ngoài cây → KHÔNG mục nào sáng', () => {
    nav.pathname = '/manage/contracts/01H';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBeNull();
  });

  it('mục đang sáng nói ra bằng aria-current, không chỉ bằng màu', () => {
    nav.pathname = '/manage/vehicles';
    const { container } = renderMenu();

    const selected = container.querySelector('.ant-menu-item-selected');
    expect(selected).toBeTruthy();
    expect(
      within(selected as HTMLElement)
        .getByRole('link')
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('CHỈ mục đang mở có aria-current', () => {
    nav.pathname = '/manage/calendar';
    renderMenu();

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toBe('Lịch thuê');
  });

  it('route ngoài cây → không mục nào mang aria-current', () => {
    nav.pathname = '/manage/contracts/01H';
    renderMenu();

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });
});

describe('ManageMenu — trình bày', () => {
  it('nhãn khối KHÔNG phải link bấm để đi đâu — nó chỉ gập/mở', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW);
    renderMenu();

    expect(screen.getByText('Quản lý').closest('a')).toBeNull();
  });

  it('mục cha KHÔNG phải link — bấm vào nó là mở danh sách, không phải điều hướng', () => {
    grant(PERMISSION.VEHICLE_VIEW);
    renderMenu();

    expect(screen.getByText('Xe của tôi').closest('a')).toBeNull();
  });

  it('nhãn dài giữ được bản đầy đủ ở `title` dù bị cắt bằng ellipsis', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_BOOKING_VIEW);
    const { container } = renderMenu();

    const item = container.querySelector('.ant-menu-item');
    expect(item?.getAttribute('title')).toBe('Đơn thuê toàn hệ thống');
  });

  it('thu gọn: nhãn vẫn là tên truy cập được của mục', () => {
    // AntD ẩn phần chữ bằng CSS khi `inlineCollapsed`; `aria-label` trên thẻ <a> là thứ giữ
    // cho mục thu gọn không thành nút vô danh.
    grant(PERMISSION.TENANT_VIEW);
    renderMenu(true);

    expect(screen.getByRole('link', { name: 'Trò chuyện' })).toBeTruthy();
  });
});

describe('useManageNav — trục NĂNG LỰC theo gói (ADR 0027)', () => {
  /** Mở mục cha "Tài chính" để thấy ba mục con (AntD chỉ dựng con sau khi submenu bung). */
  function openFinanceBranch() {
    fireEvent.click(screen.getByText('Tài chính'));
  }

  it('cache CŨ (chưa có `features`) KHÔNG khoá ai — mọi mục vẫn hiện', () => {
    grant(PERMISSION.FINANCE_VIEW, PERMISSION.DRIVER_VIEW, PERMISSION.MEMBER_VIEW);
    features.states = {};
    renderMenu();

    expect(itemLabels()).toContain('Tài xế');
    expect(itemLabels()).toContain('Người dùng & phân quyền');
  });

  it('hidden ⇒ mục VẮNG khỏi menu dù có đủ quyền — hai trục kiểm nối tiếp nhau', () => {
    grant(PERMISSION.DRIVER_VIEW, PERMISSION.MEMBER_VIEW);
    features.states = { drivers: FEATURE_STATE.HIDDEN, members: FEATURE_STATE.HIDDEN };
    renderMenu();

    expect(itemLabels()).not.toContain('Tài xế');
    expect(itemLabels()).not.toContain('Người dùng & phân quyền');
  });

  it('read_only VẪN hiện — không ai mất lối vào sổ sách của chính mình', () => {
    grant(PERMISSION.DRIVER_VIEW);
    features.states = { drivers: FEATURE_STATE.READ_ONLY };
    renderMenu();

    expect(itemLabels()).toContain('Tài xế');
  });

  it('cả ba mục con của Tài chính hidden ⇒ MỤC CHA biến mất theo', () => {
    grant(PERMISSION.FINANCE_VIEW);
    features.states = { finance: FEATURE_STATE.HIDDEN, debts: FEATURE_STATE.HIDDEN };
    renderMenu();

    expect(screen.queryByText('Tài chính')).toBeNull();
  });

  it('chỉ Công nợ hidden ⇒ mục cha còn, và mất đúng một mục con', () => {
    grant(PERMISSION.FINANCE_VIEW);
    features.states = { debts: FEATURE_STATE.HIDDEN };
    renderMenu();

    openFinanceBranch();
    expect(itemLabels()).toContain('Giao dịch thu chi');
    expect(itemLabels()).not.toContain('Công nợ');
  });

  it('huy hiệu vẫn dồn lên mục cha đóng cho các mục NHÌN THẤY ĐƯỢC (không hồi quy)', () => {
    grant(PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.BOOKING_VIEW);
    badges.bookingRequestsPending = 4;
    renderMenu();

    // Mục cha "Đơn thuê" đang đóng (pathname = /manage) ⇒ dồn 4 lên nhãn của nó.
    expect(screen.getByText('4')).toBeTruthy();
  });

  /*
   * KHÔNG test trực tiếp được "phép dồn huy hiệu loại mục hidden": hiện KHÔNG mục nào vừa mang
   * huy hiệu vừa mang cờ năng lực — huy hiệu chỉ có ở Yêu cầu đặt xe và Trò chuyện, cả hai đều
   * là bậc cơ bản (`NAV_BADGE` cố ý chỉ có hai giá trị).
   *
   * Thứ khoá được, và là thứ thật sự quan trọng: cả BA chỗ đi qua CÙNG một vị từ `canSeeLeaf`.
   * Test "cả ba mục con của Tài chính hidden ⇒ mục cha biến mất" ở trên chứng minh nhánh dựng
   * mục đi qua nó; hai phép dồn dùng lại chính hàm đó (`.filter(canSeeLeaf)`), nên chúng không
   * thể lệch mà không làm hỏng test kia.
   *
   * Ngày một mục vừa-badge-vừa-cờ xuất hiện, đây là chỗ thêm khẳng định.
   */
});

/**
 * VÍ GIAN HÀNG — trục SỞ HỮU, không phải trục quyền (ADR 0038 điều 3).
 *
 * API đã là `@ShopOwnerOnly()` từ đợt trước, nhưng menu vẫn gác bằng `seller_profile.view`. Hệ
 * quả: một `shop_manager` được cấp quyền đó nhìn thấy mục "Số dư & rút tiền", bấm vào, và nhận
 * 403 — giao diện mời họ vào một cánh cửa đã khoá.
 *
 * Cách sửa là hạ MENU xuống đúng luật của guard. Bộ test này cũng khoá chiều ngược lại: nới guard
 * cho khớp menu sẽ làm test cuối cùng đỏ, vì tiền trong ví là nghĩa vụ với một người cụ thể chứ
 * không phải một tài nguyên của gian hàng mà quyền cấp phát được.
 */
describe('useManageNav — ví gian hàng chỉ dành cho CHỦ', () => {
  /** Mọi quyền của gian hàng: chứng minh trục quyền KHÔNG mở được mục này. */
  function grantEverything() {
    grant(...(Object.values(PERMISSION) as Permission[]));
  }

  it('chủ gian hàng thấy mục Số dư', () => {
    grantEverything();
    user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER };
    renderMenu();

    fireEvent.click(screen.getByText('Tài chính'));
    expect(screen.getByRole('link', { name: /Số dư & rút tiền/ }).getAttribute('href')).toBe(
      '/manage/balance',
    );
  });

  it('quản lý, nhân viên và người xem KHÔNG thấy — dù có đủ mọi quyền', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      grantEverything();
      user.tenant = { roleKey };
      const { unmount } = renderMenu();

      fireEvent.click(screen.getByText('Tài chính'));
      expect(screen.queryByRole('link', { name: /Số dư & rút tiền/ })).toBeNull();
      unmount();
    }
  });

  /*
   * Các mục tài chính KHÁC không bị kéo theo: doanh thu, thu chi và công nợ là sổ sách của gian
   * hàng, phân quyền được, và một quản lý được cấp quyền phải xem được. Thu hẹp đúng một mục.
   */
  it('không kéo theo các mục tài chính khác', () => {
    grantEverything();
    user.tenant = { roleKey: TENANT_ROLE.SHOP_MANAGER };
    renderMenu();

    fireEvent.click(screen.getByText('Tài chính'));
    expect(screen.getByRole('link', { name: /Tổng quan doanh thu/ })).toBeTruthy();
  });

  /*
   * Nhân sự nền tảng mở Manage của một gian hàng KHÔNG phải chủ ví của gian hàng đó. Cây menu
   * nền tảng vốn đã khác, nên đây chỉ là chốt chặn: không có lối tắt nào vào ví của người khác.
   */
  it('nhân sự nền tảng không có lối vào ví của gian hàng', () => {
    grantEverything();
    user.platformRole = 'platform_admin';
    user.tenant = null;
    renderMenu();

    expect(screen.queryByRole('link', { name: /^Số dư & rút tiền$/ })).toBeNull();
  });
});
