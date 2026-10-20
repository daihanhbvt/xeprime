'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { compactPhoneInput, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import type { LoginValues, PhoneLoginValues, RegisterValues } from '@xeprime/validators';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { resolveAppLocale } from '@/i18n/config';
import { useErrorCodeMessage, useErrorMessage } from '@/i18n/use-error-message';
import {
  checkRegistration,
  loginWithPassword,
  registerWithPassword,
  type AuthProvider,
  type CurrentUser,
} from '@/services/auth.service';
import { startSocialLogin } from '../lib/social-auth-url';

/** Việc đang chạy — mỗi nút biết mình có đang quay hay không. */
export type AuthPending = 'password' | 'sendCode' | 'register' | AuthProvider;

export interface UseAuthFlowOptions {
  /** Gọi khi phiên đã được cấp. `justRegistered` để chỗ gọi xử lý riêng lượt vừa tạo tài khoản. */
  onAuthenticated: (user: CurrentUser, ctx: { justRegistered: boolean }) => void | Promise<void>;
  /**
   * Mã lỗi (`API_ERROR_CODE`) mang về từ `?authError=` sau một lần đăng nhập mạng xã hội hỏng.
   *
   * Đăng nhập social là một lần RỜI TRANG (ADR 0019), nên lỗi của nó không thể là state của
   * component như lỗi của form — nó phải sống sót qua một vòng điều hướng, và URL là chỗ duy
   * nhất làm được điều đó.
   */
  initialErrorCode?: string | null;
}

/**
 * TOÀN BỘ logic đăng nhập/đăng ký của XePrime — ADR 0060. Hai bề mặt dùng chung nó: hộp tài khoản
 * của site khách (`MarketAuthForms`, design v2) và `AuthPanel` của site partner/quản trị. Mỗi bề
 * mặt chỉ lo phần NHÌN; hook này không biết mình nằm trong hộp hay trên trang, và không điều hướng
 * — nó chỉ gọi `onAuthenticated`. Đó là điều giữ hai giao diện không trôi thành hai bộ logic.
 *
 *  - **Đăng nhập**: SỐ ĐIỆN THOẠI + mật khẩu (site quản trị: email/SĐT), hoặc Google/Facebook.
 *  - **Đăng ký**: SĐT · tên hiển thị · mật khẩu · nhập lại → kiểm trước (`register/check`) → gửi mã
 *    OTP tới SĐT → nhập mã → tài khoản ra đời với SĐT đã xác minh VÀ phiên được cấp ngay. Mã chỉ
 *    CHỨNG MINH SỐ, phiên đến từ chính lượt đăng ký.
 *
 * Realm của tài khoản do SITE quyết (proxy), không do form — cùng hook ở site khách tạo tài khoản
 * khách, ở site partner tạo tài khoản đối tác (ADR 0053).
 */
