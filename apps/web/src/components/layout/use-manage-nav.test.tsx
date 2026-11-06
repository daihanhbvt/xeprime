import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  BILLING_MODE,
  FEATURE_STATE,
  PERMISSION,
  TENANT_ROLE,
  type Permission,
} from '@xeprime/types';
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
  // Trục SỞ HỮU (ADR 0038 điều 3) — `roleKey` quyết định mục gác bằng `ownerOnly`. `billingMode`
  // quyết định TUYẾN của site partner (ADR 0051 điều 3): `package` ⇒ menu Full Manage.
  tenant: null as { roleKey: string; billingMode?: string } | null,
}));
/**
 * Khu đang render (ADR 0051): menu chọn theo KHU + tuyến, không theo `platformRole`. Bộ test đặt khu
 * theo đúng nơi menu đó sống — nhân sự nền tảng ở site quản trị, gian hàng ở site partner.
 */
const zone = vi.hoisted(() => ({ value: 'partner' as 'partner' | 'admin' }));

vi.mock('@/zones/ZoneProvider', () => ({
  useZone: () => zone.value,
}));
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const badges = vi.hoisted(() => ({
  bookingRequestsPending: 0,
  bookingRequestsUrgent: false,
  chatUnread: 0,
}));
/** Trạng thái cờ năng lực (ADR 0027) — trục THỨ HAI, độc lập với `perms`. */
const features = vi.hoisted(() => ({ states: {} as Record<string, string> }));

vi.mock('next/navigation', () => ({
  // Link menu mang chi nhánh theo URL (ADR 0052) — test không lọc gì nên URL sạch tham số.
  useSearchParams: () => new URLSearchParams(),
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
    counts: {
      // "Đơn thuê xe" gộp (05/11/2026) mang số "cần xử lý" của cả chuyến.
      [NAV_BADGE.RENTALS_WORK]: badges.bookingRequestsPending,
      [NAV_BADGE.CHAT_UNREAD]: badges.chatUnread,
    },
    urgent: {
      [NAV_BADGE.RENTALS_WORK]: badges.bookingRequestsUrgent,
    },
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
  zone.value = user.platformRole ? 'admin' : 'partner';
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
  user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.PACKAGE };
  badges.bookingRequestsPending = 0;
  badges.bookingRequestsUrgent = false;
  badges.chatUnread = 0;
  // Mặc định RỖNG = chưa biết cờ nào ⇒ mọi mục hiện. Đó chính là hành vi phải giữ cho cache
  // `/auth/me` cũ: không khoá ai vì thiếu dữ liệu.
  features.states = {};
  grant();
});

afterEach(cleanup);

/*
 * Cây gian hàng từ 02/11/2026 là menu NGANG sáu khối (`docs/design/09_PARTNER_REDESIGN.md` §2). Drawer
 * mobile vẽ CÙNG cây đó qua `useManageNav`: khối là nhóm gập được, không còn mục cha (submenu).
 */
