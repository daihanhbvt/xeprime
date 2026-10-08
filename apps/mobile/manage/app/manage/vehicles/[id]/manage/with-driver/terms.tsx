import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { RENTAL_TERMS_ANCHOR, VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';

/** Đường dẫn CŨ (trước 30/09/2026) — thủ tục có tài xế nay nằm trong "Nhận chuyến & thủ tục". Cùng chuyển hướng với trang web. */
export default function LegacyWithDriverTermsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Redirect
      href={ROUTES.account.vehicleManageSection(
        id,
        VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
        { anchor: RENTAL_TERMS_ANCHOR },
      )}
    />
  );
}
