import { useLocalSearchParams } from 'expo-router';
import { RequestBookingScreen } from '@/features/booking-requests/RequestBookingScreen';

/**
 * Gửi yêu cầu thuê (BKG-01) — route CÔNG KHAI, không bọc `RequireSession`: khách chọn chuyến và
 * xem giá khi chưa đăng nhập. Lượt GỬI cần tài khoản khách có SĐT đã xác minh (ADR 0060) — màn
 * tự mời đăng nhập ở nút "Tiếp tục" và giữ bản nháp trong bộ nhớ.
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