describe('useManageNav — hiển thị theo quyền (gian hàng)', () => {
  it('không có quyền nào → menu rỗng, không mục lá nào và không nhãn khối nào', () => {
    renderMenu();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText('Vận hành')).toBeNull();
    expect(screen.queryByText('Cấu hình')).toBeNull();
  });

  it('chỉ TENANT_VIEW → thấy mục cơ bản, KHÔNG thấy xe/đơn thuê/sổ sách', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    const labels = itemLabels();
    expect(labels).toEqual(
      expect.arrayContaining(['Tổng quan', 'Thông tin cửa hàng', 'Trung tâm hỗ trợ']),
    );
    expect(labels).not.toContain('Danh sách xe');
    expect(labels).not.toContain('Nhân viên & Phân quyền');
    // Tin nhắn là icon ở header, không còn là dòng menu.
    expect(labels).not.toContain('Trò chuyện');
  });

  it('khối Doanh thu biến mất khi mọi mục bị lọc — nhân viên không có quyền sổ sách', () => {
    grant(PERMISSION.TENANT_VIEW);
    /*
     * NHÂN VIÊN, không phải chủ: khối Doanh thu có hai loại mục — sổ sách gác bằng QUYỀN, và ví gác
     * bằng SỞ HỮU (`ownerOnly`, ADR 0038 điều 3). Một CHỦ chỉ có `tenant.view` vẫn thấy khối này vì ví
     * của chính họ ở đó.
     */
    user.tenant = { roleKey: TENANT_ROLE.SHOP_STAFF, billingMode: BILLING_MODE.PACKAGE };
    renderMenu();

    expect(screen.queryByText('Doanh thu')).toBeNull();
  });

  it('FINANCE_VIEW mở các mục sổ sách của Doanh thu — mục Công nợ ẨN thì không vẽ', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.FINANCE_VIEW);
    renderMenu();

    const labels = itemLabels();
    expect(labels).toEqual(
      expect.arrayContaining(['Tổng quan doanh thu', 'Quản lý ví', 'Lịch sử giao dịch']),
    );
    // Công nợ chờ design mới (vào từ thẻ trên Tổng quan doanh thu) — không vẽ thành dòng.
    expect(labels).not.toContain('Công nợ');
  });

  it('MEMBER_VIEW mở "Nhân viên & Phân quyền"; thiếu nó thì mục biến mất hoàn toàn', () => {
    grant(PERMISSION.TENANT_VIEW);
    const { unmount } = renderMenu();
    expect(itemLabels()).not.toContain('Nhân viên & Phân quyền');
    unmount();

    grant(PERMISSION.TENANT_VIEW, PERMISSION.MEMBER_VIEW);
    renderMenu();
    expect(itemLabels()).toContain('Nhân viên & Phân quyền');
  });

  it('khối biến mất khi mọi mục con bị lọc — không để lại nhãn khối rỗng', () => {
    // Chỉ VEHICLE_VIEW: khối "Xe & Tài xế" còn danh sách xe, khối "Cấu hình" không còn mục nào.
    grant(PERMISSION.VEHICLE_VIEW);
    renderMenu();

    expect(screen.getByText('Xe & Tài xế')).toBeTruthy();
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
      PERMISSION.SUPPORT_VIEW,
    );
  });

  it('drawer có ĐỦ mọi dòng của menu ngang, đúng thứ tự design', () => {
    renderMenu();

    expect(itemLabels()).toEqual([
      'Tổng quan',
      'Đơn thuê xe',
      'Lịch thuê xe',
      'Danh sách khách hàng',
      'Danh sách xe',
      'Quản lý tài xế',
      'Bảo dưỡng',
      'Tổng quan doanh thu',
      'Quản lý ví',
      'Lịch sử giao dịch',
      'Thông tin cửa hàng',
      'Chính sách thuê',
      'Nhân viên & Phân quyền',
      'Trung tâm hỗ trợ',
      'Yêu cầu hỗ trợ',
    ]);
  });

  it('Bảo dưỡng giữ route riêng; yêu cầu + đơn là MỘT mục "Đơn thuê xe" (05/11/2026)', () => {
    renderMenu();

    expect(screen.getByRole('link', { name: 'Bảo dưỡng' }).getAttribute('href')).toBe(
      '/manage/maintenance',
    );
    expect(screen.getByRole('link', { name: 'Đơn thuê xe' }).getAttribute('href')).toBe(
      '/manage/bookings',
    );
    expect(screen.queryByRole('link', { name: 'Yêu cầu đặt xe' })).toBeNull();
  });

  it('mục ẨN không thành dòng — nhưng đứng ở trang của nó thì khối của nó vẫn bung', () => {
    nav.pathname = '/manage/bookings/awaiting-pickup';
    renderMenu();

    expect(itemLabels()).not.toContain('Chờ giao xe');
    expect(itemLabels()).toContain('Đơn thuê xe');
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
    expect(itemLabels()).toContain('Lịch thuê xe');

    fireEvent.click(sectionToggle('Vận hành'));

    expect(store.getState().app.navSectionsCollapsed).toEqual(['operations']);
    expect(itemLabels()).not.toContain('Lịch thuê xe');
  });

  it('bấm lần nữa thì mở lại', () => {
    renderMenu();

    fireEvent.click(sectionToggle('Vận hành'));
    fireEvent.click(sectionToggle('Vận hành'));

    expect(store.getState().app.navSectionsCollapsed).toEqual([]);
    expect(itemLabels()).toContain('Lịch thuê xe');
  });

  it('nút gập nói ra trạng thái bằng aria-expanded', () => {
    renderMenu();
    expect(sectionToggle('Vận hành').getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(sectionToggle('Vận hành'));

    expect(sectionToggle('Vận hành').getAttribute('aria-expanded')).toBe('false');
  });

  it('khối CHỨA trang đang mở luôn bung — không giấu mất trang đang xem', () => {
    nav.pathname = '/manage/calendar';
    renderMenu();

    fireEvent.click(sectionToggle('Vận hành'));

    expect(itemLabels()).toContain('Lịch thuê xe');
  });

  it('Tổng quan và Trợ giúp không có nút gập — chúng luôn hiện', () => {
    renderMenu();

    expect(screen.queryByRole('button', { name: /nhóm Tổng quan$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /nhóm Trợ giúp$/ })).toBeNull();
  });

  it('thu gọn còn icon thì MỌI khối bung — không có mục nào mất lối vào', () => {
    renderMenu();
    fireEvent.click(sectionToggle('Vận hành'));
    cleanup();

    // Cùng store rỗng nhưng render ở chế độ thu gọn: khối đã gập vẫn phải hiện mục con, vì
    // lúc này không còn nhãn khối để bấm mở lại.
    renderMenu(true);
    fireEvent.click(sectionToggle('Vận hành'));
    expect(itemLabels()).toContain('Lịch thuê xe');
  });
});

