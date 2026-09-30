import { memo } from 'react';
import { ScrollView } from 'react-native';
import { XStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Chip } from '@/components/ui/Chip';
import { ROUTES } from '@/navigation/routes';
import {
  VEHICLE_EDIT_TAB,
  VEHICLE_EDIT_TAB_ORDER,
  type VehicleEditTab,
} from '@/navigation/vehicle-edit-tab';
import { colors, space } from '@/theme/tokens';

/**
 * Dải SÁU tab của khu sửa xe — bản native của `<Tabs>` trong `VehicleEditWorkspace`.
 *
 * Web giữ cả sáu tab trong MỘT trang nên đổi tab là đổi state; app cho mỗi tab một route riêng
 * (bàn phím, cuộn và nút Lui của native đều mong đợi như vậy), nên đổi tab là `router.replace`.
 * `replace` chứ không `push`: nhảy qua lại năm tab rồi bấm Lui phải về danh sách xe, không phải
 * lùi ngược năm lần qua chính những tab vừa xem. Cũng vì thế không cần `useNavigateOnce` — thay
 * màn tại chỗ thì không xếp chồng được.
 *
 * `guard` dành cho màn còn thay đổi chưa lưu: nó nhận ý định rời đi và tự quyết hỏi hay không
 * (`useLeaveGuard`). Màn không có form thì bỏ trống.
 */
export const VehicleEditTabs = memo(function VehicleEditTabs({
  vehicleId,
  active,
  guard,
}: {
  vehicleId: string;
  active: VehicleEditTab;
  guard?: (go: () => void) => void;
}) {
  const t = useTranslations('Vehicles.edit.tabs');
  const router = useRouter();

  const open = (tab: VehicleEditTab) => {
    if (tab === active) return;
    const go = () => router.replace(ROUTES.manage.vehicleEditTab(vehicleId, tab));
    if (guard) guard(go);
    else go();
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ backgroundColor: colors.surface, flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        gap: space.xs,
      }}
    >
      <XStack gap={space.xs} accessibilityRole="tablist">
        {VEHICLE_EDIT_TAB_ORDER.map((tab) => (
          <Chip
            key={tab}
            label={tabLabel(t, tab)}
            selected={tab === active}
            onPress={() => open(tab)}
          />
        ))}
      </XStack>
    </ScrollView>
  );
});

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function tabLabel(
  t: ReturnType<typeof useTranslations<'Vehicles.edit.tabs'>>,
  tab: VehicleEditTab,
): string {
  switch (tab) {
    case VEHICLE_EDIT_TAB.MEDIA:
      return t('media');
    case VEHICLE_EDIT_TAB.PRICING:
      return t('pricing');
    case VEHICLE_EDIT_TAB.SOURCE:
      return t('source');
    case VEHICLE_EDIT_TAB.DOCUMENTS:
      return t('documents');
    case VEHICLE_EDIT_TAB.MAINTENANCE:
      return t('maintenance');
    default:
      return t('information');
  }
}
