import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TRANSMISSION_TYPE_EXT,
  VEHICLE_TYPE,
  type MarketplaceFilters,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CheckOption, RadioOption } from '@/components/ui/RadioOption';
import type { IconName } from '@/components/ui/Chip';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

/** Mốc giá nhanh — đúng ba khoảng của `QuickFilterPills` web (#213). */
const PRICE_LOW = 500_000;
const PRICE_HIGH = 1_000_000;
/** Web chỉ bày 8 mục đầu của danh mục trong popover; phần còn lại ở tấm Bộ lọc. */
const POPOVER_ITEMS = 8;
const CAR_TRANSMISSION = [TRANSMISSION_TYPE_EXT.AUTOMATIC, TRANSMISSION_TYPE_EXT.MANUAL];
const MOTORBIKE_TRANSMISSION = [
  TRANSMISSION_TYPE_EXT.AUTOMATIC_CVT,
  TRANSMISSION_TYPE_EXT.SEMI_AUTOMATIC,
  TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH,
];
/**
 * Chiều cao một viên lọc — thấp hơn sàn chạm 8dp để cả hàng viên vừa một dòng như web; vùng chạm
 * vẫn đủ nhờ khoảng đệm của hàng cuộn ngang.
 */
const PILL_HEIGHT = sizing.touchTarget - 8;
/** Cỡ huy hiệu đếm số bộ lọc đang áp trên nút "Bộ lọc". */
const COUNT_BADGE_SIZE = 16;
const QUICK_AMENITIES = ['delivery', 'noCollateral', 'vatInvoice', 'discount'] as const;

type PillKey =
  | 'demand'
  | 'brand'
  | 'vehicleType'
  | 'price'
  | 'transmission'
  | 'seats'
  | 'amenities';
type ArrayField = 'brand' | 'bodyType' | 'motorbikeCategory' | 'seats';

/**
 * Hàng "viên lọc nhanh" của trang tìm kiếm — bản native của `QuickFilterPills` web (#213): Nhu cầu ·
 * Hãng xe · Loại xe · Giá · Hộp số · Số chỗ (ô tô) · Tiện ích, rồi nút Bộ lọc. Popover của web thành
 * tấm trượt; lựa chọn ÁP NGAY như web (ô tick hiệu lực tức thì, nút "Áp dụng" chỉ đóng tấm).
 *
 * Bỏ viên "Đánh giá" của web: hai lựa chọn của nó chỉ đặt `sort=recommended`, không lọc theo điểm
 * (xem lỗi web ở sổ đồng bộ) — hứa "4.5 trở lên" mà không lọc là nói dối khách.
 */
