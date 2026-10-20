'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { useIsMobile } from '@/hooks/use-media-query';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useAuthCache } from '../hooks/use-auth-actions';
import { AUTH_CONTEXT, AUTH_MODE, resolveCustomerDestination } from '../post-auth-destination';
import { AuthBrandPanel } from './AuthBrandPanel';
import { CloseIcon } from './AuthIcons';
import { useAuthModal } from './AuthModalProvider';
import { MarketAuthForms } from './MarketAuthForms';
import { MarketForgotPassword } from './MarketForgotPassword';
import styles from './AuthModal.module.css';

/**
 * Hộp TÀI KHOẢN của khách — design v2 (Figma "Xe Prime": `19786:73234` Đăng nhập · `19836:35020`
 * Đăng ký · `19836:42239` Quên mật khẩu). Hiện ngay trên trang đang xem, không rời marketplace.
 *
 * Desktop: hộp 1100px hai cột — ảnh thương hiệu (`AuthBrandPanel`) bên trái, form bên phải. Màn
 * hẹp hơn tablet ngang chỉ còn cột form; mobile thành màn toàn trang (form có bàn phím ảo).
 *
 * Ba chế độ, đều nằm trong URL (`?auth=login|register|forgot`, xem `AuthModalProvider`):
 *  - **Đăng nhập** / **Đăng ký** (`MarketAuthForms`): đăng ký xong mã OTP là ĐÃ ĐĂNG NHẬP — hộp đóng
 *    thẳng, chạy tiếp hành động bị chặn hoặc đi tới `next`; không chen màn "Tạo tài khoản thành
 *    công" nào vào giữa.
 *  - **Quên mật khẩu** (`MarketForgotPassword`): ba bước ngay trong hộp, xong thì về form đăng nhập
 *    với số vừa đặt lại điền sẵn — đặt lại mật khẩu KHÔNG cấp phiên (ADR 0060 §4).
 */
export function AuthModal() {
  const t = useTranslations('Auth.modal');
  const router = useRouter();
  const { isOpen, mode, next, close, takePendingAction } = useAuthModal();
  const { refreshAfterAuth } = useAuthCache();

  async function handleAuthenticated(user: CurrentUser) {
    const fresh = (await refreshAfterAuth(user)) ?? user;
    // Chạy tiếp hành động bị chặn (nếu có) rồi đóng hộp / đi tới `next`.
    const action = takePendingAction();
    const destination = resolveCustomerDestination(next);
    close();
    if (action) {
      action(fresh);
      return;
    }
    if (destination) router.push(destination);
  }

  function handleClose() {
    takePendingAction();
    close();
  }

  /*
   * Tên dialog mang cả THƯƠNG HIỆU và là một message riêng, không phải nhãn nút cộng chuỗi
   * " XePrime": trật tự từ của hai ngôn ngữ khác nhau ("Đăng nhập XePrime" ↔ "Sign in to XePrime"),
   * nên chỗ đặt thương hiệu phải do từng bản dịch quyết định.
   */
  const dialogTitle =
    mode === AUTH_MODE.REGISTER
      ? t('registerDialogTitle')
      : mode === AUTH_MODE.FORGOT
        ? t('forgotDialogTitle')
        : t('loginDialogTitle');

  return (
    <ResponsiveDialog
      open={isOpen}
      onClose={handleClose}
      /*
       * Tiêu đề hiện nằm TRONG cột form (mỗi chế độ một kiểu), nên header của dialog ẩn — nhưng
       * dialog VẪN phải có tên: `hideHeaderTitle` + `ariaLabel` dựng tiêu đề chỉ-đọc-màn-hình.
       */
      hideHeaderTitle
      ariaLabel={dialogTitle}
      size="fit"
      mobileMode="fullscreen"
      footer={null}
      closeIcon={<CloseIcon />}
      className={styles.dialog}
      bodyClassName={styles.body}
    >
      <AuthModalBody onAuthenticated={handleAuthenticated} />
    </ResponsiveDialog>
  );
}

/**
 * Thân hộp — chỉ tồn tại khi hộp đang mở (dialog huỷ nội dung lúc đóng), nên mọi thứ nó giữ sống
 * đúng MỘT lần mở hộp và tự sạch khi đóng:
 *  - SĐT mang qua lại giữa các chế độ ("Quên mật khẩu?" mang số đang gõ sang bước 1; đặt lại xong
 *    mang số đó về form đăng nhập);
 *  - máy gửi mã quên mật khẩu: sang đăng nhập rồi quay lại "Quên mật khẩu?" thì đồng hồ gửi lại
 *    vẫn chạy và mã đã gửi vẫn dùng được — không bị server chặn vì cooldown ở bước 1.
 * Không đặt ở `AuthModal`: hộp đó gắn sẵn trên MỌI trang công khai, còn máy gửi mã đọc cấu hình OTP
 * qua mạng ngay khi mount.
 */
function AuthModalBody({
  onAuthenticated,
}: {
  onAuthenticated: (user: CurrentUser) => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const { mode, errorCode, context, setMode } = useAuthModal();
  /** Đang dở luồng thuê xe: hộp nói vì sao được hỏi đăng nhập, và xong thì trả khách về luồng đó. */
  const forBooking = context === AUTH_CONTEXT.BOOKING;
  const [carriedPhone, setCarriedPhone] = useState<string | null>(null);
  const resetOtp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  return (
    <div className={styles.frame}>
      <AuthBrandPanel className={styles.brand} />
      <div className={styles.content}>
        {mode === AUTH_MODE.FORGOT ? (
          <MarketForgotPassword
            defaultPhone={carriedPhone ?? ''}
            otp={resetOtp}
            sentTo={resetSentTo}
            onCodeSent={setResetSentTo}
            autoFocus={!isMobile}
            onBackToLogin={(phone) => {
              setCarriedPhone(phone);
              setMode(AUTH_MODE.LOGIN);
            }}
          />
        ) : (
          <MarketAuthForms
            mode={mode}
            onModeChange={setMode}
            onForgot={(phone) => {
              setCarriedPhone(phone);
              setMode(AUTH_MODE.FORGOT);
            }}
            onAuthenticated={onAuthenticated}
            initialErrorCode={errorCode}
            forBooking={forBooking}
            prefillPhone={carriedPhone}
            autoFocus={!isMobile}
          />
        )}
      </div>
    </div>
  );
}
