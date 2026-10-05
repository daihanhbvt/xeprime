import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditLog } from '@/features/admin-audit/types';

import AdminAuditPage from './page';

/**
 * Test ĐẶC TẢ cho `/manage/admin/audit` — viết TRƯỚC khi migrate sang nền tảng Wave 1C.
 *
 * Đây là trang rủi ro THẤP duy nhất trong kiểm kê 1C-A: chỉ đọc, không mutation, không quyền ở
 * tầng trang. Vì vậy nó là nơi an toàn nhất để chứng minh `DataTable` + `FilterBar` + `useUrlFilters`
 * chạy được với nhau — nhưng vẫn phải khoá lại đúng những gì đang có.
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin/audit',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/admin-audit/hooks/use-audit-logs', () => ({
  useAuditLogs: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

const drawer = vi.hoisted(() => ({ logId: null as string | null }));

vi.mock('@/features/admin-audit/components/AuditLogDetailDrawer', () => ({
  AuditLogDetailDrawer: ({ logId }: { logId: string | null }) => {
    drawer.logId = logId;
    return logId ? <div data-testid="audit-drawer">{logId}</div> : null;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function log(over: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'l1',
    createdAt: '2026-08-07T03:00:00.000Z',
    actorScope: 'platform',
    actorName: 'Quản trị viên',
    actorEmail: 'admin@xeprime.test',
    action: 'tenant.lock',
    targetType: 'tenant',
    targetId: 'T-001',
    tenantName: 'Gian hàng Demo',
    ...over,
  } as AuditLog;
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function renderPage() {
  return render(
    <App>
      <AdminAuditPage />
    </App>,
  );
}

function lastUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  drawer.logId = null;
  setQuery();
});

afterEach(cleanup);

describe('/manage/admin/audit — trạng thái', () => {
  it('lỗi khi chưa có dữ liệu: câu chữ riêng của module + Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được nhật ký')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('Thử lại gọi refetch', () => {
    setQuery({ isError: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setQuery({ isError: true, data: { items: [log()], meta: META } });
    renderPage();

    expect(screen.getByText('Quản trị viên')).toBeTruthy();
    expect(screen.queryByText('Không tải được nhật ký')).toBeNull();
  });

  it('rỗng không lọc: "Chưa có nhật ký nào", không có nút xoá lọc', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có nhật ký nào')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('rỗng khi đang lọc: đổi câu chữ và mở lối xoá lọc', () => {
    nav.params = new URLSearchParams('action=tenant.lock');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có dòng nhật ký khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('lọc theo khoảng ngày cũng tính là đang lọc', () => {
    nav.params = new URLSearchParams('dateFrom=2026-01-01');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có dòng nhật ký khớp bộ lọc')).toBeTruthy();
  });
});

describe('/manage/admin/audit — filter và URL', () => {
  it('mặc định ba bộ lọc là "all" và được truyền xuống lớp dữ liệu', () => {
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    const filters = query.lastFilters as Record<string, unknown>;
    expect(filters.actorScope).toBe('all');
    expect(filters.action).toBe('all');
    expect(filters.targetType).toBe('all');
  });

  it('đọc đủ tham số từ URL, kể cả các tham số sâu (targetId/tenantId/actorUserId)', () => {
    nav.params = new URLSearchParams(
      'actorScope=platform&action=tenant.lock&targetType=tenant&targetId=T-001&tenantId=X&actorUserId=U&dateFrom=2026-01-01&dateTo=2026-01-31&page=2',
    );
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      actorScope: 'platform',
      action: 'tenant.lock',
      targetType: 'tenant',
      targetId: 'T-001',
      tenantId: 'X',
      actorUserId: 'U',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      page: 2,
    });
  });

  it('"Xoá bộ lọc" trả ba select về all, xoá khoảng ngày, và về trang 1', () => {
    nav.params = new URLSearchParams(
      'actorScope=platform&action=tenant.lock&targetType=tenant&dateFrom=2026-01-01&dateTo=2026-01-31&page=5',
    );
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = lastUrl();
    expect(url).not.toContain('actorScope=');
    expect(url).not.toContain('action=');
    expect(url).not.toContain('targetType=');
    expect(url).not.toContain('dateFrom=');
    expect(url).not.toContain('dateTo=');
    expect(url).not.toContain('page=');
  });

  it('giữ nguyên tham số không liên quan khi xoá lọc', () => {
    nav.params = new URLSearchParams('action=tenant.lock&targetId=T-001');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(lastUrl()).toContain('targetId=T-001');
  });

  it('khoảng ngày hiển thị theo quy ước Việt Nam', () => {
    nav.params = new URLSearchParams('dateFrom=2026-01-01&dateTo=2026-01-31');
    setQuery({ data: { items: [log()], meta: META } });
    const { container } = renderPage();

    const inputs = container.querySelectorAll('.ant-picker-input input');
    expect((inputs[0] as HTMLInputElement).value).toBe('01/01/2026');
    expect((inputs[1] as HTMLInputElement).value).toBe('31/01/2026');
  });
});

describe('/manage/admin/audit — dữ liệu và hành động', () => {
  it('hiện người thao tác, email, nhãn hành động VN và mã hành động thô', () => {
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    expect(screen.getByText('Quản trị viên')).toBeTruthy();
    expect(screen.getByText('admin@xeprime.test')).toBeTruthy();
    expect(screen.getByText('Khoá gian hàng')).toBeTruthy();
    // Mã thô luôn hiện kèm — nhật ký phải tra được kể cả khi chưa có nhãn tiếng Việt.
    expect(screen.getByText('tenant.lock')).toBeTruthy();
  });

  it('thiếu người thao tác thì hiện gạch ngang', () => {
    setQuery({ data: { items: [log({ actorName: null, actorEmail: null })], meta: META } });
    renderPage();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('phạm vi hiển thị bằng StatusTag, không phải chữ thô', () => {
    setQuery({ data: { items: [log({ actorScope: 'platform' })], meta: META } });
    const { container } = renderPage();

    expect(container.querySelector('.ant-tag')).toBeTruthy();
  });

  it('"Xem chi tiết" mở panel đúng dòng, KHÔNG điều hướng', () => {
    setQuery({ data: { items: [log({ id: 'l-42' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(drawer.logId).toBe('l-42');
  });

  it('bảng chỉ có một hành động — nhật ký là bề mặt chỉ đọc', () => {
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    expect(within(bodyRows()[0]!).getAllByRole('button')).toHaveLength(1);
  });

  it('đổi trang ghi page và limit vào URL', () => {
    setQuery({ data: { items: [log()], meta: { page: 1, limit: 20, total: 60, hasNext: true } } });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toContain('page=2');
    expect(lastUrl()).toContain('limit=20');
  });

  it('tổng hiển thị theo đơn vị "dòng"', () => {
    setQuery({ data: { items: [log()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('245 dòng')).toBeTruthy();
  });
});
