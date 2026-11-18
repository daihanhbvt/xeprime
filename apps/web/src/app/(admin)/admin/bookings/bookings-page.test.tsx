import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminBooking } from '@/features/admin-bookings/types';

import AdminBookingsPage from './page';

/**
 * `/manage/admin/bookings` — bảng + panel chi tiết (drawer chuẩn có mask).
 *
 * Dùng bảng và panel THẬT, chỉ giả tầng dữ liệu: thứ cần khoá là tương tác giữa hai bên — bấm
 * dòng mở đúng đơn, dòng đó được đánh dấu, BỐ CỤC BẢNG KHÔNG ĐỔI (nội dung đứng yên dưới panel —
 * quyết định 07/10/2026), đóng panel là bỏ đánh dấu.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin/bookings',
  useSearchParams: () => nav.params,
}));

const list = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));
const detail = vi.hoisted(() => ({ byId: {} as Record<string, unknown> }));

vi.mock('@/features/admin-bookings/hooks/use-admin-bookings', () => ({
  useAdminBookings: () => list,
  useAdminBooking: (id: string | null) => ({
    data: id ? detail.byId[id] : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRevealBookingContact: () => ({ data: undefined, isPending: false, mutate: vi.fn() }),
}));

// Tab "Cần chăm sóc" chỉ cần số đếm ở đây — bảng đơn là thứ được soát.
vi.mock('@/features/admin-follow-ups/hooks/use-follow-ups', () => ({
  useNewFollowUpCount: () => ({ data: undefined, isPending: false }),
}));

// Tab "Chưa giữ chỗ": số đếm từ dải tóm tắt Vận hành chuyến + bảng yêu cầu cả hai chặng.
const requests = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  lastFilters: undefined as unknown,
}));
vi.mock('@/features/admin-trips/hooks/use-admin-trips', () => ({
  useTripSummary: () => ({
    data: {
      queues: {
        pending_approval: { count: 3, urgentCount: 1 },
        awaiting_hold: { count: 2, urgentCount: 0 },
      },
    },
  }),
  useTripRequests: (filters: unknown) => {
    requests.lastFilters = filters;
    return { data: requests.data, isError: false, isFetching: false, refetch: vi.fn() };
  },
  useRemindTripRequest: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => false, hasAny: () => false, isLoading: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function booking(over: Partial<AdminBooking>): AdminBooking {
  return {
    id: 'B1',
    code: 'XP-001',
    status: 'reserved',
    serviceType: 'self_drive',
    customerName: 'Nguyễn Văn A',
    customerPhoneMasked: '090****567',
    pickupAt: '2026-09-21T03:00:00.000Z',
    returnAt: '2026-09-22T03:00:00.000Z',
    totalAmount: '468000',
    paidAmount: '0',
    debtAmount: '468000',
    tenantId: 'T1',
    tenantName: 'Đà Nẵng Mini Rental',
    tenantStatus: 'active',
    vehicleId: 'V1',
    vehicleName: 'Hyundai Grand i10',
    vehiclePlateNumber: '43A-276.16',
    createdAt: '2026-09-18T10:54:00.000Z',
    ...over,
  } as AdminBooking;
}

const ROWS = [booking({}), booking({ id: 'B2', code: 'XP-002', customerName: 'Trần Thị B' })];

function detailOf(row: AdminBooking) {
  return {
    ...row,
    baseAmount: row.totalAmount,
    deliveryFee: '0',
    discountAmount: '0',
    depositAmount: '0',
    actualPickupAt: null,
    actualReturnAt: null,
    note: null,
    createdByName: null,
    receiptCount: 0,
    paymentCount: 0,
    hasContract: false,
    updatedAt: row.createdAt,
    // Đơn lập tay: không đi qua thanh toán của XePrime.
    marketplace: {
      fees: null,
      hold: null,
      bankTransactions: null,
      insurancePolicies: [],
      taxRows: [],
      cancellation: null,
    },
    // Case hỗ trợ còn mở của đơn (ADR 0095) — không có case nào.
    openSupportCases: [],
  };
}

function renderPage() {
  return render(
    <App>
      <AdminBookingsPage />
    </App>,
  );
}

function rowOf(code: string): HTMLElement {
  return screen
    .getByRole('button', { name: `Xem chi tiết đơn ${code}` })
    .closest('tr') as HTMLElement;
}

function headers(): string[] {
  return screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  list.data = { items: ROWS, meta: { page: 1, limit: 20, total: 2, hasNext: false } };
  list.isError = false;
  list.isFetching = false;
  detail.byId = Object.fromEntries(ROWS.map((row) => [row.id, detailOf(row)]));
});

afterEach(cleanup);

describe('/manage/admin/bookings - bảng + panel chi tiết', () => {
  it('chưa mở đơn nào: đủ cột, có cột tiền, không dòng nào được đánh dấu', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(headers()).toEqual(
      expect.arrayContaining([
        'Mã đơn',
        'Khách thuê',
        'Gian hàng · xe',
        'Thời gian thuê',
        'Trạng thái',
        'Tổng tiền',
        'Còn nợ',
      ]),
    );
    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });

  it('bấm vào dòng mở panel của đúng đơn đó và đánh dấu dòng', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-002')).getByText('Trần Thị B'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Đơn XP-002')).toBeTruthy();
    expect(rowOf('XP-002').getAttribute('aria-current')).toBe('true');
    expect(rowOf('XP-002').className).toContain('rowSelected');
    expect(rowOf('XP-001').getAttribute('aria-current')).toBeNull();
  });

  it('mã đơn là nút mở panel - dùng được bằng bàn phím', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết đơn XP-001' }));
    expect(screen.getByText('Đơn XP-001')).toBeTruthy();
  });

  it('panel mở: bảng GIỮ NGUYÊN mọi cột - nội dung đứng yên dưới panel, không co, không đẩy', () => {
    renderPage();
    const before = headers();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(headers()).toEqual(before);
    expect(headers()).toEqual(expect.arrayContaining(['Tổng tiền', 'Còn nợ', 'Thao tác']));
  });

  it('drawer chuẩn như màn Kiểm duyệt xe: có mask, bấm ra ngoài là đóng và bỏ đánh dấu dòng', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));
    expect(document.querySelector('.ant-drawer-mask')).not.toBeNull();

    fireEvent.click(document.querySelector('.ant-drawer-mask') as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });

  it('đóng panel bằng nút X: bỏ đánh dấu dòng', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));
    fireEvent.click(document.querySelector('.ant-drawer-close') as HTMLElement);

    expect(document.querySelector('tr[aria-current]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('đóng panel bằng Esc', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });

  it('đơn đã huỷ: cột "Còn nợ" hiện "-" thay vì một khoản nợ không tồn tại', () => {
    list.data = {
      items: [booking({ status: 'cancelled', paidAmount: '68000', debtAmount: '400000' })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPage();
    const row = within(rowOf('XP-001'));
    expect(row.queryByText('400.000 ₫')).toBeNull();
    expect(row.getByText('-')).toBeTruthy();
  });

  it('còn nợ của chuyến chưa kết thúc KHÔNG bị tô đỏ trong bảng', () => {
    renderPage();
    expect(document.querySelector('[class*="debtOverdue"]')).toBeNull();
  });

  it('ba tab theo hành trình; tab Chưa giữ chỗ đếm cả hai chặng; đổi tab là sang đúng link', () => {
    renderPage();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toContain('Chưa giữ chỗ');
    expect(tabs[0]).toContain('5');
    expect(tabs[1]).toContain('Đã thành đơn');
    expect(tabs[2]).toContain('Không thành');

    fireEvent.click(screen.getByRole('tab', { name: /Chưa giữ chỗ/ }));
    expect(nav.replace).toHaveBeenCalledWith('/admin/bookings?view=pending');
  });

  it('lọc trạng thái không còn lựa chọn `confirmed` đã deprecated', () => {
    renderPage();
    fireEvent.mouseDown(screen.getByLabelText('Lọc theo trạng thái đơn'));
    expect(screen.getAllByText('Tất cả trạng thái').length).toBeGreaterThan(0);
    expect(screen.queryByText('Đã xác nhận')).toBeNull();
  });
});

describe('/manage/admin/bookings?view=pending - yêu cầu chưa giữ chỗ', () => {
  const base = {
    customerPhoneMasked: '090****001',
    serviceType: 'self_drive',
    pickupAt: '2026-12-01T01:00:00.000Z',
    returnAt: '2026-12-03T01:00:00.000Z',
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: null,
    pickupWindowStartDate: null,
    pickupWindowEndDate: null,
    createdAt: '2026-11-17T01:00:00.000Z',
    firstRemindedAt: null,
    finalRemindedAt: null,
    tenantId: 'T1',
    tenantName: 'XePrime Sài Gòn',
    tenantStatus: 'active',
    ownerName: 'Chủ xe',
    ownerPhone: '0988000111',
    vehicleId: 'V1',
    vehicleName: 'Kia K3',
    vehiclePlateNumber: '51G-301.15',
    vehicleImageUrl: null,
    vehicleType: 'car',
    lastPlatformRemindAt: null,
  };

  beforeEach(() => {
    nav.params = new URLSearchParams('view=pending');
    requests.data = {
      items: [
        {
          ...base,
          id: 'R1',
          status: 'pending_host_approval',
          customerName: 'Khách Chờ Duyệt',
          respondBy: '2099-01-01T00:00:00.000Z',
          decidedAt: null,
          holdExpiresAt: null,
          holdAmount: null,
        },
        {
          ...base,
          id: 'R2',
          status: 'awaiting_hold',
          customerName: 'Khách Chờ Tiền',
          respondBy: '2026-11-17T01:30:00.000Z',
          decidedAt: '2026-11-17T01:10:00.000Z',
          holdExpiresAt: '2099-01-01T00:00:00.000Z',
          holdAmount: '450000',
        },
      ],
      meta: { page: 1, limit: 20, total: 2, hasNext: false },
    };
  });

  it('một bảng cho cả hai chặng: cột Tình trạng + Đã chờ + Hạn, không cột tiền của đơn', () => {
    renderPage();
    expect(requests.lastFilters).toMatchObject({ queue: undefined });
    expect(headers()).toEqual(
      expect.arrayContaining(['Khách', 'Xe · gian hàng', 'Lịch thuê', 'Tình trạng', 'Đã chờ', 'Hạn']),
    );
    expect(headers()).not.toContain('Còn nợ');
    expect(screen.getByText('Chờ chủ xe duyệt')).toBeTruthy();
    expect(screen.getByText('Chờ khách giữ chỗ')).toBeTruthy();
    expect(screen.getByText('Giữ chỗ 450.000 ₫')).toBeTruthy();
  });

  it('nút Nhắc chủ xe chỉ có ở dòng đang chờ chủ xe', () => {
    renderPage();
    const pendingRow = screen.getByText('Khách Chờ Duyệt').closest('tr') as HTMLElement;
    const awaitingRow = screen.getByText('Khách Chờ Tiền').closest('tr') as HTMLElement;
    expect(within(pendingRow).queryByRole('button', { name: /Nhắc chủ xe/ })).not.toBeNull();
    expect(within(awaitingRow).queryByRole('button', { name: /Nhắc chủ xe/ })).toBeNull();
  });

  it('chọn một tình trạng gửi đúng `queue` lên URL', () => {
    nav.params = new URLSearchParams('view=pending&queue=awaiting_hold');
    renderPage();
    expect(requests.lastFilters).toMatchObject({ queue: 'awaiting_hold' });
    // Một chặng thì tiêu đề cột hạn nói rõ hạn gì.
    expect(headers()).toContain('Hạn giữ chỗ');
    expect(headers()).not.toContain('Tình trạng');
  });
});
