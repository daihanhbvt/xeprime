'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { useAuthCache } from '../hooks/use-auth-actions';
import {
  AUTH_MODE,
  resolveCustomerDestination,
  resolveOwnerCtaHref,
} from '../post-auth-destination';
import { AuthPanel } from './AuthPanel';
import { useAuthModal } from './AuthModalProvider';
import { RegisterSuccess } from './RegisterSuccess';
import styles from './AuthModal.module.css';

/**
 * Đăng nhập/đăng ký của KHÁCH — hiện ngay trên trang đang xem, không rời marketplace.
 *
 * Desktop dùng Modal, mobile dùng Drawer đáy (bàn phím ảo không đẩy form ra ngoài viewport).
 * Cả hai đều lấy nội dung từ `AuthPanel` — không có bản sao logic đăng nhập thứ hai.
 */
export function AuthModal() {
  const t = useTranslations('Auth.modal');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const isMobile = useIsMobile();
  const { isOpen, mode, next, close, setMode, takePendingAction } = useAuthModal();
  const { refreshAfterAuth } = useAuthCache();
  const [registered, setRegistered] = useState<CurrentUser | null>(null);

  async function handleAuthenticated(user: CurrentUser, ctx: { justRegistered: boolean }) {
    const fresh = (await refreshAfterAuth(user)) ?? user;

    if (ctx.justRegistered) {
      // Không điều hướng vội: khách vừa tạo tài khoản phải được CHỌN đi đâu tiếp.
      setRegistered(fresh);
      return;
    }

    finishAndGo(fresh);
  }

  /** Chạy tiếp hành động bị chặn (nếu có) rồi đóng modal / đi tới `next`. */
  function finishAndGo(user: CurrentUser) {
    const action = takePendingAction();
    const destination = resolveCustomerDestination(next);
    close();
    if (action) {
      action(user);
      return;
    }
    if (destination) router.push(destination);
  }

  function handleClose() {
    if (registered) {
      // Đăng ký xong mà đang dở một hành động (`next`) thì đi tiếp — bỏ ý định của khách ở đây
      // đồng nghĩa bắt họ thao tác lại từ đầu.
      const user = registered;
      setRegistered(null);
      finishAndGo(user);
      return;
    }
    takePendingAction();
    close();
  }

  function goTo(path: string) {
    setRegistered(null);
    close();
    router.push(path);
  }

  const body = registered ? (
    <RegisterSuccess
      hasTenant={registered.tenant != null}
      closeLabel={next ? t('continueLabel') : tCommon('actions.close')}
      onClose={handleClose}
      onOpenAccount={() => goTo(ROUTES.ACCOUNT.ROOT)}
      onBecomeOwner={() => goTo(resolveOwnerCtaHref(registered))}
    />
  ) : (
    <>
      <div className={cx(styles.head, mode === AUTH_MODE.REGISTER && styles.registerHead)}>
        <Logo size="sm" />
        <div>
          <div className={styles.title}>
            {mode === AUTH_MODE.LOGIN ? t('loginTitle') : t('registerTitle')}{' '}
            <span className={styles.brandName}>XePrime</span>
          </div>
          <div className={styles.sub}>
            {mode === AUTH_MODE.LOGIN ? t('loginSub') : t('registerSub')}
          </div>
        </div>
      </div>
      <AuthPanel
        mode={mode}
        onModeChange={setMode}
        onAuthenticated={handleAuthenticated}
        autoFocus={!isMobile}
      />
    </>
  );

  return (
    <ResponsiveDialog
      open={isOpen}
      onClose={handleClose}
      /**
       * Modal tự dựng phần đầu có thương hiệu (logo + tiêu đề + phụ đề) trong thân, nên header
       * mặc định bị ẩn — nhưng dialog VẪN phải có tên. Bản cũ truyền `aria-label` cho
       * `Modal`/`Drawer`, mà AntD không chuyển tiếp nó xuống phần tử `role="dialog"` khi
       * `title` rỗng: modal đăng nhập trước Wave 1B **không có tên khả truy cập** (backlog
       * D14.2). `hideHeaderTitle` + `ariaLabel` dựng một tiêu đề chỉ-đọc-màn-hình, sửa đúng chỗ.
       */
      hideHeaderTitle
      /*
       * Tên dialog mang cả THƯƠNG HIỆU và là một message riêng, không phải nhãn nút cộng chuỗi
       * " XePrime": trật tự từ của hai ngôn ngữ khác nhau ("Đăng nhập XePrime" ↔ "Sign in to
       * XePrime"), nên chỗ đặt thương hiệu phải do từng bản dịch quyết định.
       */
      ariaLabel={mode === AUTH_MODE.LOGIN ? t('loginDialogTitle') : t('registerDialogTitle')}
      /**
       * `sm` + `sheet`: giữ nguyên hình thái đang chạy — desktop hộp hẹp, mobile bottom sheet
       * cao theo nội dung. Cố ý KHÔNG dùng full-screen như quy tắc 5 của Figma `130:1563`:
       * form auth ngắn, và bản hiện tại chọn drawer đáy chính vì bàn phím ảo không đẩy nội
       * dung ra khỏi viewport. Đổi sang full-screen là redesign, không thuộc Wave 1B.
       */
      size="sm"
      mobileMode="sheet"
      footer={null}
      className={styles.dialog}
      bodyClassName={styles.body}
    >
      {body}
    </ResponsiveDialog>
  );
}
