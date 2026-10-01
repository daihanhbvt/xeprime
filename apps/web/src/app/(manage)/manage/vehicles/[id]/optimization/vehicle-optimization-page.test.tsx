import { describe, expect, it, vi } from 'vitest';

import { VEHICLE_EDIT_TAB } from '@/constants/routes';

import Page from './page';

/**
 * `/manage/vehicles/[id]/optimization` — **chỉ còn là một lần chuyển hướng** (29/09/2026).
 *
 * Trang này ra đời 17/09/2026 vì xe của gian hàng không có chỗ nào bật "Đặt ngay". Nay menu trái
 * của màn sửa xe có đúng mục đó cho từng dịch vụ, nên một trang riêng là lối vào THỨ HAI cho
 * cùng một công tắc — và hai lối vào cho một thiết lập là hai chỗ để lệch nhau (đã xảy ra thật
 * với `canEdit` của bảng giá).
 *
 * Bộ test cũ khẳng định trên giao diện của trang (tab theo dịch vụ, màn rỗng khi xe chỉ cho thuê
 * dài hạn, chặn khi thiếu quyền). Những khẳng định đó KHÔNG mất: chúng chuyển sang
 * `edit-vehicle-page.test.tsx`, nơi mục ấy đang sống. Ở đây chỉ còn một việc phải khoá lại —
 * link cũ và bookmark cũ vẫn tới đúng chỗ.
 */
const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

describe('/manage/vehicles/[id]/optimization', () => {
  it('chuyển hướng tới mục "Tối ưu nhận chuyến" của màn sửa xe', async () => {
    await Page({ params: Promise.resolve({ id: 'v1' }) });

    expect(redirect).toHaveBeenCalledWith(
      `/manage/vehicles/v1/edit?tab=${VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION}`,
    );
  });
});
