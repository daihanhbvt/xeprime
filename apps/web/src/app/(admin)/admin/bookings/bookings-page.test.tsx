import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminBooking } from '@/features/admin-bookings/types';

import AdminBookingsPage from './page';

/**
 * `/manage/admin/bookings` — bảng + panel chi tiết đứng cạnh.
 *
 * Dùng bảng và panel THẬT, chỉ giả tầng dữ liệu: thứ cần khoá là tương tác giữa hai bên — bấm
 * dòng mở đúng đơn, dòng đó được đánh dấu, bảng bỏ các cột đã có trong panel, đóng panel là mọi
 * thứ về như cũ.
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

describe('/manage/admin/bookings — bảng + panel chi tiết', () => {
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

  it('mã đơn là nút mở panel — dùng được bằng bàn phím', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết đơn XP-001' }));
    expect(screen.getByText('Đơn XP-001')).toBeTruthy();
  });

  it('panel mở: bảng giữ năm cột ưu tiên, bỏ cột tiền và cột thao tác (đã có trong panel)', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));

    const shown = headers();
    expect(shown).toEqual(
      expect.arrayContaining([
        'Mã đơn',
        'Khách thuê',
        'Gian hàng · xe',
        'Thời gian thuê',
        'Trạng thái',
      ]),
    );
    expect(shown).not.toContain('Tổng tiền');
    expect(shown).not.toContain('Còn nợ');
    expect(shown).not.toContain('Thao tác');
  });

  it('không có mask: vẫn bấm được dòng khác để đổi đơn đang xem', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));
    expect(document.querySelector('.ant-drawer-mask')).toBeNull();

    fireEvent.click(within(rowOf('XP-002')).getByText('Trần Thị B'));
    expect(screen.getByText('Đơn XP-002')).toBeTruthy();
    expect(rowOf('XP-002').getAttribute('aria-current')).toBe('true');
    expect(rowOf('XP-001').getAttribute('aria-current')).toBeNull();
  });

  it('đóng panel bằng nút X: bỏ đánh dấu dòng, cột tiền trở lại', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));
    fireEvent.click(document.querySelector('.ant-drawer-close') as HTMLElement);

    expect(document.querySelector('tr[aria-current]')).toBeNull();
    expect(headers()).toContain('Tổng tiền');
  });

  it('đóng panel bằng Esc', () => {
    renderPage();
    fireEvent.click(within(rowOf('XP-001')).getByText('Nguyễn Văn A'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });

  it('đơn đã huỷ: cột "Còn nợ" hiện "—" thay vì một khoản nợ không tồn tại', () => {
    list.data = {
      items: [booking({ status: 'cancelled', paidAmount: '68000', debtAmount: '400000' })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPage();
    const row = within(rowOf('XP-001'));
    expect(row.queryByText('400.000 ₫')).toBeNull();
    expect(row.getByText('—')).toBeTruthy();
  });

  it('còn nợ của chuyến chưa kết thúc KHÔNG bị tô đỏ trong bảng', () => {
    renderPage();
    expect(document.querySelector('[class*="debtOverdue"]')).toBeNull();
  });

  it('lọc trạng thái không còn lựa chọn `confirmed` đã deprecated', () => {
    renderPage();
    fireEvent.mouseDown(screen.getByLabelText('Lọc theo trạng thái đơn'));
    expect(screen.getAllByText('Tất cả trạng thái').length).toBeGreaterThan(0);
    expect(screen.queryByText('Đã xác nhận')).toBeNull();
  });
});