describe('useManageNav — huy hiệu cần xử lý', () => {
  beforeEach(() => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW);
  });

  it('yêu cầu đặt xe đang chờ hiện số VÀ nói thành lời trong tên truy cập được', () => {
    badges.bookingRequestsPending = 2;
    renderMenu();

    const requests = screen.getByRole('link', { name: /^Đơn thuê xe/ });
    expect(requests.getAttribute('aria-label')).toBe('Đơn thuê xe, 2 việc cần xử lý');
    expect(requests.textContent).toContain('2');
  });

  it('có việc gấp → huy hiệu đỏ, và "gấp" được nói thành lời chứ không chỉ bằng màu', () => {
    badges.bookingRequestsPending = 2;
    badges.bookingRequestsUrgent = true;
    renderMenu();

    const requests = screen.getByRole('link', { name: /^Đơn thuê xe/ });
    expect(requests.getAttribute('aria-label')).toBe(
      'Đơn thuê xe, 2 việc cần xử lý, có việc gấp',
    );
    expect(requests.querySelector('[class*="urgent"]')).toBeTruthy();
  });

  it('không gấp → huy hiệu cam, không mang lớp đỏ', () => {
    badges.bookingRequestsPending = 2;
    renderMenu();

    const requests = screen.getByRole('link', { name: /^Đơn thuê xe/ });
    expect(requests.querySelector('[class*="badge"]')).toBeTruthy();
    expect(requests.querySelector('[class*="urgent"]')).toBeNull();
  });

  it('khối đang GẬP chứa việc gấp → nhãn khối cũng đỏ', () => {
    badges.bookingRequestsPending = 3;
    badges.bookingRequestsUrgent = true;
    renderMenu();

    fireEvent.click(sectionToggle('Vận hành'));

    const toggle = screen.getByRole('button', { name: /nhóm Vận hành/ });
    expect(toggle.getAttribute('aria-label')).toContain('có việc gấp');
    expect(toggle.querySelector('[class*="urgent"]')).toBeTruthy();
  });

  it('không có việc gì chờ → KHÔNG dựng huy hiệu rỗng', () => {
    renderMenu();

    expect(screen.getByRole('link', { name: 'Đơn thuê xe' }).textContent).toBe('Đơn thuê xe');
  });

  it('việc nằm trong khối đang GẬP thì con số dồn lên nhãn khối', () => {
    badges.bookingRequestsPending = 3;
    renderMenu();

    fireEvent.click(sectionToggle('Vận hành'));

    expect(screen.queryByRole('link', { name: /^Đơn thuê xe/ })).toBeNull();
    // Tên truy cập được của nút gập lúc này mang cả số việc — tìm theo tiền tố.
    const toggle = screen.getByRole('button', { name: /nhóm Vận hành/ });
    expect(toggle.closest('li')?.textContent).toContain('3');
  });

  it('thu gọn còn icon: việc cần xử lý vẫn báo được — chấm trên biểu tượng', () => {
    // AntD làm mờ hẳn phần chữ khi thu gọn, nên con số nằm trong đó sẽ biến mất. Tín hiệu
    // chuyển sang biểu tượng; con số đầy đủ vẫn còn ở tên truy cập được.
    badges.bookingRequestsPending = 2;
    const { container } = renderMenu(true);

    expect(container.querySelector('[class*="iconDotted"]')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đơn thuê xe, 2 việc cần xử lý' })).toBeTruthy();
  });

  it('thu gọn mà không có việc gì chờ → không có chấm nào', () => {
    const { container } = renderMenu(true);

    expect(container.querySelector('[class*="iconDotted"]')).toBeNull();
  });

  it('trên 99 thì hiện "99+" thay vì phá vỡ bố cục', () => {
    badges.bookingRequestsPending = 120;
    renderMenu();

    expect(screen.getByRole('link', { name: /^Đơn thuê xe/ }).textContent).toContain('99+');
  });
});

