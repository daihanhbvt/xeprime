import { useEffect } from 'react';

/** Trang đầu tiên. Mọi lần đổi bộ lọc/tìm kiếm đều quay về đây. */
export const FIRST_PAGE = 1;

/**
 * Kéo trang hiện tại về trang CUỐI CÙNG còn tồn tại khi danh sách vừa ngắn đi.
 *
 * Số trang là state của MÀN còn tổng bản ghi là của SERVER, nên hai thứ rời nhau ngay khi danh
 * sách đổi dưới chân người dùng: duyệt bản ghi cuối của trang 2 khi tổng còn 18 và `limit` là 20
 * ⇒ trang 2 biến mất, server trả mảng rỗng và màn hiện "không có yêu cầu nào".
 *
 * KHÔNG đơn giản là "về trang 1 sau mỗi mutation": làm vậy ném người dùng ra khỏi chỗ đang đứng
 * kể cả khi trang đó còn nguyên. Ở đây chỉ động vào khi trang thật sự vượt quá số trang còn lại.
 */
export function useClampedPage(
  meta: { page: number; limit: number; total: number } | undefined,
  setPage: (next: number) => void,
): void {
  const lastPage = meta
    ? Math.max(FIRST_PAGE, Math.ceil(meta.total / Math.max(meta.limit, 1)))
    : FIRST_PAGE;
  const current = meta?.page ?? FIRST_PAGE;
  const overshot = meta !== undefined && current > lastPage;

  useEffect(() => {
    if (overshot) setPage(lastPage);
  }, [overshot, lastPage, setPage]);
}
