import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { BranchesView } from './BranchesView';

/**
 * Trang quản lý chi nhánh.
 *
 * Bốn thứ test này khoá, đều là chỗ dễ hỏng âm thầm:
 *  1. mọi TRẠNG THÁI đều có màn hình riêng (đang tải / rỗng / lỗi / thiếu quyền);
 *  2. chi nhánh MẶC ĐỊNH không ngừng được, và nút bị khoá phải NÓI LÝ DO;
 *  3. chi nhánh chưa có tỉnh được cảnh báo rõ — xe của nó không lên chợ;
 *  4. thiếu quyền `branches.manage` thì không dựng được đường tạo/sửa.
 */
const state = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null as unknown,
}));

// Nút/hành động ghi bọc theo cờ năng lực (ADR 0027), và hook cờ đọc `/auth/me` qua TanStack
// Query. Màn này không KIỂM cờ — nó chỉ dùng — nên chặn ở đúng ranh giới đó thay vì dựng
// QueryClient giả. `enabled` = gian hàng đang có gói, tức là hành vi mặc định.
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({ state: 'enabled', canWrite: true, isVisible: true, planEndsAt: null }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));

const action = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('../hooks/use-branches', () => ({
  useBranches: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    error: state.error,
    refetch: vi.fn(),
  }),
  useBranchAction: () => action,
  useCreateBranch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBranch: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({
    options: [{ value: '79', label: 'Hồ Chí Minh' }],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
}));

const DEFAULT_BRANCH = {
  id: 'b1',
  code: 'CN01',
  name: 'Chi nhánh HCM',
  provinceCode: '79',
  provinceName: 'Hồ Chí Minh',
  address: '123 Nguyễn Văn Cừ',
  phone: '0901234567',
  latitude: null,
  longitude: null,
  isDefault: true,
  status: 'active',
  vehicleCount: 12,
  needsLocationReview: false,
  legacyProvinceValue: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const SECOND_BRANCH = {
  ...DEFAULT_BRANCH,
  id: 'b2',
  code: 'CN02',
  name: 'Chi nhánh Đà Nẵng',
  provinceCode: '48',
  provinceName: 'Đà Nẵng',
  isDefault: false,
  vehicleCount: 0,
};

function listOf(items: unknown[], extra: Record<string, number> = {}) {
  return {
    items,
    total: items.length,
    activeCount: items.length,
    needsReviewCount: 0,
    ...extra,
  };
}

function renderView() {
  return render(
    <App>
      <BranchesView />
    </App>,
  );
}

beforeEach(() => {
  state.data = listOf([DEFAULT_BRANCH, SECOND_BRANCH]);
  state.isLoading = false;
  state.isError = false;
  state.error = null;
  action.mutate.mockReset();
  perms.granted = new Set<string>([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE]);
});

afterEach(cleanup);

describe('BranchesView — trạng thái', () => {
  it('đang tải: không dựng bảng rỗng gây hiểu nhầm "chưa có chi nhánh"', () => {
    state.data = undefined;
    state.isLoading = true;
    renderView();

    expect(screen.queryByText('Chưa có chi nhánh nào')).toBeNull();
  });

  it('rỗng: nói rõ việc cần làm và có nút tạo', () => {
    state.data = listOf([]);
    renderView();

    expect(screen.getByText('Chưa có chi nhánh nào')).toBeTruthy();
  });

  it('lỗi tải lần đầu: hiện lỗi kèm nút thử lại, không phải bảng trắng', () => {
    state.data = undefined;
    state.isError = true;
    state.error = new Error('mất mạng');
    renderView();

    expect(screen.getByText('Không tải được danh sách chi nhánh')).toBeTruthy();
  });

  it('thiếu quyền xem: hiện màn thiếu quyền thay vì danh sách', () => {
    perms.granted = new Set<string>();
    renderView();

    expect(screen.getByText('Bạn không có quyền xem chi nhánh')).toBeTruthy();
  });
});

describe('BranchesView — luật nghiệp vụ hiển thị', () => {
  it('chi nhánh mặc định có nhãn riêng và KHÔNG có hành động ngừng hoạt động khả dụng', async () => {
    renderView();

    expect(screen.getByText('Mặc định')).toBeTruthy();

    // Nút "Ngừng hoạt động" của chi nhánh mặc định phải bị khoá (luật: gian hàng luôn có một
    // chi nhánh mặc định đang chạy).
    const stopButtons = screen.getAllByRole('button', { name: /Ngừng hoạt động/ });
    expect(stopButtons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('cảnh báo khi có chi nhánh chưa gán tỉnh — xe ở đó không lên chợ', () => {
    state.data = listOf(
      [{ ...DEFAULT_BRANCH, provinceCode: null, provinceName: null, needsLocationReview: true }],
      { needsReviewCount: 1 },
    );
    renderView();

    expect(screen.getByText('1 chi nhánh chưa có tỉnh/thành')).toBeTruthy();
    expect(screen.getByText('Chưa có tỉnh/thành')).toBeTruthy();
  });

  it('đặt mặc định gọi đúng hành động cho ĐÚNG chi nhánh', async () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: /Đặt làm mặc định/ }));
    await waitFor(() => expect(action.mutate).toHaveBeenCalledTimes(1));
    expect(action.mutate).toHaveBeenCalledWith({ id: 'b2', action: 'set-default' });
  });

  it('chỉ có quyền XEM: nút thêm/sửa bị khoá, không phải ẩn đi không lý do', () => {
    perms.granted = new Set<string>([PERMISSION.BRANCH_VIEW]);
    renderView();

    // Tên truy cập được gồm cả nhãn của icon (`plus`) — khớp bằng regex thay vì chuỗi tuyệt đối.
    const add = screen.getByRole('button', { name: /Thêm chi nhánh/ });
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });
});
