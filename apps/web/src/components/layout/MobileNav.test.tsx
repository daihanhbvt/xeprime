import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { FEATURE_STATE, PERMISSION, PLAN_FEATURE, type Permission } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore, type AppStore } from '@/store/make-store';

import { MobileNav } from './MobileNav';

/**
 * Test ĐẶC TẢ cho điều hướng mobile của cổng quản lý.
 *
 * `MobileNav` là ĐIỀU HƯỚNG, không phải `DetailDrawer` nghiệp vụ — nó gồm hai phần rời:
 * thanh tab dưới đáy (luôn mount, ẩn/hiện bằng CSS) và Drawer menu đầy đủ (mở theo Redux).
 *
 * Wave 1D đổi ranh breakpoint và có thể đổi vỏ Drawer. Bộ này khoá lại: tab nào hiện theo
 * scope, tab nào sáng theo route, và Drawer đóng lại khi người dùng đã chọn xong.
 */

const nav = vi.hoisted(() => ({ pathname: '/manage' }));
const user = vi.hoisted(() => ({ platformRole: null as string | null }));
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
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
  usePlanEndsAt: () => null,
}));

// Huy hiệu lấy từ hai query thật (chat + yêu cầu đặt xe) — chặn ở ranh giới đó, test này lo
// điều hướng chứ không lo con số.
vi.mock('./use-nav-badges', () => ({
  useNavBadges: () => ({ bookingRequestsPending: 0, chatUnread: 0 }),
}));

// Thẻ người dùng gọi `destroySession`/router riêng — không thuộc phạm vi test điều hướng.
vi.mock('./ManageUserCard', () => ({ ManageUserCard: () => <div data-testid="user-card" /> }));

let store: AppStore;

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderNav() {
  store = makeStore();
  return render(
    <Provider store={store}>
      <MobileNav />
    </Provider>,
  );
}

/** Thanh tab dưới đáy — phần luôn hiển thị trên mobile. */
function bottomBar(container: HTMLElement): HTMLElement {
  return container.querySelector('nav') as HTMLElement;
}

/**
 * Tìm tab theo nhãn nhìn thấy — khớp TUYỆT ĐỐI được từ Batch 1D-C, khi icon đã được bọc
 * `aria-hidden` (D16.1). Trước đó tên truy cập được là `"calendar Lịch xe"`.
 */
function tab(bar: HTMLElement, label: string): HTMLElement {
  return within(bar).getByRole('link', { name: label });
}

function moreButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Thêm' });
}

/** Bốn quyền mở đủ bộ tab của gian hàng. */
const SHOP_TAB_PERMISSIONS = [
  PERMISSION.TENANT_VIEW,
  PERMISSION.CALENDAR_VIEW,
  PERMISSION.BOOKING_REQUEST_VIEW,
  PERMISSION.BOOKING_VIEW,
] as const;

function openDrawer() {
  fireEvent.click(moreButton());
}

beforeEach(() => {
  nav.pathname = '/manage';
  user.platformRole = null;
  grant(...SHOP_TAB_PERMISSIONS, PERMISSION.VEHICLE_VIEW);
  features.states = {};
});

afterEach(cleanup);

