import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  DEFAULT_LISTING_SORT,
  LISTING_AMENITY_DESC,
  LISTING_AMENITY_LABEL,
  LISTING_AMENITY_VALUES,
  SEAT_BUCKET_LABEL,
  SEAT_BUCKET_VALUES,
  VEHICLE_TYPE,
  vehicleFuelTypesFor,
  type ListingSort,
} from '@xeprime/types';
import { catalogLabel } from '@xeprime/api-client';
import { type MarketplaceFilters } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { SortMenu } from './SortMenu';
import { BrandMark } from '@/features/catalog/components/BrandMark';
import { CatalogCardPicker } from '@/features/catalog/components/CatalogCardPicker';
import { useCatalog, useCatalogLabels } from '@/features/catalog/use-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { useListingFacets } from '../hooks/use-search-results';

const PRICE_STEP = 50_000;
/** Trần dự phòng khi chưa có dữ liệu giá (facet đang tải / chưa có xe). */
const PRICE_FALLBACK_MAX = 3_000_000;
const SHEET_RATIO = 0.9;

/** Phần filter mà tấm này SỞ HỮU — bản nháp cục bộ, chỉ áp khi bấm "Áp dụng". */
interface FilterDraft {
  sort: ListingSort;
  priceMin?: number;
  priceMax?: number;
  bodyType: string[];
  brand: string[];
  seats: string[];
  fuelType: string[];
  features: string[];
  hourly: boolean;
  delivery: boolean;
  noCollateral: boolean;
  discount: boolean;
}

function draftFromFilters(filters: MarketplaceFilters): FilterDraft {
  return {
    sort: filters.sort ?? DEFAULT_LISTING_SORT,
    ...(filters.priceMin === undefined ? {} : { priceMin: filters.priceMin }),
    ...(filters.priceMax === undefined ? {} : { priceMax: filters.priceMax }),
    bodyType: filters.bodyType ?? [],
    brand: filters.brand ?? [],
    seats: filters.seats ?? [],
    fuelType: filters.fuelType ?? [],
    features: filters.features ?? [],
    hourly: filters.hourly ?? false,
    delivery: filters.delivery ?? false,
    noCollateral: filters.noCollateral ?? false,
    discount: filters.discount ?? false,
  };
}

/** Nháp → patch. Mảng rỗng / `false` / `undefined` sẽ bị `setFilters` xoá khỏi ngữ cảnh. */
function draftToPatch(draft: FilterDraft): Partial<MarketplaceFilters> {
  return {
    sort: draft.sort === DEFAULT_LISTING_SORT ? undefined : draft.sort,
    priceMin: draft.priceMin,
    priceMax: draft.priceMax,
    bodyType: draft.bodyType,
    brand: draft.brand,
    seats: draft.seats,
    fuelType: draft.fuelType,
    features: draft.features,
    hourly: draft.hourly,
    delivery: draft.delivery,
    noCollateral: draft.noCollateral,
    discount: draft.discount,
  };
}

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/**
 * Tấm "Bộ lọc" — bản native của `FilterPanel.tsx`.
 *
 * Faceted filter đầy đủ: sắp xếp, khoảng giá, kiểu dáng, hãng xe, số chỗ, nhiên liệu, tính năng,
 * tiện ích. Mỗi lựa chọn kèm SỐ XE ĐẾM THẬT từ `/public/listings/facets` — backend đếm mỗi chiều
 * với mọi filter TRỪ chính nó, nên chọn SUV vẫn thấy Sedan còn bao nhiêu xe.
 *
 * Lựa chọn giữ ở bản nháp cục bộ, chỉ áp khi bấm "Áp dụng (N xe)". N là `total` của bản nháp và
 * cập nhật sống (debounce 300ms) — khách biết trước kết quả trước khi đóng tấm.
 */
