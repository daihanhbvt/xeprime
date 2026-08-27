import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { PERMISSION, type Permission } from '@xeprime/types';
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
const user = vi.hoisted(() => ({ platformRole: null as string | null }));
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const badges = vi.hoisted(() => ({ bookingRequestsPending: 0, chatUnread: 0 }));

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
  badges.bookingRequestsPending = 0;
  badges.chatUnread = 0;
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
        'Thùng rác',
        'Trung tâm hỗ trợ',
      ]),
    );
    expect(labels).not.toContain('Xe của tôi');
    expect(labels).not.toContain('Người dùng & phân quyền');
  });

  it('mục cha biến mất hoàn toàn khi mọi mục con bị lọc', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    // Không có `finance.view` ⇒ không còn mục cha "Tài chính" nào để bấm vào.
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

  it('mục placeholder vẫn hiện và vẫn là link thật', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    const trash = screen.getByRole('link', { name: 'Thùng rác' });
    expect(trash.getAttribute('href')).toBe('/manage/trash');
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

    const labels = itemLabels();
    expect(labels).toEqual([
      'Tổng quan',
      'Xe toàn hệ thống',
      'Đơn thuê toàn hệ thống',
      'Khách thuê',
    ]);
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
