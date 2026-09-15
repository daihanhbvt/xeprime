import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { queryKeys } from '@/queries/query-keys';
import { accountApi, CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../api';

/** Khớp `OTP_RESEND_COOLDOWN_SECONDS` mặc định của backend — gửi sớm hơn là chắc chắn bị từ chối. */
const RESEND_COOLDOWN_SEC = 60;

export type ContactVerifyStep = 'identifier' | 'code';

/**
 * Máy trạng thái đổi email / số điện thoại: nhập định danh mới → nhận mã → xác nhận.
 * Bản native của `apps/web/src/features/account/hooks/use-contact-verify.ts`.
 *
 * Một hook cho cả hai kênh vì các bước, bộ đếm gửi lại và cách hiển thị lỗi giống hệt nhau; chỉ
 * hai hàm gọi API là khác, và chúng được chọn bằng `channel` ngay ở đây thay vì để màn hình phải
 * mang theo bốn hàm.
 *
 * Cố ý KHÔNG giữ giá trị đang gõ: ô nhập thuộc về form của màn hình (React Hook Form), còn hook
 * này chỉ giữ thứ mà form không biết — đang ở bước nào, còn bao lâu mới gửi lại được, và địa chỉ
 * nào đã THỰC SỰ được gửi mã (người dùng có thể sửa ô nhập sau khi bấm gửi).
 */
export function useContactVerify(channel: ContactChannel) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<ContactVerifyStep>('identifier');
  /** Định danh mã đã gửi TỚI — không phải giá trị đang có trong ô nhập. */
  const [sentTo, setSentTo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  const counting = cooldown > 0;
  useEffect(() => {
    if (!counting) return undefined;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
    // Chỉ (re)tạo timer khi BẬT/TẮT đếm ngược, không phải mỗi giây.
  }, [counting]);

  const send = useMutation({
    mutationFn: (identifier: string) =>
      channel === CONTACT_CHANNEL.PHONE
        ? accountApi.sendPhoneOtp({ phone: identifier })
        : accountApi.sendEmailOtp({ email: identifier }),
    onSuccess: (result, identifier) => {
      setSentTo(identifier);
      setDevCode(result.devCode ?? null);
      setCooldown(RESEND_COOLDOWN_SEC);
      setStep('code');
    },
  });

  const verify = useMutation({
    mutationFn: (code: string) =>
      channel === CONTACT_CHANNEL.PHONE
        ? accountApi.verifyPhone({ phone: sentTo, code })
        : accountApi.verifyEmail({ email: sentTo, code }),
    onSuccess: (profile: UserProfile) => {
      /*
       * Ghi thẳng hồ sơ mới vào cache rồi mới invalidate `auth.me`: email/SĐT vừa đổi phải hiện
       * ngay trên chính màn hình người dùng đang đứng, còn `auth.me` là nguồn của thanh trên và
       * menu ở khắp nơi — thiếu vế thứ hai thì hai chỗ nói hai đằng tới lần mở app sau.
       */
      queryClient.setQueryData(queryKeys.account.profile(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });

  const reset = useCallback(() => {
    setStep('identifier');
    setSentTo('');
    setDevCode(null);
    setCooldown(0);
    send.reset();
    verify.reset();
  }, [send, verify]);

  /** Quay lại bước nhập để sửa định danh — GIỮ NGUYÊN đếm ngược, vì mã đã thực sự được gửi đi. */
  const editIdentifier = useCallback(() => {
    setStep('identifier');
    verify.reset();
  }, [verify]);

  return {
    step,
    sentTo,
    cooldown,
    devCode,
    sending: send.isPending,
    verifying: verify.isPending,
    /** Mã đã đúng và hồ sơ đã đổi — màn hình dùng nó để đóng tấm trượt và chúc mừng. */
    verified: verify.isSuccess,
    /** Lỗi của bước đang đứng — màn hình đổi nó thành chữ qua `useErrorMessage` (ADR 0012). */
    error: send.error ?? verify.error,
    send: (identifier: string) => send.mutate(identifier),
    verify: (code: string) => verify.mutate(code),
    reset,
    editIdentifier,
  };
}
