import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore } from '@/store/make-store';
import { XP_TOKENS } from '@/styles/theme';

import { AppShell } from './AppShell';

/**
 * `AppShell` là nơi bug gốc sống: user không có gian hàng bị render THẲNG form tạo gian hàng,
 * biến một trạng thái hợp lệ (khách thuê xe) thành thứ phải sửa ngay.
 *
 * Bộ test này khoá lại việc đó, cộng với hai lối thoát khỏi khung portal: `/manage/login` phải
 * công khai (không thì loop redirect) và `/manage/onboarding` phải tự render lấy.
 *
 * Bổ sung ở Batch 1D-A: chốt các VÙNG của khung (sidebar · topbar · main · điều hướng mobile)
 * và ranh giới với khu công khai, trước khi Wave 1D đổi vỏ.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/manage' }));
const state = vi.hoisted(() => ({
  user: null as unknown,
  isLoading: false,
  isError: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: state.user,
    isLoading: state.isLoading,
    isError: state.isError,
  }),
}));

const features = vi.hoisted(() => ({ states: {} as Record<string, string> }));

vi.mock('@/hooks/use-feature', () => ({
  useFeatureStates: () => features.states,
  usePlanEndsAt: () => null,
}));

vi.mock('@/services/auth.service', () => ({ destroySession: vi.fn(async () => undefined) }));

// Con của shell không thuộc phạm vi test — chặn để khỏi kéo cả cây menu/chat vào.
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('./Topbar', () => ({ Topbar: () => <div data-testid="topbar" /> }));
vi.mock('./MobileNav', () => ({ MobileNav: () => <div data-testid="mobile-nav" /> }));

const CUSTOMER = { displayName: 'Khách A', tenant: null, platformRole: null };
const OWNER = {
  displayName: 'Chủ shop',
  tenant: { id: 'T1', name: 'Shop', slug: 's', status: 'active', roleKey: 'shop_owner' },
  platformRole: null,
};
const ADMIN = { displayName: 'Admin', tenant: null, platformRole: 'platform_admin' };
const PENDING_OWNER = {
  displayName: 'Chủ shop',
  tenant: { id: 'T2', name: 'Shop', slug: 's', status: 'pending_review', roleKey: 'shop_owner' },
  platformRole: null,
};
/** Vừa là nhân sự nền tảng vừa thuộc một gian hàng — brief 00 B2. */
const DUAL = {
  displayName: 'Vừa admin vừa chủ shop',
  tenant: { id: 'T3', name: 'Shop', slug: 's', status: 'active', roleKey: 'shop_owner' },
  platformRole: 'platform_admin',
};

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // Shell lưu tuỳ chọn sidebar/khối menu vào cookie qua `useNavPreferencesSync`, nên nó đọc
    // store — không có Provider thì react-redux ném ngay ở render đầu.
    <Provider store={makeStore()}>
      <QueryClientProvider client={queryClient}>
        <AppShell>
          <div data-testid="page">Nội dung trang</div>
        </AppShell>
      </QueryClientProvider>
    </Provider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.pathname = '/manage';
  state.user = null;
  state.isLoading = false;
  features.states = {};
  state.isError = false;
});

afterEach(cleanup);

