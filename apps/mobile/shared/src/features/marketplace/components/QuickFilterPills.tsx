import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  LISTING_MIN_RATING_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TRANSMISSION_TYPE_EXT_LABEL,
  VEHICLE_TYPE,
  type MarketplaceFilters,
  type VehicleType,
} from '@xeprime/types';
import { serviceTypesFor } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { CheckOption, RadioOption } from '@/components/ui/RadioOption';
import type { IconName } from '@/components/ui/Chip';
import { catalogItemAppliesTo } from '@/api/catalog';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import {
  isPriceBandSelected,
  priceBandsFor,
  quickTransmissionsFor,
  usePriceBandLabel,
} from '../filter-constants';

/** Web chỉ bày 8 mục đầu của danh mục trong popover; phần còn lại ở tấm Bộ lọc. */
const POPOVER_ITEMS = 8;
/**
 * Chiều cao một viên lọc — thấp hơn sàn chạm 8dp để cả hàng viên vừa một dòng như web; vùng chạm
 * vẫn đủ nhờ khoảng đệm của hàng cuộn ngang.
 */
const PILL_HEIGHT = 32;
const QUICK_AMENITIES = ['delivery', 'noCollateral', 'vatInvoice', 'discount'] as const;
/** Nhãn ô tick tiện ích — đúng khoá web dùng trong popover "Tiện ích". */
const AMENITY_LABEL_KEY = {
  delivery: 'amenityDesc.delivery',
  noCollateral: 'amenityDesc.noCollateral',
  vatInvoice: 'vatInvoice',
  discount: 'amenityDesc.discount',
} as const;

type PillKey =
  | 'demand'
  | 'brand'
  | 'bodyType'
  | 'price'
  | 'transmission'
  | 'seats'
  | 'amenities'
  | 'rating';

/** Figma "List - MB" (`20043:57771`): hàng đầu 4 viên (Nhu cầu · Hãng xe · Kiểu xe · Khoảng giá), phần còn lại hàng hai. */
const FIRST_ROW = 4;
type ArrayField = 'brand' | 'bodyType' | 'motorbikeCategory' | 'seats';

/**
 * Hàng "viên lọc nhanh" của trang tìm kiếm — nghiệp vụ như `QuickFilterPills` web (#213/#214/#216),
 * TRÌNH BÀY theo Figma "List - MB" (`20043:57771`, người dùng chốt 27/10/2026): tám viên có icon,
 * xếp HAI hàng trong một khung cuộn ngang, không mũi tên. Nút "Bộ lọc" không còn ở đây — nó là ô
 * vuông cạnh khung tìm kiếm. Popover của web thành tấm trượt; lựa chọn ÁP NGAY.
 *
 * Viên "Đánh giá" lọc thật theo `minRating` (API có từ #222, danh sách đóng `LISTING_MIN_RATING_VALUES`).
 */
