import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_HISTORY_KIND,
  BOOKING_HISTORY_OUTCOME,
  PERMISSION,
  SERVICE_TYPE,
} from '@xeprime/types';
import { bookingPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';
import type { BookingHistoryFilters, BookingHistoryItem } from '../types';

/** "Đơn đã kết thúc" (05/11/2026) — ngăn, kết cục do server suy, đường mở chi tiết của hai loại dòng. */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/bookings/ended',
  useSearchParams: () => nav.params,
}));
const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));
vi.mock(
  '@/features/branches/hooks/use-branch-filter',
  () => import('@/features/branches/test-utils'),
);
vi.mock('@/features/tenant-support/support-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tenant-support/support-session')>()),
  useSupportSession: () => null,
}));
const opened = vi.hoisted(() => ({ request: null as unknown }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: opened.request, isLoading: false }),
}));
vi.mock('@/features/booking-requests/components/BookingRequestDetailDialog', () => ({
  BookingRequestDetailDialog: ({ request }: { request: { id: string } | null }) =>
    request ? <div data-testid="request-detail-dialog">{request.id}</div> : null,
}));
vi.mock('@/features/vehicles/components/VehicleDetailDialog', () => ({
  VehicleDetailDialog: () => null,
}));

const history = vi.hoisted(() => ({
  lastFilters: undefined as BookingHistoryFilters | undefined,
  items: [] as unknown[],
  includesRequests: true,
}));
vi.mock('../hooks/use-booking-history', () => ({
  useBookingHistory: (filters: BookingHistoryFilters) => {
    history.lastFilters = filters;
    return {
      data: {
        items: history.items,
        meta: {
          page: 1,
          limit: 10,
          total: history.items.length,
          hasNext: false,
          tabCounts: { all: 17, completed: 10, cancelled: 5, notConverted: 2 },
          includesRequests: history.includesRequests,
        },
      },
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    };
  },
}));

const { BookingHistoryView } = await import('./BookingHistoryView');

function row(over: Partial<BookingHistoryItem> & { id: string }): BookingHistoryItem {
  return {
    kind: BOOKING_HISTORY_KIND.BOOKING,
    code: `DH-${over.id}`,
    outcome: BOOKING_HISTORY_OUTCOME.COMPLETED,
    endedAt: '2026-11-01T05:40:00.000Z',
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    vehicleId: 'V1',
    vehicleName: `Xe ${over.id}`,
    vehiclePlate: '14A-789.79',
    vehicleImageUrl: null,
    customerName: 'Đỗ Thị Kim',
    customerPhone: '0944555666',
    pickupAt: '2026-11-09T15:00:00.000Z',
    returnAt: '2026-11-10T15:00:00.000Z',
    ...over,
  } as BookingHistoryItem;
}

function renderPage(params = '') {
  nav.params = new URLSearchParams(params);
  return renderWithIntl(
    <App>
      <BookingHistoryView />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW]);
  history.items = [];
  history.includesRequests = true;
  opened.request = null;
  nav.push.mockClear();
  nav.replace.mockClear();
});
afterEach(cleanup);

describe('Đơn đã kết thúc', () => {
  it('bốn ngăn kèm số đếm của server; ngăn đọc từ `?tab=` và đi thẳng xuống API', () => {
    renderPage('tab=cancelled');
    expect(history.lastFilters?.tab).toBe('cancelled');
    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /Tất cả\s*17/ })).toBeTruthy();
    expect(within(tabs).getByRole('tab', { name: /Không thành đơn\s*2/ })).toBeTruthy();
  });

  it('không có quyền xem yêu cầu ⇒ không có ngăn "Không thành đơn"', () => {
    history.includesRequests = false;
    renderPage();
    expect(screen.queryByRole('tab', { name: /Không thành đơn/ })).toBeNull();
  });

  it('đổi ngăn gỡ kết cục của ngăn cũ', () => {
    renderPage('tab=cancelled&outcome=no_show');
    fireEvent.click(screen.getByRole('tab', { name: /Hoàn thành/ }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/bookings/ended?tab=completed', {
      scroll: false,
    });
  });

  it('kết cục là NHÃN do client dịch từ mã server; yêu cầu không có mã đơn', () => {
    history.items = [
      row({ id: 'B1', outcome: BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST }),
      row({
        id: 'R1',
        kind: BOOKING_HISTORY_KIND.REQUEST,
        code: null,
        outcome: BOOKING_HISTORY_OUTCOME.REQUEST_REJECTED,
      }),
    ];
    renderPage();
    expect(screen.getAllByText('Bạn đã huỷ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bạn đã từ chối').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#DH-B1').length).toBeGreaterThan(0);
  });

  it('dòng ĐƠN mở trang chi tiết đơn; dòng YÊU CẦU mở popup chi tiết yêu cầu', () => {
    history.items = [
      row({ id: 'B1' }),
      row({ id: 'R1', kind: BOOKING_HISTORY_KIND.REQUEST, code: null }),
    ];
    renderPage();
    const buttons = screen.getAllByRole('button', { name: 'Xem chi tiết' });
    fireEvent.click(buttons[0]!);
    expect(nav.push).toHaveBeenCalledWith(bookingPath.detail('B1'));
    opened.request = { id: 'R1' };
    fireEvent.click(buttons[1]!);
    expect(screen.getByTestId('request-detail-dialog').textContent).toBe('R1');
  });

  it('không có dòng nào ⇒ câu trống của đúng ngăn', () => {
    renderPage('tab=not_converted');
    expect(screen.getByText('Chưa có yêu cầu nào không thành đơn')).toBeTruthy();
  });
});