export function QuickFilterPills({
  filters,
  onChange,
  onOpenFilters,
  appliedCount,
}: {
  filters: MarketplaceFilters;
  onChange: (patch: Partial<MarketplaceFilters>) => void;
  onOpenFilters: () => void;
  appliedCount: number;
}) {
  const t = useTranslations('Marketplace.results');
  const tf = useTranslations('Marketplace.filterPanel');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const colors = useColors();
  const { catalog } = useCatalog();
  const [open, setOpen] = useState<PillKey | null>(null);

  const isMotorbike = filters.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const brands = catalog[CATALOG_TYPE.VEHICLE_BRAND].slice(0, POPOVER_ITEMS);
  const bodyTypes = catalog[CATALOG_TYPE.BODY_TYPE].slice(0, POPOVER_ITEMS);
  const transmissions = isMotorbike ? MOTORBIKE_TRANSMISSION : CAR_TRANSMISSION;

  const toggle = (field: ArrayField, value: string) => {
    const list = filters[field] ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ [field]: next.length > 0 ? next : undefined });
  };
  const close = () => setOpen(null);

  const priceRanges = [
    { key: 'any', label: tf('any'), min: undefined, max: undefined },
    { key: 'low', label: tf('priceUnder', { amount: fmt.money(String(PRICE_LOW)) }), min: undefined, max: PRICE_LOW },
    {
      key: 'mid',
      label: tf('priceBetween', {
        min: fmt.money(String(PRICE_LOW)),
        max: fmt.money(String(PRICE_HIGH)),
      }),
      min: PRICE_LOW,
      max: PRICE_HIGH,
    },
    { key: 'high', label: tf('priceOver', { amount: fmt.money(String(PRICE_HIGH)) }), min: PRICE_HIGH, max: undefined },
  ];

  const pills: { key: PillKey; icon: IconName; label: string; active: boolean }[] = [
    {
      key: 'demand',
      icon: 'options-outline',
      label: filters.serviceType ? domainLabel('serviceType', filters.serviceType) : t('demand'),
      active: Boolean(filters.serviceType),
    },
    {
      key: 'brand',
      icon: 'grid-outline',
      label: filters.brand?.length ? `${filters.brand.length} ${tf('brand')}` : tf('brand'),
      active: Boolean(filters.brand?.length),
    },
    {
      key: 'vehicleType',
      icon: 'car-outline',
      label: tf('vehicleType'),
      active: Boolean(filters.bodyType?.length || filters.motorbikeCategory?.length),
    },
    {
      key: 'price',
      icon: 'cash-outline',
      label: tf('priceRange'),
      active: filters.priceMin != null || filters.priceMax != null,
    },
    {
      key: 'transmission',
      icon: 'cog-outline',
      label: filters.transmission?.[0]
        ? domainLabel('transmissionType', filters.transmission[0])
        : t('transmission'),
      active: Boolean(filters.transmission?.length),
    },
    ...(isMotorbike
      ? []
      : [
          {
            key: 'seats' as const,
            icon: 'people-outline' as IconName,
            label: tf('seats'),
            active: Boolean(filters.seats?.length),
          },
        ]),
    {
      key: 'amenities',
      icon: 'star-outline',
      label: tf('amenities'),
      active: QUICK_AMENITIES.some((key) => filters[key]),
    },
  ];

  const title = pills.find((pill) => pill.key === open)?.label ?? '';

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.xs, paddingRight: layout.screenX }}
      >
        {pills.map((pill) => (
          <Pressable
            key={pill.key}
            onPress={() => setOpen(pill.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: pill.active }}
          >
            <XStack
              ai="center"
              gap={space.xs}
              px={space.md}
              minHeight={PILL_HEIGHT}
              br={radius.pill}
              bw={1}
              bc={pill.active ? colors.primary : colors.border}
              bg={pill.active ? colors.primaryLight : colors.surface}
            >
              <Ionicons
                name={pill.icon}
                size={iconSize.xs}
                color={pill.active ? colors.primaryActive : colors.textMuted}
              />
              <Text
                col={pill.active ? colors.primaryActive : colors.text}
                fos={fontSize.bodySm}
                fow={fontWeight.medium}
              >
                {pill.label}
              </Text>
              <Ionicons name="chevron-down" size={iconSize.xs} color={colors.textMuted} />
            </XStack>
          </Pressable>
        ))}
        <Pressable onPress={onOpenFilters} accessibilityRole="button">
          <XStack
            ai="center"
            gap={space.xs}
            px={space.md}
            minHeight={PILL_HEIGHT}
            br={radius.pill}
            bg={colors.primary}
          >
            <Ionicons name="filter-outline" size={iconSize.xs} color={colors.onPrimary} />
            <Text col={colors.onPrimary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {tf('title')}
            </Text>
            {appliedCount > 0 ? (
              <YStack minWidth={COUNT_BADGE_SIZE} h={COUNT_BADGE_SIZE} px={3} br={radius.pill} bg={colors.surface} ai="center" jc="center">
                <Text col={colors.primaryActive} fos={fontSize.meta} fow={fontWeight.bold}>
                  {appliedCount}
                </Text>
              </YStack>
            ) : null}
          </XStack>
        </Pressable>
      </ScrollView>

      <BottomSheet
        open={open !== null}
        onClose={close}
        title={title}
        footer={<Button label={tf('apply')} onPress={close} />}
      >
        <YStack gap={space.xs}>
          {open === 'demand' ? (
            <>
              <RadioOption
                label={t('allServices')}
                checked={!filters.serviceType}
                onPress={() => {
                  onChange({ serviceType: undefined, routeType: undefined });
                  close();
                }}
              />
              {SERVICE_TYPE_VALUES.map((value) => (
                <RadioOption
                  key={value}
                  label={domainLabel('serviceType', value)}
                  checked={filters.serviceType === value}
                  onPress={() => {
                    onChange(
                      value === SERVICE_TYPE.WITH_DRIVER
                        ? { serviceType: value }
                        : { serviceType: value, routeType: undefined },
                    );
                    close();
                  }}
                />
              ))}
            </>
          ) : null}

          {open === 'brand'
            ? brands.map((item) => (
                <CheckOption
                  key={item.key}
                  label={item.label}
                  checked={(filters.brand ?? []).includes(item.key)}
                  onPress={() => toggle('brand', item.key)}
                />
              ))
            : null}

          {open === 'vehicleType'
            ? isMotorbike
              ? MOTORBIKE_CATEGORY_VALUES.map((value) => (
                  <CheckOption
                    key={value}
                    label={domainLabel('motorbikeCategory', value)}
                    checked={(filters.motorbikeCategory ?? []).includes(value)}
                    onPress={() => toggle('motorbikeCategory', value)}
                  />
                ))
              : bodyTypes.map((item) => (
                  <CheckOption
                    key={item.key}
                    label={item.label}
                    checked={(filters.bodyType ?? []).includes(item.key)}
                    onPress={() => toggle('bodyType', item.key)}
                  />
                ))
            : null}

          {open === 'price'
            ? priceRanges.map((range) => (
                <RadioOption
                  key={range.key}
                  label={range.label}
                  checked={filters.priceMin === range.min && filters.priceMax === range.max}
                  onPress={() => {
                    onChange({ priceMin: range.min, priceMax: range.max });
                    close();
                  }}
                />
              ))
            : null}

          {open === 'transmission' ? (
            <>
              <RadioOption
                label={tf('any')}
                checked={!filters.transmission?.length}
                onPress={() => {
                  onChange({ transmission: undefined });
                  close();
                }}
              />
              {transmissions.map((value) => (
                <RadioOption
                  key={value}
                  label={domainLabel('transmissionType', value)}
                  checked={filters.transmission?.[0] === value}
                  onPress={() => {
                    onChange({ transmission: [value] });
                    close();
                  }}
                />
              ))}
            </>
          ) : null}

          {open === 'seats'
            ? SEAT_BUCKET_VALUES.map((value) => (
                <CheckOption
                  key={value}
                  label={domainLabel('seatBucket', value, SEAT_BUCKET_LABEL[value])}
                  checked={(filters.seats ?? []).includes(value)}
                  onPress={() => toggle('seats', value)}
                />
              ))
            : null}

          {open === 'amenities'
            ? QUICK_AMENITIES.map((key) => (
                <CheckOption
                  key={key}
                  label={domainLabel('listingAmenity', key)}
                  checked={Boolean(filters[key])}
                  onPress={() => onChange({ [key]: filters[key] ? undefined : true })}
                />
              ))
            : null}
        </YStack>
      </BottomSheet>
    </>
  );
}