describe('useManageNav — hiển thị theo quyền (nền tảng)', () => {
  it('platformRole → cây nền tảng, KHÔNG có mục gian hàng nào', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW, PERMISSION.PLATFORM_TENANT_VIEW);
    renderMenu();

    // Từ 28/09/2026 hai danh sách đối tác là hai mục LÁ trong khối "Đối tác" — không còn mục cha
    // "Gian hàng & xe" phải bung ra.
    const labels = itemLabels();
    expect(labels).toEqual(['Tổng quan', 'Gian hàng gói', 'Chủ xe cá nhân']);
    expect(screen.queryByText('Gian hàng & xe')).toBeNull();
    expect(labels).not.toContain('Lịch thuê');
    expect(labels).not.toContain('Công nợ');
  });

  it('super admin: đủ các khối mới, đúng thứ tự mục, "Kiểm duyệt xe" và "Tất cả xe" cùng cấp', () => {
    user.platformRole = 'platform_admin';
    grant(
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_APPROVAL_REVIEW,
      PERMISSION.PLATFORM_VEHICLE_VIEW,
      PERMISSION.PLATFORM_TENANT_VIEW,
      PERMISSION.PLATFORM_BOOKING_VIEW,
      PERMISSION.PLATFORM_CUSTOMER_VIEW,
    );
    renderMenu();

    expect(itemLabels()).toEqual([
      'Tổng quan',
      'Kiểm duyệt xe',
      'Tất cả xe',
      'Gian hàng gói',
      'Chủ xe cá nhân',
      'Vận hành chuyến',
      'Đơn thuê toàn hệ thống',
      'Khách thuê',
      'Tra cứu tài khoản',
    ]);
    for (const group of ['Chợ xe', 'Đối tác', 'Đơn & khách hàng']) {
      expect(screen.getByText(group)).toBeTruthy();
    }
    expect(screen.queryByText('Duyệt xe')).toBeNull();
  });

  it('vai support: THẤY hai danh sách đối tác chỉ với quyền XEM (ADR 0050), không cần quyền quản lý', () => {
    user.platformRole = 'support';
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW, PERMISSION.PLATFORM_TENANT_VIEW);
    renderMenu();
    expect(itemLabels()).toEqual(expect.arrayContaining(['Gian hàng gói', 'Chủ xe cá nhân']));
  });

  it('chỉ có quyền QUẢN LÝ mà thiếu quyền xem: không có danh sách đối tác nào, khối "Đối tác" biến mất', () => {
    user.platformRole = 'finance_admin';
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW, PERMISSION.PLATFORM_TENANT_MANAGE);
    renderMenu();
    expect(itemLabels()).not.toContain('Gian hàng gói');
    expect(itemLabels()).not.toContain('Chủ xe cá nhân');
    expect(screen.queryByText('Đối tác')).toBeNull();
  });

  it('thiếu quyền kiểm duyệt: không thấy "Kiểm duyệt xe" nhưng vẫn thấy "Tất cả xe"', () => {
    user.platformRole = 'platform_staff';
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW, PERMISSION.PLATFORM_VEHICLE_VIEW);
    renderMenu();
    expect(itemLabels()).toEqual(['Tổng quan', 'Tất cả xe']);
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
      'Tất cả xe',
      'Vận hành chuyến',
      'Đơn thuê toàn hệ thống',
      'Khách thuê',
      'Tra cứu tài khoản',
    ]);
    // Không có `PLATFORM_TENANT_VIEW` ⇒ không danh sách đối tác nào.
    expect(labels).not.toContain('Gian hàng gói');
    expect(labels).not.toContain('Chủ xe cá nhân');
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

  it('route đúng bằng href → mục đó sáng', () => {
    nav.pathname = '/manage/vehicles';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Danh sách xe');
  });

  it('route con → mục cha sáng', () => {
    nav.pathname = '/manage/vehicles/01H/edit';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Danh sách xe');
  });

  it('"Đơn đã kết thúc" (/bookings/ended) vẫn sáng mục "Đơn thuê xe"', () => {
    nav.pathname = '/manage/bookings/ended';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Đơn thuê xe');
  });

  it('/manage chỉ sáng Tổng quan khi ở ĐÚNG /manage', () => {
    nav.pathname = '/manage';
    const first = renderMenu();
    expect(selectedLabel(first.container)).toBe('Tổng quan');
    first.unmount();

    nav.pathname = '/manage/receipts';
    const second = renderMenu();
    expect(selectedLabel(second.container)).toBe('Lịch sử giao dịch');
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
    expect(current[0]!.textContent).toBe('Lịch thuê xe');
  });

  it('route ngoài cây → không mục nào mang aria-current', () => {
    nav.pathname = '/manage/contracts/01H';
    renderMenu();

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });
});

