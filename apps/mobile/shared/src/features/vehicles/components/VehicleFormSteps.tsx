import type { ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  CATALOG_TYPE,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  isVehicleServiceTypeAllowed,
  vehicleFeatureAppliesTo,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleSourceType,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { LockedValueField } from '@/components/ui/LockedValueField';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { RadioOption } from '@/components/ui/RadioOption';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { LongTermPriceHint } from '@/features/rental-policies/components/LongTermPriceHint';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { CatalogCardPicker } from '@/features/catalog/components/CatalogCardPicker';
import { useCatalog } from '@/features/catalog/use-catalog';
import { VehicleClassificationFields } from './VehicleClassificationFields';
import { VehicleEnergyFields, useTransmissionOptions } from './VehicleEnergyFields';
import { VehicleIdentityFields } from './VehicleIdentityFields';
import { RegistrationTextField } from './RegistrationTextField';
import { useCatalogSpecLock, useSpecFieldLock } from '../hooks/use-vehicle-data';
import { TypedMediaFields } from './TypedMediaFields';
import {
  CatalogRentHint,
  CatalogValueHint,
  useVehicleCatalogSuggestion,
} from './CatalogSuggestions';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { discountedPriceVnd } from '../pricing';

interface StepProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
}

/**
 * Tiêu đề nhóm con bên trong một bước — kiểu tiêu đề phụ của app KHÁCH (14 Semibold, màu chữ chính,
 * giữ hoa/thường như message), thay nhãn chữ hoa nhỏ mờ của khu quản lý cũ (người dùng chốt
 * 10/11/2026: màn quản lý lấy phong cách hiển thị của app khách).
 */
function GroupTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      col={colors.text}
      fos={fontSize.body}
      fow={fontWeight.semibold}
      accessibilityRole="header"
    >
      {children}
    </Text>
  );
}

/**
 * Cảnh báo/gợi ý một dòng — thay `<Alert>` của AntD.
 *
 * CÓ biểu tượng, đúng `showIcon` mà mọi `<Alert>` của web đều bật. Không có nó, một khối màu
 * vàng nhạt kèm chữ đậm đọc ra hệt như một tiêu đề khác của form; hình tam giác cảnh báo là thứ
 * duy nhất phân biệt "đọc đi" với "đây là mục tiếp theo".
 */
export function Notice({
  tone,
  title,
  body,
}: {
  tone: 'info' | 'warning';
  title: string;
  body?: string;
}) {
  const colors = useColors();
  const skin =
    tone === 'warning'
      ? { fg: colors.warning, bg: colors.warningSurface, icon: 'warning-outline' as const }
      : { fg: colors.info, bg: colors.infoSurface, icon: 'information-circle-outline' as const };

  return (
    <XStack bg={skin.bg} br={radius.sm} p={space.sm} gap={space.xs} ai="center">
      <Ionicons name={skin.icon} size={iconSize.sm} color={skin.fg} />
      <YStack f={1} gap={2}>
        <Text col={skin.fg} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {title}
        </Text>
        {body ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {body}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * Bước 1 — thông tin cơ bản + thông số vận hành + hình thức nguồn xe.
 *
 * Trạng thái vận hành KHÔNG hỏi lúc tạo (xe mới mặc định "Sẵn sàng") — đúng như web: hỏi ngay
 * lúc onboarding là một câu thừa.
 */
export function BasicStep({
  control,
  branchOptions,
  branchLoading,
  lockedNotice,
  hideServiceTypes = false,
  hideBranch = false,
}: Pick<StepProps, 'control'> & {
  /** Tuyến hoa hồng chỉ có MỘT chi nhánh: ẩn ô (đã chọn sẵn) như web `branchHidden`. */
  hideBranch?: boolean;
  /**
   * Wizard tạo xe (17/11/2026) hỏi dịch vụ bằng công tắc trên từng thẻ ở bước "Dịch vụ & giá" —
   * ẩn chip ở đây để không có hai đường ghi cho cùng một trường.
   */
  hideServiceTypes?: boolean;
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  /**
   * Xe đang CÔNG KHAI: backend từ chối đổi `vehicleType`/`plateNumber`/`transmission`/
   * `fuelType`/`manufactureYear` (409 `VEHICLE_FIELD_LOCKED` — `assertNoLockedFieldChange`).
   * Có giá trị = khoá ô, đúng `lockedNotice` của `VehicleEditWorkspace` bên web: khoá field
   * bằng `disabled` + đổi hẳn dòng gợi ý, không phải ẩn đi hay chặn lúc lưu.
   */
  lockedNotice?: string;
}) {
  const t = useTranslations('Vehicles.form');
  const domainLabel = useDomainLabel();
  const vehicleTypeOptions = VEHICLE_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('vehicleType', value),
  }));

  return (
    <YStack gap={space.md}>
      <GroupTitle>{t('sections.basic')}</GroupTitle>

      {/* Không có ô tên xe: server ghép "Hãng Dòng Phiên bản Năm" (ADR 0102); tấm xác nhận hiện tên đó. */}
      {/* Thêm xe (Figma, như web): không hỏi Mã xe - server tự sinh; sửa ở màn chỉnh sửa xe. */}
      {/*
        Chi nhánh = VỊ TRÍ CÔNG KHAI của xe. Ngay cả khi gian hàng chỉ có một chi nhánh, ô này vẫn
        hiện (đã chọn sẵn) để người dùng biết xe sẽ hiển thị ở tỉnh nào — một trường bị ẩn là một
        quyết định không ai nhìn thấy.
      */}
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
      <SelectField
        control={control}
        name="vehicleType"
        label={t('basic.vehicleType')}
        options={vehicleTypeOptions}
        disabled={Boolean(lockedNotice)}
        {...(lockedNotice ? { hint: lockedNotice } : {})}
        required
      />

      {/* MẢNG dịch vụ — một xe đăng đồng thời tự lái / có tài xế / dài hạn. */}
      {hideServiceTypes ? null : (
        <>
          <ServiceTypesField control={control} required />
          <ServicePriceRemovalWarning control={control} />
        </>
      )}
    </YStack>
  );
}

