import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  CATALOG_TYPE,
  SERVICE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  isVehicleServiceTypeAllowed,
  vehicleFeatureAppliesTo,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useServiceToggle } from '@/features/vehicle-manage/hooks/use-service-toggle';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, space } from '@/theme/tokens';
import type { VehicleDetail } from '../api';
import { VehicleClassificationFields } from './VehicleClassificationFields';
import { VehicleEnergyFields, useTransmissionOptions } from './VehicleEnergyFields';
import { BodyTypePicker, FeaturesField, Notice } from './VehicleFormSteps';
import { VehicleIdentityFields } from './VehicleIdentityFields';

/*
 * Các khối của mục "Thông tin xe & tiện ích" trên màn sửa xe (cổng quản lý) — bản native của
 * `BasicSection(hideServiceTypes)` · `VehicleIdentitySection` · `VehicleEnergySection` ·
 * `FeaturesDescriptionSection` · `DimensionsSection` · `EngineOutputSection` · `ConsumptionSection`
 * bên web (30/09/2026). Tách khỏi `VehicleFormSteps` (khối của wizard tạo xe) vì web cũng chia
 * đúng như vậy: màn sửa có bốn thẻ cơ bản + ba thẻ nâng cao, wizard thì không.
 */

interface SectionProps {
  control: Control<VehicleFormValues>;
}

/** Trần mô tả — khớp `vehicleFormSchema.description` và `maxLength={4000}` của web. */
const DESCRIPTION_MAX = 4000;

/**
 * Thẻ "Thông tin chung": tên · mã (chỉ đọc) · chi nhánh · loại xe. KHÔNG có ô dịch vụ và trạng
 * thái vận hành — dịch vụ lưu ngay bằng `VehicleServiceChips` bên dưới, trạng thái sửa trên thẻ
 * đầu xe.
 *
 * Loại xe KHÔNG khoá ở đây dù xe đã duyệt — đúng `BasicSection` bên web (chỉ khoá trong phiên hỗ
 * trợ); server mới là lớp chặn thật với `VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS`.
 */
export function VehicleGeneralFields({
  control,
  branchOptions,
  branchLoading,
  branchDisabled,
}: SectionProps & {
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  /** Web `branchDisabled={!canUpdate}`. */
  branchDisabled: boolean;
}) {
  const t = useTranslations('Vehicles.form.basic');
  const domainLabel = useDomainLabel();
  const vehicleTypeOptions = VEHICLE_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('vehicleType', value),
  }));

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="name"
        label={t('name')}
        placeholder={t('namePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="code"
        label={t('code')}
        placeholder={t('codePlaceholder')}
        editable={false}
      />
      <SelectField
        control={control}
        name="branchId"
        label={t('branch')}
        options={branchOptions}
        hint={branchLoading ? undefined : t('branchHelp')}
        disabled={branchDisabled}
        required
      />
      <SelectField
        control={control}
        name="vehicleType"
        label={t('vehicleType')}
        options={vehicleTypeOptions}
        required
      />
      <VehicleTypePolicyWarning control={control} />
    </YStack>
  );
}

/** Đổi loại xe ⇒ xe kế thừa chính sách thuê mặc định của loại mới — nói trước khi lưu (web). */
function VehicleTypePolicyWarning({ control }: SectionProps) {
  const t = useTranslations('Vehicles.form.warnings');
  const domainLabel = useDomainLabel();
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const { defaultValues } = useFormState({ control });
  const initial = defaultValues?.vehicleType;
  if (!initial || initial === vehicleType) return null;

  return (
    <Notice
      tone="info"
      title={t('typePolicyTitle', { label: domainLabel('vehicleType', vehicleType) })}
      body={t('typePolicyBody')}
    />
  );
}

