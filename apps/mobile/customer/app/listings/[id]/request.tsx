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
  const { id, serviceType, provinceCode } = useLocalSearchParams<{
    id: string;
    serviceType?: string;
    /** Tỉnh đang lọc ở màn tìm xe — điền sẵn ô địa chỉ giao xe (ADR 0035). */
    provinceCode?: string;
  }>();

  return (
    <RequestBookingScreen
      vehicleId={id}
      {...(serviceType ? { initialServiceType: serviceType } : {})}
      {...(provinceCode ? { deliveryProvinceCode: provinceCode } : {})}
    />
  );
}