/**
 * Thông số vận hành — biển số, hãng, đời, chỗ ngồi, nhiên liệu, màu, kiểu dáng.
 *
 * Khối RIÊNG chứ không nằm trong `BasicStep`, vì hai nơi gọi xếp nó khác nhau và web cũng vậy:
 * wizard tạo xe nối thẳng sau khối cơ bản dưới một tiêu đề phụ, còn màn sửa cho nó hẳn một thẻ
 * "Thông số kỹ thuật" đứng sau thẻ "Quản lý trạng thái".
 */
export function SpecsSection({
  control,
  isCar,
  lockedNotice,
  setValue,
  registrationReading,
}: StepProps & {
  /** Lượt đọc cà vẹt mới nhất - biển số/màu khớp nó thì khoá (ADR 0102 điều 6). */
  registrationReading?: VehicleRegistrationReading | null;
  /** Xem docblock của `BasicStep` — cùng cơ chế khoá `plateNumber`/`manufactureYear`/`fuelType`. */
  lockedNotice?: string;
  /**
   * Dọn ô không còn nghĩa khi đổi loại xe / hãng / nguồn năng lượng — ba khối dùng chung bên
   * dưới tự làm việc đó. Thiếu nó thì form giữ lại một mẫu xe hoặc một con số mà server sẽ xoá.
   */
  setValue: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form');
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;
  const fuelType = useWatch({ control, name: 'fuelType' });
  const transmissionOptions = useTransmissionOptions(vehicleType, fuelType);

  return (
    <YStack gap={space.md}>
      <RegistrationTextField
        control={control}
        name="plateNumber"
        reading={registrationReading}
        disabled={Boolean(lockedNotice)}
        label={t('specs.plateNumber')}
        publishRequired
        placeholder={t('specs.platePlaceholder')}
        hint={lockedNotice ?? t('specs.plateHelp')}
        autoCapitalize="characters"
        editable={!lockedNotice}
      />

      {/*
        Hãng → Mẫu xe: cặp chọn phụ thuộc dùng chung với wizard đăng nhanh. Client gửi
        `vehicleCatalogModelId`, backend chép nhãn hãng/mẫu xuống — nên không có đường nào lưu
        được một chiếc xe máy hiệu Toyota.
      */}
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
        label={t('specs.manufactureYear')}
        placeholder={String(new Date().getFullYear())}
        min={1980}
        max={new Date().getFullYear() + 1}
        {...(lockedNotice ? { hint: lockedNotice } : {})}
        editable={!lockedNotice}
      />
      <RegistrationTextField
        control={control}
        name="color"
        reading={registrationReading}
        label={t('specs.color')}
        placeholder={t('specs.colorPlaceholder')}
      />

      {/*
        Phân loại: ô tô có số chỗ + kiểu dáng thân xe, xe máy có phân khúc. Hai chiều đối xứng và
        loại trừ nhau — ma trận `vehicleFieldPolicy` quyết định, không phải cờ `isCar` rải rác.
      */}
      <VehicleClassificationFields
        control={control}
        vehicleType={vehicleType}
        bodyTypePicker={<BodyTypePicker control={control} />}
        disabled={Boolean(lockedNotice)}
        setValue={setValue}
      />

      {/*
        Giá trị xe (ADR 0088) — mẫu số phí bảo hiểm, chỉ ô tô; gợi ý theo Dữ liệu xe (ADR 0090) chỉ
        điền khi chủ xe bấm. Trước 17/11/2026 app không có ô này (web có) - bù cho đủ thông tin.
      */}
      {isCar ? <InsuredValueField control={control} setValue={setValue} /> : null}

      {/*
        Nguồn năng lượng + thông số của nó: xe xăng hỏi lít/100km, xe điện hỏi km mỗi lần sạc.
        Cùng khối với wizard đăng xe nhanh, cùng ma trận `vehicleEnergySpecPolicy` mà backend dùng.
      */}
      <VehicleEnergyFields
        control={control}
        vehicleType={vehicleType}
        transmissionOptions={transmissionOptions}
        fuelTypeRequired
        disabled={Boolean(lockedNotice)}
        {...(lockedNotice ? { lockedNotice } : {})}
        setValue={setValue}
      />
    </YStack>
  );
}

/**
 * Giá trị xe (ADR 0088) - mẫu số phí bảo hiểm VCX, chỉ ô tô. Bản native của ô "Giá trị xe" bên
 * web: nhập tiền + nhãn giải thích, kèm gợi ý theo Dữ liệu xe (ADR 0090) chỉ điền khi chủ xe bấm.
 */
export function InsuredValueField({
  control,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  setValue: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.specs');
  return (
    <YStack gap={space.xs}>
      <MoneyField
        control={control}
        name="insuredValue"
        label={t('insuredValue')}
        hint={t('insuredValueTip')}
      />
      <InsuredValueSuggestion control={control} setValue={setValue} />
    </YStack>
  );
}

/** Giá trị xe tham khảo — bản native của `InsuredValueSuggestion` bên web. */
function InsuredValueSuggestion({
  control,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  setValue: UseFormSetValue<VehicleFormValues>;
}) {
  const suggestion = useVehicleCatalogSuggestion({
    modelId: useWatch({ control, name: 'vehicleCatalogModelId' }),
    variantId: useWatch({ control, name: 'vehicleCatalogVariantId' }),
    year: useWatch({ control, name: 'manufactureYear' }),
  });
  if (!suggestion?.value) return null;
  return (
    <CatalogValueHint
      value={suggestion.value}
      onApply={(amount) =>
        setValue('insuredValue', amount, { shouldDirty: true, shouldValidate: true })
      }
    />
  );
}

/**
 * Kiểu dáng xe — thẻ có ảnh thay vì danh sách chữ.
 *
 * Đây chính là chiều "Loại xe" khách dùng để lọc ngoài chợ, nên chọn sai là xe không ai tìm
 * thấy; ảnh minh hoạ làm việc chọn tường minh hơn hẳn một danh sách "CUV / SUV / MPV" bằng chữ.
 * Cùng component với bộ lọc chợ xe (`CatalogCardPicker`) nên hai màn không thể lệch ảnh.
 */
export function BodyTypePicker({ control }: { control: Control<VehicleFormValues> }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.specs');
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const { catalog } = useCatalog();
  const items = catalog[CATALOG_TYPE.BODY_TYPE] ?? [];
  // Kiểu dáng theo xe chuẩn đang chọn - khoá + bút như mọi ô tự điền (ADR 0102). Lưới thẻ ảnh không
  // có trạng thái chỉ đọc nên đang khoá thì thay bằng ô khoá (web `SpecLockedField`).
  const vehicleType = useWatch({ control, name: 'vehicleType' }) ?? VEHICLE_TYPE.CAR;
  const lock = useCatalogSpecLock(control, vehicleType, 'bodyType');
  const toFieldLock = useSpecFieldLock();
  const bodyType = useWatch({ control, name: 'bodyType' });
  const lockedLabel = items.find((item) => item.key === bodyType)?.label;
  if (lock.locked && lockedLabel) {
    return (
      <LockedValueField
        label={t('bodyType')}
        value={lockedLabel}
        lock={toFieldLock(lock, t('bodyType'))}
        hint={tCatalog('specLocked')}
      />
    );
  }

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={t('bodyType')} />
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('bodyTypeHint')}
      </Text>
      <Controller
        control={control}
        name="bodyType"
        render={({ field }) => (
          <CatalogCardPicker
            ariaLabel={t('bodyType')}
            items={items}
            value={field.value ? [field.value] : []}
            /* MỘT kiểu dáng cho một chiếc xe — bộ chọn là đa trị, ở đây chỉ lấy mục cuối. */
            onChange={(next) => field.onChange(next[next.length - 1] ?? null)}
          />
        )}
      />
    </YStack>
  );
}

