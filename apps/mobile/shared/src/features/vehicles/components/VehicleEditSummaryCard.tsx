import { memo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { useVehicle } from '../hooks/use-vehicle';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import { VehicleEditHeaderCard } from './VehicleEditHeaderCard';

/**
 * Thẻ tóm tắt xe + công tắc "Trên chợ" ở đầu MỌI tab sửa xe - web `VehicleEditWorkspace` vẽ
 * `VehicleEditSummary` cạnh mọi mục, không chỉ "Thông tin chung" (người dùng chốt 17/11/2026).
 *
 * Tự đọc xe từ cache `useVehicle` (màn chứa nó đã tải), nên mỗi tab chỉ cần một dòng. `guard` là
 * `useLeaveGuard().guard` của tab: bấm ảnh để sang tab Hình ảnh khi form còn dở phải hỏi trước.
 */
export const VehicleEditSummaryCard = memo(function VehicleEditSummaryCard({
  vehicleId,
  tab,
  guard,
}: {
  vehicleId: string;
  tab: VehicleEditTab;
  guard?: (go: () => void) => void;
}) {
  const router = useRouter();
  const { has } = usePermissions();
  const can = useVehicleCapabilities();
  const vehicle = useVehicle(vehicleId, has(PERMISSION.VEHICLE_VIEW));

  const openImages = useCallback(() => {
    const go = () => router.replace(ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.MEDIA));
    if (guard) guard(go);
    else go();
  }, [guard, router, vehicleId]);

  if (!vehicle.data) return null;
  return (
    <VehicleEditHeaderCard
      vehicle={vehicle.data}
      {...(tab !== VEHICLE_EDIT_TAB.MEDIA ? { onEditImages: openImages } : {})}
      statusEditable={has(PERMISSION.VEHICLE_UPDATE)}
      showSource={can.source}
    />
  );
});