/**
 * Loại dịch vụ — nhãn bấm là LƯU NGAY, cùng đường ghi với công tắc trên mục lục quản lý xe
 * (`useServiceToggle`): gửi `serviceTypes` đầy đủ, không bao giờ rỗng, hỏi lại khi tắt một dịch
 * vụ đang có giá riêng. Bản native của `VehicleServiceChips` bên web.
 *
 * Nhãn bị chặn KHÔNG mờ đi im lặng: chạm vào thì nói lý do (web nói bằng tooltip).
 */
export function VehicleServiceChips({
  vehicle,
  canEdit,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
}) {
  const t = useTranslations('Vehicles.form.basic');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const toggle = useServiceToggle(vehicle, canEdit);
  const value = vehicle.serviceTypes ?? [];

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={t('serviceTypes')} required />
      <XStack flexWrap="wrap" gap={space.xs} accessibilityLabel={t('serviceTypes')}>
        {SERVICE_TYPE_VALUES.map((service) => {
          const checked = value.includes(service);
          const allowed = isVehicleServiceTypeAllowed(vehicle.vehicleType, service);
          const reason = toggle.blockedReason(service, !checked);
          const locked = !canEdit || toggle.pending || (!checked && !allowed) || Boolean(reason);
          return (
            <YStack key={service} opacity={locked && !checked ? 0.6 : 1}>
              <Chip
                label={domainLabel('serviceType', service)}
                selected={checked}
                {...(checked ? { icon: 'checkmark' as const } : {})}
                role="button"
                onPress={() => {
                  if (reason) toast.showInfo(reason);
                  else if (!locked) toggle.toggle(service, !checked);
                }}
              />
            </YStack>
          );
        })}
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('serviceTypesHelp')}
      </Text>
      {toggle.dialog}
    </YStack>
  );
}

/** Thẻ "Nhận dạng xe": biển số · hãng/mẫu · năm SX · màu · phân loại. */
export function VehicleIdentityCardFields({
  control,
  isCar,
  lockedNotice,
  setValue,
}: SectionProps & {
  isCar: boolean;
  lockedNotice?: string | undefined;
  setValue: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="plateNumber"
        label={t('plateNumber')}
        publishRequired
        placeholder={t('platePlaceholder')}
        hint={lockedNotice ?? t('plateHelp')}
        autoCapitalize="characters"
        editable={!lockedNotice}
      />
      <VehicleIdentityFields
        control={control}
        vehicleType={vehicleType}
        disabled={Boolean(lockedNotice)}
        {...(lockedNotice ? { lockedNotice } : {})}
        setValue={setValue}
      />
      <NumberField
        control={control}
        name="manufactureYear"
        grouped={false}
        integer
        label={t('manufactureYear')}
        placeholder={String(new Date().getFullYear())}
        min={1980}
        max={new Date().getFullYear() + 1}
        {...(lockedNotice ? { hint: lockedNotice } : {})}
        editable={!lockedNotice}
      />
      <TextField
        control={control}
        name="color"
        label={t('color')}
        placeholder={t('colorPlaceholder')}
      />
      <VehicleClassificationFields
        control={control}
        vehicleType={vehicleType}
        bodyTypePicker={<BodyTypePicker control={control} />}
        disabled={Boolean(lockedNotice)}
        setValue={setValue}
      />
    </YStack>
  );
}

/** Thẻ "Động cơ & nhiên liệu" — `VehicleEnergyFields` dùng chung với wizard đăng nhanh. */
export function VehicleEnergyCardFields({
  control,
  isCar,
  lockedNotice,
  setValue,
}: SectionProps & {
  isCar: boolean;
  lockedNotice?: string | undefined;
  setValue: UseFormSetValue<VehicleFormValues>;
}) {
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;
  const fuelType = useWatch({ control, name: 'fuelType' });
  const transmissionOptions = useTransmissionOptions(vehicleType, fuelType);

  return (
    <VehicleEnergyFields
      control={control}
      vehicleType={vehicleType}
      transmissionOptions={transmissionOptions}
      disabled={Boolean(lockedNotice)}
      {...(lockedNotice ? { lockedNotice } : {})}
      setValue={setValue}
    />
  );
}