/**
 * Hình thức nguồn xe — sở hữu / trả góp / thuê lại / hợp tác.
 *
 * CHỈ có ở wizard TẠO xe, đúng như web: `VehicleForm` dựng `SourceTypeSection` ở bước 1, còn
 * `VehicleEditWorkspace` thì không — hồ sơ nguồn xe của một xe đã tồn tại sống ở tab "Nguồn xe
 * & tài chính" với đầy đủ hợp đồng và kỳ thanh toán, và hỏi lại mỗi hình thức ở form thông tin
 * là mở một đường sửa thứ hai cho cùng một dữ liệu.
 */
export function SourceTypeSection({ control }: { control: Control<VehicleFormValues> }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form');

  return (
    <YStack gap={space.md}>
      <GroupTitle>{t('source.legend')}</GroupTitle>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('source.description')}
      </Text>
      <SourceTypeField control={control} />
      <Notice tone="info" title={t('source.hint')} />
    </YStack>
  );
}

/**
 * Dịch vụ xe phục vụ được — nhiều lựa chọn, nên là hàng chip bật/tắt chứ không phải menu:
 * một menu không cho thấy tổ hợp nào đang bật.
 */
function ServiceTypesField({
  control,
  required = false,
}: {
  control: Control<VehicleFormValues>;
  required?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.basic');
  const domainLabel = useDomainLabel();
  const vehicleType = useWatch({ control, name: 'vehicleType' });

  return (
    <Controller
      control={control}
      name="serviceTypes"
      render={({ field, fieldState }) => {
        const selected = field.value ?? [];
        return (
          <YStack gap={space.xs}>
            <FieldLabel label={t('serviceTypes')} required={required} />
            <XStack flexWrap="wrap" gap={space.xs}>
              {SERVICE_TYPE_VALUES.map((value) => {
                const active = selected.includes(value);
                /*
                  Dịch vụ loại xe này không phục vụ được (vd xe máy có tài xế) thì KHOÁ chip chưa
                  chọn — đúng `ServiceTypeChips` của web. Chip đang bật vẫn tắt được.
                */
                const locked = !active && !isVehicleServiceTypeAllowed(vehicleType, value);
                return (
                  // `Chip` không có trạng thái khoá — mờ đi và bỏ `onPress` là đủ, như thẻ khoá của web.
                  <YStack
                    key={value}
                    opacity={locked ? 0.45 : 1}
                    pointerEvents={locked ? 'none' : 'auto'}
                  >
                    <Chip
                      label={domainLabel('serviceType', value)}
                      selected={active}
                      {...(locked
                        ? {}
                        : {
                            onPress: () =>
                              field.onChange(
                                active
                                  ? selected.filter((item) => item !== value)
                                  : [...selected, value],
                              ),
                          })}
                    />
                  </YStack>
                );
              })}
            </XStack>
            <Text col={fieldState.error ? colors.danger : colors.textMuted} fos={fontSize.label}>
              {fieldState.error?.message ?? t('serviceTypesHelp')}
            </Text>
          </YStack>
        );
      }}
    />
  );
}

/** Bốn hình thức nguồn xe — mỗi lựa chọn kèm một câu mô tả, nên là radio chứ không phải menu. */
function SourceTypeField({ control }: { control: Control<VehicleFormValues> }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.source');
  const domainLabel = useDomainLabel();

  /*
   * Liệt kê tường minh cả bốn nhánh (thay cho một chuỗi ba ngôi) nên thêm một hình thức nguồn xe
   * mới là lỗi biên dịch ngay tại đây, không phải một ô mô tả trống lúc chạy.
   */
  const description: Record<VehicleSourceType, string> = {
    owned: t('owned'),
    financed: t('financed'),
    rented: t('rented'),
    partnership: t('partnership'),
  };

  return (
    <Controller
      control={control}
      name="sourceType"
      render={({ field, fieldState }) => (
        <YStack gap={space.xs}>
          {VEHICLE_SOURCE_TYPE_VALUES.map((value) => (
            <RadioOption
              key={value}
              label={domainLabel('vehicleSourceType', value)}
              hint={description[value]}
              checked={field.value === value}
              onPress={() => field.onChange(value)}
            />
          ))}
          {fieldState.error?.message ? (
            <Text col={colors.danger} fos={fontSize.label}>
              {fieldState.error.message}
            </Text>
          ) : null}
        </YStack>
      )}
    />
  );
}

/**
 * Cảnh báo NGAY khi bỏ một dịch vụ mà xe đang có giá chuyên biệt: lưu là giá đó bị xoá theo
 * (server `orphanPriceClears`), thêm lại dịch vụ thì phải nhập giá lại. Đây là lời báo trước;
 * nút Lưu bấm sau khi đã thấy cảnh báo chính là xác nhận.
 */
export function ServicePriceRemovalWarning({ control }: { control: Control<VehicleFormValues> }) {
  const t = useTranslations('Vehicles.form.warnings');
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  const withDriverDailyPrice = useWatch({ control, name: 'withDriverDailyPrice' });
  const withDriverInterCityPrice = useWatch({ control, name: 'withDriverInterCityPrice' });
  const withDriverOneWayPrice = useWatch({ control, name: 'withDriverOneWayPrice' });

  const losses: string[] = [];
  if (!serviceTypes.includes(SERVICE_TYPE.LONG_TERM) && monthlyPrice != null) {
    losses.push(t('lossMonthly'));
  }
  if (
    !serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER) &&
    (withDriverDailyPrice != null ||
      withDriverInterCityPrice != null ||
      withDriverOneWayPrice != null)
  ) {
    losses.push(t('lossWithDriver'));
  }
  if (losses.length === 0) return null;

  /*
   * Nối bằng MESSAGE, không bằng `losses.join(' và ')`: liên từ là chữ, và tiếng Anh dùng "and"
   * ở đúng chỗ này. Chỉ có tối đa hai mục nên không cần `Intl.ListFormat`.
   */
  const summary =
    losses.length === 1 ? losses[0]! : t('lossJoin', { first: losses[0]!, second: losses[1]! });

  return (
    <Notice
      tone="warning"
      title={t('priceRemovalTitle', { losses: summary })}
      body={t('priceRemovalBody')}
    />
  );
}

