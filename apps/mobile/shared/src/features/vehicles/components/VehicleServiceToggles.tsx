import { Pressable } from 'react-native';
import type { Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  SERVICE_TYPE_VALUES,
  type ServiceType,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useServiceToggle } from '@/features/vehicle-manage/hooks/use-service-toggle';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { VehicleDetail } from '../api';
import { layout } from '@/theme/layout';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

const DOT = 8;
/** Ba tab chia đều bề ngang. */
const TAB_STYLE = { flex: 1, minWidth: 0 } as const;

/**
 * Đầu mục "Dịch vụ xe" — bản native của dải tab dịch vụ + `ToggleRow` của `ServicesPane` web (sổ
 * redesign §3.6 E8): mỗi dịch vụ một dòng có chấm xanh/xám (bật/tắt) và công tắc bật/tắt dịch vụ.
 * Như web: ba tab, chỉ hiện công tắc và khối giá của tab đang mở (màn giá lọc theo `active`). Công tắc đi CÙNG đường ghi `useServiceToggle` (gửi đủ `serviceTypes`, hỏi lại khi tắt
 * dịch vụ đang có giá riêng); bị chặn thì nói lý do thay vì mờ đi im lặng.
 */
export function VehicleServiceToggles({
  vehicle,
  canEdit,
  active,
  onSelect,
  policyHref,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  /** Tab dịch vụ đang mở - web `ServicesPane` chỉ hiện công tắc + giá của MỘT dịch vụ mỗi lần. */
  active: ServiceType;
  onSelect: (service: ServiceType) => void;
  /**
   * Đích của link "Chính sách thuê" trong câu gợi ý — mục Chính sách thuê của ĐÚNG khu đang đứng.
   * Bỏ trống = mục của màn sửa xe gian hàng.
   */
  policyHref?: Href;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.editor.services');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const toggle = useServiceToggle(vehicle, canEdit);
  const services = vehicle.serviceTypes ?? [];
  /* Web `ServicesPane`: LUÔN đủ ba tab (dịch vụ tắt vẫn bật lên được ngay tại đây). */
  const allowed = SERVICE_TYPE_VALUES;
  const on = services.includes(active);
  const reason = toggle.blockedReason(active, !on);

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader icon="apps-outline">{t('tabsLabel')}</SectionHeader>
        {/* Dải tab dịch vụ - chấm xanh = đang bật, xám = tắt (ledger §3.6 E8). */}
        {/* Dạng TAB ngang chia đều (người dùng chốt 17/11/2026): khối xám, tab đang chọn nền trắng. */}
        <XStack
          gap={space.xs}
          p={space.xs}
          br={radius.control}
          bg={colors.surfaceMuted}
          bw={1}
          bc={colors.border}
          accessibilityRole="tablist"
          accessibilityLabel={t('tabsLabel')}
        >
          {allowed.map((service) => {
            const serviceOn = services.includes(service);
            const selected = service === active;
            return (
              <Pressable
                key={service}
                style={TAB_STYLE}
                onPress={() => onSelect(service)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <XStack
                  ai="center"
                  jc="center"
                  gap={space.xs}
                  px={space.xs}
                  py={space.sm}
                  br={radius.md}
                  bg={selected ? colors.surface : 'transparent'}
                  bw={selected ? 1 : 0}
                  bc={colors.border}
                >
                  <YStack
                    w={DOT}
                    h={DOT}
                    br={radius.pill}
                    bg={serviceOn ? colors.success : colors.danger}
                    accessibilityLabel={serviceOn ? t('on') : t('off')}
                  />
                  <Text
                    flexShrink={1}
                    col={colors.text}
                    fos={fontSize.label}
                    fow={selected ? fontWeight.semibold : fontWeight.regular}
                    numberOfLines={1}
                    ta="center"
                  >
                    {t(`toggle.${service}.title` as 'toggle.self_drive.title')}
                  </Text>
                </XStack>
              </Pressable>
            );
          })}
        </XStack>
        <ToggleRow
          label={t(`toggle.${active}.title` as 'toggle.self_drive.title')}
          // Hiện bật cả lúc hộp nhập giá có tài xế đang mở; huỷ hộp thì về tắt (web `ServicesPane`).
          checked={on || toggle.showsOn(active)}
          disabled={!canEdit || toggle.pending}
          onToggle={() => {
            if (reason) toast.showInfo(reason);
            else toggle.toggle(active, !on);
          }}
        />
        {/* Web `ServicesPane`: "Chính sách thuê" trong câu gợi ý là LINK sang mục đó. */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('toggle.hint', {
            service: t(`toggle.${active}.target` as 'toggle.self_drive.target'),
            conditions: (chunks) => (
              <Text
                col={colors.primaryActive}
                fow={fontWeight.semibold}
                accessibilityRole="link"
                onPress={() =>
                  navigateOnce(
                    policyHref ?? ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.POLICY),
                  )
                }
              >
                {chunks}
              </Text>
            ),
          })}
        </Text>
        {on ? null : (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('offNote')}
          </Text>
        )}
      </YStack>
      {toggle.dialog}
    </Card>
  );
}
