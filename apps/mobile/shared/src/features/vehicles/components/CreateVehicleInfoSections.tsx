import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE_VALUES,
  type VehicleRegistrationReading,
  type VehicleType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { LineIcon } from '@/components/icons/LineIcon';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SelectField } from '@/components/ui/SelectField';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { RegistrationCaptureState } from '../registration-capture';
import { VEHICLE_SOURCE_ICON } from '../source-icons';
import { RegistrationFieldInputs } from './RegistrationCapture';
import { RegistrationTextField } from './RegistrationTextField';
import { BodyTypePicker } from './VehicleFormSteps';
import { VehicleEnergyCardFields, VehicleIdentityCardFields } from './VehicleInfoFormSections';

/**
 * Thẻ "Thông tin xe" của bước 1 wizard thêm xe - Figma Thêm xe MB (`24486:108619`): khay "Ô tô · Xe
 * máy", rồi Biển số · Chi nhánh giữ xe · cà vẹt (Tên chủ xe, "Số khung xe | Số máy xe") · Hãng | Dòng
 * · Năm | Màu · Số chỗ | Giá trị xe · Nhiên liệu, hộp số và thông số năng lượng.
 *
 * Không có ô "Tên xe": server ghép từ Hãng + Dòng + Phiên bản + Năm (ADR 0102), tấm xác nhận hiện tên
 * đó. Các ô Figma chưa vẽ nhưng web có (tên chủ xe, phiên bản, giá trị xe, ô năng lượng theo nhiên
 * liệu) giữ nguyên - người dùng chốt 27/11/2026 "làm như website".
 */
export function CreateVehicleInfoCard({
  control,
  isCar,
  setValue,
  branchOptions,
  branchLoading,
  hideBranch,
  registration,
  onRegistrationChange,
  vehiclePlate,
  showRegistrationErrors,
}: {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  setValue: UseFormSetValue<VehicleFormValues>;
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  /** Tuyến hoa hồng chỉ có MỘT chi nhánh: ẩn ô (đã chọn sẵn) như web `branchHidden`. */
  hideBranch: boolean;
  registration: RegistrationCaptureState;
  onRegistrationChange: (
    update: (prev: RegistrationCaptureState) => RegistrationCaptureState,
  ) => void;
  vehiclePlate: string | null | undefined;
  showRegistrationErrors: boolean;
}) {
  const t = useTranslations('Vehicles.form');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const domainLabel = useDomainLabel();
  const typeItems = useMemo(
    () => VEHICLE_TYPE_VALUES.map((value) => ({ key: value, label: domainLabel('vehicleType', value) })),
    [domainLabel],
  );
  const registrationLabels = useMemo(
    () => ({
      chassisNumber: { label: tCreate('chassisLabel'), placeholder: tCreate('chassisPlaceholder') },
      engineNumber: { label: tCreate('engineLabel'), placeholder: tCreate('enginePlaceholder') },
    }),
    [tCreate],
  );
  const reading: VehicleRegistrationReading | null = registration.reading;

  return (
    <InfoGroupCard title={tCreate('infoTitle')}>
      <Controller
        control={control}
        name="vehicleType"
        render={({ field }) => (
          <SegmentedTabs<VehicleType>
            items={typeItems}
            value={field.value as VehicleType}
            onChange={field.onChange}
            variant="neutral"
          />
        )}
      />
      <RegistrationTextField
        control={control}
        name="plateNumber"
        reading={reading}
        label={t('specs.plateNumber')}
        required
        placeholder={t('specs.platePlaceholder')}
        hint={t('specs.plateHelp')}
        hintInLabel
        autoCapitalize="characters"
      />
      {hideBranch ? null : (
        <SelectField
          control={control}
          name="branchId"
          label={t('basic.branch')}
          options={branchOptions}
          hint={branchLoading ? undefined : t('basic.branchHelp')}
          required
        />
      )}
      <RegistrationFieldInputs
        state={registration}
        onChange={onRegistrationChange}
        vehiclePlate={vehiclePlate}
        showErrors={showRegistrationErrors}
        paired
        labels={registrationLabels}
      />
      <VehicleIdentityCardFields
        control={control}
        isCar={isCar}
        setValue={setValue}
        bodyTypeElsewhere
        registrationReading={reading}
        creating
      />
      <VehicleEnergyCardFields control={control} isCar={isCar} setValue={setValue} fuelTypeRequired />
    </InfoGroupCard>
  );
}