describe('AppShell — user không có gian hàng', () => {
  it('KHÔNG tự hiện form tạo gian hàng, mà hiện màn lựa chọn', () => {
    state.user = CUSTOMER;
    renderShell();

    expect(screen.getByText('Bạn chưa có gian hàng')).toBeTruthy();
    expect(screen.getByText('Đăng ký trở thành chủ xe')).toBeTruthy();
    expect(screen.getByText('Quay lại tìm xe')).toBeTruthy();
    // Form tạo gian hàng chỉ sống ở /manage/onboarding.
    expect(screen.queryByText('Tạo gian hàng')).toBeNull();
    expect(screen.queryByText('Tên gian hàng')).toBeNull();
    // Và không render dashboard gian hàng với tenant null.
    expect(screen.queryByTestId('sidebar')).toBeNull();
  });

  it('nhân sự nền tảng không có gian hàng vẫn vào được portal', () => {
    state.user = ADMIN;
    renderShell();

    expect(screen.queryByText('Bạn chưa có gian hàng')).toBeNull();
    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('có gian hàng → khung portal đầy đủ', () => {
    state.user = OWNER;
    renderShell();

    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });
});

describe('AppShell — route thoát khỏi khung portal', () => {
  it('/manage/login render thẳng, KHÔNG đòi đăng nhập (chống loop redirect)', () => {
    nav.pathname = '/manage/login';
    state.user = null;
    renderShell();

    expect(screen.getByTestId('page')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('/manage/onboarding với user chưa có gian hàng → để page tự render, không chặn', () => {
    nav.pathname = '/manage/onboarding';
    state.user = CUSTOMER;
    renderShell();

    expect(screen.getByTestId('page')).toBeTruthy();
    expect(screen.queryByText('Bạn chưa có gian hàng')).toBeNull();
    expect(screen.queryByTestId('sidebar')).toBeNull();
  });
});

describe('AppShell — phiên hỏng', () => {
  it('/auth/me lỗi → dọn phiên và về portal login kèm next, không loop', async () => {
    nav.pathname = '/manage/vehicles';
    state.user = null;
    state.isError = true;
    renderShell();

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/manage/login?next=%2Fmanage%2Fvehicles'),
    );
  });

  it('đang nạp /auth/me → chưa dựng khung, chưa đá đi đâu', () => {
    state.user = null;
    state.isLoading = true;
    renderShell();

    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe('AppShell — các vùng của khung', () => {
  beforeEach(() => {
    state.user = OWNER;
  });

  it('dựng đủ sidebar · topbar · vùng nội dung <main> · điều hướng mobile', () => {
    renderShell();

    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('topbar')).toBeTruthy();
    expect(screen.getByTestId('mobile-nav')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('children nằm TRONG <main>, không nằm cạnh sidebar', () => {
    renderShell();

    expect(screen.getByRole('main').contains(screen.getByTestId('page'))).toBe(true);
  });

  it('cả sidebar lẫn điều hướng mobile đều luôn mount — chọn hiện cái nào là việc của CSS', () => {
    // Hiện trạng: `AppShell` KHÔNG gọi `useIsMobile`/`useIsTablet`. Không có nhánh JS nào theo
    // breakpoint; `Sidebar` và thanh tab của `MobileNav` loại trừ nhau bằng `@media` trong
    // `.module.css`. Wave 1D đổi ranh 992→1024 là đổi ở đó — nếu chuyển sang nhánh JS thì
    // test này phải sửa CÓ CHỦ Ý.
    const matchMedia = vi.spyOn(window, 'matchMedia');
    renderShell();

    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('mobile-nav')).toBeTruthy();
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('gian hàng chờ duyệt: hiện dải thông báo NHƯNG vẫn cho xem nội dung', () => {
    state.user = PENDING_OWNER;
    renderShell();

    expect(screen.getByText('Hồ sơ đang chờ nền tảng duyệt')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
    expect(screen.getByTestId('sidebar')).toBeTruthy();
  });

  it('gian hàng đang hoạt động: KHÔNG có dải trạng thái nào', () => {
    renderShell();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * Dải trạng thái gian hàng.
 *
 * Bug gốc: một cờ gộp `draft | pending_review | needs_revision` in chung câu "Gian hàng đang chờ
 * duyệt" cho cả ba — với shop `draft` thì đó là chuyện CHƯA XẢY RA, và ngay trên `/manage/shop`
 * nó nằm đè lên một dải khác nói ngược lại ("Hồ sơ chưa được gửi duyệt"). Ba trạng thái xấu còn
 * lại thì không có dải nào: gian hàng bị khoá chỉ biết qua việc xe biến mất khỏi marketplace.
 */
describe('AppShell — dải trạng thái gian hàng', () => {
  const withStatus = (status: string) => ({
    displayName: 'Chủ shop',
    tenant: { id: 'T9', name: 'Shop', slug: 's', status, roleKey: 'shop_owner' },
    platformRole: null,
  });

  it('nháp: nói CHƯA GỬI, không nói đang chờ — và chỉ đường về hồ sơ', () => {
    state.user = withStatus('draft');
    renderShell();

    expect(screen.getByText('Hồ sơ chưa được gửi duyệt')).toBeTruthy();
    expect(screen.queryByText('Hồ sơ đang chờ nền tảng duyệt')).toBeNull();
    expect(screen.getByRole('button', { name: /Hoàn thiện hồ sơ/ })).toBeTruthy();
  });

  it('cần bổ sung: câu riêng, không phải câu của "đang chờ duyệt"', () => {
    state.user = withStatus('needs_revision');
    renderShell();

    expect(screen.getByText('Nền tảng yêu cầu bổ sung')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bổ sung ngay/ })).toBeTruthy();
  });

  it.each([
    ['rejected', 'Hồ sơ bị từ chối', 'Xem lý do'],
    ['suspended', 'Gian hàng đang bị khoá', 'Liên hệ hỗ trợ'],
    ['expired', 'Gói dịch vụ đã hết hạn', 'Liên hệ hỗ trợ'],
  ])('%s: có dải riêng kèm lối đi tiếp (trước đây im lặng hoàn toàn)', (status, title, action) => {
    state.user = withStatus(status);
    renderShell();

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(action) })).toBeTruthy();
  });

  it('ở CHÍNH /manage/shop thì im lặng — trang đó đã có bản đầy đủ, hai dải là hai câu chồng nhau', () => {
    nav.pathname = '/manage/shop';
    state.user = withStatus('draft');
    renderShell();

    expect(screen.queryByText('Hồ sơ chưa được gửi duyệt')).toBeNull();
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('nhân sự nền tảng không có gian hàng: không có dải nào', () => {
    state.user = ADMIN;
    renderShell();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('route thoát khung KHÔNG dựng vùng nào của khung', () => {
    nav.pathname = '/manage/onboarding';
    state.user = CUSTOMER;
    renderShell();

    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('topbar')).toBeNull();
    expect(screen.queryByTestId('mobile-nav')).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
  });
});

describe('AppShell — ranh giới quyền giữ nguyên', () => {
  it('vừa có gian hàng vừa là nhân sự nền tảng → vẫn vào khung, không bị chặn', () => {
    state.user = DUAL;
    renderShell();

    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('AppShell KHÔNG tự quyết quyền — không đọc usePermissions', () => {
    // Lọc menu là việc của `useManageNav`; chặn `/manage/admin/*` là việc của `admin/layout`;
    // chặn thật là guard backend. Khung chỉ phân biệt "đã đăng nhập / có gian hàng".
    const code = codeOf('./AppShell.tsx');

    expect(code).not.toContain('usePermissions');
    expect(code).not.toContain('PERMISSION');
  });
});

/**
 * Đọc source dạng văn bản. Ghép đường dẫn bằng `node:path` — `new URL('./x.tsx', …)` bị Vite
 * bắt lại thành import asset.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

function sourceOf(relative: string): string {
  return readFileSync(join(HERE, relative), 'utf8');
}

/**
 * Chỉ phần CODE, đã bỏ comment.
 *
 * Cần vì docblock ở đây CỐ Ý nêu tên thứ bị loại trừ ("cố ý KHÔNG dùng `DetailDrawer`") để
 * người đọc sau hiểu lý do. Khẳng định "không dùng X" mà quét cả comment thì chính lời giải
 * thích làm test đỏ — đã vấp đúng bẫy này ba lần trong Wave 1D.
 */
function codeOf(relative: string): string {
  return sourceOf(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Có DỰNG `<AppShell>` hay không — khác hẳn với "có nhắc tới chữ AppShell trong comment". */
function wrapsAppShell(source: string): boolean {
  return /<AppShell[\s>]/.test(source);
}

describe('AppShell — vùng nội dung co theo bề rộng sidebar', () => {
  const css = sourceOf('./AppShell.module.css');

  it('vỏ là flex: sidebar cột cố định, nội dung ăn phần còn lại', () => {
    // Đây là lý do thu gọn sidebar KHÔNG cần tính offset ở JS: đổi bề rộng cột thì
    // `flex: 1` của `.main` tự bù. Không có `margin-left`/`padding-left` cứng nào.
    expect(css).toMatch(/\.shell\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.main\s*\{[^}]*flex:\s*1/);
    expect(css).not.toContain('var(--xp-shell-sidebar-width)');
    expect(css).not.toContain('var(--xp-shell-sidebar-collapsed-width)');
  });

  it('`.main` giữ min-width: 0 — thứ chặn bảng rộng đẩy tràn cả trang', () => {
    expect(css).toMatch(/\.main\s*\{[^}]*min-width:\s*0/);
  });

  it('không có offset tính bằng JS trong AppShell', () => {
    const source = sourceOf('./AppShell.tsx');

    expect(source).not.toContain('sidebarCollapsed');
    expect(source).not.toContain('marginLeft');
  });

  it('vỏ KHÔNG tự tạo tràn ngang cấp trang', () => {
    // Ba thứ cùng nhau đảm bảo điều đó và mỗi thứ đều dễ mất khi ai đó sửa bố cục:
    //  - `.main { min-width: 0 }` cho phép cột co nhỏ hơn nội dung của nó;
    //  - vỏ không đặt `width`/`min-width` cứng cho vùng nội dung;
    //  - cuộn ngang là việc của từng `DataTable`, không phải của vỏ.
    expect(css).toMatch(/\.main\s*\{[^}]*min-width:\s*0/);
    expect(css).not.toMatch(/\.content\s*\{[^}]*\bwidth:/);
    expect(css).not.toContain('overflow-x');
  });

  it('vùng nội dung chừa chỗ cho thanh tab bằng token, không phải số gõ tay', () => {
    expect(css).toContain('var(--xp-shell-bottom-nav-height)');
    expect(css).toContain('env(safe-area-inset-bottom');
  });
});

describe('AppShell — chồng lớp overlay', () => {
  it('vỏ nằm DƯỚI mọi overlay của AntD', () => {
    // `ResponsiveDialog` và `DetailDrawer` không tự đặt z-index — AntD xếp chúng từ
    // `zIndexPopupBase`. Vỏ phải nằm thấp hơn con số đó, nếu không modal/drawer sẽ chui
    // xuống dưới sidebar hoặc thanh tab.
    const popupBase = Number(XP_TOKENS['z-popup-base']);

    expect(Number(XP_TOKENS['z-sidebar'])).toBeLessThan(popupBase);
    expect(Number(XP_TOKENS['z-topbar'])).toBeLessThan(popupBase);
  });

  it('sidebar nằm trên topbar và thanh tab (nó là cột toàn chiều cao)', () => {
    expect(Number(XP_TOKENS['z-sidebar'])).toBeGreaterThan(Number(XP_TOKENS['z-topbar']));
  });
});

describe('MobileNav — ngoại lệ có chủ ý với DetailDrawer', () => {
  it('dùng thẳng Drawer của AntD, KHÔNG dùng DetailDrawer', () => {
    // `DetailDrawer` (Wave 1B) mang ngữ nghĩa "chi tiết một thực thể nghiệp vụ". Điều hướng
    // không phải thực thể. Ghi lại như ngoại lệ (kiểm kê trùng lặp Wave 0B §D17, đã nghỉ hưu).
    const code = codeOf('./MobileNav.tsx');

    expect(code).not.toContain('DetailDrawer');
    expect(code).toMatch(/from 'antd'/);
    expect(code).toMatch(/<Drawer/);
  });

  it('và KHÔNG dựng lại một primitive drawer riêng', () => {
    expect(codeOf('./MobileNav.tsx')).not.toMatch(/position:\s*fixed/);
  });
});

describe('AppShell — không bọc nhầm khu công khai', () => {
  it('CHỈ route group (manage) bọc AppShell', () => {
    expect(wrapsAppShell(sourceOf('../../app/(manage)/layout.tsx'))).toBe(true);
  });

  it('marketplace công khai KHÔNG bọc AppShell (cần SEO, có header/footer riêng)', () => {
    const source = sourceOf('../../app/(public)/layout.tsx');

    expect(wrapsAppShell(source)).toBe(false);
    expect(source).toContain('MarketHeader');
    expect(source).toContain('MobileTabBar');
  });

  it('khu (auth) và layout gốc cũng không bọc AppShell', () => {
    expect(wrapsAppShell(sourceOf('../../app/(auth)/layout.tsx'))).toBe(false);
    expect(wrapsAppShell(sourceOf('../../app/layout.tsx'))).toBe(false);
  });

  it('điều hướng mobile của hai khu là hai component khác nhau', () => {
    // `MobileNav` (cổng quản lý) và `MobileTabBar` (marketplace) không được gộp: một cái lọc
    // theo quyền tenant/platform, cái kia mở modal đăng nhập cho khách.
    expect(sourceOf('../../app/(public)/layout.tsx')).not.toContain('<MobileNav');
  });
});

describe('AppShell — băng "gói hết hạn" của tính năng đang đọc (ADR 0027 điều 3)', () => {
  /**
   * Băng tra `pathname → leaf.feature` từ CHÍNH cây nav, nên test đi qua đúng đường đó: đặt
   * pathname vào một trang bị gác rồi bật `read_only` cho đúng cờ của trang ấy.
   */
  function shellAt(pathname: string) {
    nav.pathname = pathname;
    state.user = OWNER;
    return renderShell();
  }

  it('trang bị gác + read_only ⇒ hiện băng gia hạn, KHÔNG che nội dung trang', () => {
    features.states = { finance: 'read_only' };
    shellAt('/manage/receipts');

    expect(screen.getByText(/đang ở chế độ chỉ xem/)).toBeTruthy();
    // Băng là một dải, không phải màn chặn — trang vẫn render.
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('cùng trang đó nhưng enabled ⇒ KHÔNG có băng nào', () => {
    features.states = { finance: 'enabled' };
    shellAt('/manage/receipts');

    expect(screen.queryByText(/đang ở chế độ chỉ xem/)).toBeNull();
  });

  it('trang KHÔNG bị gác ⇒ không băng, dù cờ khác đang read_only', () => {
    features.states = { finance: 'read_only' };
    shellAt('/manage/bookings');

    expect(screen.queryByText(/đang ở chế độ chỉ xem/)).toBeNull();
  });

  it('hidden KHÔNG dựng băng — đó là màn upsell, không phải băng nhắc gia hạn', () => {
    features.states = { finance: 'hidden' };
    shellAt('/manage/receipts');

    expect(screen.queryByText(/đang ở chế độ chỉ xem/)).toBeNull();
  });
});
