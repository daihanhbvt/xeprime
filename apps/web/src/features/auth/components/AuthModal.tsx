'use client';

import { Drawer, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useAuthCache } from '../hooks/use-auth-actions';
import { AUTH_MODE, resolveCustomerDestination, resolveOwnerCtaHref } from '../post-auth-destination';
import { AuthPanel } from './AuthPanel';
import { useAuthModal } from './AuthModalProvider';
import { RegisterSuccess } from './RegisterSuccess';
import styles from './AuthModal.module.css';

const COPY = {
  [AUTH_MODE.LOGIN]: {
    title: 'Đăng nhập XePrime',
    sub: 'Đăng nhập để đặt xe và quản lý chuyến đi.',
  },
  [AUTH_MODE.REGISTER]: {
    title: 'Tạo tài khoản XePrime',
    sub: 'Tạo tài khoản để đặt xe nhanh hơn và theo dõi chuyến đi.',
  },
} as const;

/**
 * Đăng nhập/đăng ký của KHÁCH — hiện ngay trên trang đang xem, không rời marketplace.
 *
 * Desktop dùng Modal, mobile dùng Drawer đáy (bàn phím ảo không đẩy form ra ngoài viewport).
 * Cả hai đều lấy nội dung từ `AuthPanel` — không có bản sao logic đăng nhập thứ hai.
 */
export function AuthModal() {
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

  const copy = COPY[mode];
  const body = registered ? (
    <RegisterSuccess
      hasTenant={registered.tenant != null}
      closeLabel={next ? 'Tiếp tục' : 'Đóng'}
      onClose={handleClose}
      onOpenAccount={() => goTo(ROUTES.ACCOUNT)}
      onBecomeOwner={() => goTo(resolveOwnerCtaHref(registered))}
    />
  ) : (
    <>
      <div className={styles.head}>
        <Logo size="md" />
        <div>
          <div className={styles.title}>{copy.title}</div>
          <div className={styles.sub}>{copy.sub}</div>
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

  // Drawer đáy trên mobile: form dài hơn một màn hình vẫn cuộn được trong drawer, và bàn phím
  // ảo không đẩy nội dung ra khỏi viewport như Modal căn giữa.
  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        placement="bottom"
        height="auto"
        onClose={handleClose}
        title={null}
        closable
        destroyOnHidden
        rootClassName={styles.drawerRoot}
        classNames={{ body: styles.body }}
        aria-label={copy.title}
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      centered
      width={420}
      destroyOnHidden
      maskClosable
      title={null}
      classNames={{ body: styles.body }}
      aria-label={copy.title}
    >
      {body}
    </Modal>
  );
}
