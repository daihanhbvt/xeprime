import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditLog } from '@/features/admin-audit/types';
import { renderWithIntl } from '@/i18n/test-utils';

import AdminAuditPage from './page';

/**
 * Test ĐẶC TẢ cho trang Nhật ký hệ thống (`admin.xeprime.vn/audit`).
 *
 * Trang chỉ đọc, không mutation, không quyền ở tầng trang — nơi an toàn nhất để chứng minh
 * `DataTable` + `FilterBar` + `useUrlFilters` chạy được với nhau, và từ 08/10/2026 thêm hai thứ:
 * dải ngữ cảnh khi đến từ một đối tượng, và dòng đang mở sống ở URL (`?open=`).
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/admin/audit',
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
    targetLabel: null,
    viaSupport: false,
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
  return renderWithIntl(
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

describe('admin/audit — trạng thái', () => {
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

    expect(screen.getByText('Không có sự kiện nào khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('lọc theo khoảng ngày cũng tính là đang lọc', () => {
    nav.params = new URLSearchParams('dateFrom=2026-01-01');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có sự kiện nào khớp bộ lọc')).toBeTruthy();
  });
});

describe('admin/audit — filter và URL', () => {
  it('mặc định ba bộ lọc là "all" và được truyền xuống lớp dữ liệu, KHÔNG kèm `open`', () => {
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    const filters = query.lastFilters as Record<string, unknown>;
    expect(filters.actorScope).toBe('all');
    expect(filters.action).toBe('all');
    expect(filters.targetType).toBe('all');
    expect('open' in filters).toBe(false);
  });

  it('đọc đủ tham số từ URL, kể cả các tham số sâu (targetId/tenantId/actorUserId)', () => {
    nav.params = new URLSearchParams(
      'actorScope=platform&action=tenant.lock&targetType=tenant&targetId=T-001&tenantId=X&actorUserId=U&dateFrom=2026-01-01&dateTo=2026-01-31&page=2',
    );
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      actorScope: 'platform',
      category: 'all',
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

describe('admin/audit — dải ngữ cảnh khi đến từ một đối tượng', () => {
  it('không có tham số sâu thì không có dải', () => {
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    expect(screen.queryByText('Đang xem lịch sử của')).toBeNull();
  });

  it('targetType + targetId: nêu loại đối tượng bằng nhãn, mã, gian hàng và số dòng', () => {
    nav.params = new URLSearchParams(
      'targetType=tenant_subscription&targetId=01M4CX5DY5HJ4RGRVXR3APM5GC',
    );
    setQuery({
      data: {
        items: [
          log({
            action: 'subscription.assign',
            targetType: 'tenant_subscription',
            targetId: '01M4CX5DY5HJ4RGRVXR3APM5GC',
            tenantName: 'HOANG DUC DAI HANH',
            targetLabel: 'Gói nâng cao',
          }),
        ],
        meta: { ...META, total: 3 },
      },
    });
    renderPage();

    expect(screen.getByText('Đang xem lịch sử của')).toBeTruthy();
    // Nhãn loại đối tượng — không còn mã `tenant_subscription` thô.
    expect(screen.getAllByText('Gói dịch vụ').length).toBeGreaterThan(0);
    // Tên đối tượng do server tra, không phải ULID.
    expect(screen.getAllByText('Gói nâng cao').length).toBeGreaterThan(0);
    expect(screen.getByText('Gian hàng HOANG DUC DAI HANH', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('3 sự kiện', { exact: false }).length).toBeGreaterThan(0);
  });

  it('"Xem toàn bộ nhật ký" bỏ tham số sâu và đóng panel đang mở', () => {
    nav.params = new URLSearchParams('targetType=tenant&targetId=T-001&open=l-9&action=tenant.lock');
    setQuery({ data: { items: [log()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem toàn bộ nhật ký' }));

    const url = lastUrl();
    expect(url).not.toContain('targetId=');
    expect(url).not.toContain('targetType=');
    expect(url).not.toContain('open=');
    // Bộ lọc thường thì giữ — người dùng chỉ rời đối tượng, không xoá cách họ đang lọc.
    expect(url).toContain('action=tenant.lock');
  });
});

describe('admin/audit — dữ liệu và hành động', () => {
  it('hiện người thực hiện, email, nhãn hành động — KHÔNG in mã hành động thô lên bảng', () => {
    setQuery({ data: { items: [log({ targetLabel: 'Gian hàng Demo' })], meta: META } });
    renderPage();

    expect(screen.getByText('Quản trị viên')).toBeTruthy();
    expect(screen.getByText('admin@xeprime.test')).toBeTruthy();
    expect(screen.getByText('Khoá gian hàng')).toBeTruthy();
    // Mã kỹ thuật nằm ở "Thông tin kỹ thuật" của panel chi tiết, không ở bảng.
    expect(screen.queryByText('tenant.lock')).toBeNull();
  });

  it('đối tượng không tra được tên rơi về mã rút gọn, không bao giờ ô trống', () => {
    setQuery({
      data: {
        items: [log({ targetType: 'tenant_customer', targetId: '01M4CX5DY5HJ4RGRVXR3APM5GC' })],
        meta: META,
      },
    });
    renderPage();

    expect(screen.getByText('…R3APM5GC', { exact: false })).toBeTruthy();
  });

  it('thao tác trong phiên hỗ trợ được gắn nhãn', () => {
    setQuery({ data: { items: [log({ viaSupport: true })], meta: META } });
    renderPage();

    expect(screen.getByText('Qua phiên hỗ trợ')).toBeTruthy();
  });

  it('hành động của luồng gói có nhãn người đọc', () => {
    setQuery({
      data: {
        items: [log({ action: 'subscription.renew', targetType: 'tenant_subscription' })],
        meta: META,
      },
    });
    renderPage();

    expect(screen.getByText('Gia hạn gói dịch vụ')).toBeTruthy();
    // "Loại: tên" — không có tên tra được thì là mã rút gọn của đối tượng.
    expect(screen.getByText('Gói dịch vụ: T-001')).toBeTruthy();
  });

  it('thiếu người thao tác thì hiện gạch ngang; phạm vi hệ thống thì ghi "Hệ thống"', () => {
    setQuery({
      data: {
        items: [
          log({ id: 'a', actorName: null, actorEmail: null }),
          log({ id: 'b', actorName: null, actorEmail: null, actorScope: 'system' }),
        ],
        meta: META,
      },
    });
    renderPage();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hệ thống').length).toBeGreaterThan(0);
  });

  it('phạm vi hiển thị bằng StatusTag, không phải chữ thô', () => {
    setQuery({ data: { items: [log({ actorScope: 'platform' })], meta: META } });
    const { container } = renderPage();

    expect(container.querySelector('.ant-tag')).toBeTruthy();
  });

  it('"Xem chi tiết" ghi dòng vào URL (`open=`) và giữ nguyên trang', () => {
    nav.params = new URLSearchParams('page=3');
    setQuery({ data: { items: [log({ id: 'l-42' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));

    expect(lastUrl()).toContain('open=l-42');
    expect(lastUrl()).toContain('page=3');
  });

  it('`?open=` trên URL mở panel đúng dòng — link từ tab Nhật ký của đối tác rơi thẳng vào sự kiện', () => {
    nav.params = new URLSearchParams('open=l-42');
    setQuery({ data: { items: [log({ id: 'l-42' })], meta: META } });
    renderPage();

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

  it('tổng hiển thị theo đơn vị "sự kiện"', () => {
    setQuery({ data: { items: [log()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('245 sự kiện')).toBeTruthy();
  });

  it('đọc ô tìm kiếm và nhóm hành động từ URL; nhóm lạ rơi về "tất cả"', () => {
    nav.params = new URLSearchParams('q=hoang&category=subscription');
    setQuery({ data: { items: [log()], meta: META } });
    const first = renderPage();
    const filters = query.lastFilters as Record<string, unknown>;
    expect(filters.q).toBe('hoang');
    expect(filters.category).toBe('subscription');
    first.unmount();

    nav.params = new URLSearchParams('category=khong-co');
    renderPage();
    expect((query.lastFilters as Record<string, unknown>).category).toBe('all');
  });

  it('"Xoá bộ lọc" xoá cả ô tìm kiếm và nhóm hành động', () => {
    nav.params = new URLSearchParams('q=hoang&category=subscription');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(lastUrl()).not.toContain('q=');
    expect(lastUrl()).not.toContain('category=');
  });
});