describe('useManageNav — mục đang sáng (nền tảng)', () => {
  beforeEach(() => {
    user.platformRole = 'platform_admin';
    grant(
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_APPROVAL_REVIEW,
      PERMISSION.PLATFORM_VEHICLE_VIEW,
      PERMISSION.PLATFORM_TENANT_VIEW,
      PERMISSION.PLATFORM_BOOKING_VIEW,
      PERMISSION.PLATFORM_CUSTOMER_VIEW,
    );
  });

  function currentLinks(): string[] {
    return screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent ?? '');
  }

  it.each([
    ['/admin', 'Kiểm duyệt xe'],
    ['/admin/vehicles', 'Tất cả xe'],
    ['/admin/partners/shops', 'Gian hàng gói'],
    ['/admin/partners/owners', 'Chủ xe cá nhân'],
    ['/admin/bookings', 'Đơn thuê toàn hệ thống'],
    ['/admin/customers', 'Khách thuê'],
  ])('%s → CHỈ "%s" sáng', (pathname, label) => {
    nav.pathname = pathname;
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe(label);
    expect(container.querySelectorAll('.ant-menu-item-selected')).toHaveLength(1);
    expect(currentLinks()).toEqual([label]);
  });

  it('trang admin không có mục riêng (URL cũ /manage/admin/tenants) KHÔNG làm "Kiểm duyệt xe" sáng', () => {
    nav.pathname = '/admin/tenants';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBeNull();
    expect(currentLinks()).toEqual([]);
  });
});

describe('ManageMenu — trình bày', () => {
  it('nhãn khối KHÔNG phải link bấm để đi đâu — nó chỉ gập/mở', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW);
    renderMenu();

    expect(screen.getByText('Xe & Tài xế').closest('a')).toBeNull();
  });

  it('mục cha (menu nền tảng) KHÔNG phải link — bấm vào nó là mở danh sách, không phải điều hướng', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_BILLING_MANAGE);
    renderMenu();

    expect(screen.getByText('Gói & phí').closest('a')).toBeNull();
  });

  it('nhãn dài giữ được bản đầy đủ ở `title` dù bị cắt bằng ellipsis', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_BOOKING_VIEW);
    const { container } = renderMenu();

    const item = container.querySelector('.ant-menu-item');
    expect(item?.getAttribute('title')).toBe('Vận hành chuyến');
  });

  it('thu gọn: nhãn vẫn là tên truy cập được của mục', () => {
    // AntD ẩn phần chữ bằng CSS khi `inlineCollapsed`; `aria-label` trên thẻ <a> là thứ giữ
    // cho mục thu gọn không thành nút vô danh.
    grant(PERMISSION.TENANT_VIEW);
    renderMenu(true);

    expect(screen.getByRole('link', { name: 'Thông tin cửa hàng' })).toBeTruthy();
  });
});

