import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  BILLING_PHASE,
  FEATURE_STATE,
  PARTNER_DETAIL_TAB,
  PARTNER_DETAIL_TABS,
  PERMISSION,
  PLAN_FEATURE,
  PLATFORM_PARTNER_KIND,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
  type PartnerDetailTab,
} from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/services/api-client';
import type { PartnerBilling, PartnerCommission, PartnerOverview } from './api';
import { PartnerDetailDrawer } from './PartnerDetailDrawer';

/**
 * Drawer CHI TIẾT đối tác — CHỈ ĐỌC (28/09/2026).
 *
 * Chạy với react-query THẬT; chỉ tầng HTTP (`@/services/api-client`) là giả. Nhờ vậy test khoá
 * được cả khoá cache (đổi đối tác không hiện dữ liệu người trước) lẫn lời hứa quan trọng nhất:
 * đi qua mọi tab KHÔNG phát ra một lời gọi ghi nào.
 */

const http = vi.hoisted(() => ({
  apiGet: vi.fn(),
  fetchPage: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('@/services/api-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...http };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/admin/partners/shops',
  useSearchParams: () => new URLSearchParams(),
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => permissions.granted.has(p),
    hasAny: (...keys: string[]) => keys.some((k) => permissions.granted.has(k)),
    isLoading: false,
  }),
}));