export function useAuthFlow({ onAuthenticated, initialErrorCode = null }: UseAuthFlowOptions) {
  const locale = useLocale();
  const pathname = usePathname();
  const apiErrorMessage = useErrorMessage();
  const errorCodeMessage = useErrorCodeMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AuthPending | null>(null);
  // Mã `?authError=` đã được chuyển thành thông báo rồi — để nó không quay lại sau mỗi lần
  // người dùng thao tác tiếp.
  const [consumedErrorCode, setConsumedErrorCode] = useState<string | null>(null);

  /** Máy gửi mã của bước đăng ký — mã `purpose=register`, không dùng chéo mục đích khác. */
  const registerOtp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.REGISTER);
  /**
   * Thông tin đăng ký ĐANG CHỜ MÃ. `null` ⇒ còn ở bước điền form. Chỉ sống trong bộ nhớ: mật khẩu
   * không bao giờ được ghi xuống storage hay URL.
   */
  const [registration, setRegistration] = useState<RegisterValues | null>(null);
  /** Lần điền gần nhất — điền lại form khi người dùng quay lại từ bước mã. */
  const [registerDraft, setRegisterDraft] = useState<RegisterValues | null>(null);
  const [code, setCode] = useState('');

  const busy = pending !== null;

  /*
   * Nạp mã lỗi từ URL NGAY TRONG RENDER, không qua `useEffect`.
   *
   * Không dùng initializer của `useState`: mã đến từ `?authError=`, mà `AuthUrlSync` đọc URL
   * trong một effect — nên ở modal, form mount TRƯỚC khi mã tới, và initializer (chạy đúng một
   * lần) sẽ đọc `null` rồi thông báo lỗi biến mất.
   *
   * Không dùng `useEffect` vì đây không phải đồng bộ với hệ thống bên ngoài — đó là mẫu "điều
   * chỉnh state khi prop đổi" mà React khuyến nghị: setState trong render làm React render lại
   * ngay, không commit lần dở dang, nên không có nháy màn hình và không có render dây chuyền.
   */
  if (initialErrorCode && initialErrorCode !== consumedErrorCode) {
    setConsumedErrorCode(initialErrorCode);
    setError(errorCodeMessage(initialErrorCode));
  }

  /** Chạy một lượt cấp phiên. `true` khi phiên đã được cấp và `onAuthenticated` đã chạy xong. */
  async function run(
    key: AuthPending,
    action: () => Promise<CurrentUser>,
    justRegistered = false,
  ): Promise<boolean> {
    // Chống double-submit: mọi nút đều disabled khi `busy`, và nhánh này chặn cả trường hợp
    // Enter được nhấn liên tiếp (hay ô mã tự gửi) trước khi React kịp render trạng thái disabled.
    if (busy) return false;
    setPending(key);
    setError(null);
    try {
      const user = await action();
      await onAuthenticated(user, { justRegistered });
      setPending(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      setPending(null);
      return false;
    }
  }

  /** Site khách / site partner: SỐ ĐIỆN THOẠI + mật khẩu (ADR 0060). */
  function loginWithPhone(values: PhoneLoginValues): Promise<boolean> {
    // Bỏ dấu cách/chấm/gạch người dùng chép từ danh bạ — server bỏ cùng một cách.
    return run('password', () =>
      loginWithPassword(compactPhoneInput(values.phone), values.password),
    );
  }

  /** Site quản trị: email HOẶC SĐT + mật khẩu (realm `platform` — ADR 0053 điều 3). */
  function loginWithIdentifier(values: LoginValues): Promise<boolean> {
    return run('password', () => loginWithPassword(values.identifier, values.password));
  }

  /**
   * Bước 1 của đăng ký: kiểm HẾT (SĐT, mật khẩu, họ tên, SĐT chưa có tài khoản ở site này) rồi gửi
   * mã tới SĐT và sang bước nhập mã. Số đã có tài khoản ⇒ server từ chối ngay ở đây
   * (`PHONE_TAKEN`), trước khi tốn một tin nhắn.
   *
   * Môi trường nhận mã test (dev/staging) KHÔNG tự gửi: sang thẳng bước mã, gõ mã test là qua —
   * hoặc bấm "Gửi lại mã" để nhận SMS thật.
   */
  async function startRegistration(values: RegisterValues): Promise<void> {
    if (busy) return;
    setError(null);
    setRegisterDraft(values);
    setPending('sendCode');
    try {
      try {
        await checkRegistration({
          displayName: values.displayName,
          phone: values.phone.trim(),
          password: values.password,
        });
      } catch (err) {
        setError(apiErrorMessage(err));
        return;
      }
      if (!registerOtp.testCodeEnabled) await registerOtp.sendAsync(values.phone.trim());
      setCode('');
      setRegistration(values);
    } catch {
      // Lỗi gửi mã (cooldown…) hiện qua `registerOtp.error` ngay trên form.
    } finally {
      setPending(null);
    }
  }

  /** Bước 2: mã đúng ⇒ tài khoản ra đời và phiên được cấp trong CÙNG một lượt gọi. */
  function confirmRegistration(submitted: string): Promise<boolean> {
    if (!registration) return Promise.resolve(false);
    return run(
      'register',
      () =>
        registerWithPassword({
          displayName: registration.displayName,
          phone: registration.phone.trim(),
          password: registration.password,
          code: submitted,
        }),
      true,
    );
  }

  /** Quay lại form đăng ký — giữ nguyên thứ đã điền; mã đã gửi vẫn tính cooldown ở server. */
  function editRegistration(): void {
    setRegistration(null);
    setCode('');
    setError(null);
    registerOtp.reset();
  }

  /** Gõ lại mã thì lỗi của lần trước không còn đúng nữa. */
  function changeCode(next: string): void {
    if (error) setError(null);
    setCode(next);
  }

  /**
   * Đăng nhập/đăng ký mạng xã hội = RỜI TRANG (ADR 0019), không phải một lời gọi API.
   *
   * Vì thế nó không đi qua `run()`: không có promise nào để `await`, không có lỗi nào để bắt, và
   * `onAuthenticated` sẽ không bao giờ chạy — khi quay lại, đây là một lần tải trang mới đã có
   * cookie phiên của ĐÚNG site đang mở (realm ghi trong `oauth_states`). Tài khoản mới tạo bằng
   * Google/Facebook chưa có SĐT ⇒ bước "Hoàn thiện hồ sơ" (`AccountPhoneGate`) hiện ngay sau đó.
   * Trạng thái `pending` vẫn đặt để nút khoá lại trong lúc trình duyệt điều hướng.
   */
  function signIn(provider: AuthProvider): void {
    if (busy) return;
    setPending(provider);
    setError(null);
    startSocialLogin(provider, {
      pathname,
      search: window.location.search,
      locale: resolveAppLocale(locale),
    });
  }

  return {
    error,
    pending,
    busy,
    registerOtp,
    /** Thông tin đăng ký đang chờ mã — khác `null` nghĩa là đang ở bước nhập mã. */
    registration,
    registerDraft,
    code,
    changeCode,
    loginWithPhone,
    loginWithIdentifier,
    startRegistration,
    confirmRegistration,
    editRegistration,
    signIn,
  };
}

export type AuthFlow = ReturnType<typeof useAuthFlow>;
