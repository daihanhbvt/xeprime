import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE_VALUES, type ServiceType } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { RowDivider, SwitchRow } from '@/components/ui/SwitchRow';
import { useServiceToggle } from '@/features/vehicle-manage/hooks/use-service-toggle';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { useColors } from '@/theme/ThemeProvider';
import { space, typeScale } from '@/theme/tokens';
import type { VehicleDetail } from '../api';

/**
 * Đầu mục "Dịch vụ xe" - bản native của dải tab dịch vụ + công tắc của `ServicesPane` web, dựng theo
 * Figma Partner `24237:38682`:
 *
 *  - Dải tab "Xe tự lái · Xe có tài xế · Xe dài hạn" (khay `SegmentedTabs` neutral), mỗi tab một
 *    chấm 6px sau nhãn: xanh = dịch vụ đang bật, đỏ = tắt. Như web: LUÔN đủ ba tab, chỉ hiện công tắc
 *    và khối giá của tab đang mở.
 *  - Một "Nhóm thông tin": công tắc bật/tắt dịch vụ của tab + câu gợi ý (link sang mục Bảo hiểm & Giao
 *    nhận xe), rồi `children` (hàng "Tự động đồng ý nhận chuyến") sau một đường kẻ.
 *
 * Công tắc đi CÙNG đường ghi `useServiceToggle` (gửi đủ `serviceTypes`, hỏi lại khi tắt dịch vụ đang
 * có giá riêng); bị chặn thì nói lý do thay vì mờ đi im lặng.
 */
export function VehicleServiceToggles({
  vehicle,
  canEdit,
  active,
  onSelect,
  policyHref,
  children,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  /** Tab dịch vụ đang mở - web `ServicesPane` chỉ hiện công tắc + giá của MỘT dịch vụ mỗi lần. */
  active: ServiceType;
  onSelect: (service: ServiceType) => void;
  /**
   * Đích của link trong câu gợi ý - mục Bảo hiểm & Giao nhận xe của ĐÚNG khu đang đứng.
   * Bỏ trống = mục của màn sửa xe gian hàng.
   */
  policyHref?: Href;
  /** Hàng thêm trong cùng thẻ, sau đường kẻ (Figma: "Tự động đồng ý nhận chuyến"). */
  children?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.editor.services');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const toggle = useServiceToggle(vehicle, canEdit);
  const services = vehicle.serviceTypes ?? [];
  const on = services.includes(active);
  const reason = toggle.blockedReason(active, !on);

  const items = SERVICE_TYPE_VALUES.map((service) => {
    const serviceOn = services.includes(service);
    const label = t(`tab.${service}` as 'tab.self_drive');
    return {
      key: service,
      label,
      dotColor: serviceOn ? colors.successVivid : colors.danger,
      accessibilityLabel: `${label}, ${serviceOn ? t('on') : t('off')}`,
    };
  });

  return (
    <>
      {/* `fit`: ô rộng theo nhãn - "Xe có tài xế" không bị cắt, hai ô ngắn co lại (người dùng 27/11/2026). */}
      <SegmentedTabs items={items} value={active} onChange={onSelect} variant="neutral" fit />
      <InfoGroupCard>
        <SwitchRow
          title={t(`toggle.${active}.title` as 'toggle.self_drive.title')}
          description={t.rich('toggle.hint', {
            service: t(`toggle.${active}.target` as 'toggle.self_drive.target'),
            // Web `ServicesPane`: tên mục trong câu gợi ý là LINK sang mục đó.
            conditions: (chunks) => (
              <Text
                col={colors.brandMoney}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
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
          value={on}
          disabled={!canEdit || toggle.pending}
          onChange={() => {
            if (reason) toast.showInfo(reason);
            else toggle.toggle(active, !on);
          }}
        />
        {on ? null : (
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t('offNote')}
          </Text>
        )}
        {children ? (
          <YStack gap={space.sm + space.xs}>
            {/* Figma `24237:56662`: đường kẻ #fafafa giữa hai hàng công tắc của thẻ này. */}
            <RowDivider tone="faint" />
            {children}
          </YStack>
        ) : null}
      </InfoGroupCard>
      {toggle.dialog}
    </>
  );
}