/** Trường giá nhận gợi ý "Dùng giá" theo Dữ liệu xe (ADR 0090). */
type CatalogPriceField =
  | 'weekdayPrice'
  | 'weekendPrice'
  | 'hourlyPrice'
  | 'monthlyPrice'
  | 'withDriverDailyPrice';

interface PriceFieldsProps {
  control: Control<VehicleFormValues>;
  setValue: UseFormSetValue<VehicleFormValues>;
}

/** Một gợi ý cho cả ba nhóm giá - một query, không ba (cùng khoá với web). */
function useCatalogPriceHint({ control, setValue }: PriceFieldsProps) {
  const suggestion = useVehicleCatalogSuggestion({
    modelId: useWatch({ control, name: 'vehicleCatalogModelId' }),
    variantId: useWatch({ control, name: 'vehicleCatalogVariantId' }),
    year: useWatch({ control, name: 'manufactureYear' }),
  });
  return (field: CatalogPriceField) => (
    <CatalogRentHint
      suggestion={suggestion}
      field={field}
      onApply={(price) => setValue(field, price, { shouldDirty: true, shouldValidate: true })}
    />
  );
}

/**
 * Giá TỰ LÁI (thẻ "Thuê xe tự lái" - Figma `24352:80745`): ngày thường · cuối tuần · theo giờ ·
 * giảm giá, rồi dòng "Giá hiển thị trên sàn" (chỉ để xem, backend tự tính - ADR 0008).
 */