/** Luồng mở phiên hỗ trợ có test riêng — ở đây chỉ cần biết drawer mở ĐÚNG luồng đó, đúng đối tác. */
const support = vi.hoisted(() => ({
  lastProps: null as null | { tenantId: string; open: boolean },
}));
vi.mock('@/features/tenant-support/components/StartSupportDialog', () => ({
  StartSupportDialog: (props: { tenantId: string; open: boolean }) => {
    support.lastProps = props;
    return props.open ? <div data-testid="start-support-dialog">{props.tenantId}</div> : null;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/* ─────────────────────────────── dữ liệu mẫu ─────────────────────────────── */

function overview(
  kind: PartnerOverview['identity']['partnerKind'],
  over: Partial<PartnerOverview['identity']> = {},
): PartnerOverview {
  const isPackage = kind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;
  return {
    identity: {
      id: over.id ?? 't-shop',
      code: 'GH-00123',
      name: over.name ?? 'Việt Car Hà Nội',
      slug: 'viet-car',
      partnerKind: kind,
      status: 'active',
      verification: 'verified',
      onboardingState: isPackage ? 'package_active' : 'commission',
      logoUrl: null,
      createdAt: '2025-08-12T02:00:00.000Z',
      storefrontAvailable: true,
      ...over,
    },
    owner: {
      name: 'Nguyễn Minh H.',
      avatarUrl: null,
      phoneMasked: '09•••218',
      emailMasked: 'mi•••@gmail.com',
      accountStatus: 'active',
      joinedAt: '2025-08-12T02:00:00.000Z',
    },
    counts: { vehicles: 24, listed: 18, renting: 3, vehiclesWithAlerts: 2 },
    alerts: [{ kind: 'document_expiring', severity: 'warning', vehicleCount: 2 }],
    operating: {
      verification: 'verified',
      onboardingCompleted: isPackage ? true : null,
      listingRequirementsMissing: isPackage ? [] : null,
      lastActivityAt: '2025-08-12T02:14:00.000Z',
      areaNames: ['Hà Nội'],
      publicAddress: 'Số 68 Trần Thái Tông',
    },
    plan: isPackage
      ? {
          planName: 'Business',
          planCode: 'business',
          phase: 'current',
          billingMode: 'package',
          endsAt: '2099-08-12T00:00:00.000Z',
          graceEndsAt: null,
          vehicleQuota: { used: 24, kind: 'total', limit: 30, reason: 'plan' },
        }
      : null,
    branches: isPackage
      ? [
          {
            id: 'b1',
            name: 'Chi nhánh Cầu Giấy',
            address: 'Số 68',
            isDefault: true,
            status: 'active',
            vehicleCount: 16,
          },
        ]
      : null,
    recentVehicles: [],
    recentBookings: [],
  };
}

const COMMISSION: PartnerCommission = {
  feePolicy: { serviceFeePercent: '10.00', version: 3, effectiveFrom: null },
  amountsVisible: false,
  openBookings: 1,
  openDisputes: 0,
  months: [
    {
      period: '2025-08',
      closed: false,
      completedCount: 6,
      revenue: null,
      serviceFee: null,
      tax: null,
    },
  ],
};

/** Có một kỳ gói và một hoá đơn còn nợ — đủ để bảng lịch sử dựng hàng thật. */
const BILLING: PartnerBilling = {
  plan: {
    planName: 'Business',
    planCode: 'business',
    phase: BILLING_PHASE.CURRENT,
    billingMode: BILLING_MODE.PACKAGE,
    endsAt: '2099-08-12T00:00:00.000Z',
    graceEndsAt: null,
    vehicleQuota: { used: 24, kind: 'total', limit: 30, reason: 'plan' },
  },
  termStartsAt: '2025-08-12T00:00:00.000Z',
  quota: {
    vehicles: { used: 24, kind: 'total', limit: 30, reason: 'plan' },
    branches: { used: 1, kind: 'total', limit: 3 },
    members: { used: 2, kind: 'unlimited' },
  },
  features: [{ feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.ENABLED }],
  feePolicy: null,
  invoiceStatus: { unpaid: 1, dueSoon: 1, overdue: 0, nextDueAt: '2099-08-05T00:00:00.000Z' },
  subscriptions: [
    {
      id: 'sub-1',
      planName: 'Business',
      planCode: 'business',
      billingMode: BILLING_MODE.PACKAGE,
      price: '3000000.00',
      termMonths: 12,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      startsAt: '2025-08-12T00:00:00.000Z',
      endsAt: '2099-08-12T00:00:00.000Z',
    },
  ],
  invoices: [
    {
      id: 'inv-1',
      code: 'HD-0001',
      periodFrom: '2025-08-12T00:00:00.000Z',
      periodTo: '2099-08-12T00:00:00.000Z',
      totalAmount: '3000000.00',
      paidAmount: '0.00',
      status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      paidAt: null,
      expiresAt: '2099-08-05T00:00:00.000Z',
    },
  ],
};

const PAGE = { items: [], meta: { page: 1, limit: 10, total: 0, hasNext: false } };

let overviews: Record<string, PartnerOverview>;

function routeGet(path: string): Promise<unknown> {
  const tenantId = decodeURIComponent(path.split('/')[3] ?? '');
  if (path.endsWith('/overview')) {
    if (tenantId === 't-gone') {
      return Promise.reject(new ApiClientError({ code: 'NOT_FOUND', message: 'x', status: 404 }));
    }
    const data = overviews[tenantId];
    return data ? Promise.resolve(data) : new Promise(() => {}); // chưa có ⇒ đang tải mãi
  }
  if (path.endsWith('/commission')) return Promise.resolve(COMMISSION);
  if (path.endsWith('/billing')) return Promise.resolve(BILLING);
  if (path.endsWith('/bookings/summary')) {
    return Promise.resolve({
      upcoming: 3,
      active: 3,
      completed: 18,
      cancelled: 2,
      total: 26,
      pickupSoon: 1,
      pendingRequests: 2,
      totalRequests: 2,
    });
  }
  if (path.endsWith('/profile')) {
    return Promise.resolve({
      publicProfile: null,
      owner: overviews[tenantId]!.owner,
      publicPhoneMasked: null,
      publicEmailMasked: null,
      addresses: [],
      activityAreas: ['Hà Nội'],
      legal: null,
      identity: {
        sellerStatus: 'verified',
        idNumberMasked: '••••2345',
        verifiedAt: null,
        phoneVerified: true,
        emailVerified: false,
      },
      documents: null,
      vehicleDocuments: [],
      verificationHistory: [],
    });
  }
  return Promise.reject(new Error(`unexpected GET ${path}`));
}

function renderDrawer(props: {
  tenantId: string | null;
  tab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (p: typeof props) => (
    <QueryClientProvider client={client}>
      <App>
        <PartnerDetailDrawer
          tenantId={p.tenantId}
          tab={p.tab}
          onTabChange={p.onTabChange ?? vi.fn()}
          onClose={vi.fn()}
        />
      </App>
    </QueryClientProvider>
  );
  const result = render(ui(props));
  return { ...result, rerenderWith: (next: typeof props) => result.rerender(ui(next)) };
}

function tabLabels(): string[] {
  return screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
}

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
  http.apiGet.mockImplementation((path: string) => routeGet(path));
  http.fetchPage.mockResolvedValue(PAGE);
  overviews = {
    't-shop': overview(PLATFORM_PARTNER_KIND.PACKAGE_SHOP),
    't-lite': overview(PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER, {
      id: 't-lite',
      name: 'Xe của anh Hoàng',
    }),
  };
  permissions.granted = new Set([
    PERMISSION.PLATFORM_TENANT_VIEW,
    PERMISSION.PLATFORM_VEHICLE_VIEW,
    PERMISSION.PLATFORM_BOOKING_VIEW,
    PERMISSION.PLATFORM_AUDIT_VIEW,
    PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW,
  ]);
  support.lastProps = null;
});

afterEach(cleanup);

/* ─────────────────────────────── biến thể & tab ─────────────────────────────── */

describe('Drawer chi tiết đối tác — biến thể', () => {
  it('gian hàng gói: đúng sáu tab, có "Gói & phí", không có "Hoa hồng & đối soát"', async () => {
    renderDrawer({ tenantId: 't-shop' });
    await screen.findAllByText('Việt Car Hà Nội');

    expect(tabLabels()).toEqual(['Tổng quan', 'Xe', 'Đơn thuê', 'Hồ sơ', 'Gói & phí', 'Nhật ký']);
    expect(screen.getByText('Gian hàng gói')).toBeTruthy();
    // Tổng quan của gian hàng có chi nhánh và gói.
    expect(screen.getByText('Chi nhánh Cầu Giấy')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
  });

  it('chủ xe cá nhân: đúng sáu tab, có "Hoa hồng & đối soát"; KHÔNG chi nhánh, gói, nhân sự', async () => {
    renderDrawer({ tenantId: 't-lite' });
    await screen.findByText('Chủ xe cá nhân');

    expect(tabLabels()).toEqual([
      'Tổng quan',
      'Xe',
      'Đơn thuê',
      'Hồ sơ',
      'Hoa hồng & đối soát',
      'Nhật ký',
    ]);
    expect(screen.getByText('Tuyến hoa hồng')).toBeTruthy();
    expect(screen.queryByText('Chi nhánh')).toBeNull();
    expect(screen.queryByText('Gói hiện tại')).toBeNull();
    expect(screen.queryByText('Nhân sự')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Gói & phí' })).toBeNull();
  });

  it('biến thể theo loại SERVER trả về, không theo danh sách đang đứng', async () => {
    // Mở một chủ xe cá nhân (dù URL có thể đang ở danh sách gian hàng): vẫn ra bộ tab cá nhân.
    renderDrawer({ tenantId: 't-lite' });
    await screen.findByRole('tab', { name: 'Hoa hồng & đối soát' });
  });
});

/* ─────────────────────────────── chỉ đọc ─────────────────────────────── */

const MUTATION_LABEL =
  /Chỉnh sửa|^Sửa|Lưu|Xác minh$|Từ chối|Duyệt|Khoá gian hàng|Mở khoá|Gia hạn|Thanh toán|Huỷ|Công khai|Ẩn xe|Gửi kiểm duyệt|Rút tiền|Chi trả/;

const TAB_LABEL: Record<PartnerDetailTab, string> = {
  [PARTNER_DETAIL_TAB.OVERVIEW]: 'Tổng quan',
  [PARTNER_DETAIL_TAB.VEHICLES]: 'Xe',
  [PARTNER_DETAIL_TAB.BOOKINGS]: 'Đơn thuê',
  [PARTNER_DETAIL_TAB.PROFILE]: 'Hồ sơ',
  [PARTNER_DETAIL_TAB.BILLING]: 'Gói & phí',
  [PARTNER_DETAIL_TAB.COMMISSION]: 'Hoa hồng & đối soát',
  [PARTNER_DETAIL_TAB.ACTIVITY]: 'Nhật ký',
};

/**
 * Mọi tab của cả hai biến thể, MỖI TAB MỘT CASE.
 *
 * Tab đi qua prop `tab` (deep-link) — đúng đường trang thật đi, vì tab sống trên URL. Bấm tab
 * trong test KHÔNG đổi được nội dung: drawer là controlled, `onTabChange` giả không ghi lại
 * `tab`, nên một vòng bấm qua sáu tab chỉ kiểm đi kiểm lại Tổng quan. Tách case cũng cho mỗi
 * lần dựng tab một đồng hồ riêng thay vì dồn mười hai lần dựng vào một `testTimeout`.
 */
const READ_ONLY_CASES = (
  [
    ['t-shop', PLATFORM_PARTNER_KIND.PACKAGE_SHOP],
    ['t-lite', PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER],
  ] as const
).flatMap(([tenantId, kind]) => PARTNER_DETAIL_TABS[kind].map((tab) => ({ tenantId, tab })));

describe('Drawer chi tiết đối tác — chỉ đọc', () => {
  it.each(READ_ONLY_CASES)(
    '$tenantId · tab $tab: không nút mutation nào, không lời gọi ghi nào',
    async ({ tenantId, tab }) => {
      permissions.granted.add(PERMISSION.PLATFORM_BILLING_MANAGE);
      renderDrawer({ tenantId, tab });
      await screen.findByRole('tab', { name: TAB_LABEL[tab], selected: true });
      const drawer = screen.getByTestId('partner-detail-drawer');
      // Chờ tab tải xong — nút hành động (nếu có) chỉ hiện cùng dữ liệu. Một tab rơi vào trạng
      // thái lỗi (GET chưa giả lập) thì chẳng còn gì để kiểm: phải dựng được dữ liệu thật.
      await waitFor(() => expect(drawer.querySelector('[aria-busy="true"]')).toBeNull());
      expect(drawer.textContent).not.toContain('Không tải được dữ liệu');

      // `querySelectorAll` thay vì `queryAllByRole`: phép sau tính khả kiến qua
      // `getComputedStyle` cho từng nút trên cả cây AntD — chính nó làm test chạm timeout trên
      // CI. Chỉ tab đang mở được dựng, nên không có nút ẩn nào của tab khác lọt vào đây.
      const mutations = Array.from(
        drawer.querySelectorAll('button, [role="button"]'),
        (button) => button.textContent ?? '',
      ).filter((label) => MUTATION_LABEL.test(label));
      expect(mutations).toEqual([]);

      expect(http.apiPost).not.toHaveBeenCalled();
      expect(http.apiPatch).not.toHaveBeenCalled();
      expect(http.apiPut).not.toHaveBeenCalled();
      expect(http.apiDelete).not.toHaveBeenCalled();
    },
  );

  it('không có quyền quản trị nền tảng: không có menu "…"', async () => {
    renderDrawer({ tenantId: 't-shop' });
    await screen.findAllByText('Việt Car Hà Nội');
    expect(screen.queryByRole('button', { name: 'Thao tác khác' })).toBeNull();
  });

  it('số tiền bị server bỏ thì hiện "Ẩn", không hiện số', async () => {
    renderDrawer({ tenantId: 't-lite', tab: 'commission' });
    await screen.findByText('Chính sách phí dịch vụ');
    expect(screen.getAllByText('Ẩn').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Chỉ người có quyền vận hành tiền của nền tảng mới xem được số tiền.'),
    ).toBeTruthy();
  });

  it('thiếu quyền Gói & thanh toán: tab Gói & phí là "không có quyền" và KHÔNG gọi API', async () => {
    renderDrawer({ tenantId: 't-shop', tab: 'billing' });
    await screen.findByText('Bạn không có quyền xem mục này');
    expect(http.apiGet.mock.calls.some(([path]) => String(path).endsWith('/billing'))).toBe(false);
  });

  it('thiếu quyền nhật ký: tab Nhật ký là "không có quyền"', async () => {
    permissions.granted.delete(PERMISSION.PLATFORM_AUDIT_VIEW);
    renderDrawer({ tenantId: 't-shop', tab: 'activity' });
    await screen.findByText('Chỉ người có quyền xem nhật ký hệ thống mới xem được tab này.');
    expect(http.fetchPage).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────── hỗ trợ ─────────────────────────────── */

describe('Drawer chi tiết đối tác — mở chế độ hỗ trợ', () => {
  it('có quyền: nút mở ĐÚNG luồng phiên hỗ trợ hiện có, với đúng đối tác', async () => {
    renderDrawer({ tenantId: 't-shop' });
    fireEvent.click(await screen.findByRole('button', { name: /Mở chế độ hỗ trợ/ }));
    expect(screen.getByTestId('start-support-dialog').textContent).toBe('t-shop');
  });

  it('không có quyền hỗ trợ: không có nút, không dựng hộp mở phiên', async () => {
    permissions.granted.delete(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
    renderDrawer({ tenantId: 't-shop' });
    await screen.findAllByText('Việt Car Hà Nội');
    expect(screen.queryByRole('button', { name: /Mở chế độ hỗ trợ/ })).toBeNull();
    expect(support.lastProps).toBeNull();
  });
});

/* ─────────────────────────────── tab URL & cache ─────────────────────────────── */

describe('Drawer chi tiết đối tác — dữ liệu theo quyền và luật', () => {
  it('gian hàng hết gói: hạn mức là trần Owner Lite đang cưỡng chế, KHÔNG "không giới hạn"', async () => {
    const lapsed = overview(PLATFORM_PARTNER_KIND.PACKAGE_SHOP);
    lapsed.plan = {
      ...lapsed.plan!,
      phase: 'lapsed',
      vehicleQuota: { used: 5, kind: 'total', limit: 3, reason: 'owner_lite' },
    };
    overviews['t-shop'] = lapsed;
    renderDrawer({ tenantId: 't-shop' });

    await screen.findByText('5 / 3 xe');
    expect(screen.getByText(/trần Owner Lite/)).toBeTruthy();
    expect(screen.queryByText(/không giới hạn/)).toBeNull();
  });

  it('server bỏ cảnh báo (thiếu quyền xem xe): không có banner, thẻ số hay khối "Cần xử lý"', async () => {
    const noVehicles = overview(PLATFORM_PARTNER_KIND.PACKAGE_SHOP);
    noVehicles.alerts = null;
    noVehicles.counts = { ...noVehicles.counts, vehiclesWithAlerts: null };
    noVehicles.recentVehicles = null;
    overviews['t-shop'] = noVehicles;
    renderDrawer({ tenantId: 't-shop' });

    await screen.findAllByText('Việt Car Hà Nội');
    expect(screen.queryByText(/xe cần chú ý/)).toBeNull();
    expect(screen.queryByText('Xe có cảnh báo')).toBeNull();
    expect(screen.queryByText('Cần xử lý')).toBeNull();
  });

  it('link tới đối tác không còn tồn tại: nói "không tìm thấy", KHÔNG có nút Thử lại', async () => {
    renderDrawer({ tenantId: 't-gone' });
    await screen.findByText('Không tìm thấy đối tác');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('tháng hiện ở dạng đọc được theo ngôn ngữ, không phải chuỗi YYYY-MM thô', async () => {
    renderDrawer({ tenantId: 't-lite', tab: 'commission' });
    await screen.findByText('Chính sách phí dịch vụ');
    expect(screen.queryByText('2025-08')).toBeNull();
  });
});

describe('Drawer chi tiết đối tác — tab và cache', () => {
  it('deep-link tab hợp lệ mở đúng tab; tab không thuộc biến thể rơi về Tổng quan', async () => {
    const shop = renderDrawer({ tenantId: 't-shop', tab: 'bookings' });
    await screen.findByText('Sắp nhận xe');
    expect(screen.getByRole('tab', { name: 'Đơn thuê', selected: true })).toBeTruthy();
    shop.unmount();

    // `commission` không phải tab của gian hàng gói ⇒ về Tổng quan thay vì một trang trống.
    renderDrawer({ tenantId: 't-shop', tab: 'commission' });
    await screen.findByRole('tab', { name: 'Tổng quan', selected: true });
  });

  it('đổi tab báo ra ngoài để ghi lên URL', async () => {
    const onTabChange = vi.fn();
    renderDrawer({ tenantId: 't-shop', onTabChange });
    fireEvent.click(await screen.findByRole('tab', { name: 'Xe' }));
    expect(onTabChange).toHaveBeenCalledWith('vehicles');
  });

  it('đổi sang đối tác chưa tải xong: KHÔNG hiện dữ liệu của đối tác trước', async () => {
    const view = renderDrawer({ tenantId: 't-shop' });
    await screen.findAllByText('Việt Car Hà Nội');

    view.rerenderWith({ tenantId: 't-pending' });
    await waitFor(() => expect(screen.queryAllByText('Việt Car Hà Nội')).toHaveLength(0));
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('Drawer chi tiết đối tác — tiếng Anh', () => {
  it('tab, huy hiệu và nút đều đã dịch', async () => {
    renderWithIntl(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <App>
          <PartnerDetailDrawer
            tenantId="t-lite"
            tab={undefined}
            onTabChange={vi.fn()}
            onClose={vi.fn()}
          />
        </App>
      </QueryClientProvider>,
      { locale: 'en' },
    );
    await screen.findByRole('tab', { name: 'Commission & statements' });
    expect(tabLabels()).toEqual([
      'Overview',
      'Vehicles',
      'Bookings',
      'Profile',
      'Commission & statements',
      'Activity log',
    ]);
    expect(screen.getByText('Individual owner')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open support mode/ })).toBeTruthy();
  });
});