export function QuickFilterPills({
  filters,
  onChange,
}: {
  filters: MarketplaceFilters;
  onChange: (patch: Partial<MarketplaceFilters>) => void;
}) {
  const t = useTranslations('Marketplace.results');
  const tf = useTranslations('Marketplace.filterPanel');
  const domainLabel = useDomainLabel();
  const colors = useColors();
  const { catalog } = useCatalog();
  const [open, setOpen] = useState<PillKey | null>(null);

  const isMotorbike = filters.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const brandItems = catalog[CATALOG_TYPE.VEHICLE_BRAND];
  /*
   * Hãng theo loại xe đọc từ CHÍNH danh mục (`vehicleTypes`, admin khai) như web. Hãng ĐANG CHỌN
   * luôn còn trong danh sách dù không áp dụng cho loại xe hiện tại, để khách bỏ chọn được thay vì
   * mang một bộ lọc vô hình.
   */
  const brands = useMemo(() => {
    const selected = new Set(filters.brand ?? []);
    return brandItems
      .filter((item) => selected.has(item.key) || catalogItemAppliesTo(item, filters.vehicleType))
      .slice(0, POPOVER_ITEMS);
  }, [brandItems, filters.brand, filters.vehicleType]);
  const bodyTypes = catalog[CATALOG_TYPE.BODY_TYPE].slice(0, POPOVER_ITEMS);
  const priceBands = priceBandsFor(filters.vehicleType);
  const transmissions = quickTransmissionsFor(filters.vehicleType);
  const priceBandLabel = usePriceBandLabel();
  const withCount = (label: string, count: number | undefined) =>
    count ? tf('labelWithCount', { label, count }) : label;

  const toggle = (field: ArrayField, value: string) => {
    const list = filters[field] ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ [field]: next.length > 0 ? next : undefined });
  };
  const close = () => setOpen(null);

  // Icon theo Figma (bộ nét riêng) — dịch sang Ionicons gần nghĩa nhất.
  const pills: { key: PillKey; icon: IconName; label: string; active: boolean }[] = [
    {
      key: 'demand',
      icon: 'stats-chart-outline',
      label: filters.serviceType ? domainLabel('serviceType', filters.serviceType) : t('demand'),
      active: Boolean(filters.serviceType),
    },
    {
      key: 'brand',
      icon: 'apps-outline',
      label: withCount(tf('brand'), filters.brand?.length),
      active: Boolean(filters.brand?.length),
    },
    {
      key: 'bodyType',
      icon: 'car-outline',
      label: withCount(
        tf('bodyType'),
        isMotorbike ? filters.motorbikeCategory?.length : filters.bodyType?.length,
      ),
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
      icon: 'grid-outline',
      label: tf('transmission'),
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
      icon: 'pie-chart-outline',
      label: tf('amenities'),
      active: QUICK_AMENITIES.some((key) => filters[key]),
    },
    {
      key: 'rating',
      icon: 'thumbs-up-outline',
      label:
        filters.minRating != null
          ? tf('modal.ratingFrom', { rating: filters.minRating })
          : tf('rating'),
      active: filters.minRating != null,
    },
  ];
  const rows = [pills.slice(0, FIRST_ROW), pills.slice(FIRST_ROW)];

  const title = pills.find((pill) => pill.key === open)?.label ?? '';

  return (
    <>
      {/*
        Vùng viên lọc — Figma `20043:57771`: hai hàng, MỖI hàng một khung cuộn ngang RIÊNG (người dùng chốt
        29/10/2026: vuốt hàng trên không kéo hàng dưới),
        khe 8 giữa viên và giữa hai hàng. Viên: nền `bg-container`, viền `color-border` 1px, bo pill,
        cao 32, đệm ngang 12, icon 16 `text-tertiary` + chữ body 14 `text-secondary`; đang áp thì viền
        `primary`, nền `primary-subtle`, chữ `primary-strong` semibold.
      */}
      <YStack gap={space.sm}>
          {rows.map((row, index) => (
            <ScrollView
              key={index}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm, paddingRight: layout.screenX }}
            >
              {row.map((pill) => (
                <Pressable
                  key={pill.key}
                  onPress={() => setOpen(pill.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pill.active }}
                >
                  <XStack
                    ai="center"
                    gap={6}
                    px={12}
                    minHeight={PILL_HEIGHT}
                    br={radius.pill}
                    bw={1}
                    bc={pill.active ? colors.primary : colors.border}
                    bg={pill.active ? colors.primarySubtle : colors.surface}
                  >
                    <Ionicons
                      name={pill.icon}
                      size={iconSize.sm}
                      color={pill.active ? colors.primaryHover : colors.placeholder}
                    />
                    <Text
                      col={pill.active ? colors.primaryStrong : colors.textMuted}
                      fos={fontSize.body}
                      fow={pill.active ? fontWeight.semibold : fontWeight.regular}
                    >
                      {pill.label}
                    </Text>
                    {/* Mũi tên xổ xuống: báo viên này MỞ một danh sách chọn (người dùng chốt 27/10/2026). */}
                    <Ionicons
                      name="chevron-down"
                      size={iconSize.xs}
                      color={pill.active ? colors.primaryHover : colors.placeholder}
                    />
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          ))}
      </YStack>

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
              {/* Xe máy KHÔNG có thuê tài xế — danh sách nhu cầu theo loại xe đang lọc (`serviceTypesFor`). */}
              {(filters.vehicleType
                ? serviceTypesFor(filters.vehicleType as VehicleType)
                : SERVICE_TYPE_VALUES
              ).map((value) => (
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

          {open === 'bodyType'
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

          {open === 'price' ? (
            <>
              <RadioOption
                label={tf('any')}
                checked={filters.priceMin == null && filters.priceMax == null}
                onPress={() => {
                  onChange({ priceMin: undefined, priceMax: undefined });
                  close();
                }}
              />
              {priceBands.map((band) => (
                <RadioOption
                  key={`${band.min ?? ''}-${band.max ?? ''}`}
                  label={priceBandLabel(band)}
                  checked={isPriceBandSelected(band, filters.priceMin, filters.priceMax)}
                  onPress={() => {
                    onChange({ priceMin: band.min, priceMax: band.max });
                    close();
                  }}
                />
              ))}
            </>
          ) : null}

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
                  label={domainLabel('transmissionType', value, TRANSMISSION_TYPE_EXT_LABEL[value])}
                  checked={filters.transmission?.includes(value) ?? false}
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
                  label={tf(AMENITY_LABEL_KEY[key])}
                  checked={Boolean(filters[key])}
                  onPress={() => onChange({ [key]: filters[key] ? undefined : true })}
                />
              ))
            : null}

          {open === 'rating' ? (
            <>
              <RadioOption
                label={tf('any')}
                checked={filters.minRating == null}
                onPress={() => {
                  onChange({ minRating: undefined });
                  close();
                }}
              />
              {LISTING_MIN_RATING_VALUES.map((value) => (
                <RadioOption
                  key={value}
                  label={tf('modal.ratingFrom', { rating: value })}
                  checked={filters.minRating === value}
                  onPress={() => {
                    onChange({ minRating: value });
                    close();
                  }}
                />
              ))}
            </>
          ) : null}
        </YStack>
      </BottomSheet>
    </>
  );
}