/** Thẻ "Kiểu dáng xe" (chỉ ô tô) - dải thẻ ảnh vuốt ngang, như màn sửa xe (Figma `24486:111887`). */
export function CreateBodyTypeCard({ control }: { control: Control<VehicleFormValues> }) {
  const tInfo = useTranslations('Vehicles.editor.information');
  const carousel = useMemo(
    () => ({ prevLabel: tInfo('bodyTypePrev'), nextLabel: tInfo('bodyTypeNext') }),
    [tInfo],
  );
  return (
    <InfoGroupCard title={tInfo('bodyType')} extra={tInfo('bodyTypeSwipe')}>
      <BodyTypePicker control={control} carousel={carousel} />
    </InfoGroupCard>
  );
}

/** Ô icon tròn: đệm 8 quanh icon 24 (Figma "Icon" `24486:112022`). */
const SOURCE_ICON_PAD = space.sm;
const SOURCE_ICON_SIZE = 24;

/**
 * Thẻ "Hình thức nguồn xe" - lưới 2x2 có icon (Figma `24486:111954`). Nhãn giữ theo hệ thống (người
 * dùng chốt 27/11/2026: không dùng "Cọc tiền" cho hợp tác/ký gửi); bỏ dòng mô tả và ghi chú.
 */
export function CreateSourceTypeCard({ control }: { control: Control<VehicleFormValues> }) {
  const colors = useColors();
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const domainLabel = useDomainLabel();
  return (
    <InfoGroupCard title={tCreate('sourceTitle')}>
      <Controller
        control={control}
        name="sourceType"
        render={({ field, fieldState }) => (
          <YStack gap={space.xs}>
            <XStack flexWrap="wrap" gap={space.md} accessibilityRole="radiogroup">
              {VEHICLE_SOURCE_TYPE_VALUES.map((value) => {
                const checked = field.value === value;
                const label = domainLabel('vehicleSourceType', value);
                return (
                  <Pressable
                    key={value}
                    style={TILE}
                    onPress={() => field.onChange(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked }}
                    accessibilityLabel={label}
                  >
                    <XStack
                      ai="center"
                      gap={space.md}
                      px={space.lg}
                      py={space.md}
                      br={radius.card}
                      bw={1}
                      bc={checked ? colors.brandShape : colors.border}
                      bg={checked ? colors.brandWash : colors.surface}
                    >
                      <YStack
                        p={SOURCE_ICON_PAD}
                        br={radius.pill}
                        bg={checked ? colors.brandLow : colors.barIdle}
                      >
                        <LineIcon
                          name={VEHICLE_SOURCE_ICON[value]}
                          size={SOURCE_ICON_SIZE}
                          color={checked ? colors.brandShape : colors.placeholder}
                        />
                      </YStack>
                      <Text
                        f={1}
                        minWidth={0}
                        col={checked ? colors.brandShape : colors.text}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                        fow={fontWeight.semibold}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </XStack>
                  </Pressable>
                );
              })}
            </XStack>
            {fieldState.error?.message ? (
              <Text col={colors.danger} fos={typeScale.label.fontSize}>
                {fieldState.error.message}
              </Text>
            ) : null}
          </YStack>
        )}
      />
    </InfoGroupCard>
  );
}

/** Hai cột trừ nửa khe 12. */
const TILE = { width: '47.5%' } as const;