describe('MobileNav — thanh tab dưới đáy', () => {
  it('gian hàng: 4 tab điều hướng + nút "Thêm"', () => {
    const { container } = renderNav();
    const bar = bottomBar(container);

    expect(
      within(bar)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Tổng quan', 'Lịch xe', 'Yêu cầu', 'Đơn thuê']);
    expect(within(bar).getByRole('button', { name: /Thêm$/ })).toBeTruthy();
  });

  it('nền tảng: bộ tab khác hẳn, không lẫn tab gian hàng', () => {
    user.platformRole = 'platform_admin';
    grant(
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_APPROVAL_REVIEW,
      PERMISSION.PLATFORM_VEHICLE_VIEW,
      PERMISSION.PLATFORM_BOOKING_VIEW,
    );
    const { container } = renderNav();

    const labels = within(bottomBar(container))
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Tổng quan', 'Duyệt hồ sơ', 'Xe', 'Đơn thuê']);
    expect(labels).not.toContain('Lịch xe');
  });

  it('thanh tab LỌC THEO QUYỀN y như sidebar (đổi có chủ ý ở 1D-C)', () => {
    // Trước 1D-C `mobileTabsForScope` không nhận quyền: một vai trò tuỳ biến thiếu
    // `bookings.view` vẫn thấy tab "Đơn thuê" dẫn tới trang mà API trả 403.
    grant(PERMISSION.TENANT_VIEW, PERMISSION.CALENDAR_VIEW);
    const { container } = renderNav();

    const labels = within(bottomBar(container))
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Tổng quan', 'Lịch xe']);
    expect(labels).not.toContain('Đơn thuê');
  });

  it('không có quyền nào: chỉ còn nút "Thêm", không tab chết nào', () => {
    grant();
    const { container } = renderNav();

    expect(within(bottomBar(container)).queryAllByRole('link')).toHaveLength(0);
    expect(moreButton()).toBeTruthy();
  });

  it('thanh tab là TẬP CON của menu, không phải bản sao', () => {
    const { container } = renderNav();

    const tabCount = within(bottomBar(container)).getAllByRole('link').length;
    openDrawer();
    const menuCount = screen.getAllByRole('link').length - tabCount;

    expect(tabCount).toBe(4);
    expect(menuCount).toBeGreaterThan(tabCount);
  });

  it('thanh tab là landmark CÓ TÊN', () => {
    renderNav();

    expect(screen.getByRole('navigation', { name: 'Điều hướng nhanh' })).toBeTruthy();
  });

  it('tab luôn mount — ẩn/hiện là việc của CSS, không phải của JS', () => {
    // Hiện trạng: `MobileNav` không gọi `useIsMobile`. Thanh tab được `display:none` trên
    // desktop trong `.module.css`. Wave 1D đổi ranh 992→1024 là đổi ở CSS đó, không ở đây.
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const { container } = renderNav();

    expect(bottomBar(container)).toBeTruthy();
    expect(matchMedia).not.toHaveBeenCalled();
  });
});

describe('MobileNav — tab đang sáng', () => {
  it('route đúng bằng href → tab đó sáng, "Thêm" không sáng', () => {
    nav.pathname = '/manage/calendar';
    const { container } = renderNav();
    const bar = bottomBar(container);

    expect(tab(bar, 'Lịch xe').className).not.toBe(moreButton().className);
  });

  it('route con vẫn sáng tab cha', () => {
    nav.pathname = '/manage/bookings/01H';
    const { container } = renderNav();
    const bar = bottomBar(container);

    expect(tab(bar, 'Đơn thuê').className).not.toBe(tab(bar, 'Tổng quan').className);
  });

  it('/manage chỉ sáng "Tổng quan" khi ở ĐÚNG /manage', () => {
    nav.pathname = '/manage/vehicles';
    const { container } = renderNav();
    const bar = bottomBar(container);

    // `/manage/vehicles` không thuộc tab chính nào → "Thêm" mới là mục sáng.
    expect(moreButton().className).not.toBe(tab(bar, 'Tổng quan').className);
  });

  it('tab đang mở nói ra bằng aria-current (D16.2 đã sửa ở 1D-C)', () => {
    nav.pathname = '/manage/calendar';
    const { container } = renderNav();
    const bar = bottomBar(container);

    expect(tab(bar, 'Lịch xe').getAttribute('aria-current')).toBe('page');

    const marked = within(bar)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(marked).toHaveLength(1);
  });

  it('route ngoài mọi tab chính → không tab nào mang aria-current', () => {
    nav.pathname = '/manage/vehicles';
    const { container } = renderNav();

    for (const link of within(bottomBar(container)).getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });

  it('tên icon KHÔNG còn lọt vào tên truy cập được (D16.1 đã sửa ở 1D-C)', () => {
    const { container } = renderNav();
    const bar = bottomBar(container);

    expect(within(bar).getByRole('link', { name: 'Lịch xe' })).toBeTruthy();
    expect(within(bar).queryByRole('link', { name: 'calendar Lịch xe' })).toBeNull();
    expect(within(bar).getByRole('button', { name: 'Thêm' })).toBeTruthy();
  });
});

describe('MobileNav — Drawer menu đầy đủ', () => {
  it('mặc định đóng: nội dung menu chưa có trong tài liệu', () => {
    renderNav();

    expect(screen.queryByRole('link', { name: 'Lịch thuê' })).toBeNull();
    expect(store.getState().app.mobileNavOpen).toBe(false);
  });

  it('nút mở có tên truy cập được và mở Drawer', () => {
    renderNav();

    openDrawer();

    expect(store.getState().app.mobileNavOpen).toBe(true);
    expect(screen.getByRole('link', { name: 'Lịch thuê' })).toBeTruthy();
  });

  it('Drawer chứa menu ĐẦY ĐỦ, không chỉ 4 tab', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW, PERMISSION.CALENDAR_VIEW);
    renderNav();

    openDrawer();

    // "Cửa hàng" và "Trò chuyện" không có trong thanh tab nhưng phải có trong Drawer.
    expect(screen.getByRole('link', { name: 'Cửa hàng' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trò chuyện' })).toBeTruthy();
  });

  it('Drawer lọc theo quyền y như sidebar', () => {
    grant(PERMISSION.CALENDAR_VIEW);
    renderNav();

    openDrawer();

    expect(screen.getByRole('link', { name: 'Lịch thuê' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Cửa hàng' })).toBeNull();
  });

  it('chọn một mục trong Drawer thì Drawer ĐÓNG — không để lại lớp phủ che trang mới', () => {
    renderNav();
    openDrawer();
    expect(store.getState().app.mobileNavOpen).toBe(true);

    fireEvent.click(screen.getByRole('link', { name: 'Lịch thuê' }));

    expect(store.getState().app.mobileNavOpen).toBe(false);
  });

  it('Drawer có nút đóng riêng (không phải ngõ cụt)', async () => {
    renderNav();
    openDrawer();

    // AntD dựng nút đóng của Drawer; navigation-audit `134:3825` bắt buộc phải có.
    const close = document.querySelector('.ant-drawer-close') as HTMLElement | null;
    expect(close).toBeTruthy();

    fireEvent.click(close as HTMLElement);

    await waitFor(() => expect(store.getState().app.mobileNavOpen).toBe(false));
  });

  it('thẻ người dùng nằm trong Drawer (lối đăng xuất trên mobile)', () => {
    renderNav();
    openDrawer();

    expect(screen.getByTestId('user-card')).toBeTruthy();
  });

  it('nút mở nói ra trạng thái bằng aria-expanded', () => {
    renderNav();
    expect(moreButton().getAttribute('aria-expanded')).toBe('false');

    openDrawer();

    expect(moreButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('Drawer có landmark điều hướng riêng, tên khác thanh tab', () => {
    renderNav();
    openDrawer();

    expect(screen.getByRole('navigation', { name: 'Menu đầy đủ' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Điều hướng nhanh' })).toBeTruthy();
  });

  it('mục đang mở trong Drawer nhận ra được bằng aria-current', () => {
    nav.pathname = '/manage/calendar';
    renderNav();
    openDrawer();

    expect(screen.getByRole('link', { name: 'Lịch thuê' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('đóng Drawer trả TIÊU ĐIỂM về nút đã mở nó', async () => {
    renderNav();
    const trigger = moreButton();
    openDrawer();

    fireEvent.click(document.querySelector('.ant-drawer-close') as HTMLElement);

    // Không có bước này thì tiêu điểm rơi về <body>: người dùng bàn phím phải Tab lại từ đầu.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('phím Escape đóng Drawer', async () => {
    renderNav();
    openDrawer();

    fireEvent.keyDown(document.querySelector('.ant-drawer') as HTMLElement, {
      key: 'Escape',
      code: 'Escape',
    });

    await waitFor(() => expect(store.getState().app.mobileNavOpen).toBe(false));
  });
});

/**
 * Trục NĂNG LỰC ở thanh tab dưới đáy — ADR 0027 điều 2/3.
 *
 * `MobileTab.feature` tồn tại từ lâu kèm ghi chú *"trường có mặt để lần sau không ai thêm được
 * một tab bị gác mà quên lọc"*, nhưng `MobileNav` chỉ lọc `permission` — tấm lưới chưa bao giờ
 * được mắc vào. Bốn tab thật đều thuộc bậc cơ bản nên không lộ ra, nên spec này DỰNG một tab có
 * cờ để kiểm chính bộ lọc, thay vì chờ tới ngày ai đó thêm tab thật rồi mới phát hiện.
 */
describe('MobileNav — lọc theo cờ tính năng (ADR 0027)', () => {
  /** Tab thứ năm mang cờ `finance` — chèn vào đúng nguồn mà `MobileNav` đọc. */
  function withGatedTab() {
    vi.doMock('@/constants/nav', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/constants/nav')>();
      return {
        ...actual,
        mobileTabsForScope: (isPlatform: boolean) => [
          ...actual.mobileTabsForScope(isPlatform),
          {
            key: 'finance',
            labelKey: 'manage.finance',
            href: '/manage/finance',
            permission: PERMISSION.FINANCE_VIEW,
            icon: () => null,
            feature: PLAN_FEATURE.FINANCE,
          },
        ],
      };
    });
    return import('./MobileNav');
  }

  afterEach(() => {
    vi.doUnmock('@/constants/nav');
    vi.resetModules();
  });

  async function renderWithGatedTab() {
    const { MobileNav: Patched } = await withGatedTab();
    store = makeStore();
    return render(
      <Provider store={store}>
        <Patched />
      </Provider>,
    );
  }

  it('feature hidden ⇒ tab BIẾN MẤT khỏi thanh dưới đáy', async () => {
    grant(...SHOP_TAB_PERMISSIONS, PERMISSION.FINANCE_VIEW);
    features.states = { [PLAN_FEATURE.FINANCE]: FEATURE_STATE.HIDDEN };

    const { container } = await renderWithGatedTab();

    expect(within(bottomBar(container)).queryByRole('link', { name: 'Tài chính' })).toBeNull();
    // Các tab bậc cơ bản KHÔNG bị ảnh hưởng — một cờ chỉ gác đúng nhóm của nó.
    expect(tab(bottomBar(container), 'Lịch xe')).toBeTruthy();
  });

  it('feature read_only ⇒ tab VẪN HIỆN để xem dữ liệu cũ (ADR 0027 điều 3)', async () => {
    grant(...SHOP_TAB_PERMISSIONS, PERMISSION.FINANCE_VIEW);
    features.states = { [PLAN_FEATURE.FINANCE]: FEATURE_STATE.READ_ONLY };

    const { container } = await renderWithGatedTab();

    expect(tab(bottomBar(container), 'Tài chính')).toBeTruthy();
  });

  it('có cờ nhưng THIẾU QUYỀN ⇒ vẫn ẩn: hai trục kiểm NỐI TIẾP, không thay nhau', async () => {
    grant(...SHOP_TAB_PERMISSIONS); // không có FINANCE_VIEW
    features.states = { [PLAN_FEATURE.FINANCE]: FEATURE_STATE.ENABLED };

    const { container } = await renderWithGatedTab();

    expect(within(bottomBar(container)).queryByRole('link', { name: 'Tài chính' })).toBeNull();
  });

  it('cache CŨ (chưa có `features`) KHÔNG khoá ai — mặc định là cho qua', async () => {
    grant(...SHOP_TAB_PERMISSIONS, PERMISSION.FINANCE_VIEW);
    features.states = {};

    const { container } = await renderWithGatedTab();

    expect(tab(bottomBar(container), 'Tài chính')).toBeTruthy();
  });
});