describe('useManageNav — trục NĂNG LỰC theo gói (ADR 0027)', () => {
  it('cache CŨ (chưa có `features`) KHÔNG khoá ai — mọi mục vẫn hiện', () => {
    grant(PERMISSION.FINANCE_VIEW, PERMISSION.DRIVER_VIEW, PERMISSION.MEMBER_VIEW);
    features.states = {};
    renderMenu();

    expect(itemLabels()).toContain('Quản lý tài xế');
    expect(itemLabels()).toContain('Nhân viên & Phân quyền');
    expect(itemLabels()).toContain('Tổng quan doanh thu');
  });

  it('hidden ⇒ mục VẮNG khỏi menu dù có đủ quyền — hai trục kiểm nối tiếp nhau', () => {
    grant(PERMISSION.DRIVER_VIEW, PERMISSION.MEMBER_VIEW);
    features.states = { drivers: FEATURE_STATE.HIDDEN, members: FEATURE_STATE.HIDDEN };
    renderMenu();

    expect(itemLabels()).toContain('Quản lý tài xế'); // ADR 0063: tài xế không còn sau cờ gói
    expect(itemLabels()).not.toContain('Nhân viên & Phân quyền');
  });

  it('read_only VẪN hiện — không ai mất lối vào sổ sách của chính mình', () => {
    grant(PERMISSION.FINANCE_VIEW);
    features.states = { finance: FEATURE_STATE.READ_ONLY };
    renderMenu();

    expect(itemLabels()).toContain('Lịch sử giao dịch');
  });

  it('sổ sách hidden ⇒ khối Doanh thu của người KHÔNG phải chủ biến mất theo', () => {
    grant(PERMISSION.FINANCE_VIEW);
    user.tenant = { roleKey: TENANT_ROLE.SHOP_MANAGER, billingMode: BILLING_MODE.PACKAGE };
    features.states = { finance: FEATURE_STATE.HIDDEN, debts: FEATURE_STATE.HIDDEN };
    renderMenu();

    expect(screen.queryByText('Doanh thu')).toBeNull();
  });

  it('sổ sách hidden ⇒ CHỦ vẫn còn khối Doanh thu với đúng mục ví', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.FINANCE_VIEW);
    features.states = { finance: FEATURE_STATE.HIDDEN, debts: FEATURE_STATE.HIDDEN };
    renderMenu();

    expect(itemLabels()).toContain('Quản lý ví');
    expect(itemLabels()).not.toContain('Tổng quan doanh thu');
    expect(itemLabels()).not.toContain('Lịch sử giao dịch');
  });
});

/**
 * VÍ GIAN HÀNG — trục SỞ HỮU, không phải trục quyền (ADR 0038 điều 3).
 *
 * API là `@ShopOwnerOnly()`. Menu phải hạ xuống đúng luật của guard — một `shop_manager` thấy mục
 * rồi bấm vào nhận 403 là giao diện mời họ vào một cánh cửa đã khoá. Bộ test này cũng khoá chiều
 * ngược lại: nới guard cho khớp menu sẽ làm test đỏ, vì tiền trong ví là nghĩa vụ với một người cụ
 * thể chứ không phải một tài nguyên của gian hàng mà quyền cấp phát được.
 */
describe('useManageNav — ví gian hàng chỉ dành cho CHỦ', () => {
  /** Mọi quyền của gian hàng: chứng minh trục quyền KHÔNG mở được mục này. */
  function grantEverything() {
    grant(...(Object.values(PERMISSION) as Permission[]));
  }

  it('chủ gian hàng thấy mục Quản lý ví', () => {
    grantEverything();
    user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.PACKAGE };
    renderMenu();

    expect(screen.getByRole('link', { name: /Quản lý ví/ }).getAttribute('href')).toBe(
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
      user.tenant = { roleKey, billingMode: BILLING_MODE.PACKAGE };
      const { unmount } = renderMenu();

      expect(screen.queryByRole('link', { name: /Quản lý ví/ })).toBeNull();
      unmount();
    }
  });

  /*
   * Các mục doanh thu KHÁC không bị kéo theo: doanh thu và giao dịch là sổ sách của gian hàng, phân
   * quyền được, và một quản lý được cấp quyền phải xem được. Thu hẹp đúng một mục.
   */
  it('không kéo theo các mục doanh thu khác', () => {
    grantEverything();
    user.tenant = { roleKey: TENANT_ROLE.SHOP_MANAGER, billingMode: BILLING_MODE.PACKAGE };
    renderMenu();

    expect(screen.getByRole('link', { name: /Tổng quan doanh thu/ })).toBeTruthy();
  });

  it('nhân sự nền tảng không có lối vào ví của gian hàng', () => {
    grantEverything();
    user.platformRole = 'platform_admin';
    user.tenant = null;
    renderMenu();

    expect(screen.queryByRole('link', { name: /^Quản lý ví$/ })).toBeNull();
  });
});

