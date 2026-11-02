import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';

/**
 * Đường dẫn CŨ — phụ phí tài xế đã gỡ (ADR 0075): giá có tài xế là giá trọn gói. Link cũ mở
 * "Nhận chuyến & thủ tục" của dịch vụ có tài xế (cùng chuyển hướng với trang web).
 */
export default function LegacyWithDriverSurchargesRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect
      href={ROUTES.account.vehicleManageSection(id, VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION)}
    />
  );
}
