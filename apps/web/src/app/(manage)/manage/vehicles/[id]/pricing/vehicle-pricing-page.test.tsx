import { describe, expect, it, vi } from 'vitest';

import { VEHICLE_EDIT_TAB } from '@/constants/routes';

import Page from './page';

/**
 * `/manage/vehicles/[id]/pricing` — **chỉ còn là một lần chuyển hướng** (29/09/2026).
 *
 * Màn giá & chính sách từng có HAI bản: mục trong `/edit` và route độc lập này. Hai bản đã lệch
 * thật — bản trong tab ghim cứng `canEdit = true` còn bản ở đây đọc `vehicles.update` — nên cùng
 * một người thiếu quyền sửa thì một đường cho sửa, một đường không.
 *
 * Route giữ lại vì nó nằm trong bookmark, link chia sẻ và màn "tạo xe thành công".
 */
const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

describe('/manage/vehicles/[id]/pricing', () => {
  it('chuyển hướng tới mục "Giá & chính sách" của màn sửa xe', async () => {
    await Page({ params: Promise.resolve({ id: 'v1' }) });

    expect(redirect).toHaveBeenCalledWith(
      `/manage/vehicles/v1/edit?tab=${VEHICLE_EDIT_TAB.PRICING}`,
    );
  });
});