export function FilterSheet({
  open,
  filters,
  onApply,
  onClose,
}: {
  open: boolean;
  /** Ngữ cảnh ĐANG áp dụng — nguồn để nạp lại bản nháp mỗi lần mở. */
  filters: MarketplaceFilters;
  onApply: (patch: Partial<MarketplaceFilters>) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Marketplace.filterPanel');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<FilterDraft>(() => draftFromFilters(filters));

  /*
   * Mỗi lần MỞ thì nạp lại bản nháp từ ngữ cảnh đang áp dụng — bỏ dở lần trước không để lại rác.
   * Đọc `filters` qua ref để effect chỉ phụ thuộc `open`: object filter đổi định danh mỗi render,
   * đưa thẳng vào deps là reseed liên tục và mọi lựa chọn bị xoá ngay khi vừa chạm.
   */
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    if (open) setDraft(draftFromFilters(filtersRef.current));
  }, [open]);

  /*
   * Facet chạy theo bản nháp (đã debounce) + ngữ cảnh tìm kiếm NGOÀI tấm này (loại xe, dịch vụ,
   * địa điểm, ngày giờ). `provinceCode` từng bị bỏ sót ở web — facet đếm toàn quốc trong khi kết
   * quả lọc theo tỉnh, số trên tấm không khớp số xe thật.
   */
  const debounced = useDebouncedValue(draft, 300);
  const facetFilters = useMemo<MarketplaceFilters>(
    () => ({
      vehicleType: filters.vehicleType,
      serviceType: filters.serviceType,
      provinceCode: filters.provinceCode,
      province: filters.province,
      pickupAt: filters.pickupAt,
      returnAt: filters.returnAt,
      priceMin: debounced.priceMin,
      priceMax: debounced.priceMax,
      bodyType: debounced.bodyType,
      brand: debounced.brand,
      seats: debounced.seats,
      fuelType: debounced.fuelType,
      features: debounced.features,
      hourly: debounced.hourly,
      delivery: debounced.delivery,
      noCollateral: debounced.noCollateral,
      discount: debounced.discount,
    }),
    [filters, debounced],
  );
  const facets = useListingFacets(facetFilters, open).data;

  // Danh mục do platform admin cấu hình — CÙNG nguồn với form tạo xe, nên bộ lọc không bao giờ
  // liệt kê một kiểu dáng mà chủ xe không chọn được (và ngược lại).
  const { catalog } = useCatalog();
  const { brandLabel } = useCatalogLabels();

  const fuelItems = useMemo(() => {
    const items = catalog[CATALOG_TYPE.FUEL_TYPE];
    if (!filters.vehicleType) return items;
    const allowed = vehicleFuelTypesFor(filters.vehicleType);
    return items.filter((item) => allowed.some((value) => value === item.key));
  }, [catalog, filters.vehicleType]);

  const countOf = useMemo(() => {
    const maps = {
      bodyType: new Map(facets?.bodyType.map((b) => [b.key, b.count]) ?? []),
      seats: new Map(facets?.seats.map((b) => [b.key, b.count]) ?? []),
      fuelType: new Map(facets?.fuelType.map((b) => [b.key, b.count]) ?? []),
      features: new Map(facets?.features.map((b) => [b.key, b.count]) ?? []),
    };
    return (dim: keyof typeof maps, key: string): number | null =>
      facets ? (maps[dim].get(key) ?? 0) : null;
  }, [facets]);

  /**
   * Hãng xe: lấy từ facet (chỉ hãng đang có xe) + hãng ĐÃ CHỌN nhưng hết xe (count 0) — nếu
   * không, khách chọn một hãng rồi lọc tiếp tới lúc hãng đó về 0 sẽ mất luôn nút để bỏ chọn.
   */
  const brandOptions = useMemo(() => {
    const fromFacets = facets?.brand ?? [];
    const known = new Set(fromFacets.map((b) => b.key.toLowerCase()));
    const stale = draft.brand
      .filter((b) => !known.has(b.toLowerCase()))
      .map((b) => ({ key: b, count: 0 }));
    return [...fromFacets, ...stale];
  }, [facets, draft.brand]);

  const priceMax = Number(facets?.price.max ?? 0) || PRICE_FALLBACK_MAX;
  const priceMin = Number(facets?.price.min ?? 0) || 0;
  const range: [number, number] = [draft.priceMin ?? priceMin, draft.priceMax ?? priceMax];

  const set = <K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* Lớp phủ là ANH EM của tấm trượt — bọc nó bên trong sẽ nuốt cử chỉ cuộn. */}
      <YStack f={1}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
        <YStack>
          <YStack
            maxHeight={height * SHEET_RATIO}
            bg={colors.surface}
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            pb={insets.bottom}
          >
            <XStack ai="center" gap={space.xs} px={space.sm} pt={space.sm}>
              <IconButton icon="close" label={tCommon('close')} onPress={onClose} />
              <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('title')}
              </Text>
            </XStack>

            <ScrollView
              contentContainerStyle={{ padding: layout.screenX, gap: layout.section }}
            >
              <Group title={t('sort')}>
                {/*
                  Ô chọn, không phải hàng chip: sắp xếp chỉ có DUY NHẤT một giá trị tại một thời
                  điểm, trải hết ra trông như bốn tiêu chí lọc bật/tắt độc lập. Web cũng dùng
                  `Select` ở đúng chỗ này.
                */}
                <SortMenu
                  value={draft.sort}
                  onChange={(next) => set('sort', next ?? DEFAULT_LISTING_SORT)}
                  block
                />
              </Group>

              <Group title={t('priceRange')}>
                <RangeSlider
                  min={priceMin}
                  max={priceMax}
                  step={PRICE_STEP}
                  value={range}
                  label={t('priceRange')}
                  // Kéo hết biên hai đầu = không lọc giá — cùng cách web hiểu "Bất kỳ".
                  caption={([low, high]) =>
                    low > priceMin || high < priceMax
                      ? t('priceRangeValue', {
                          from: fmt.money(String(low)),
                          to: fmt.money(String(high)),
                        })
                      : t('any')
                  }
                  onChange={([low, high]) =>
                    setDraft((prev) => ({
                      ...prev,
                      priceMin: low <= priceMin ? undefined : low,
                      priceMax: high >= priceMax ? undefined : high,
                    }))
                  }
                />
              </Group>

              {/* Xe máy không có kiểu dáng ô tô — web ẩn hẳn khối này, native cũng vậy. */}
              {filters.vehicleType !== VEHICLE_TYPE.MOTORBIKE &&
              catalog[CATALOG_TYPE.BODY_TYPE].length > 0 ? (
                <Group title={t('vehicleType')}>
                  <CatalogCardPicker
                    ariaLabel={t('vehicleType')}
                    items={catalog[CATALOG_TYPE.BODY_TYPE]}
                    value={draft.bodyType}
                    onChange={(next) => set('bodyType', next)}
                    countOf={(key) => countOf('bodyType', key) ?? undefined}
                    countSuffix={t('countSuffix')}
                  />
                </Group>
              ) : null}

              {brandOptions.length > 0 ? (
                <Group title={t('brand')}>
                  <FacetChips
                    options={brandOptions.map((b) => ({
                      key: b.key,
                      label: brandLabel(b.key) ?? b.key,
                      count: b.count,
                      leading: <BrandMark brand={b.key} />,
                    }))}
                    selected={draft.brand}
                    onToggle={(key) => set('brand', toggle(draft.brand, key))}
                  />
                </Group>
              ) : null}

              <Group title={t('seats')}>
                <FacetChips
                  options={SEAT_BUCKET_VALUES.map((value) => ({
                    key: value,
                    label: domainLabel('seatBucket', value, SEAT_BUCKET_LABEL[value]),
                    count: countOf('seats', value),
                  }))}
                  selected={draft.seats}
                  onToggle={(key) => set('seats', toggle(draft.seats, key))}
                />
              </Group>

              <Group title={t('fuelType')}>
                <FacetChips
                  options={fuelItems.map((item) => ({
                    key: item.key,
                    label: catalogLabel(fuelItems, item.key) ?? item.key,
                    count: countOf('fuelType', item.key),
                  }))}
                  selected={draft.fuelType}
                  onToggle={(key) => set('fuelType', toggle(draft.fuelType, key))}
                />
              </Group>

              <Group title={t('features')}>
                <FacetChips
                  options={catalog[CATALOG_TYPE.VEHICLE_FEATURE].map((item) => ({
                    key: item.key,
                    label:
                      catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], item.key) ?? item.key,
                    count: countOf('features', item.key),
                  }))}
                  selected={draft.features}
                  onToggle={(key) => set('features', toggle(draft.features, key))}
                />
              </Group>

              <Group title={t('amenities')}>
                <YStack>
                  {LISTING_AMENITY_VALUES.map((amenity, index) => (
                    <AmenityRow
                      key={amenity}
                      label={domainLabel('listingAmenity', amenity, LISTING_AMENITY_LABEL[amenity])}
                      // Mô tả tiện ích chưa có trong bó message — web cũng in thẳng hằng này.
                      // Đưa nó vào `Domain` là việc của một đợt i18n riêng, cho CẢ HAI client.
                      hint={LISTING_AMENITY_DESC[amenity]}
                      count={facets?.amenities[amenity] ?? null}
                      value={draft[amenity]}
                      first={index === 0}
                      onToggle={() => set(amenity, !draft[amenity])}
                    />
                  ))}
                </YStack>
              </Group>
            </ScrollView>

            <XStack gap={space.sm} px={layout.screenX} py={space.md} borderTopWidth={1} bc={colors.borderSubtle}>
              {/*
                Hai nút KHÔNG chia đôi: "Áp dụng (12 xe)" dài gấp đôi "Xoá bộ lọc" mà lại là
                thứ phải đọc được trọn vẹn — chia đều thì đúng nó bị cắt thành "Áp dụng (…".
              */}
              <YStack flexShrink={1}>
                <Button
                  label={t('clear')}
                  variant="secondary"
                  onPress={() => setDraft(draftFromFilters({}))}
                />
              </YStack>
              <YStack f={1}>
                <Button
                  // Số xe của bản NHÁP, không phải kết quả hiện tại — khách biết trước mình
                  // sắp thấy bao nhiêu xe trước khi đóng tấm.
                  label={
                    facets
                      ? t('applyWithCount', { count: facets.total })
                      : t('apply')
                  }
                  onPress={() => {
                    onApply(draftToPatch(draft));
                    onClose();
                  }}
                />
              </YStack>
            </XStack>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack gap={space.sm}>
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {title}
      </Text>
      {children}
    </YStack>
  );
}