export function SelfDrivePriceFields({ control, setValue }: PriceFieldsProps) {
  const t = useTranslations('Vehicles.form.prices');
  const tWizard = useTranslations('Vehicles.form.wizard');
  const fmt = useAppFormat();
  const hint = useCatalogPriceHint({ control, setValue });
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const discounted = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  return (
    <YStack gap={space.md}>
      <YStack gap={space.xs}>
        <MoneyField
          control={control}
          name="weekdayPrice"
          label={t('weekday')}
          publishRequired
          placeholder={t('weekdayPlaceholder')}
          hint={t('weekdayHelp')}
        />
        {hint('weekdayPrice')}
      </YStack>
      <YStack gap={space.xs}>
        <MoneyField
          control={control}
          name="weekendPrice"
          label={t('weekend')}
          placeholder={t('weekendPlaceholder')}
          hint={t('weekendHelp')}
        />
        {hint('weekendPrice')}
      </YStack>
      <YStack gap={space.xs}>
        <MoneyField
          control={control}
          name="hourlyPrice"
          label={t('hourly')}
          placeholder={t('hourlyPlaceholder')}
        />
        {hint('hourlyPrice')}
      </YStack>
      <NumberField
        control={control}
        name="discountPercent"
        percent
        label={t('discountPercent')}
        placeholder={t('discountPlaceholder')}
        hint={t('discountHelp')}
      />
      {discounted != null ? (
        <Notice tone="info" title={tWizard('pricePreview', { price: fmt.money(discounted) })} />
      ) : null}
    </YStack>
  );
}

