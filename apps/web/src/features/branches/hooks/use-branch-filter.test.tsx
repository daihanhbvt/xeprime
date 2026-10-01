import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';

/**
 * Ô lọc chi nhánh theo từng màn — ADR 0052.
 *
 * Bốn điều bài test này khoá, và điều gì hỏng nếu mất chúng:
 *
 *  1. **URL thắng giá trị đã nhớ.** Không thì một link "lịch chi nhánh Ninh Kiều" gửi cho đồng
 *     nghiệp sẽ mở ra chi nhánh mà NGƯỜI NHẬN chọn lần trước — đúng thứ bộ lọc trên URL sinh ra
 *     để tránh.
 *  2. **"Tất cả chi nhánh" là một lựa chọn được ghi nhớ**, không phải "chưa chọn gì". Không thì
 *     người vừa cố ý bấm "Tất cả" bị điền lại chi nhánh cũ ở màn kế tiếp, và ô lọc thành ra
 *     không tắt được.
 *  3. **Chi nhánh đã nhớ mà không còn hợp lệ thì bỏ qua** (vừa ngừng hoạt động, hoặc thuộc gian
 *     hàng khác). Không thì người dùng mở màn ra và nhận một bảng rỗng không lời giải thích.
 *  4. **Gian hàng một chi nhánh không dựng ô nào.** Một dropdown có đúng một mục chọn được là
 *     điều khiển chết; và đó là hình dạng của khu Owner Lite, nơi các màn này dùng lại nguyên.
 *
 * Mock ở tầng `useBranches`/`useCurrentUser`/`usePermissions` — bài test nói về LUẬT của ô lọc,
 * không về cách hook gọi API.
 */

/*
 * `vi.hoisted` chạy TRƯỚC mọi import, nên `PERMISSION` chưa tồn tại ở đây — bộ quyền được nạp ở
 * `beforeEach`, nơi hằng đã sẵn sàng. Viết thẳng `'branch.view'` vào đây là đúng thứ ADR 0005
 * cấm: một lần đổi khoá quyền sẽ để lại một bài test xanh mà không còn kiểm gì.
 */
const state = vi.hoisted(() => ({
  branches: [] as { id: string; name: string; provinceName: string | null; isDefault: boolean }[],
  isLoading: false,
  isError: false,
  tenantId: 'T1' as string | null,
  permissions: new Set<string>(),
}));

vi.mock('./use-branches', () => ({
  useBranches: () => ({
    data: { items: state.branches },
    isLoading: state.isLoading,
    isError: state.isError,
  }),
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: state.tenantId ? { tenant: { id: state.tenantId } } : undefined }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: (p: string) => state.permissions.has(p) }),
}));
vi.mock('next-intl', () => ({
  // Trả về chính KHOÁ: bài test kiểm luật, không kiểm bản dịch (parity vi↔en đã có `i18n:check`).
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
}));

import { useBranchFilter, type BranchFilterState } from './use-branch-filter';

const HCM = { id: 'B1', name: 'Quận 5', provinceName: 'Hồ Chí Minh', isDefault: true };
const CAN_THO = { id: 'B2', name: 'Ninh Kiều', provinceName: 'Cần Thơ', isDefault: false };

const onChange = vi.fn();

/** `result.current` là bản mới nhất sau mỗi lượt render — không tự bắt bằng biến ngoài. */
function mount(value?: string): { current: BranchFilterState } {
  return renderHook(({ v }: { v?: string }) => useBranchFilter({ value: v, onChange }), {
    initialProps: { v: value },
  }).result;
}

beforeEach(() => {
  state.branches = [HCM, CAN_THO];
  state.isLoading = false;
  state.isError = false;
  state.tenantId = 'T1';
  state.permissions = new Set<string>([PERMISSION.BRANCH_VIEW]);
  onChange.mockReset();
});

afterEach(cleanup);

