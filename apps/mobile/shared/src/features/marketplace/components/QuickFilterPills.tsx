import { Ionicons } from '@/components/icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { catalogItemAppliesTo } from '@/api/catalog';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
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

/** Phần khuất bên phải nhỏ hơn mức này coi như đã tới cuối. */
const END_TOLERANCE = 4;
/** Một lần chạm mũi tên cuộn ~70% bề rộng khung. */
const SCROLL_STEP_RATIO = 0.7;
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
  /*
   * Mũi tên "còn nữa" ở mép phải: chỉ một boolean - setState cùng giá trị thì không render lại,
   * nên cuộn không gây render mỗi khung hình.
   */
  const scrollRef = useRef<ScrollView>(null);
  const metrics = useRef({ x: 0, viewport: 0, content: 0 });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const updateHasMore = () => {
    const m = metrics.current;
    setCanLeft(m.x > END_TOLERANCE);
    setCanRight(m.content - m.viewport - m.x > END_TOLERANCE);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    metrics.current.x = e.nativeEvent.contentOffset.x;
    updateHasMore();
  };
  const scrollStep = (direction: 1 | -1) => {
    const m = metrics.current;
    const x = Math.max(0, m.x + direction * m.viewport * SCROLL_STEP_RATIO);
    scrollRef.current?.scrollTo({ x, animated: true });
  };

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

  // Icon đúng nét Figma (19707:80489 / 22185:115213) - SVG gốc trong `LineIcon`.
  const pills: { key: PillKey; icon: LineIconName; label: string; active: boolean }[] = [
    {
      key: 'demand',
      icon: 'chart',
      label: filters.serviceType ? domainLabel('serviceType', filters.serviceType) : t('demand'),
      active: Boolean(filters.serviceType),
    },
    {
      key: 'brand',
      icon: 'category',
      label: withCount(tf('brand'), filters.brand?.length),
      active: Boolean(filters.brand?.length),
    },
    {
      key: 'bodyType',
      icon: 'car-profile',
      label: withCount(
        t('quickPills.bodyType'),
        isMotorbike ? filters.motorbikeCategory?.length : filters.bodyType?.length,
      ),
      active: Boolean(filters.bodyType?.length || filters.motorbikeCategory?.length),
    },
    {
      key: 'price',
      icon: 'dollar-circle',
      label: t('quickPills.priceRange'),
      active: filters.priceMin != null || filters.priceMax != null,
    },
    {
      key: 'transmission',
      icon: 'filter-4',
      label: tf('transmission'),
      active: Boolean(filters.transmission?.length),
    },
    ...(isMotorbike
      ? []
      : [
          {
            key: 'seats' as const,
            icon: 'users-2' as LineIconName,
            label: t('quickPills.seats'),
            active: Boolean(filters.seats?.length),
          },
        ]),
    {
      key: 'amenities',
      icon: 'graph',
      label: tf('amenities'),
      active: QUICK_AMENITIES.some((key) => filters[key]),
    },
    {
      key: 'rating',
      icon: 'like',
      label:
        filters.minRating != null
          ? tf('modal.ratingFrom', { rating: filters.minRating })
          : tf('rating'),
      active: filters.minRating != null,
    },
  ];

  const title = pills.find((pill) => pill.key === open)?.label ?? '';

  return (
    <>
      {/*
        Vùng viên lọc - MỘT dòng cuộn ngang (người dùng chốt 09/11/2026, thay bản hai hàng của Figma
        `22185:115235`), khe 12. Viên: icon 16 #a4a7ae + chữ 12/18 medium #414651, đệm 6/8, bo pill;
        đang áp thì viền + chữ `primary`. Mũi tên "‹" / "›" ở hai mép khi còn viên khuất phía đó.
      */}
      <YStack position="relative">
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: layout.screenX }}
          scrollEventThrottle={32}
          onScroll={onScroll}
          onLayout={(e) => {
            metrics.current.viewport = e.nativeEvent.layout.width;
            updateHasMore();
          }}
          onContentSizeChange={(width) => {
            metrics.current.content = width;
            updateHasMore();
          }}
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
                    gap={4}
                    px={8}
                    minHeight={PILL_HEIGHT}
                    br={radius.pill}
                    bw={1}
                    bc={pill.active ? colors.primary : colors.border}
                    bg={pill.active ? colors.primarySubtle : colors.surface}
                  >
                    <LineIcon
                      name={pill.icon}
                      size={16}
                      color={pill.active ? colors.primary : colors.textPlaceholder}
                    />
                    <Text
                      col={pill.active ? colors.primary : colors.textMuted}
                      fos={fontSize.label}
                      fow={fontWeight.medium} lh={18}
                    >
                      {pill.label}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
        </ScrollView>
        {canLeft ? (
          <Pressable
            onPress={() => scrollStep(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('quickPills.scrollPrev')}
            hitSlop={8}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            <XStack h="100%" w={20} ai="center" jc="center" bg={colors.surface}>
              <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
            </XStack>
          </Pressable>
        ) : null}
        {canRight ? (
          <Pressable
            onPress={() => scrollStep(1)}
            accessibilityRole="button"
            accessibilityLabel={t('quickPills.scrollMore')}
            hitSlop={8}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            <XStack h="100%" w={20} ai="center" jc="center" bg={colors.surface}>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </XStack>
          </Pressable>
        ) : null}
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
