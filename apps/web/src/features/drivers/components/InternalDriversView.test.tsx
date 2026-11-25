import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestProvider } from '@/i18n/test-utils';
import { InternalDriversView } from './InternalDriversView';

/**
 * Danh bạ tài xế nội bộ (ADR 0108): danh sách phân trang ở server, thêm / sửa / lưu trữ / khôi phục,
 * không có quyền quản lý thì chỉ xem.
 */

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  manage: true,
  params: new URLSearchParams(),
}));
const calls = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: calls.replace, replace: calls.replace }),
  usePathname: () => '/manage/drivers',
  useSearchParams: () => state.params,
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => (p === 'drivers.manage' ? state.manage : true),
  }),
}));
vi.mock('../hooks/use-internal-drivers', () => ({
  useInternalDrivers: () => ({
    data: {
      items: state.items,
      meta: { page: 1, limit: 20, total: state.items.length, hasNext: false },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateInternalDriver: () => ({ mutate: calls.create, isPending: false }),
  useUpdateInternalDriver: () => ({ mutate: calls.update, isPending: false }),
  useArchiveInternalDriver: () => ({
    mutate: calls.archive,
    isPending: false,
    variables: undefined,
  }),
  useRestoreInternalDriver: () => ({
    mutate: calls.restore,
    isPending: false,
    variables: undefined,
  }),
}));

const PERSON = {
  id: 'int-1',
  name: 'Lê Văn Lái',
  phone: '0912000111',
  note: 'Lái Innova',
  archivedAt: null,
  activeTripCount: 2,
  createdAt: '2026-11-25T01:00:00.000Z',
};

function renderView() {
  return render(
    <IntlTestProvider>
      <App>
        <InternalDriversView viewSwitch={<div data-testid="switch" />} />
      </App>
    </IntlTestProvider>,
  );
}

beforeEach(() => {
  state.items = [PERSON];
  state.manage = true;
  state.params = new URLSearchParams();
  Object.values(calls).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

describe('InternalDriversView', () => {
  it('liệt kê tên, ghi chú, SĐT gọi được và số chuyến chưa xong', () => {
    renderView();
    expect(screen.getByText('Lê Văn Lái')).toBeTruthy();
    expect(screen.getByText('Lái Innova')).toBeTruthy();
    expect(screen.getByRole('link', { name: '0912000111' }).getAttribute('href')).toContain('tel:');
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByTestId('switch')).toBeTruthy();
  });

  it('thêm tài xế: chuẩn hoá SĐT +84, ghi chú trống ⇒ null', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài xế nội bộ/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Nhập tên tài xế'), {
      target: { value: '  Trần Mới  ' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('Số di động khách gọi để gặp tài xế'), {
      target: { value: '+84912000999' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
    expect(calls.create.mock.calls[0]![0]).toEqual({
      name: 'Trần Mới',
      phone: '+84912000999',
      note: null,
    });
  });

  it('SĐT bàn không nhận', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài xế nội bộ/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Nhập tên tài xế'), {
      target: { value: 'Trần Mới' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('Số di động khách gọi để gặp tài xế'), {
      target: { value: '02838123456' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('lưu trữ hỏi lại và nói rõ các chuyến đang gán giữ nguyên', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Lưu trữ/ }));
    expect(await screen.findByText('Lưu trữ tài xế Lê Văn Lái?')).toBeTruthy();
    expect(screen.getByText(/đang gán 2 chuyến chưa xong/)).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: /Lưu trữ/ }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.archive).toHaveBeenCalledTimes(1));
    expect(calls.archive.mock.calls[0]![0]).toBe('int-1');
  });

  it('danh sách đã lưu trữ: chỉ có nút khôi phục', () => {
    state.items = [{ ...PERSON, archivedAt: '2026-11-26T01:00:00.000Z' }];
    state.params = new URLSearchParams('view=internal&archived=true');
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Khôi phục/ }));
    expect(calls.restore.mock.calls[0]![0]).toBe('int-1');
    expect(screen.queryByRole('button', { name: /Lưu trữ/ })).toBeNull();
  });

  it('không có quyền quản lý: chỉ xem, không có nút thêm/sửa/lưu trữ', () => {
    state.manage = false;
    renderView();
    expect(screen.queryByRole('button', { name: /Thêm tài xế nội bộ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu trữ/ })).toBeNull();
  });

  it('danh bạ trống: lời mời thêm tài xế đầu tiên', () => {
    state.items = [];
    renderView();
    expect(screen.getByText('Chưa có tài xế nội bộ')).toBeTruthy();
  });
});