/**
 * HAI menu ở site partner (ADR 0051 điều 3): tuyến hoa hồng thấy Owner Lite — kể cả khi có đủ mọi
 * quyền, vì ranh giới tuyến KHÔNG đi qua trục quyền (ADR 0038 điều 4).
 */
describe('useManageNav — menu theo tuyến ở site partner', () => {
  it('chủ xe tuyến hoa hồng: menu Owner Lite, không có sổ sách của tuyến gói', () => {
    grant(...(Object.values(PERMISSION) as Permission[]));
    user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION };
    renderMenu();

    const labels = itemLabels();
    expect(labels).toEqual(expect.arrayContaining(['Tổng quan', 'Lịch thuê xe']));
    expect(labels).not.toContain('Danh sách khách hàng');
    expect(labels).not.toContain('Tổng quan doanh thu');
  });

  /*
   * CÙNG khung sáu khối với tuyến gói (02/11/2026): MỘT cửa tiền, MỘT hồ sơ, tài liệu cho người mới
   * ở Trợ giúp. Tin nhắn là icon ở header.
   */
  it('chủ xe tuyến hoa hồng: cùng khung khối với tuyến gói, mỗi việc một mục', () => {
    grant(...(Object.values(PERMISSION) as Permission[]));
    user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION };
    renderMenu();

    expect(itemLabels()).toEqual([
      'Tổng quan',
      'Đơn thuê xe',
      'Lịch thuê xe',
      'Danh sách xe',
      // Tài xế mở cho cả chủ xe tuyến hoa hồng (ADR 0063).
      'Quản lý tài xế',
      'Quản lý ví',
      'Hồ sơ chủ xe',
      'Cẩm nang cho thuê xe',
      'Hợp đồng & Chứng từ',
      'Chính sách bảo vệ dữ liệu',
      'Yêu cầu hỗ trợ',
    ]);
  });

  /*
   * 06/11/2026: chủ xe tuyến hoa hồng dùng CHUNG màn "Đơn thuê xe" với gian hàng — "Chuyến cho
   * thuê" riêng đã gỡ. Đúng MỘT mục, không phải hai mục cùng tên.
   */
  it('chủ xe tuyến hoa hồng: đúng một mục "Đơn thuê xe", không còn "Chuyến cho thuê"', () => {
    grant(...(Object.values(PERMISSION) as Permission[]));
    user.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION };
    renderMenu();

    const labels = itemLabels();
    expect(labels.filter((label) => label === 'Đơn thuê xe')).toHaveLength(1);
    expect(labels).not.toContain('Chuyến cho thuê');
  });

  it('thành viên gian hàng tuyến hoa hồng: cùng mục "Đơn thuê xe" với chủ', () => {
    grant(...(Object.values(PERMISSION) as Permission[]));
    user.tenant = { roleKey: TENANT_ROLE.SHOP_STAFF, billingMode: BILLING_MODE.COMMISSION };
    renderMenu();

    const labels = itemLabels();
    expect(labels).not.toContain('Chuyến cho thuê');
    expect(labels).toEqual(expect.arrayContaining(['Đơn thuê xe']));
    // Ví và Hồ sơ chủ xe là của CHỦ — hai khối đó vắng hẳn, không còn nhãn khối rỗng.
    expect(screen.queryByText('Doanh thu')).toBeNull();
  });

  it('chưa có gian hàng: không menu nào', () => {
    grant(...(Object.values(PERMISSION) as Permission[]));
    user.tenant = null;
    renderMenu();

    expect(itemLabels()).toEqual([]);
  });
});
