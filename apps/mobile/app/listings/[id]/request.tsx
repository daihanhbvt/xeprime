import { useLocalSearchParams } from 'expo-router';
import { RequestBookingScreen } from '@/features/booking-requests/RequestBookingScreen';

/**
 * Gửi yêu cầu thuê (BKG-01) — CÔNG KHAI, không bọc `RequireSession`.
 *
 * Khách vãng lai đặt được: xác thực SĐT bằng OTP là đủ, và server tạo tài khoản rồi trả luôn
 * cặp token trong biên nhận (mục 1.1 của kế hoạch). Dựng tường đăng nhập ở đây là chặn đúng
 * nhóm khách đông nhất.
 */
export default function RequestBookingRoute() {
  const { id, serviceType } = useLocalSearchParams<{ id: string; serviceType?: string }>();

  return (
    <RequestBookingScreen
      vehicleId={id}
      {...(serviceType ? { initialServiceType: serviceType } : {})}
    />
  );
}
