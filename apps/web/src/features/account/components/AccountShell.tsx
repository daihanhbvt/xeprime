'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Spin } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';

import {
  accountNavOwner,
  flattenAccountNav,
  resolveAccountNav,
} from '@/constants/account-nav';
import { ROUTES, isAccountVehicleManagePath } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';

import { shopAccountRedirect } from '../shop-account-gate';

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
  /*
   * Không gian "Quản lý xe" có menu trái RIÊNG của xe nên khớp theo TIỀN TỐ (mọi mục con, kể cả
   * gốc tự chuyển hướng) — không thể liệt kê từng đường như lịch xe vì id xe nằm trong URL.
   */
  const fullWidth = FULL_WIDTH_PATHS.includes(pathname) || isAccountVehicleManagePath(pathname);

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
        <Alert type="info" showIcon title={t('signInRequired')} />
        <Button type="primary" onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}>
          {t('signIn')}
        </Button>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon title={errorMessage(error)} />
        <Button onClick={() => void refetch()}>{tCommon('actions.retry')}</Button>
      </div>
    );
  }

  /*
   * CỔNG URL của khu khách (15/09/2026) — không phải chuyện ẩn menu.
   *
   * Thành viên gian hàng tuyến gói gõ thẳng `/account/change-password`, `/account/vehicles`,
   * `/account/earnings`… phải được đưa về đúng nơi làm việc, không được rơi vào một màn khách
   * mà menu đã bỏ đi. Ẩn mục menu mà để URL mở được là để lại một cửa sau, và người dùng tìm
   * thấy nó bằng bookmark cũ chứ không phải bằng ý đồ xấu.
   *
   * `redirectFor` trả về ĐÍCH TƯƠNG ĐƯƠNG, không phải một trang 403: mỗi màn khách đều có bản
   * của nó trong Manage, nên người dùng đến được thứ họ định làm.
   */
  const redirect = shopAccountRedirect(user, pathname);
  if (redirect) return <ShellRedirect href={redirect} />;

  if (fullWidth) return <div className={styles.fullWidth}>{children}</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <aside className={styles.aside}>
          <AccountSidebar user={user} />
        </aside>
        <div className={styles.content}>
          <AccountSubPageBack user={user} pathname={pathname} />
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Đường LUI của một màn con không có mục menu riêng.
 *
 * ADR 0038 điều 9 gom ba cửa tiền vào trong "Tài khoản của tôi", nên `/account/balance`,
 * `/account/earnings`, `/account/bank-accounts` và `/account/payments` không còn là mục menu với
 * chủ xe. Người dùng vào đó bằng một nút bên trong màn cha — và rồi không có gì đưa họ ngược lại:
 * menu không sáng mục nào, trang cũng không có nút lui.
 *
 * Đặt ở SHELL chứ không ở từng trang: bốn trang kia không hề biết mình đang là màn con hay mục
 * menu — câu trả lời đó phụ thuộc MENU của người đang đăng nhập (khách thuê vẫn có chúng làm mục
 * riêng). Và một màn tiền thêm vào tháng sau sẽ tự có đường lui thay vì lại quên.
 *
 * Không render gì khi màn hiện tại tự có mục menu — ở đó chính mục đang sáng đã là chỗ đứng.
 */
function AccountSubPageBack({
  user,
  pathname,
}: {
  user: CurrentUser;
  pathname: string | null;
}) {
  const t = useTranslations('Account.ownerGate');
  const owner = pathname
    ? accountNavOwner(pathname, flattenAccountNav(resolveAccountNav(user)))
    : undefined;

  if (!owner) return null;

  return (
    <Link href={owner.href} className={styles.subPageBack}>
      <ArrowLeftOutlined aria-hidden="true" /> {t('backToAccount')}
    </Link>
  );
}

/**
 * Chuyển hướng KHÔNG render gì của khu khách.
 *
 * Component riêng vì `AccountShell` đã `return` sớm ở nhiều nhánh phía trên — gọi `useEffect`
 * sau một `return` có điều kiện là vi phạm quy tắc hook. `replace` để nút Quay lại không rơi
 * ngược vào chính URL vừa bị chuyển đi.
 */
function ShellRedirect({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <div className={styles.center}>
      <Spin size="large" />
    </div>
  );
}
