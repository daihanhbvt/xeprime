import { memo, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE,
  requiredVehicleImageTypes,
  vehicleEnergySpecPolicy,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { LineIcon } from '@/components/icons/LineIcon';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { useImageSlotLabel } from '../hooks/use-vehicle-spec-items';

const EMPTY = '-';
/** Figma "Vehicle Image" của thư viện: cao 71, bo 12, ba cột cách 12. */
const THUMB_HEIGHT = 71;
const THUMB_WIDTH = '31%';
/** Lưới "Thông tin xe": hai cột, khe dọc 12 - ngang 16. */
const INFO_COL = '47%';

/**
 * Nội dung tấm "Xác nhận thông tin & gửi duyệt xe" - Figma Thêm xe MB (`24486:112581`), bản native
 * của web `CreateVehicleConfirmDialog`: Thư viện ảnh · Dịch vụ & giá (từng dịch vụ đang bật) · Thông
 * tin xe · ghi chú "Sau khi gửi…". Chỉ HIỂN THỊ những gì đã nhập; hai nút ở chân tấm do màn gọi.
 */
export const CreateVehicleConfirmContent = memo(function CreateVehicleConfirmContent({
  values,
  branchLabel,
  registration,
}: {
  values: VehicleFormValues;
  branchLabel: string | null;
  /** Số khung · số máy (cà vẹt - đọc hoặc gõ). */
  registration: { chassisNumber: string; engineNumber: string };
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.confirm');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const labels = useCatalogLabels();
  const slotLabel = useImageSlotLabel();
  // Dòng xe chọn bằng id danh mục - chữ `model` chỉ có sau khi server lưu, nên đọc nhãn từ danh mục.
  const { models } = useCatalogModels({
    vehicleType: values.vehicleType,
    brandKey: values.brand,
    includeId: values.vehicleCatalogModelId ?? null,
  });
  const modelLabel =
    models.find((m) => m.id === values.vehicleCatalogModelId)?.label ?? values.model ?? null;

  const text = (value: string | number | null | undefined) =>
    value == null || value === '' ? EMPTY : String(value);
  const money = (value: number | string | null | undefined) =>
    value == null || value === '' ? EMPTY : fmt.money(String(value));
  const isCar = values.vehicleType === VEHICLE_TYPE.CAR;
  const services = values.serviceTypes ?? [];
  const media = values.media ?? [];
  // Figma: "5/5 Ảnh" - số góc ảnh bắt buộc đã có / tổng số góc bắt buộc của loại xe.
  const requiredSlots = requiredVehicleImageTypes(values.vehicleType);
  const filledSlots = requiredSlots.filter((slot) => media.some((item) => item.type === slot)).length;
  const energy = vehicleEnergySpecPolicy(values.vehicleType, values.fuelType);

  const info: Array<{ label: string; value: string }> = [
    { label: t('vehicleType'), value: domainLabel('vehicleType', values.vehicleType) },
    { label: t('name'), value: text(values.name) },
    { label: t('plate'), value: text(values.plateNumber) },
    { label: t('branch'), value: text(branchLabel) },
    { label: t('chassis'), value: text(registration.chassisNumber) },
    { label: t('engine'), value: text(registration.engineNumber) },
    { label: t('brand'), value: text(labels.brandLabel(values.brand)) },
    { label: t('model'), value: text(modelLabel) },
    { label: t('year'), value: text(values.manufactureYear) },
    { label: t('color'), value: text(values.color) },
    ...(isCar ? [{ label: t('seats'), value: text(values.seatCount) }] : []),
    { label: t('fuel'), value: text(values.fuelType ? labels.fuelTypeLabel(values.fuelType) : null) },
    {
      label: t('transmission'),
      value: text(values.transmission ? domainLabel('transmissionType', values.transmission) : null),
    },
    // Hai dòng xe điện của Figma - chỉ khi nhiên liệu đang chọn có ô đó (cùng ma trận backend).
    ...(energy.electricRangeKm !== 'hidden'
      ? [
          {
            label: tCreate('confirm.electricRange'),
            value: values.electricRangeKm == null ? EMPTY : fmt.km(values.electricRangeKm),
          },
        ]
      : []),
    ...(energy.electricConsumption !== 'hidden'
      ? [
          {
            label: tCreate('confirm.electricConsumption'),
            value:
              values.electricConsumptionKwhPer100Km == null
                ? EMPTY
                : tCreate('confirm.electricConsumptionValue', {
                    value: fmt.measure(values.electricConsumptionKwhPer100Km),
                  }),
          },
        ]
      : []),
    ...(values.sourceType
      ? [{ label: t('source'), value: domainLabel('vehicleSourceType', values.sourceType) }]
      : []),
  ];

  return (
    <YStack gap={space.lg}>
      <YStack gap={space.md}>
        <SectionTitle
          title={t('gallery')}
          right={
            <Text
              col={colors.success}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.medium}
            >
              {tCreate('confirm.photoCount', { done: filledSlots, total: requiredSlots.length })}
            </Text>
          }
        />
        <XStack flexWrap="wrap" gap={space.md}>
          {media.map((item) => (
            <YStack key={item.url} w={THUMB_WIDTH} h={THUMB_HEIGHT} br={radius.control} ov="hidden">
              <RemoteImage
                uri={item.url}
                fallback={null}
                contentFit="cover"
                accessibilityLabel={slotLabel(item.type)}
              />
            </YStack>
          ))}
        </XStack>
      </YStack>

      <DashedRule />

      <YStack gap={space.md}>
        <SectionTitle title={t('pricing')} />
        {services.includes(SERVICE_TYPE.SELF_DRIVE) ? (
          <PriceGroup title={domainLabel('serviceType', SERVICE_TYPE.SELF_DRIVE)}>
            <PriceRow label={tCreate('confirm.weekday')} value={money(values.weekdayPrice)} />
            <PriceRow label={tCreate('confirm.weekend')} value={money(values.weekendPrice)} />
            <PriceRow label={tCreate('confirm.hourly')} value={money(values.hourlyPrice)} />
            <PriceRow
              label={tCreate('confirm.discount')}
              value={
                values.discountPercent
                  ? tCreate('confirm.discountValue', { percent: values.discountPercent })
                  : EMPTY
              }
              positive={Boolean(values.discountPercent)}
            />
          </PriceGroup>
        ) : null}
        {services.includes(SERVICE_TYPE.WITH_DRIVER) ? (
          <PriceGroup title={tCreate('services.with_driver.title')}>
            <PriceRow
              label={tCreate('confirm.withDriverDaily')}
              value={money(values.withDriverDailyPrice)}
            />
            <PriceRow
              label={tCreate('confirm.withDriverInterCity')}
              value={money(values.withDriverInterCityPrice)}
            />
            <PriceRow
              label={tCreate('confirm.withDriverOneWay')}
              value={money(values.withDriverOneWayPrice)}
            />
          </PriceGroup>
        ) : null}
        {services.includes(SERVICE_TYPE.LONG_TERM) ? (
          <PriceGroup title={tCreate('services.long_term.title')}>
            <PriceRow label={tCreate('confirm.monthly')} value={money(values.monthlyPrice)} />
          </PriceGroup>
        ) : null}
      </YStack>

      <DashedRule />

      <YStack gap={space.md}>
        <SectionTitle title={t('info')} />
        <XStack flexWrap="wrap" columnGap={space.lg} rowGap={space.md}>
          {info.map((row) => (
            <YStack key={row.label} w={INFO_COL} gap={2}>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {row.label}
              </Text>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {row.value}
              </Text>
            </YStack>
          ))}
        </XStack>
      </YStack>

      {/* Figma "OCR information": nền `status/information-low`, ⓘ 20 + chữ 14 medium xanh. */}
      <XStack bg={colors.infoLow} br={radius.card} p={space.md} gap={space.sm} ai="center">
        <LineIcon name="info-circle" size={20} color={colors.infoStrong} />
        <Text
          f={1}
          col={colors.infoStrong}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
        >
          {t('note')}
        </Text>
      </XStack>
    </YStack>
  );
});

function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text
        f={1}
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {right}
    </XStack>
  );
}

/** Đường kẻ đứt giữa các mục (Figma "Vector 19"). */
function DashedRule() {
  const colors = useColors();
  return <YStack h={0} borderTopWidth={1} borderStyle="dashed" borderColor={colors.border} />;
}

/** Nhóm giá của một dịch vụ: nền `bg/gray-50`, bo 16, đệm 12, khe 8. */
function PriceGroup({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack bg={colors.background} br={radius.card} p={space.md} gap={space.sm}>
      <Text
        col={colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.semibold}
      >
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function PriceRow({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const colors = useColors();
  const empty = value === EMPTY;
  return (
    <XStack jc="space-between" gap={space.sm}>
      <Text
        f={1}
        col={colors.textMuted}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
      >
        {label}
      </Text>
      <Text
        col={positive ? colors.success : empty ? colors.textPlaceholder : colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.medium}
      >
        {value}
      </Text>
    </XStack>
  );
}
