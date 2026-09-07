import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Controller, useWatch, type Control } from 'react-hook-form';
import {
  CATALOG_TYPE,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  vehicleFuelTypesFor,
  type VehicleSourceType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { RadioOption } from '@/components/ui/RadioOption';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { LongTermPriceHint } from '@/features/vehicle-pricing/components/LongTermPriceHint';
import { ToggleRow } from '@/features/vehicle-pricing/components/PolicySections';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { VehicleImagePicker } from './VehicleImagePicker';

interface StepProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
}

/** Nhãn nhóm bên trong một bước — nhỏ, viết hoa, mờ. */
function GroupTitle({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
      {children.toUpperCase()}
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
  codeReadOnly = false,
}: Pick<StepProps, 'control'> & {
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  /**
   * Mã xe chỉ ĐỌC — màn sửa bật, wizard tạo thì không, đúng `codeReadOnly` của web.
   *
   * Mã là định danh nội bộ đã đi vào phiếu thu chi, đơn thuê và hợp đồng của xe; đổi nó ở một
   * form thông tin là đổi thứ mà mọi chứng từ cũ đang trỏ tới.
   */
  codeReadOnly?: boolean;
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

      <TextField
        control={control}
        name="name"
        label={t('basic.name')}
        placeholder={t('basic.namePlaceholder')}
        required
      />
      <TextField
        control={control}
        name="code"
        label={t('basic.code')}
        placeholder={t('basic.codePlaceholder')}
        hint={t('basic.codeHelp')}
        editable={!codeReadOnly}
      />
      {/*
        Chi nhánh = VỊ TRÍ CÔNG KHAI của xe. Ngay cả khi gian hàng chỉ có một chi nhánh, ô này vẫn
        hiện (đã chọn sẵn) để người dùng biết xe sẽ hiển thị ở tỉnh nào — một trường bị ẩn là một
        quyết định không ai nhìn thấy.
      */}
      <SelectField
        control={control}
        name="branchId"
        label={t('basic.branch')}
        options={branchOptions}
        hint={branchLoading ? undefined : t('basic.branchHelp')}
        required
      />
      <SelectField
        control={control}
        name="vehicleType"
        label={t('basic.vehicleType')}
        options={vehicleTypeOptions}
        required
      />

      {/* MẢNG dịch vụ — một xe đăng đồng thời tự lái / có tài xế / dài hạn. */}
      <ServiceTypesField control={control} />
      <ServicePriceRemovalWarning control={control} />

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
export function SpecsSection({ control, isCar }: StepProps) {
  const t = useTranslations('Vehicles.form');
  const { catalog } = useCatalog();

  const brandOptions = useMemo(
    () =>
      (catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? []).map((item) => ({
        value: item.key,
        label: item.label,
      })),
    [catalog],
  );

  const bodyTypeOptions = useMemo(
    () =>
      (catalog[CATALOG_TYPE.BODY_TYPE] ?? []).map((item) => ({
        value: item.key,
        label: item.label,
      })),
    [catalog],
  );

  return (
    <YStack gap={space.md}>

      <TextField
        control={control}
        name="plateNumber"
        label={t('specs.plateNumber')}
        placeholder={t('specs.platePlaceholder')}
        hint={t('specs.plateHelp')}
      />
      <SelectField
        control={control}
        name="brand"
        label={t('specs.brand')}
        options={brandOptions}
        placeholder={t('specs.brandPlaceholder')}
      />
      <TextField
        control={control}
        name="model"
        label={t('specs.model')}
        placeholder={t('specs.modelPlaceholder')}
      />
      <NumberField
        control={control}
        name="manufactureYear"
        grouped={false}
        label={t('specs.manufactureYear')}
        placeholder={String(new Date().getFullYear())}
      />
      <NumberField
        control={control}
        name="seatCount"
        integer
        label={t('specs.seatCount')}
        placeholder={t('specs.seatPlaceholder')}
      />
      <FuelTypeField control={control} isCar={isCar} />
      <TextField
        control={control}
        name="color"
        label={t('specs.color')}
        placeholder={t('specs.colorPlaceholder')}
      />
      {isCar ? (
        <SelectField
          control={control}
          name="bodyType"
          label={t('specs.bodyType')}
          options={bodyTypeOptions}
          hint={t('specs.bodyTypeHint')}
        />
      ) : null}
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
function ServiceTypesField({ control }: { control: Control<VehicleFormValues> }) {
  const t = useTranslations('Vehicles.form.basic');
  const domainLabel = useDomainLabel();

  return (
    <Controller
      control={control}
      name="serviceTypes"
      render={({ field, fieldState }) => {
        const selected = field.value ?? [];
        return (
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('serviceTypes')}
            </Text>
            <XStack flexWrap="wrap" gap={space.xs}>
              {SERVICE_TYPE_VALUES.map((value) => {
                const active = selected.includes(value);
                return (
                  <Chip
                    key={value}
                    label={domainLabel('serviceType', value)}
                    selected={active}
                    onPress={() =>
                      field.onChange(
                        active ? selected.filter((item) => item !== value) : [...selected, value],
                      )
                    }
                  />
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

/**
 * Nguồn năng lượng phụ thuộc LOẠI PHƯƠNG TIỆN: xe máy chỉ nhận xăng/điện, nên danh sách phải
 * lọc theo `vehicleFuelTypesFor` — cùng hàm backend dùng để từ chối tổ hợp không hợp lệ.
 */
function FuelTypeField({ control, isCar }: StepProps) {
  const t = useTranslations('Vehicles.form.specs');
  const { catalog } = useCatalog();
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;
  const allowed = vehicleFuelTypesFor(vehicleType);

  const options = useMemo(
    () =>
      (catalog[CATALOG_TYPE.FUEL_TYPE] ?? [])
        .filter((item) => allowed.some((value) => value === item.key))
        .map((item) => ({ value: item.key, label: item.label })),
    [catalog, allowed],
  );

  return (
    <SelectField
      control={control}
      name="fuelType"
      label={t('fuelType')}
      options={options}
      placeholder={isCar ? t('fuelPlaceholderCar') : t('fuelPlaceholderMotorbike')}
    />
  );
}

/** Bốn hình thức nguồn xe — mỗi lựa chọn kèm một câu mô tả, nên là radio chứ không phải menu. */
function SourceTypeField({ control }: { control: Control<VehicleFormValues> }) {
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
function ServicePriceRemovalWarning({ control }: { control: Control<VehicleFormValues> }) {
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

/**
 * Bước 2 — giá thuê & chính sách.
 *
 * Ô giá dài hạn / có tài xế CHỈ hiện khi xe đăng dịch vụ đó ở bước 1 — không bắt chủ xe nhìn hai
 * ô giá vô nghĩa với một chiếc xe chỉ cho thuê tự lái.
 */
export function PricingStep({ control }: StepProps) {
  const t = useTranslations('Vehicles.form.prices');
  const tPolicies = useTranslations('Vehicles.form.policies');
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const offersLongTerm = serviceTypes.includes(SERVICE_TYPE.LONG_TERM);
  const offersWithDriver = serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER);
  /*
   * Đọc vô điều kiện (rules of hooks) — gợi ý giá tháng chỉ RENDER khi xe có dịch vụ dài hạn.
   * Cùng component với tab Giá & chính sách: hai bề mặt không được khuyên khác nhau.
   */
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });

  return (
    <YStack gap={space.md}>
      <MoneyField
        control={control}
        name="weekdayPrice"
        label={t('weekday')}
        placeholder={t('weekdayPlaceholder')}
        hint={t('weekdayHelp')}
      />
      <MoneyField
        control={control}
        name="weekendPrice"
        label={t('weekend')}
        placeholder={t('weekendPlaceholder')}
        hint={t('weekendHelp')}
      />
      <MoneyField
        control={control}
        name="hourlyPrice"
        label={t('hourly')}
        placeholder={t('hourlyPlaceholder')}
      />
      <NumberField
        control={control}
        name="discountPercent"
        percent
        label={t('discountPercent')}
        placeholder={t('discountPlaceholder')}
        hint={t('discountHelp')}
      />

      {offersLongTerm ? (
        <>
          <MoneyField
            control={control}
            name="monthlyPrice"
            label={t('monthly')}
            placeholder={t('monthlyPlaceholder')}
            hint={t('monthlyHelp')}
          />
          <LongTermPriceHint weekdayPrice={weekdayPrice} monthlyPrice={monthlyPrice} />
        </>
      ) : null}

      {offersWithDriver ? (
        <>
          <MoneyField
            control={control}
            name="withDriverDailyPrice"
            label={t('withDriverDaily')}
            placeholder={t('withDriverDailyPlaceholder')}
            hint={t('withDriverDailyHelp')}
          />
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
        </>
      ) : null}

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
    </YStack>
  );
}

/** Bước 3 — ảnh, tiện ích, mô tả. */
export function MediaStep({ control }: StepProps) {
  const t = useTranslations('Vehicles.form.media');
  const tCards = useTranslations('Vehicles.edit.cards');
  const { catalog } = useCatalog();

  const features = catalog[CATALOG_TYPE.VEHICLE_FEATURE] ?? [];

  return (
    /*
      HAI THẺ, đúng hai `<Card>` của web: "Hình ảnh xe" (`ImagesSection`) và "Tiện ích & mô tả"
      (`FeaturesDescriptionSection`) — tiện ích và mô tả đi CHUNG một thẻ, không tách ba.

      Thẻ chứ không phải tiêu đề trần: hai nhóm này là hai loại việc khác hẳn nhau (tải ảnh và
      nhập chữ), và một mặt phẳng riêng cho mỗi nhóm nói điều đó rõ hơn mọi dòng tiêu đề.

      Tiêu đề lấy thẳng `Vehicles.edit.cards.*` — đúng chuỗi web dùng; khai khoá mới cho cùng
      một chữ là mở đường cho hai bên lệch nhau.
    */
    <YStack gap={layout.section}>
      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{tCards('images')}</BlockTitle>
          <VehicleImagePicker
            control={control}
            name="mainImageUrl"
            label={t('mainImage')}
            required
          />
          <VehicleImagePicker control={control} name="images" label={t('gallery')} multiple />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{tCards('featuresDescription')}</BlockTitle>
          <FeaturesField control={control} features={features} />
          <TextField
            control={control}
            name="description"
            label={t('description')}
            placeholder={t('descriptionPlaceholder')}
            required
            multiline
            rows={5}
            maxLength={DESCRIPTION_MAX}
          />
        </YStack>
      </Card>
    </YStack>
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
function FeaturesField({
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
                        active
                          ? selected.filter((k) => k !== item.key)
                          : [...selected, item.key],
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
  const t = useTranslations('Vehicles.form.advanced');
  const domainLabel = useDomainLabel();

  const transmissionOptions = TRANSMISSION_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('transmissionType', value),
  }));

  return (
    <YStack gap={space.md}>
      <GroupTitle>{t('dimensionsTitle')}</GroupTitle>
      <NumberField control={control} name="lengthMm" label={t('lengthMm')} suffix="mm" placeholder={t('lengthPlaceholder')} />
      <NumberField control={control} name="widthMm" label={t('widthMm')} suffix="mm" placeholder={t('widthPlaceholder')} />
      <NumberField control={control} name="heightMm" label={t('heightMm')} suffix="mm" placeholder={t('heightPlaceholder')} />
      <NumberField control={control} name="curbWeightKg" label={t('curbWeightKg')} suffix="kg" placeholder={t('curbWeightPlaceholder')} />

      <GroupTitle>{t('engineTitle')}</GroupTitle>
      <NumberField
        control={control}
        name="engineDisplacementCc"
        label={t('engineDisplacementCc')}
        placeholder={t('enginePlaceholder')}
        suffix="cc"
      />
      <NumberField control={control} name="horsepowerHp" label={t('horsepowerHp')} suffix="HP" placeholder={t('horsepowerPlaceholder')} />
      <SelectField
        control={control}
        name="transmission"
        label={t('transmission')}
        options={transmissionOptions}
        placeholder={t('transmissionPlaceholder')}
      />

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
