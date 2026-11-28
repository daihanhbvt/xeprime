import { Pressable } from 'react-native';
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
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { LineIcon } from '@/components/icons/LineIcon';
import { Chip } from '@/components/ui/Chip';
import { CheckMark } from '@/components/ui/CheckMark';
import { FieldLabel } from '@/components/ui/Field';
import { LockedValueField } from '@/components/ui/LockedValueField';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { LongTermPriceHint } from '@/features/rental-policies/components/LongTermPriceHint';
import {
  CatalogCardCarousel,
  CatalogCardPicker,
} from '@/features/catalog/components/CatalogCardPicker';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useCatalogSpecLock, useSpecFieldLock } from '../hooks/use-vehicle-data';
import {
  useCatalogRentText,
  CatalogValueHint,
  useCatalogValueText,
  useVehicleCatalogSuggestion,
} from './CatalogSuggestions';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';

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
 * Giá trị xe (ADR 0088) - mẫu số phí bảo hiểm VCX, chỉ ô tô. Bản native của ô "Giá trị xe" bên
 * web: nhập tiền + nhãn giải thích, kèm gợi ý theo Dữ liệu xe (ADR 0090) chỉ điền khi chủ xe bấm.
 */
export function InsuredValueField({
  control,
  setValue,
  creating = false,
}: {
  control: Control<VehicleFormValues>;
  setValue: UseFormSetValue<VehicleFormValues>;
  /**
   * Wizard THÊM xe: giá tham khảo đã TỰ ĐIỀN vào ô (`useAutofillCatalogRent`) nên không có nút
   * "Dùng giá trị này" - câu giá tham khảo nằm luôn trong chú thích của ô.
   */
  creating?: boolean;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const suggestion = useVehicleCatalogSuggestion({
    modelId: useWatch({ control, name: 'vehicleCatalogModelId' }),
    variantId: useWatch({ control, name: 'vehicleCatalogVariantId' }),
    year: useWatch({ control, name: 'manufactureYear' }),
  });
  const valueText = useCatalogValueText();
  const tip = t('insuredValueTip');
  const hint = creating && suggestion?.value ? `${tip}\n${valueText(suggestion.value)}` : tip;
  return (
    <YStack gap={space.xs}>
      <MoneyField control={control} name="insuredValue" label={t('insuredValue')} hint={hint} />
      {creating || !suggestion?.value ? null : (
        <CatalogValueHint
          value={suggestion.value}
          onApply={(amount) =>
            setValue('insuredValue', amount, { shouldDirty: true, shouldValidate: true })
          }
        />
      )}
    </YStack>
  );
}

/**
 * Kiểu dáng xe — thẻ có ảnh thay vì danh sách chữ.
 *
 * Đây chính là chiều "Loại xe" khách dùng để lọc ngoài chợ, nên chọn sai là xe không ai tìm
 * thấy; ảnh minh hoạ làm việc chọn tường minh hơn hẳn một danh sách "CUV / SUV / MPV" bằng chữ.
 * Cùng component với bộ lọc chợ xe (`CatalogCardPicker`) nên hai màn không thể lệch ảnh.
 */
export function BodyTypePicker({
  control,
  carousel,
}: {
  control: Control<VehicleFormValues>;
  /**
   * Dải ngang của màn Chỉnh sửa xe (Figma `24228:105329`): tiêu đề + "Vuốt ngang để xem" nằm ở
   * đầu thẻ chứa, nên ở đây không vẽ nhãn/gợi ý riêng. Chỉ đổi bố cục, cùng một phép chọn.
   */
  carousel?: { prevLabel: string; nextLabel: string };
}) {
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
  const fieldLock = toFieldLock(lock, t('bodyType'));

  if (carousel) {
    /*
     * Dải thẻ (thêm xe / sửa xe): mẫu xe có kiểu dáng ⇒ thẻ đó TỰ SÁNG ngay trong dải, không đổi sang
     * ô chỉ-đọc dạng select (người dùng chốt 28/11/2026). Chạm thẻ khác = mở khoá rồi chọn, đúng
     * nghĩa cây bút của ô khoá.
     */
    const lockedNow = lock.locked && Boolean(lockedLabel);
    return (
      <YStack gap={space.xs}>
        <Controller
          control={control}
          name="bodyType"
          render={({ field }) => (
            <CatalogCardCarousel
              ariaLabel={t('bodyType')}
              items={items}
              value={field.value ? [field.value] : []}
              onChange={(next) => {
                const picked = next[next.length - 1] ?? null;
                // Chạm lại đúng thẻ đang khoá thì giữ nguyên - không bỏ chọn giá trị theo mẫu.
                if (lockedNow && picked === null) return;
                if (lockedNow && fieldLock.locked) fieldLock.onUnlock();
                field.onChange(picked);
              }}
              prevLabel={carousel.prevLabel}
              nextLabel={carousel.nextLabel}
            />
          )}
        />
        {lockedNow ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {tCatalog('specLocked')}
          </Text>
        ) : null}
      </YStack>
    );
  }

  if (lock.locked && lockedLabel) {
    return (
      <LockedValueField
        label={t('bodyType')}
        value={lockedLabel}
        lock={fieldLock}
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

/**
 * Một gợi ý cho cả ba nhóm giá - một query, không ba (cùng khoá với web). Wizard thêm xe đã TỰ ĐIỀN
 * giá tham khảo (`useAutofillCatalogRent`) nên không có nút "Dùng …": câu tham khảo ghép vào ⓘ của ô
 * (`help` + giá tham khảo + khoảng giá trên chợ) - người dùng chốt 28/11/2026.
 */
export function useCatalogPriceHint({ control }: Pick<PriceFieldsProps, 'control'>) {
  const suggestion = useVehicleCatalogSuggestion({
    modelId: useWatch({ control, name: 'vehicleCatalogModelId' }),
    variantId: useWatch({ control, name: 'vehicleCatalogVariantId' }),
    year: useWatch({ control, name: 'manufactureYear' }),
  });
  const rentText = useCatalogRentText();
  return (help: string, field: CatalogPriceField): string => {
    const reference = rentText(suggestion, field);
    return reference ? `${help}\n${reference}` : help;
  };
}

/** Giá DÀI HẠN (thẻ "Thuê xe dài hạn"): giá tháng + gợi ý giá tháng theo giá ngày đang nhập. */
export function LongTermPriceFields({ control }: PriceFieldsProps) {
  const t = useTranslations('Vehicles.form.prices');
  const hint = useCatalogPriceHint({ control });
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  return (
    <YStack gap={space.xs}>
      <MoneyField
        control={control}
        name="monthlyPrice"
        label={t('monthly')}
        required
        placeholder={t('monthlyPlaceholder')}
        hint={hint(t('monthlyHelp'), 'monthlyPrice')}
        hintInLabel
      />
      <LongTermPriceHint weekdayPrice={weekdayPrice} monthlyPrice={monthlyPrice} />
    </YStack>
  );
}

/**
 * Thẻ "Tiện ích xe" - bước 3 của wizard thêm xe (Figma Thêm xe MB `24486:111197`): viên tiện ích
 * lọc theo loại xe (tiện ích là một chiều lọc ngoài chợ - "cửa sổ trời" cho xe máy là sai).
 */
export function CreateFeaturesCard({ control }: { control: Control<VehicleFormValues> }) {
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const { catalog } = useCatalog();
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const features = (catalog[CATALOG_TYPE.VEHICLE_FEATURE] ?? []).filter((item) =>
    vehicleFeatureAppliesTo(item.key, vehicleType),
  );
  return (
    <InfoGroupCard title={tCreate('featuresTitle')}>
      <FeaturesField control={control} features={features} variant="pill" />
    </InfoGroupCard>
  );
}

/**
 * Thẻ "Mô tả xe" (Figma `24486:111449`): bộ đếm "x/4.000" ở đầu thẻ, ô nhiều dòng không nhãn. Văn
 * bản thường, trần theo schema - không thanh định dạng (người dùng chốt 17/11 và 27/11/2026).
 */
export function CreateDescriptionCard({ control }: { control: Control<VehicleFormValues> }) {
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const fmt = useAppFormat();
  const description = useWatch({ control, name: 'description' });
  return (
    <InfoGroupCard
      title={tCreate('descriptionTitle')}
      extra={`${fmt.count(String(description ?? '').length)}/${fmt.count(DESCRIPTION_MAX)}`}
    >
      <TextField
        control={control}
        name="description"
        label={tCreate('descriptionTitle')}
        hideLabel
        placeholder={tCreate('descriptionPlaceholder')}
        multiline
        rows={6}
        maxLength={DESCRIPTION_MAX}
        hideCount
      />
    </InfoGroupCard>
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
  variant = 'chips',
}: {
  control: Control<VehicleFormValues>;
  features: readonly { key: string; label: string }[];
  /**
   * `checkbox` - danh sách ô tick một cột của màn Chỉnh sửa xe (Figma "Driver Assistance
   * Features" `24705:44850`): không nhãn riêng (tiêu đề thẻ đã nói), ô 16, chữ 14/20.
   */
  variant?: 'chips' | 'checkbox' | 'pill';
}) {
  const t = useTranslations('Vehicles.form.media');
  const colors = useColors();

  return (
    <Controller
      control={control}
      name="features"
      render={({ field }) => {
        const selected = (field.value ?? []) as string[];
        const toggle = (key: string, active: boolean) =>
          field.onChange(active ? selected.filter((k) => k !== key) : [...selected, key]);
        if (variant === 'checkbox') {
          return (
            <YStack gap={space.sm + space.xs} accessibilityLabel={t('features')}>
              {features.map((item) => {
                const active = selected.includes(item.key);
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => toggle(item.key, active)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={item.label}
                  >
                    <XStack gap={space.sm} ai="flex-start">
                      <YStack pt={2}>
                        <CheckMark checked={active} size="sm" />
                      </YStack>
                      <Text
                        f={1}
                        col={colors.textMuted}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                      >
                        {item.label}
                      </Text>
                    </XStack>
                  </Pressable>
                );
              })}
            </YStack>
          );
        }
        if (variant === 'pill') {
          return (
            <XStack flexWrap="wrap" gap={space.sm} accessibilityLabel={t('features')}>
              {features.map((item) => (
                <FeaturePill
                  key={item.key}
                  label={item.label}
                  selected={selected.includes(item.key)}
                  onPress={() => toggle(item.key, selected.includes(item.key))}
                />
              ))}
            </XStack>
          );
        }
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

/**
 * Viên tiện ích (Figma `24512:136839`): đệm 8/4, bo tròn, chữ 12. Đã chọn = nền `bg/primary-25`, viền
 * `stroke/primary-300`, dấu tích 12 + chữ medium `text/brand/primary-2`; chưa chọn = nền `bg/gray-50`,
 * viền `stroke/gray-low200`, chữ thường `text/gray/medium`.
 */
function FeaturePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <XStack
        ai="center"
        gap={space.xs}
        px={space.sm}
        py={space.xs}
        br={radius.pill}
        bw={1}
        bc={selected ? colors.brandBorder : colors.border}
        bg={selected ? colors.brandWash : colors.background}
      >
        {selected ? <LineIcon name="tick" size={12} color={colors.brandLink} /> : null}
        <Text
          col={selected ? colors.brandLink : colors.textMuted}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={selected ? fontWeight.medium : fontWeight.regular}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
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
