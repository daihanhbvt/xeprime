'use client';

import { Alert, Button, Spin } from 'antd';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';

import { AccountSidebar } from './AccountSidebar';
import styles from './AccountShell.module.css';

/**
 * Route CHIẾM TRỌN bề ngang: menu trái tạm ẩn, nội dung tự lo lối quay lại.
 *
 * Lịch xe là một LƯỚI hai chiều — mỗi cột là một ngày, mỗi hàng là một xe. Nhường 256px cho menu
 * nghĩa là cắt mất khoảng hai ngày khỏi tầm nhìn, đúng thứ người dùng mở lịch để xem. Cùng lý do
 * `AppShell` khoá viewport cho `/manage/calendar`.
 *
 * Cổng đăng nhập vẫn áp bình thường — "ẩn menu" không phải "ra khỏi khu tài khoản".
 */
const FULL_WIDTH_PATHS: readonly string[] = [ROUTES.ACCOUNT.CALENDAR];

/**
 * Vỏ chung của khu `/account` (và `/trips`, được bọc cùng vỏ) — menu trái và **cổng đăng nhập
 * đặt ĐÚNG MỘT LẦN**.
 *
 * Trước đây `AccountView` tự gác cửa cho riêng nó. Khi khu này có nhiều trang, mỗi trang tự gác
 * là từng ấy bản sao của cùng một luồng bảo mật — và chỉ cần một trang quên là lộ khung trang
 * cho người chưa đăng nhập. Vỏ gác một lần, trang con chỉ lo dữ liệu của mình.
 *
 * Vỏ KHÔNG mang tiêu đề chung (bản 08/09/2026): mỗi trang tự có một `h1` của nó ("Danh sách xe",
 * "Cập nhật bảo mật"…) — một `h1` "Tài khoản của tôi" đứng trên mọi trang vừa lặp với tên mục
 * đang mở, vừa buộc `TripsView` (có `h1` riêng từ trước) sinh hai `h1` trên cùng một trang.
 *
 * Vỏ nằm trong route group `(public)` nên vẫn giữ header/footer marketplace: ADR 0014 — lúc mở
 * trang này người dùng đang ở vai CON NGƯỜI, không phải vai gian hàng, và chính họ cũng có thể
 * đi thuê xe. Menu chủ xe chỉ hiện khi họ là `shop_owner` (`resolveAccountNav`).
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Account');
  const errorMessage = useErrorMessage();
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();
  const tCommon = useTranslations('Common');
  const pathname = usePathname();
  const fullWidth = FULL_WIDTH_PATHS.includes(pathname);

  if (isLoading) {
    return (
      <div className={styles.center}>
        <Spin size="large" />
      </div>
    );
  }

  // 401 là trạng thái hợp lệ (chưa đăng nhập), không phải lỗi hệ thống — hai lối ra khác nhau.
  if (isError && isUnauthenticated(error)) {
    return (
      <div className={styles.center}>
        <Alert type="info" showIcon message={t('signInRequired')} />
        <Button type="primary" onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}>
          {t('signIn')}
        </Button>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon message={errorMessage(error)} />
        <Button onClick={() => void refetch()}>{tCommon('actions.retry')}</Button>
      </div>
    );
  }

  if (fullWidth) return <div className={styles.fullWidth}>{children}</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <aside className={styles.aside}>
          <AccountSidebar user={user} />
        </aside>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
