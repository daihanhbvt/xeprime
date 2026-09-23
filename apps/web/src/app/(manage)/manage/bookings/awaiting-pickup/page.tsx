'use client';

import { Spin } from 'antd';
import { Suspense } from 'react';
import { BOOKING_LIST_PRESET } from '@xeprime/types';
import { BookingsListView } from '@/features/bookings/components/BookingsListView';
import styles from '../bookings-page.module.css';

/**
 * "Chờ giao xe" — CÙNG danh sách đơn, cùng endpoint, chỉ khoá sẵn một nhóm việc.
 *
 * Đây là một route chứ không phải `/manage/bookings?preset=…` vì mục menu đang mở được quyết
 * bằng `matchSelectedKey(pathname, …)`, và `usePathname()` không mang theo query (lý do đầy đủ
 * ở `ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP`). Các bộ lọc còn lại — từ khoá, trạng thái, sắp
 * xếp, trang — vẫn sống ở searchParams như mọi danh sách khác, nên link vẫn gửi được nguyên vẹn.
 */
export default function BookingsAwaitingPickupPage() {
  // useBookingFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <BookingsListView preset={BOOKING_LIST_PRESET.AWAITING_PICKUP} />
    </Suspense>
  );
}
