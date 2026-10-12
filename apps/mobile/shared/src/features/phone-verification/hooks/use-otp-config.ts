import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { getOtpConfig } from '../api';

/**
 * Môi trường có nhận mã OTP test không (dev/staging) — bản native của `useOtpTestCodeEnabled` web.
 * Có thì giao diện cho nhập mã ngay, không bắt gửi SMS trước. Cấu hình đổi theo lần deploy ⇒ đọc
 * một lần, giữ suốt phiên. Đang tải hoặc lỗi ⇒ `false`: rơi về luồng chuẩn như production.
 */
export function useOtpTestCodeEnabled(): boolean {
  const q = useQuery({
    queryKey: queryKeys.auth.otpConfig(),
    queryFn: getOtpConfig,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  return q.data?.testCodeEnabled ?? false;
}