/** Giá CÓ TÀI XẾ (thẻ "Xe có tài xế"): nội thành (bắt buộc lên chợ) · liên tỉnh · liên tỉnh 1 chiều. */
export function WithDriverPriceFields({ control, setValue }: PriceFieldsProps) {
  const t = useTranslations('Vehicles.form.prices');
  const hint = useCatalogPriceHint({ control, setValue });
  return (
    <YStack gap={space.md}>
      <YStack gap={space.xs}>
        <MoneyField
          control={control}
          name="withDriverDailyPrice"
          label={t('withDriverDaily')}
          publishRequired
          placeholder={t('withDriverDailyPlaceholder')}
          hint={t('withDriverDailyHelp')}
        />
        {hint('withDriverDailyPrice')}
      </YStack>
      <MoneyField
        control={control}
        name="withDriverInterCityPrice"
        label={t('withDriverInterCity')}
        placeholder={t('withDriverInterCityPlaceholder')}
        hint={t('withDriverInterCityHelp')}
      />
      <MoneyField
        control={control}
        name="withDriverOneWayPrice"
        label={t('withDriverOneWay')}
        placeholder={t('withDriverOneWayPlaceholder')}
        hint={t('withDriverOneWayHelp')}
      />
    </YStack>
  );
}

/** Giá DÀI HẠN (thẻ "Thuê xe dài hạn"): giá tháng + gợi ý giá tháng theo giá ngày đang nhập. */
export function LongTermPriceFields({ control, setValue }: PriceFieldsProps) {
  const t = useTranslations('Vehicles.form.prices');
  const hint = useCatalogPriceHint({ control, setValue });
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  return (
    <YStack gap={space.xs}>
      <MoneyField
        control={control}
        name="monthlyPrice"
        label={t('monthly')}
        publishRequired
        placeholder={t('monthlyPlaceholder')}
        hint={t('monthlyHelp')}
      />
      {hint('monthlyPrice')}
      <LongTermPriceHint weekdayPrice={weekdayPrice} monthlyPrice={monthlyPrice} />
    </YStack>
  );
}

/** Công tắc "Giao xe tận nơi" của wizard tạo xe. */
export function DeliveryToggle({ control }: { control: Control<VehicleFormValues> }) {
  const tPolicies = useTranslations('Vehicles.form.policies');
  return (
    <Controller
      control={control}
      name="deliveryEnabled"
      render={({ field }) => (
        <ToggleRow
          label={tPolicies('delivery')}
          hint={tPolicies('deliveryDescription')}
          checked={field.value === true}
          onToggle={() => field.onChange(!field.value)}
        />
      )}
    />
  );
}

