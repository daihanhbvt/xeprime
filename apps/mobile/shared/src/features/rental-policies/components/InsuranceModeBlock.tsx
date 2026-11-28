import { useController, type Control } from 'react-hook-form';
import { Text, YStack, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  INSURANCE_ELIGIBILITY_GAP,
  INSURANCE_MODE,
  INSURANCE_MODE_DEFAULT,
  INSURANCE_MODE_VALUES,
  type InsuranceMode,
} from '@xeprime/types';
import type { ShopInsuranceImpact } from '@/api/rental-policies/api';
import { Callout } from '@/components/ui/Callout';
import { FieldLabel } from '@/components/ui/Field';
import { InfoHint } from '@/components/ui/InfoHint';
import { InlineAction } from '@/components/ui/InlineAction';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { ChoiceRow } from '@/components/ui/ChoiceRow';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import type { PolicyFormValues } from '../schema';

/** Số tên xe hiện trong cảnh báo - phần còn lại gộp thành "và N xe khác". */
const IMPACT_NAMES_SHOWN = 5;

/** Mục của màn sửa xe nơi chủ xe bổ sung từng thứ còn thiếu - web `GAP_TAB`. */
const GAP_TAB: Partial<Record<string, VehicleEditTab>> = {
  [INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING]: VEHICLE_EDIT_TAB.INFORMATION,
  [INSURANCE_ELIGIBILITY_GAP.VEHICLE_INFO_MISSING]: VEHICLE_EDIT_TAB.INFORMATION,
  [INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING]: VEHICLE_EDIT_TAB.MEDIA,
  [INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING]: VEHICLE_EDIT_TAB.DOCUMENTS,
};

/** Điều kiện bảo hiểm của MỘT xe (chính sách riêng của xe) - `gaps` rỗng = xe đủ điều kiện. */
export interface VehicleInsuranceReadiness {
  vehicleId: string;
  gaps: readonly string[];
}

/**
 * Bảo hiểm vật chất xe MIC: Bắt buộc hay Tuỳ chọn (ADR 0091 điều 1) - bản native của web
 * `InsuranceModeBlock`, một khối cho chính sách mặc định của gian hàng (theo loại xe) và chính sách
 * riêng của một xe.
 *
 * Nơi gọi chỉ dựng khối khi nền tảng ĐANG bán bảo hiểm theo bậc và đó là ô tô (`applies`). `impact`
 * (chỉ màn gian hàng) liệt kê xe kế thừa thiếu dữ liệu - hiện khi đang chọn Bắt buộc. Server vẫn là
 * nơi chặn thật.
 */
export function InsuranceModeBlock<T extends PolicyFormValues>({
  control,
  disabled,
  impact,
  vehicle,
  headless = false,
}: {
  control: Control<T>;
  disabled: boolean;
  impact?: ShopInsuranceImpact | null | undefined;
  /** Màn giá của MỘT xe: chế độ Bắt buộc mà xe còn thiếu dữ liệu ⇒ liệt kê từng thiếu (web, 20/11/2026). */
  vehicle?: VehicleInsuranceReadiness | null | undefined;
  /** Thẻ nơi gọi đã có tiêu đề + ⓘ (Figma `24238:57800`) - bỏ hàng nhãn lặp lại bên trong. */
  headless?: boolean;
}) {
  const t = useTranslations('Shop.policies.workspace.insurance');
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const { field } = useController({
    control: control as unknown as Control<PolicyFormValues>,
    name: 'insuranceMode',
  });
  const mode = (field.value ?? INSURANCE_MODE_DEFAULT) as InsuranceMode;
  const required = mode === INSURANCE_MODE.REQUIRED;
  const affected = required && impact ? impact.total : 0;
  const vehicleGaps = required && vehicle ? vehicle.gaps : [];
  const names = impact?.vehicles.slice(0, IMPACT_NAMES_SHOWN).map((v) => v.name) ?? [];

  return (
    <YStack gap={space.sm + space.xs}>
      {headless ? null : (
        <XStack ai="center" gap={space.xs}>
          <FieldLabel label={t('title')} />
          <InfoHint label={t('tipLabel')} content={t('hint')} />
        </XStack>
      )}
      {/* Figma "Checkbox" radio v2 (`24238:58634`): hàng không khung, vòng 16. */}
      {INSURANCE_MODE_VALUES.map((value) => (
        <ChoiceRow
          key={value}
          kind="radio"
          label={domainLabel('insuranceMode', value)}
          hint={value === INSURANCE_MODE.REQUIRED ? t('modeRequiredApp') : t('modeOptional')}
          checked={value === mode}
          disabled={disabled}
          onPress={() => field.onChange(value)}
        />
      ))}
      {affected > 0 ? (
        <Callout tone="warning" title={t('impactTitle', { count: affected })}>
          {affected > names.length
            ? t('impactNamesMore', { names: names.join(LIST_SEPARATOR), count: affected - names.length })
            : names.join(LIST_SEPARATOR)}
        </Callout>
      ) : null}
      {vehicle && vehicleGaps.length > 0 ? (
        <Callout tone="warning" title={t('vehicleBlockedTitle')}>
          <YStack gap={space.xs}>
            {vehicleGaps.map((gap) => {
              const tab = GAP_TAB[gap];
              const label = domainLabel('insuranceEligibilityGap', gap);
              return tab ? (
                <InlineAction
                  key={gap}
                  label={`• ${label}`}
                  onPress={() => navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.vehicleId, tab))}
                />
              ) : (
                <Text key={gap}>{`• ${label}`}</Text>
              );
            })}
          </YStack>
        </Callout>
      ) : null}
    </YStack>
  );
}
