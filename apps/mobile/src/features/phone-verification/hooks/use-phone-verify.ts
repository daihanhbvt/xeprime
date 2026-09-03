import { useMutation } from '@tanstack/react-query';
import { API_ERROR_CODE, type PhoneVerificationPurpose } from '@xeprime/types';
import { getErrorCode } from '@/lib/api-client';
import { useCallback, useEffect, useState } from 'react';
import { sendOtp, verifyOtp } from '../api';

export type PhoneVerifyStatus = 'idle' | 'code_sent' | 'verified';

const RESEND_COOLDOWN_SEC = 60;

function serverCooldownSec(error: unknown): number {
  if (getErrorCode(error) !== API_ERROR_CODE.OTP_COOLDOWN) return 0;
  const seconds = Number(/(\d+)\s*s/.exec(String((error as Error)?.message ?? ''))?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : RESEND_COOLDOWN_SEC;
}

export function usePhoneVerify(purpose: PhoneVerificationPurpose) {
  const [status, setStatus] = useState<PhoneVerifyStatus>('idle');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

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
      setCooldown(RESEND_COOLDOWN_SEC);
    },
    onError: (error) => {
      setError(error);
      const wait = serverCooldownSec(error);
      if (wait > 0) setCooldown(wait);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (v: { phone: string; code: string }) =>
      verifyOtp({ phone: v.phone, purpose, code: v.code }),
    onSuccess: () => {
      setStatus('verified');
      setError(null);
    },
    onError: setError,
  });

  const reset = useCallback(() => {
    setStatus('idle');
    setDevCode(null);
    setError(null);
    setCooldown(0);
  }, []);

  return {
    status,
    cooldown,
    devCode,
    error,
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
    clearError: () => setError(null),
    reset,
  };
}
