'use client';

import { Button, Result, Spin } from 'antd';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './admin-layout.module.css';

/**
 * Cổng vào khu quản trị nền tảng.
 *
 * Phân biệt rõ 401 và 403 — đây là chỗ dễ làm sai nhất:
 *  - Chưa đăng nhập (401) do `AppShell` xử lý trước: dọn phiên rồi ra `/manage/login`.
 *  - Đã đăng nhập nhưng KHÔNG có scope nền tảng (403) thì dừng ở đây với thông báo rõ ràng.
 *    Tuyệt đối không đẩy họ sang đăng ký gian hàng: thiếu quyền admin không có nghĩa là muốn
 *    mở shop.
 *
 * Đây chỉ là lớp UX. Chặn thật nằm ở `@PlatformOnly()` + `@RequirePermissions` phía backend —
 * ẩn một trang ở client không bảo vệ được gì (CLAUDE.md mục 6).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user.platformRole) {
    return (
      <Result
        status="403"
        title="Không có quyền truy cập"
        subTitle="Khu quản trị nền tảng chỉ dành cho nhân sự XePrime. Tài khoản của bạn không có quyền này."
        extra={
          <div className={styles.actions}>
            <Link href={ROUTES.MANAGE.ROOT}>
              <Button type="primary">Về trang quản lý</Button>
            </Link>
            <Link href={ROUTES.HOME}>
              <Button>Quay lại tìm xe</Button>
            </Link>
          </div>
        }
      />
    );
  }

  return <>{children}</>;
}
