import { useMutation } from '@tanstack/react-query';
import { API_ERROR_CODE, OTP_POLICY, type PhoneVerificationPurpose } from '@xeprime/types';
import { getErrorCode, getRetryAfterSeconds } from '@/lib/api-client';
import { useCallback, useEffect, useState } from 'react';
import { sendOtp, verifyOtp } from '../api';
import { useOtpTestCodeEnabled } from './use-otp-config';

export type PhoneVerifyStatus = 'idle' | 'code_sent' | 'verified';

/**
 * Mã đã CHẾT (khoá vì sai quá số lần, hoặc hết hạn) — gõ tiếp vô ích, chỉ còn "Gửi lại mã"
 * (web `use-phone-verify`, PR #278).
 */
const DEAD_CODE_ERRORS = new Set<string>([API_ERROR_CODE.OTP_LOCKED, API_ERROR_CODE.OTP_EXPIRED]);

/** Server nói phải chờ bao lâu mới gửi được mã tiếp — đồng hồ "Gửi lại mã" bám theo con số đó. */
const SEND_WAIT_ERRORS = new Set<string>([API_ERROR_CODE.OTP_COOLDOWN, API_ERROR_CODE.OTP_TOO_MANY]);

export function usePhoneVerify(purpose: PhoneVerificationPurpose) {
  const testCodeEnabled = useOtpTestCodeEnabled();
  const [status, setStatus] = useState<PhoneVerifyStatus>('idle');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [codeDead, setCodeDead] = useState(false);
  const noteCodeError = useCallback((e: unknown) => {
    const code = getErrorCode(e);
    if (code && DEAD_CODE_ERRORS.has(code)) setCodeDead(true);
  }, []);

  const running = cooldown > 0;
  // Timer đọc giá trị mới nhất qua setState functional, nên effect chỉ cần chạy lại khi
  // BẬT/TẮT — phụ thuộc thẳng vào `cooldown` sẽ dựng lại interval mỗi giây.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const sendMutation = useMutation({
    mutationFn: (phone: string) => sendOtp({ phone, purpose }),
    onSuccess: (res) => {
      setStatus('code_sent');
      setDevCode(res.devCode ?? null);
      setError(null);
      setCodeDead(false);
      setCooldown(OTP_POLICY.RESEND_COOLDOWN_SECONDS);
    },
    onError: (error) => {
      setError(error);
      const code = getErrorCode(error);
      const wait = getRetryAfterSeconds(error);
      if (code && SEND_WAIT_ERRORS.has(code) && wait !== null) setCooldown(wait);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (v: { phone: string; code: string }) =>
      verifyOtp({ phone: v.phone, purpose, code: v.code }),
    onSuccess: () => {
      setStatus('verified');
      setError(null);
    },
    onError: (e) => {
      setError(e);
      noteCodeError(e);
    },
  });

  const reset = useCallback(() => {
    setStatus('idle');
    setDevCode(null);
    setError(null);
    setCooldown(0);
    setCodeDead(false);
  }, []);

  return {
    status,
    cooldown,
    devCode,
    error,
    /**
     * Môi trường nhận mã OTP test (dev/staging): cho nhập mã ngay cả khi chưa gửi — gõ mã test là
     * qua, bấm gửi thì nhận SMS thật như thường. Production luôn false.
     */
    testCodeEnabled,
    /** Ô nhập mã được hiện: đã gửi mã, hoặc môi trường nhận mã test. */
    canEnterCode: status === 'code_sent' || testCodeEnabled,
    sending: sendMutation.isPending,
    verifying: verifyMutation.isPending,
    send: (phone: string) => sendMutation.mutate(phone),
    sendAsync: (phone: string) => sendMutation.mutateAsync(phone),
    /**
     * `options` xuyên thẳng xuống `mutate` để nơi gọi bắn được toast lỗi.
     *
     * Có nó vì `error` trong state chỉ hợp với chỗ hiện lỗi TẠI CHỖ; app native báo lỗi thao tác
     * bằng toast (`useAppToast`), mà toast là một SỰ KIỆN — treo nó vào một `useEffect` theo dõi
     * `error` thì cùng một lỗi lặp lại (nhập sai mã hai lần liên tiếp) không bắn lần thứ hai vì
     * giá trị state không đổi.
     */
    verify: (
      phone: string,
      code: string,
      options?: { onError?: (error: unknown) => void; onSuccess?: () => void },
    ) => verifyMutation.mutate({ phone, code }, options),
    /** Bản Promise của `verify` - màn quên mật khẩu 3 bước của app Partner đợi kết quả để sang bước 3 (như web). */
    verifyAsync: (phone: string, code: string) => verifyMutation.mutateAsync({ phone, code }),
    clearError: () => setError(null),
    /** Mã vừa nhập đã chết (`OTP_LOCKED`/`OTP_EXPIRED`) — khoá ô nhập, chỉ còn gửi lại mã. */
    codeDead,
    /** Lỗi của một lượt đối chiếu mã qua endpoint KHÁC (đăng ký, đặt lại mật khẩu) — xem `codeDead`. */
    noteCodeError,
    reset,
  };
}