/**
 * Hàng viên kèm số đếm. Lựa chọn có **0 xe** vẫn HIỆN nhưng mờ và không bấm được — ẩn nó đi thì
 * danh sách nhảy chỗ mỗi lần chạm, và khách mất thông tin "chiều này không còn gì".
 */
function FacetChips({
  options,
  selected,
  onToggle,
}: {
  options: { key: string; label: string; count: number | null; leading?: ReactNode }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
      {options.map((option) => {
        const isSelected = selected.includes(option.key);
        const empty = option.count === 0 && !isSelected;

        return (
          <YStack key={option.key} opacity={empty ? 0.45 : 1}>
            {/*
              Mục 0 xe MỜ đi nhưng vẫn BẤM ĐƯỢC — đúng như web: khách chọn trước rồi nới các
              chiều khác cho khớp. Chặn bấm là bắt họ đoán ngược thứ tự thao tác.
            */}
            <Chip
              label={option.count === null ? option.label : `${option.label}  ${option.count}`}
              selected={isSelected}
              size="sm"
              {...(option.leading ? { leading: option.leading } : {})}
              onPress={() => onToggle(option.key)}
            />
          </YStack>
        );
      })}
    </XStack>
  );
}

/** Một tiện ích bật/tắt: nhãn + mô tả + số đếm, công tắc bên phải. */
function AmenityRow({
  label,
  hint,
  count,
  value,
  first,
  onToggle,
}: {
  label: string;
  hint: string;
  count: number | null;
  value: boolean;
  first: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <XStack
        ai="center"
        gap={space.md}
        py={space.sm}
        minHeight={sizing.touchTarget}
        borderTopWidth={first ? 0 : 1}
        bc={colors.borderSubtle}
      >
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {count === null ? label : `${label} (${count})`}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {hint}
          </Text>
        </YStack>

        <YStack
          w={44}
          h={26}
          br={radius.pill}
          bg={value ? colors.primary : colors.border}
          jc="center"
          px={3}
        >
          <YStack
            w={20}
            h={20}
            br={radius.pill}
            bg={colors.surface}
            marginLeft={value ? 18 : 0}
          />
        </YStack>
      </XStack>
    </Pressable>
  );
}
