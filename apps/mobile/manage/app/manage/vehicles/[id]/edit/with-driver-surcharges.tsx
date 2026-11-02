import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

/**
 * BÍ DANH — phụ phí tài xế đã gỡ (ADR 0075); link cũ mở "Nhận chuyến & thủ tục" của dịch vụ có
 * tài xế (web `TAB_ALIAS`).
 */
export default function LegacyEditWithDriverSurchargesRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION)} />;
}