/** Thẻ "Tiện ích & mô tả" — dời sang mục Thông tin từ 30/09/2026, cùng một lần lưu. */
export function FeaturesDescriptionFields({ control, isCar }: SectionProps & { isCar: boolean }) {
  const t = useTranslations('Vehicles.form.media');
  const { catalog } = useCatalog();
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;
  // LỌC theo loại xe: tiện ích là chiều LỌC ngoài chợ, xe máy gắn "cửa sổ trời" là sai kết quả.
  const features = (catalog[CATALOG_TYPE.VEHICLE_FEATURE] ?? []).filter((item) =>
    vehicleFeatureAppliesTo(item.key, vehicleType),
  );

  return (
    <YStack gap={space.md}>
      <FeaturesField control={control} features={features} />
      <TextField
        control={control}
        name="description"
        label={t('description')}
        placeholder={t('descriptionPlaceholder')}
        multiline
        rows={5}
        maxLength={DESCRIPTION_MAX}
      />
    </YStack>
  );
}

/** Kích thước & khối lượng (tab nâng cao). */
export function DimensionsFields({ control }: SectionProps) {
  const t = useTranslations('Vehicles.form.advanced');
  return (
    <YStack gap={space.md}>
      <NumberField
        control={control}
        name="lengthMm"
        label={t('lengthMm')}
        suffix="mm"
        placeholder={t('lengthPlaceholder')}
      />
      <NumberField
        control={control}
        name="widthMm"
        label={t('widthMm')}
        suffix="mm"
        placeholder={t('widthPlaceholder')}
      />
      <NumberField
        control={control}
        name="heightMm"
        label={t('heightMm')}
        suffix="mm"
        placeholder={t('heightPlaceholder')}
      />
      <NumberField
        control={control}
        name="curbWeightKg"
        label={t('curbWeightKg')}
        suffix="kg"
        placeholder={t('curbWeightPlaceholder')}
      />
    </YStack>
  );
}

/**
 * Công suất (tab nâng cao). Dung tích xi-lanh KHÔNG ở đây — nó sống trong khối năng lượng, đúng
 * web (`EngineOutputSection` chỉ còn công suất).
 */
export function EngineOutputFields({ control }: SectionProps) {
  const t = useTranslations('Vehicles.form.advanced');
  return (
    <NumberField
      control={control}
      name="horsepowerHp"
      label={t('horsepowerHp')}
      suffix="HP"
      placeholder={t('horsepowerPlaceholder')}
      min={1}
    />
  );
}

/**
 * Mức tiêu thụ theo điều kiện đường (tab nâng cao). KHÔNG có ô "kết hợp" — ô đó sống ở khối năng
 * lượng (web 30/09/2026); hai ô cho cùng một giá trị thì ô nào ghi đè ô nào là chuyện may rủi.
 */
export function ConsumptionFields({ control }: SectionProps) {
  const t = useTranslations('Vehicles.form.advanced');
  return (
    <YStack gap={space.md}>
      <NumberField
        control={control}
        name="fuelConsumptionCity"
        label={t('consumptionCity')}
        placeholder={t('consumptionCityPlaceholder')}
        suffix="L/100km"
      />
      <NumberField
        control={control}
        name="fuelConsumptionHighway"
        label={t('consumptionHighway')}
        placeholder={t('consumptionHighwayPlaceholder')}
        suffix="L/100km"
      />
    </YStack>
  );
}

/** Nhãn tab ngang kèm số lỗi — tab đang ẩn vẫn báo được là nó có lỗi (web `<Badge>`). */
export function PaneTab({
  label,
  errors,
  selected,
  onPress,
}: {
  label: string;
  errors: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Chip
      label={errors > 0 ? `${label} (${errors})` : label}
      selected={selected}
      variant="segmented"
      size="sm"
      grow
      onPress={onPress}
      {...(errors > 0 ? { icon: 'alert-circle' as const } : {})}
    />
  );
}