describe('useBranchFilter — dựng ô chọn', () => {
  it('gian hàng nhiều chi nhánh: dựng field kèm mục "Tất cả" đứng đầu', () => {
    const r = mount();

    expect(r.current.visible).toBe(true);
    expect(r.current.field?.kind).toBe('select');
    const options = r.current.field?.kind === 'select' ? r.current.field.options : [];
    expect(options.map((o) => o.value)).toEqual(['all', 'B1', 'B2']);
  });

  it('gian hàng MỘT chi nhánh: không dựng ô nào — dropdown một mục là điều khiển chết', () => {
    state.branches = [HCM];
    const r = mount();

    expect(r.current.visible).toBe(false);
    expect(r.current.field).toBeNull();
  });

  it('thiếu branches.view: không dựng ô', () => {
    state.permissions = new Set<string>();
    const r = mount();

    expect(r.current.field).toBeNull();
  });

  it('không thuộc gian hàng nào (nhân sự nền tảng): không dựng ô', () => {
    state.tenantId = null;
    const r = mount();

    expect(r.current.field).toBeNull();
  });

  it('gọi /branches hỏng: coi như không có chi nhánh nào, màn hình vẫn dùng được', () => {
    state.isError = true;
    const r = mount();

    expect(r.current.field).toBeNull();
    expect(r.current.options).toEqual([]);
  });
});

/**
 * URL là nguồn sự thật DUY NHẤT (ADR 0052, phương án B).
 *
 * Không còn bản ghi nhớ nào ở client: tiện lợi "không phải chọn lại ở từng màn" do LINK điều
 * hướng mang theo (`branch-link.ts`), nên đường dẫn đích đã đúng ngay từ request đầu và không có
 * lượt hỏi "tất cả chi nhánh" thừa nào để nhấp nháy.
 */
describe('useBranchFilter — chỉ đọc URL, không có bộ nhớ nào ở client', () => {
  it('URL trống: KHÔNG tự điền gì', async () => {
    const r = mount();

    await waitFor(() => expect(r.current.visible).toBe(true));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('URL có chi nhánh HỢP LỆ: để yên', async () => {
    const r = mount('B2');

    await waitFor(() => expect(r.current.visible).toBe(true));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('select: đẩy thẳng lên URL', () => {
    const r = mount();
    r.current.select('B2');

    expect(onChange).toHaveBeenCalledWith('B2');
  });

  it('select("all"): xoá tham số khỏi URL', () => {
    const r = mount();
    r.current.select('all');

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

/**
 * Tự NHẢ một `branchId` không dùng được — về "Tất cả chi nhánh".
 *
 * Bốn đường đều có thật, và điểm chung là: không nhả thì người dùng nhìn một bảng rỗng mà không
 * có cách nào biết vì sao, cũng không có cách nào mở rộng lại.
 */
describe('useBranchFilter — branchId không dùng được thì tự về Tất cả', () => {
  it('người dùng sửa tay URL thành id rác', async () => {
    mount('KHONG_TON_TAI');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });

  it('chi nhánh vừa bị ngừng hoạt động (không còn trong danh sách active)', async () => {
    mount('B_DA_NGUNG');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });

  it('thiếu branches.view nhưng link vẫn mang branchId', async () => {
    state.permissions = new Set<string>();
    mount('B2');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });

  it('gian hàng một chi nhánh + link mang branchId: ô không hiện thì bộ lọc cũng không được áp', async () => {
    state.branches = [HCM];
    mount('B1');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });

  /**
   * Ca này là lý do effect phải chờ `isLoading`: lúc đang tải, danh sách chi nhánh còn rỗng nên
   * MỌI giá trị đều trông như không hợp lệ. Nhả ở đó là xoá đúng lựa chọn trong link người dùng
   * vừa mở, ngay trước khi dữ liệu kịp chứng minh nó hợp lệ.
   */
  it('đang tải danh sách chi nhánh: KHÔNG nhả gì, dù chưa chứng minh được là hợp lệ', async () => {
    state.isLoading = true;
    const r = mount('B2');

    await waitFor(() => expect(r.current.isLoading).toBe(true));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('màn chỉ-đọc (không truyền onChange): không tự đổi URL của màn đó', async () => {
    const { result } = renderHook(() => useBranchFilter({ value: 'KHONG_TON_TAI' }));

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(onChange).not.toHaveBeenCalled();
  });
});
