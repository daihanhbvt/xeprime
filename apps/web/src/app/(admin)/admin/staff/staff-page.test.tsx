import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Staff } from '@/features/admin-staff/types';

import AdminStaffPage from './page';

/**
 * Test ĐẶC TẢ cho `/manage/admin/staff` — rủi ro CAO (quyền nền tảng).
 *
 * Bất biến: **không ai tự thao tác lên dòng của chính mình**. Việc chặn hạ cấp Super Admin cuối
 * cùng nằm ở backend (trong transaction) — giao diện KHÔNG được giả vờ thay thế nó.
 */

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/admin-staff/hooks/use-staff', () => ({
  useStaff: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

const updateRole = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const removeStaff = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));

vi.mock('@/features/admin-staff/hooks/use-staff-mutations', () => ({
  useUpdateStaffRole: () => updateRole,
  useRemoveStaff: () => removeStaff,
}));

vi.mock('@/features/admin-staff/components/AddStaffModal', () => ({
  AddStaffModal: ({ open }: { open: boolean }) => (open ? <div data-testid="add-staff" /> : null),
}));

const me = vi.hoisted(() => ({ id: 'me-1' }));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: me, isLoading: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function staff(over: Partial<Staff> = {}): Staff {
  return {
    userId: 'u1',
    displayName: 'Nhân sự A',
    email: 'a@xeprime.test',
    avatarUrl: null,
    roleKey: 'platform_staff',
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as Staff;
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function renderWith(items: Staff[]) {
  setQuery({ data: { items, meta: META } });
  return render(
    <App>
      <AdminStaffPage />
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
  updateRole.mutate.mockReset();
  removeStaff.mutate.mockReset();
  setQuery();
});

afterEach(cleanup);

describe('/manage/admin/staff', () => {
  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    setQuery({ isError: true });
    render(
      <App>
        <AdminStaffPage />
      </App>,
    );

    expect(screen.getByText('Không tải được danh sách nhân sự')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('rỗng: câu chữ riêng và luôn mở lối thêm (trang chỉ platform admin vào được)', () => {
    renderWith([]);

    expect(screen.getByText('Chưa có nhân sự nào')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Thêm nhân sự/ })[0]!);
    expect(screen.getByTestId('add-staff')).toBeTruthy();
  });

  it('hiện tên và email', () => {
    renderWith([staff()]);

    expect(screen.getByText('Nhân sự A')).toBeTruthy();
    expect(screen.getByText('a@xeprime.test')).toBeTruthy();
  });

  it('đánh dấu "(bạn)" ở dòng của chính mình', () => {
    renderWith([staff({ userId: 'me-1' })]);

    expect(screen.getByText(/\(bạn\)/)).toBeTruthy();
  });

  it('người khác thì đổi được vai trò', () => {
    renderWith([staff()]);

    expect(within(bodyRows()[0]!).getByRole('combobox')).toBeTruthy();
  });

  it('KHÔNG tự đổi vai trò của chính mình', () => {
    renderWith([staff({ userId: 'me-1' })]);

    expect(within(bodyRows()[0]!).queryByRole('combobox')).toBeNull();
  });

  it('KHÔNG tự gỡ chính mình', () => {
    renderWith([staff({ userId: 'me-1' })]);

    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('gỡ nhân sự khác phải xác nhận rồi mới gọi mutation đúng userId', async () => {
    renderWith([staff({ userId: 'u-42' })]);

    fireEvent.click(within(bodyRows()[0]!).getAllByRole('button')[0]!);
    expect(removeStaff.mutate).not.toHaveBeenCalled();

    expect(await screen.findByText('Gỡ nhân sự này khỏi nền tảng?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }));

    await waitFor(() => expect(removeStaff.mutate).toHaveBeenCalledTimes(1));
    expect(removeStaff.mutate.mock.calls[0]![0]).toBe('u-42');
  });

  it('trạng thái hiển thị bằng StatusTag', () => {
    const { container } = renderWith([staff()]);

    expect(container.querySelector('.ant-tag')).toBeTruthy();
  });

  it('đổi trang gọi lại lớp dữ liệu với page mới', () => {
    setQuery({
      data: { items: [staff()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    render(
      <App>
        <AdminStaffPage />
      </App>,
    );

    fireEvent.click(screen.getByTitle('2'));
    expect((query.lastFilters as { page?: number }).page).toBe(2);
  });

  it('tổng hiển thị theo đơn vị "nhân sự"', () => {
    setQuery({ data: { items: [staff()], meta: { ...META, total: 245 } } });
    render(
      <App>
        <AdminStaffPage />
      </App>,
    );

    expect(screen.getByText('245 nhân sự')).toBeTruthy();
  });
});
