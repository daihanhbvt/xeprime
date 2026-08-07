import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Plan } from '@/features/admin-plans/types';

import AdminPlansPage from './page';

/**
 * Test ĐẶC TẢ cho `/manage/admin/plans` — viết TRƯỚC khi migrate.
 *
 * Trang này là ngoại lệ hữu ích: **không phân trang** (API trả cả danh sách), và bộ lọc là
 * **state cục bộ**, không nằm trên URL. Nó chứng minh `DataTable` phục vụ được cả bảng không
 * phân trang mà không phải bịa `meta` giả.
 */

const query = vi.hoisted(() => ({
  data: undefined as Plan[] | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastStatus: undefined as unknown,
}));

vi.mock('@/features/admin-plans/hooks/use-plans', () => ({
  usePlans: (status: unknown) => {
    query.lastStatus = status;
    return query;
  },
}));

const archive = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as string | undefined,
}));

vi.mock('@/features/admin-plans/hooks/use-plan-mutations', () => ({
  useArchivePlan: () => archive,
}));

const modal = vi.hoisted(() => ({ open: false, plan: null as Plan | null }));

vi.mock('@/features/admin-plans/components/PlanFormModal', () => ({
  PlanFormModal: ({ open, plan }: { open: boolean; plan: Plan | null }) => {
    modal.open = open;
    modal.plan = plan;
    return open ? <div data-testid="plan-form">{plan ? plan.id : 'new'}</div> : null;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    code: 'BASIC',
    name: 'Gói cơ bản',
    description: 'Cho shop nhỏ',
    price: '500000',
    durationDays: 30,
    maxVehicles: 10,
    subscriptionCount: 3,
    status: 'active',
    sortOrder: 1,
    ...over,
  } as Plan;
}

/** Nhãn của bộ lọc Segmented trùng chữ với nút hành động trong hàng — luôn nhắm đúng bộ lọc. */
function clickStatusFilter(container: HTMLElement, label: string) {
  const segmented = container.querySelector('.ant-segmented') as HTMLElement;
  fireEvent.click(within(segmented).getByText(label));
}

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function renderPage() {
  return render(
    <App>
      <AdminPlansPage />
    </App>,
  );
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

beforeEach(() => {
  query.refetch.mockReset();
  archive.mutate.mockReset();
  archive.isPending = false;
  modal.open = false;
  modal.plan = null;
  setQuery();
});

afterEach(cleanup);

describe('/manage/admin/plans — nạp dữ liệu', () => {
  it('luôn lấy TẤT CẢ gói từ API; lọc là việc phía client', () => {
    setQuery({ data: [plan()] });
    renderPage();

    expect(query.lastStatus).toBe('all');
  });

  it('đang tải lần đầu: hiện trạng thái chờ, KHÔNG hiện câu "chưa có gói"', () => {
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.queryByText('Chưa có gói nào')).toBeNull();
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách gói')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setQuery({ isError: true, data: [plan()] });
    renderPage();

    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.queryByText('Không tải được danh sách gói')).toBeNull();
  });
});

describe('/manage/admin/plans — bảng không phân trang', () => {
  it('KHÔNG dựng thanh phân trang — API trả cả danh sách', () => {
    const { container } = renderPageWith([plan(), plan({ id: 'p2', name: 'Gói pro' })]);

    expect(container.querySelector('.ant-pagination')).toBeNull();
  });

  it('hiện tên, mã và mô tả gói', () => {
    renderPageWith([plan()]);

    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.getByText('BASIC · Cho shop nhỏ')).toBeTruthy();
  });

  it('giá hiển thị qua formatMoneyVnd', () => {
    renderPageWith([plan({ price: '500000' })]);

    expect(screen.getByText('500.000 ₫')).toBeTruthy();
  });

  it('giới hạn xe rỗng nghĩa là không giới hạn', () => {
    renderPageWith([plan({ maxVehicles: null })]);

    expect(screen.getByText('Không giới hạn')).toBeTruthy();
  });

  it('trạng thái hiển thị bằng StatusTag', () => {
    const { container } = renderPageWith([plan()]);

    expect(container.querySelector('.ant-tag')).toBeTruthy();
  });
});

describe('/manage/admin/plans — lọc theo trạng thái (state cục bộ)', () => {
  it('mặc định hiện hết', () => {
    renderPageWith([plan({ id: 'a', status: 'active' }), plan({ id: 'b', status: 'archived' })]);

    expect(bodyRows()).toHaveLength(2);
  });

  it('chọn "Đang bán" chỉ giữ gói active', () => {
    const { container } = renderPageWith([
      plan({ id: 'a', name: 'Gói A', status: 'active' }),
      plan({ id: 'b', name: 'Gói B', status: 'archived' }),
    ]);

    clickStatusFilter(container, 'Đang bán');

    expect(screen.getByText('Gói A')).toBeTruthy();
    expect(screen.queryByText('Gói B')).toBeNull();
  });

  it('lọc ra rỗng thì đổi câu chữ', () => {
    const { container } = renderPageWith([plan({ status: 'active' })]);

    clickStatusFilter(container, 'Ngừng bán');

    expect(screen.getByText('Không có gói ở trạng thái này')).toBeTruthy();
  });

  it('HIỆN TRẠNG: lọc KHÔNG ghi vào URL — là state cục bộ', () => {
    // Khác mọi danh sách khác (ADR 0004). Giữ nguyên: đổi sang URL là thay đổi hành vi,
    // không thuộc phạm vi wave giao diện.
    renderPageWith([plan()]);

    expect(window.location.search).toBe('');
  });
});

describe('/manage/admin/plans — hành động', () => {
  it('rỗng: mở lối tạo gói đầu tiên', () => {
    setQuery({ data: [] });
    renderPage();

    expect(screen.getByText('Chưa có gói nào')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Tạo gói/ })[0]!);
    expect(screen.getByTestId('plan-form').textContent).toBe('new');
  });

  it('"Tạo gói" ở đầu trang mở form rỗng', () => {
    renderPageWith([plan()]);

    fireEvent.click(screen.getByRole('button', { name: /Tạo gói/ }));
    expect(screen.getByTestId('plan-form').textContent).toBe('new');
  });

  it('"Sửa" mở form với đúng gói', () => {
    renderPageWith([plan({ id: 'p-42' })]);

    fireEvent.click(screen.getByRole('button', { name: /Sửa/ }));
    expect(screen.getByTestId('plan-form').textContent).toBe('p-42');
  });

  it('"Ngừng bán" chỉ có ở gói đang bán', () => {
    renderPageWith([plan({ status: 'archived' })]);

    expect(screen.queryByRole('button', { name: /Ngừng bán/ })).toBeNull();
  });

  it('"Ngừng bán" phải xác nhận, kèm câu cảnh báo về thuê bao đã gán', async () => {
    renderPageWith([plan({ id: 'p-7', status: 'active' })]);

    fireEvent.click(screen.getByRole('button', { name: /Ngừng bán/ }));
    expect(archive.mutate).not.toHaveBeenCalled();

    expect(
      await screen.findByText('Ngừng bán gói này? Thuê bao đã gán giữ nguyên hiệu lực.'),
    ).toBeTruthy();

    const confirms = screen.getAllByRole('button', { name: 'Ngừng bán' });
    fireEvent.click(confirms[confirms.length - 1]!);

    await waitFor(() => expect(archive.mutate).toHaveBeenCalledTimes(1));
    expect(archive.mutate.mock.calls[0]![0]).toBe('p-7');
  });
});

function renderPageWith(plans: Plan[]) {
  setQuery({ data: plans });
  return renderPage();
}
