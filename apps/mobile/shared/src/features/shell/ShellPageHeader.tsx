import type { ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import { AppHeader } from '@/components/layout/AppHeader';
import { goBackOr } from '@/navigation/go-back-or';
import { ManageHeader } from './ManageHeader';
import { ManagePageTitle } from './ManagePageTitle';

/** VỎ của một màn dùng ở cả khu tài khoản (nút lui) lẫn MỤC MENU của khu quản lý (nút mở menu). */
export type PageShell = 'account' | 'manage';

/**
 * Thanh trên theo vỏ — một chỗ thay cho từng màn tự rẽ nhánh.
 *
 *  - `account`: `AppHeader` có nút lui về `backTo` (màn chen ngang, lui được).
 *  - `manage`: `ManageHeader` (nút mở drawer) + `ManagePageTitle` — màn là MỘT MỤC của menu khu
 *    quản lý, đổi mục chứ không chồng thêm một nấc lui (ADR 0053: các mục Owner Lite của app Partner
 *    nằm trong bộ tab như mọi mục menu khác). `ManageHeader` đòi `ManageDrawerHost`, nên vỏ này chỉ
 *    dùng được cho route nằm trong nhóm `(tabs)`.
 *
 * `right` đứng ở góc phải thanh trên (vỏ tài khoản) hoặc cạnh tiêu đề trang (vỏ quản lý).
 */
export function ShellPageHeader({
  shell,
  title,
  subtitle,
  right,
  backTo,
}: {
  shell: PageShell;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  backTo: Href;
}) {
  const router = useRouter();

  if (shell === 'manage') {
    return (
      <>
        <ManageHeader />
        <ManagePageTitle
          title={title}
          {...(subtitle ? { subtitle } : {})}
          {...(right ? { action: right } : {})}
        />
      </>
    );
  }

  return (
    <AppHeader
      onBack={() => goBackOr(router, backTo)}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(right ? { right } : {})}
    />
  );
}
