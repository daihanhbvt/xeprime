import type { ReactNode } from 'react';

import { AccountShell } from '@/features/account/components/AccountShell';

/**
 * `/trips` và `/trips/[id]` mang CÙNG vỏ với khu tài khoản (menu trái + cổng đăng nhập) — URL
 * giữ nguyên để thông báo và link cũ không gãy; `TripsView`/`TripDetailView` không đổi một dòng.
 *
 * `AccountShell` không mang tiêu đề chung, nên `h1` của `TripsView` vẫn là `h1` duy nhất của trang.
 */
export default function TripsLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