/**
 * Thẻ "Hình ảnh xe" — ảnh theo GÓC CHỤP (`media[{url,type}]`) + ảnh đại diện, cùng `TypedMediaFields`
 * với wizard đăng nhanh. `children` là phần đi kèm trong CÙNG thẻ (ô cà vẹt của wizard tạo xe).
 */
export function ImagesCard({
  control,
  title,
  badge,
  children,
}: {
  control: Control<VehicleFormValues>;
  title: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  return (
    <Card>
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <YStack f={1}>
            <SectionHeader icon="images-outline">{title}</SectionHeader>
          </YStack>
          {badge}
        </XStack>
        <TypedMediaFields control={control} vehicleType={vehicleType} />
        {children}
      </YStack>
    </Card>
  );
}

/**
 * Thẻ "Tiện ích & mô tả" — bước 3 của wizard tạo xe (Figma `24352:81824`). Mô tả văn bản thường,
 * tối đa 4.000 ký tự (người dùng chốt 17/11/2026, không thanh định dạng).
 */
export function FeaturesDescriptionCard({
  control,
  title,
}: {
  control: Control<VehicleFormValues>;
  title: string;
}) {
  const t = useTranslations('Vehicles.form.media');
  const { catalog } = useCatalog();
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  // LỌC theo loại xe - tiện ích là một chiều lọc ngoài chợ, "cửa sổ trời" cho xe máy là sai.
  const features = (catalog[CATALOG_TYPE.VEHICLE_FEATURE] ?? []).filter((item) =>
    vehicleFeatureAppliesTo(item.key, vehicleType),
  );
  return (
    <Card>
      <YStack gap={space.md}>
        <SectionHeader icon="list-outline">{title}</SectionHeader>
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
    </Card>
  );
}
/** Trần mô tả — khớp `vehicleFormSchema.description` và `maxLength={4000}` của web. */
const DESCRIPTION_MAX = 4000;

/**
 * Tiện ích trên xe — dải CHIP bật/tắt.
 *
 * Web dùng `<Checkbox.Group>`, nhưng lưới ô tick trên màn hẹp ăn gấp đôi chiều cao cho cùng
 * lượng lựa chọn và mép phải luôn so le vì nhãn dài ngắn khác nhau. Chip là hình thái native cho
 * "chọn nhiều trong một tập ngắn", và app đã dùng đúng nó ở dịch vụ xe ngay màn trước — đổi kiểu
 * giữa hai màn của cùng một form là thứ người dùng phải học lại.
 */
export function FeaturesField({
  control,
  features,
}: {
  control: Control<VehicleFormValues>;
  features: readonly { key: string; label: string }[];
}) {
  const t = useTranslations('Vehicles.form.media');

  return (
    <Controller
      control={control}
      name="features"
      render={({ field }) => {
        const selected = (field.value ?? []) as string[];
        return (
          <YStack gap={space.xs}>
            <FieldLabel label={t('features')} />
            <XStack flexWrap="wrap" gap={space.xs}>
              {features.map((item) => {
                const active = selected.includes(item.key);
                return (
                  <Chip
                    key={item.key}
                    label={item.label}
                    selected={active}
                    onPress={() =>
                      field.onChange(
                        active ? selected.filter((k) => k !== item.key) : [...selected, item.key],
                      )
                    }
                  />
                );
              })}
            </XStack>
          </YStack>
        );
      }}
    />
  );
}

/** Thông số kỹ thuật nâng cao — chỉ có ở màn SỬA, luồng tạo không hỏi (đúng như web). */
export function AdvancedSpecsSection({ control }: { control: Control<VehicleFormValues> }) {
  // Kích thước, trọng lượng, công suất theo xe chuẩn đang chọn - khoá + bút (ADR 0102).
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const vehicleType = useWatch({ control, name: 'vehicleType' }) ?? VEHICLE_TYPE.CAR;
  const toFieldLock = useSpecFieldLock();
  const locks = {
    lengthMm: useCatalogSpecLock(control, vehicleType, 'lengthMm'),
    widthMm: useCatalogSpecLock(control, vehicleType, 'widthMm'),
    heightMm: useCatalogSpecLock(control, vehicleType, 'heightMm'),
    curbWeightKg: useCatalogSpecLock(control, vehicleType, 'curbWeightKg'),
    engineDisplacementCc: useCatalogSpecLock(control, vehicleType, 'engineDisplacementCc'),
    horsepowerHp: useCatalogSpecLock(control, vehicleType, 'horsepowerHp'),
  };
  const specLocked = tCatalog('specLocked');
  /*
   * KHÔNG nhận `lockedNotice` nữa: khối này chỉ còn kích thước, dung tích và công suất — không
   * trường nào bị khoá khi xe lên chợ. Căn cước bị khoá (biển số, nhiên liệu, hộp số, năm SX)
   * nằm ở khối trên và tự nhận cảnh báo của nó.
   */
  const t = useTranslations('Vehicles.form.advanced');

  return (
    <YStack gap={space.md}>
      <GroupTitle>{t('dimensionsTitle')}</GroupTitle>
      <NumberField
        control={control}
        name="lengthMm"
        label={t('lengthMm')}
        lock={toFieldLock(locks.lengthMm, t('lengthMm'))}
        {...(locks.lengthMm.locked ? { hint: specLocked } : {})}
        suffix="mm"
        placeholder={t('lengthPlaceholder')}
      />
      <NumberField
        control={control}
        name="widthMm"
        label={t('widthMm')}
        lock={toFieldLock(locks.widthMm, t('widthMm'))}
        {...(locks.widthMm.locked ? { hint: specLocked } : {})}
        suffix="mm"
        placeholder={t('widthPlaceholder')}
      />
      <NumberField
        control={control}
        name="heightMm"
        label={t('heightMm')}
        lock={toFieldLock(locks.heightMm, t('heightMm'))}
        {...(locks.heightMm.locked ? { hint: specLocked } : {})}
        suffix="mm"
        placeholder={t('heightPlaceholder')}
      />
      <NumberField
        control={control}
        name="curbWeightKg"
        label={t('curbWeightKg')}
        lock={toFieldLock(locks.curbWeightKg, t('curbWeightKg'))}
        {...(locks.curbWeightKg.locked ? { hint: specLocked } : {})}
        suffix="kg"
        placeholder={t('curbWeightPlaceholder')}
      />

      <GroupTitle>{t('engineTitle')}</GroupTitle>
      <NumberField
        control={control}
        name="engineDisplacementCc"
        label={t('engineDisplacementCc')}
        lock={toFieldLock(locks.engineDisplacementCc, t('engineDisplacementCc'))}
        {...(locks.engineDisplacementCc.locked ? { hint: specLocked } : {})}
        placeholder={t('enginePlaceholder')}
        suffix="cc"
      />
      <NumberField
        control={control}
        name="horsepowerHp"
        label={t('horsepowerHp')}
        lock={toFieldLock(locks.horsepowerHp, t('horsepowerHp'))}
        {...(locks.horsepowerHp.locked ? { hint: specLocked } : {})}
        suffix="HP"
        placeholder={t('horsepowerPlaceholder')}
      />
      {/*
        KHÔNG có ô hộp số ở đây — nó sống trong `VehicleEnergyFields` phía trên, đúng như web.

        Bản trước dựng ô thứ hai cho CÙNG một trường `transmission`, và liệt kê thẳng cả 8 giá
        trị của union thay vì hỏi `vehicleTransmissionTypesFor`. Hệ quả: một chiếc xe máy được
        mời chọn "CVT" và "DCT", còn hai ô cùng trường thì ô nào ghi đè ô nào là chuyện may rủi.
      */}

      <GroupTitle>{t('consumptionTitle')}</GroupTitle>
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
      <NumberField
        control={control}
        name="fuelConsumptionCombined"
        label={t('consumptionCombined')}
        placeholder={t('consumptionCombinedPlaceholder')}
        suffix="L/100km"
      />

      <Notice tone="info" title={t('hint')} />
    </YStack>
  );
}

/** Trạng thái vận hành — chỉ có ở màn SỬA (thẻ "Quản lý trạng thái" của web). */
export function StatusSection({ control }: { control: Control<VehicleFormValues> }) {
  const t = useTranslations('Vehicles.form.status');
  const domainLabel = useDomainLabel();

  return (
    <SelectField
      control={control}
      name="operationStatus"
      label={t('operationStatus')}
      options={VEHICLE_OPERATION_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleOperationStatus', value),
      }))}
      required
    />
  );
}
