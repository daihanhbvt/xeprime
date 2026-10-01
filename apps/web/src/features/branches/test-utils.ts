import type { BranchFilterState } from './hooks/use-branch-filter';

/**
 * Bản thay thế của `use-branch-filter` cho test TRANG.
 *
 * Các bộ test trang (danh sách xe, bảo dưỡng, đơn thuê, lịch) cố ý chặn mọi hook đọc server ở
 * tầng hook và render component KHÔNG kèm `QueryClientProvider` — chúng kiểm bố cục, bộ lọc trên
 * URL và phân quyền, không kiểm cách hook gọi API. `useBranchFilter` đọc `/branches` + `/auth/me`
 * nên phải được chặn cùng kiểu, nếu không mọi bộ đó đổ vì "No QueryClient set".
 *
 * Mặc định là gian hàng MỘT chi nhánh (`visible: false`, `field: null`): đó là hình dạng mà các
 * bộ test này đang mô tả, và nó giữ cho ô "Chi nhánh" không chen vào số lượng ô lọc mà chúng đếm.
 *
 * Hành vi thật của ô lọc — dựng lựa chọn, ghi nhớ, điền lại khi mở màn khác — có bộ test riêng ở
 * `hooks/use-branch-filter.test.tsx`; nhân bản nó vào sáu bộ test trang chỉ tạo sáu chỗ để nó
 * trôi khỏi bản thật.
 *
 * Dùng: `vi.mock('@/features/branches/hooks/use-branch-filter', () => import('@/features/branches/test-utils'));`
 */
export function useBranchFilter(): BranchFilterState {
  return {
    field: null,
    options: [],
    visible: false,
  locked: false,
    isLoading: false,
    select: () => {},
  };
}
