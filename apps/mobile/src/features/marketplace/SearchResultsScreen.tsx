import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LISTING_AMENITY_LABEL,
  LISTING_AMENITY_VALUES,
  LISTING_SORT_LABEL,
  ROUTE_TYPE_LABEL,
  SEAT_BUCKET_LABEL,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  type VehicleType,
} from '@xeprime/types';
import { catalogLabel } from '@xeprime/api-client';
import { serviceTypesFor, serviceUsesRentalRange, LIST_SEPARATOR } from '@xeprime/domain';
import { type MarketplaceFilters, type PublicListing } from '@xeprime/types';
import { dayjs, rentalDurationParts } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { useCatalog, useCatalogLabels } from '@/features/catalog/use-catalog';
import { useCollapseOnScroll } from '@/hooks/use-collapse-on-scroll';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { SearchExperienceProvider, useSearchExperience } from './search-context';
import { useInfinitePublicListings } from './hooks/use-search-results';
import { FilterSheet } from './components/FilterSheet';
import { LocationPicker } from './components/LocationPicker';
import { RentalRangeSheet } from './components/RentalRangeSheet';
import { SortMenu } from './components/SortMenu';
import { VehicleCard } from './components/VehicleCard';
import { ROUTES } from '@/navigation/routes';

/** Các chiều thuộc tấm Bộ lọc — "Xoá tất cả" gỡ đúng nhóm này, giữ nguyên ngữ cảnh tìm kiếm. */
const FACET_KEYS = [
  'brand',
  'bodyType',
  'seats',
  'fuelType',
  'features',
  ...LISTING_AMENITY_VALUES,
  'priceMin',
  'priceMax',
  'sort',
] as const;

const keyExtractor = (item: PublicListing) => item.id;

/** Khoảng cách giữa hai thẻ. Khai ngoài component để FlatList không thấy một kiểu mới mỗi render. */
const Separator = () => <YStack h={layout.block} />;

/**
 * Màn kết quả tìm xe (MKT-03) — bản native của `/search`.
 *
 * Cùng bề mặt với web: thanh tóm tắt ngữ cảnh + Chỉnh sửa, hàng đếm + Bộ lọc + Sắp xếp, chip
 * nhanh loại xe/dịch vụ, chip đang lọc + Xoá tất cả, danh sách, trạng thái rỗng.
 *
 * Khác web đúng một chỗ: **cuộn tải dần thay cho nút "Tải thêm"**. Web có URL để mang trang, và
 * nút tải thêm cho phép chia sẻ đúng vị trí; native không có, mà cuộn tới đâu tải tới đó là cử
 * chỉ mặc định của điện thoại.
 *
 * Ngữ cảnh (loại xe, dịch vụ, địa điểm, khoảng thuê) đến từ `SearchExperienceProvider` — cùng
 * một nguồn với trang chủ, cùng luật `draftToFilterPatch`.
 */
export function SearchResultsScreen({
  initialFilters,
  onBack,
}: {
  /** Ngữ cảnh mang từ trang chủ sang — cùng vai trò query string bên web. */
  initialFilters: MarketplaceFilters;
  onBack: () => void;
}) {
  return (
    <SearchExperienceProvider initial={initialFilters}>
      <ResultsBody onBack={onBack} />
    </SearchExperienceProvider>
  );
}

function ResultsBody({ onBack }: { onBack: () => void }) {
  const t = useTranslations('Marketplace.results');
  const tPanel = useTranslations('Marketplace.filterPanel');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const insets = useSafeAreaInsets();
  const navigateOnce = useNavigateOnce();
  const { catalog } = useCatalog();
  const { brandLabel } = useCatalogLabels();

  const {
    draft,
    filters,
    setVehicleType,
    setServiceType,
    setProvinceCode,
    setRentalRange,
    setRentalMode,
    setFilters,
    submit,
    provinceLabel,
  } = useSearchExperience();

  const [filterOpen, setFilterOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  const results = useInfinitePublicListings(filters);

  /*
   * Khối lọc ẩn khi cuộn XUỐNG, hiện lại khi cuộn LÊN. Nó chiếm gần một phần ba màn; giữ nguyên
   * tại chỗ thì đọc danh sách chỉ còn hai thẻ xe một khung hình.
   *
   * Chiều cao đo bằng `onLayout` chứ không đoán: số chip "đang lọc" đổi theo từng lựa chọn nên
   * khối này cao thấp khác nhau, gõ cứng một con số là chừa hụt hoặc chừa thừa.
   */
  const {
    onScroll,
    progress,
    height: filterHeight,
    heightValue: filterHeightSv,
    onLayout: onFilterLayout,
  } = useCollapseOnScroll();

  const filterBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -filterHeightSv.value * (1 - progress.value) }],
  }));

  /*
   * Ba thứ dưới đây phải GIỮ NGUYÊN THAM CHIẾU giữa các lần render, nếu không `memo` trên
   * `VehicleCard` thành vô nghĩa: màn này dựng lại vì đủ chuyện không liên quan tới một chiếc
   * xe cụ thể (đo chiều cao khối lọc, tải thêm trang, đổi sắp xếp), và một `renderItem` mới là
   * đủ để FlatList vẽ lại toàn bộ hàng đang hiển thị.
   */
  const openListing = useCallback(
    (listing: PublicListing, serviceType: string | undefined) =>
      // Mang ngữ cảnh dịch vụ sang, cùng vai trò `?serviceType=` bên web.
      navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType)),
    [navigateOnce],
  );

  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => <VehicleCard listing={item} onPress={openListing} />,
    [openListing],
  );

  const listPadding = useMemo(
    () => ({
      paddingHorizontal: layout.screenX,
      // Khối lọc nằm đè, nên chỗ của nó phải do danh sách tự chừa ra.
      paddingTop: filterHeight + space.md,
      paddingBottom: layout.section + insets.bottom,
    }),
    [filterHeight, insets.bottom],
  );

  /** Chip cho từng giá trị đang lọc — bấm × là gỡ đúng giá trị đó, không xoá cả chiều. */
  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; clear: () => void }[] = [];

    const listChip = (
      dim: 'brand' | 'bodyType' | 'seats' | 'fuelType' | 'features',
      label: (key: string) => string,
    ) => {
      for (const key of filters[dim] ?? []) {
        chips.push({
          id: `${dim}:${key}`,
          label: label(key),
          clear: () => setFilters({ [dim]: (filters[dim] ?? []).filter((k) => k !== key) }),
        });
      }
    };

    listChip('brand', (key) => brandLabel(key) ?? key);
    listChip('bodyType', (key) => catalogLabel(catalog.body_type, key) ?? key);
    listChip('seats', (key) => domainLabel('seatBucket', key, SEAT_BUCKET_LABEL[key as never]));
    listChip('fuelType', (key) => catalogLabel(catalog.fuel_type, key) ?? key);
    listChip('features', (key) => catalogLabel(catalog.vehicle_feature, key) ?? key);

    for (const amenity of LISTING_AMENITY_VALUES) {
      if (!filters[amenity]) continue;
      chips.push({
        id: amenity,
        label: domainLabel('listingAmenity', amenity, LISTING_AMENITY_LABEL[amenity]),
        clear: () => setFilters({ [amenity]: undefined }),
      });
    }

    if (filters.sort) {
      chips.push({
        id: 'sort',
        label: domainLabel('listingSort', filters.sort, LISTING_SORT_LABEL[filters.sort]),
        // Gỡ = về lại thứ tự mặc định, không phải "không sắp xếp".
        clear: () => setFilters({ sort: undefined }),
      });
    }

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      chips.push({
        id: 'price',
        label: tPanel('priceRangeValue', {
          from: fmt.money(String(filters.priceMin ?? 0)),
          to: fmt.money(String(filters.priceMax ?? 0)),
        }),
        clear: () => setFilters({ priceMin: undefined, priceMax: undefined }),
      });
    }

    return chips;
  }, [filters, brandLabel, catalog, domainLabel, fmt, setFilters, tPanel]);

  /**
   * Huy hiệu trên nút Bộ lọc = SỐ VIÊN đang hiện ngay cạnh "Xoá tất cả".
   *
   * Đếm theo CHIỀU (hãng = 1 dù chọn ba hãng) thì con số và hàng viên nói hai điều khác nhau
   * trên cùng một màn — người ta đọc "2 bộ lọc" rồi đếm được năm viên bên dưới. Web cũng lấy
   * đúng `appliedChips.length`.
   */
  const filterCount = activeChips.length;

  /*
   * Tóm tắt đọc từ `filters` ĐÃ ÁP DỤNG, không phải bản nháp — nó mô tả kết quả đang hiện trên
   * màn, mà kết quả thì chạy theo ngữ cảnh đã áp.
   *
   * Địa điểm hiện TÊN tra từ danh sách điểm đến; mã không phải thứ để người dùng đọc. Lựa chọn
   * cũ không còn khả dụng thì nói thẳng, KHÔNG âm thầm hiện "Toàn quốc" trong khi vẫn đang lọc.
   */
  const days =
    filters.pickupAt && filters.returnAt
      ? rentalDurationParts(dayjs(filters.pickupAt), dayjs(filters.returnAt)).days
      : 0;

  const summary = [
    filters.vehicleType ? domainLabel('vehicleType', filters.vehicleType) : t('allVehicles'),
    filters.serviceType ? domainLabel('serviceType', filters.serviceType) : null,
    // Lộ trình (ngữ cảnh có tài xế) đi kèm ngay sau dịch vụ.
    filters.serviceType === SERVICE_TYPE.WITH_DRIVER && filters.routeType
      ? domainLabel('routeType', filters.routeType, ROUTE_TYPE_LABEL[filters.routeType as never])
      : null,
    provinceLabel(filters.provinceCode ?? ''),
    filters.pickupAt && filters.returnAt
      ? days
        ? t('dateRangeWithDays', {
            from: fmt.date(filters.pickupAt),
            to: fmt.date(filters.returnAt),
            days,
          })
        : t('dateRange', { from: fmt.date(filters.pickupAt), to: fmt.date(filters.returnAt) })
      : null,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  // Đọc theo ngữ cảnh ĐÃ ÁP DỤNG, cùng nguồn với các chip ngay dưới; thứ tự và luật "xe máy
  // không có tài xế" lấy từ package dùng chung.
  const serviceItems = serviceTypesFor(
    (filters.vehicleType as VehicleType | undefined) ?? draft.vehicleType,
  );

  return (
    <YStack f={1} bg={colors.background}>
      {/*
        Dải safe area ĐỨNG YÊN. Thanh tiêu đề trượt đi cùng khối lọc, nên nếu không có dải này
        thì danh sách chạy thẳng lên dưới thanh trạng thái.
      */}
      <YStack h={insets.top} bg={colors.surface} />

      {/* Tầng tương đối: cả khối trên cùng nằm ĐÈ lên danh sách, không chiếm chỗ trong dòng chảy. */}
      <YStack f={1}>
        <Animated.View
          onLayout={onFilterLayout}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 5,
              backgroundColor: colors.background,
            },
            filterBarStyle,
          ]}
        >
          {/*
        Thanh tiêu đề trượt đi CÙNG khối lọc.
        
        Để nó đứng lại thì cuộn hết cỡ vẫn còn một dải chiếm chỗ ngang bằng chính nó, mà trên
        màn danh sách thì mỗi dòng pixel đều là một phần thẻ xe. Nút quay lại không mất đi đâu:
        khối bám ngón tay, kéo ngược một chút là nó ló ra ngay.
      */}
          <AppHeader onBack={onBack} title={t('title')} flushTop />

          <YStack px={layout.screenX} pt={space.sm} pb={space.sm} gap={space.sm}>
            {/*
          Thanh tóm tắt ngữ cảnh: chạm vào thân để sửa ĐỊA ĐIỂM, nút lịch bên phải để sửa
          KHOẢNG THUÊ.

          Hai lối riêng chứ không một cú chạm mở cả hai: tóm tắt hiện cả nơi lẫn ngày, nên mở
          bộ chọn địa điểm khi khách đang muốn đổi ngày là bắt đóng ra rồi tìm tiếp. Nút lịch
          vắng mặt ở dịch vụ dài hạn — dịch vụ đó không có khoảng ngày nào để sửa (ADR 0011).
        */}
            <XStack ai="center" gap={space.sm}>
              <Pressable
                onPress={() => setLocationOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('editSearch', { summary })}
                style={appStyles.fill}
              >
                <XStack
                  ai="center"
                  gap={space.sm}
                  bg={colors.surface}
                  bw={1}
                  bc={colors.border}
                  br={radius.md}
                  px={space.md}
                  minHeight={sizing.touchTarget}
                >
                  <Text f={1} col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
                    {summary}
                  </Text>
                  <XStack ai="center" gap={space.xs}>
                    <Ionicons name="create-outline" size={14} color={colors.primaryActive} />
                    <Text
                      col={colors.primaryActive}
                      fos={fontSize.bodySm}
                      fow={fontWeight.semibold}
                    >
                      {t('edit')}
                    </Text>
                  </XStack>
                </XStack>
              </Pressable>

              {serviceUsesRentalRange(draft.serviceType) ? (
                <Pressable
                  onPress={() => setRangeOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('changeTimeOrPlace')}
                >
                  <XStack
                    ai="center"
                    jc="center"
                    w={sizing.touchTarget}
                    h={sizing.touchTarget}
                    bg={colors.surface}
                    bw={1}
                    bc={colors.border}
                    br={radius.md}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={iconSize.md}
                      color={colors.primaryActive}
                    />
                  </XStack>
                </Pressable>
              ) : null}
            </XStack>

            {/*
          Đếm một hàng, hai điều khiển một hàng.

          Nhồi cả ba vào một hàng thì "8 xe khả dụng · 1 bộ lọc" + menu sắp xếp + nút Bộ lọc
          vượt bề ngang điện thoại, và cái bị cắt lại chính là con số — thứ người ta đọc trước.
        */}
            <XStack ai="baseline" gap={space.xs}>
              <Text
                flexShrink={1}
                numberOfLines={1}
                col={colors.text}
                fos={fontSize.h4}
                fow={fontWeight.bold}
              >
                {results.isInitialLoading
                  ? t('searching')
                  : t('available', { count: results.total })}
              </Text>
              {filterCount > 0 ? (
                <Text flexShrink={0} col={colors.textMuted} fos={fontSize.label}>
                  {t('filterCount', { count: filterCount })}
                </Text>
              ) : null}
            </XStack>

            <XStack ai="center" jc="space-between" gap={space.sm}>
              <SortMenu value={filters.sort} onChange={(sort) => setFilters({ sort })} />

              <Pressable onPress={() => setFilterOpen(true)} accessibilityRole="button">
                <XStack
                  ai="center"
                  gap={space.xs}
                  bw={1}
                  bc={filterCount > 0 ? colors.primary : colors.border}
                  br={radius.pill}
                  px={space.md}
                  minHeight={sizing.touchTarget - 8}
                >
                  <Ionicons name="options-outline" size={15} color={colors.text} />
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('filters')}
                  </Text>
                  {filterCount > 0 ? (
                    <YStack
                      w={16}
                      h={16}
                      br={radius.pill}
                      bg={colors.danger}
                      ai="center"
                      jc="center"
                    >
                      <Text col={colors.onDiscount} fos={9} fow={fontWeight.bold}>
                        {filterCount}
                      </Text>
                    </YStack>
                  ) : null}
                </XStack>
              </Pressable>
            </XStack>

            {/* Chip nhanh: loại xe rồi tới dịch vụ — cùng hai chiều với thẻ tìm kiếm trang chủ. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.xs, paddingRight: layout.screenX }}
              accessibilityLabel={t('quickChipsLabel')}
            >
              {[VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE].map((value) => (
                <Chip
                  key={value}
                  label={domainLabel('vehicleType', value)}
                  selected={filters.vehicleType === value}
                  onPress={() => setVehicleType(value as VehicleType)}
                  size="sm"
                />
              ))}
              <YStack w={1} bg={colors.border} my={space.xs} />

              {/* "Tất cả" = BỎ chiều dịch vụ. Rời "có tài xế" thì lộ trình cũng phải rời theo —
              nó là ngữ cảnh của riêng dịch vụ đó, giữ lại là một tham số ma. */}
              <Chip
                label={t('allServices')}
                selected={!filters.serviceType}
                onPress={() => setFilters({ serviceType: undefined, routeType: undefined })}
                size="sm"
              />
              {serviceItems.map((value) => (
                <Chip
                  key={value}
                  label={domainLabel('serviceType', value)}
                  selected={filters.serviceType === value}
                  onPress={() => {
                    setServiceType(value);
                    if (value !== SERVICE_TYPE.WITH_DRIVER) setFilters({ routeType: undefined });
                  }}
                  size="sm"
                />
              ))}
            </ScrollView>

            {activeChips.length > 0 ? (
              <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap" ai="center">
                {activeChips.map((chip) => (
                  <Pressable
                    key={chip.id}
                    onPress={chip.clear}
                    accessibilityRole="button"
                    accessibilityLabel={t('removeFilter', { label: chip.label })}
                  >
                    <XStack
                      ai="center"
                      gap={space.xs}
                      bg={colors.primaryLight}
                      bw={1}
                      bc={colors.primary}
                      br={radius.pill}
                      px={space.sm}
                      py={space.xs}
                    >
                      <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.medium}>
                        {chip.label}
                      </Text>
                      <Ionicons name="close" size={12} color={colors.primaryActive} />
                    </XStack>
                  </Pressable>
                ))}

                <Pressable
                  onPress={() =>
                    setFilters(Object.fromEntries(FACET_KEYS.map((key) => [key, undefined])))
                  }
                  accessibilityRole="button"
                  hitSlop={space.xs}
                >
                  <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
                    {t('clearAll')}
                  </Text>
                </Pressable>
              </XStack>
            ) : null}
          </YStack>
        </Animated.View>

        {results.initialError ? (
          <YStack f={1} pt={filterHeight}>
            <ScreenError
              title={t('loadErrorTitle')}
              error={results.initialError}
              onRetry={results.retryInitial}
            />
          </YStack>
        ) : results.isInitialLoading ? (
          <YStack px={layout.screenX} pt={filterHeight + space.md} gap={layout.block}>
            {Array.from({ length: 3 }, (_, i) => (
              <VehicleCardSkeleton key={i} />
            ))}
          </YStack>
        ) : results.listings.length === 0 ? (
          <YStack f={1} pt={filterHeight}>
            <Empty
              filtered={filterCount > 0}
              onClear={() =>
                setFilters(Object.fromEntries(FACET_KEYS.map((key) => [key, undefined])))
              }
              onChangeContext={() => setLocationOpen(true)}
            />
          </YStack>
        ) : (
          <Animated.FlatList
            data={results.listings}
            keyExtractor={keyExtractor}
            {...LIST_TUNING}
            onScroll={onScroll}
            scrollEventThrottle={scrollThrottle.frame}
            contentContainerStyle={listPadding}
            refreshControl={
              <RefreshControl
                refreshing={results.isRefreshing}
                onRefresh={results.refresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ItemSeparatorComponent={Separator}
            renderItem={renderItem}
            onEndReached={results.fetchNextPage}
            ListFooterComponent={
              results.appendError ? (
                <YStack py={layout.section} gap={space.sm} ai="center">
                  <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                    {t('appendError', { reason: '' })}
                  </Text>
                  <Button
                    label={t('loadMore')}
                    variant="secondary"
                    block={false}
                    onPress={results.retryNextPage}
                  />
                </YStack>
              ) : results.isFetchingNextPage ? (
                <YStack pt={layout.block} accessibilityLabel={t('loadingMore')}>
                  <VehicleCardSkeleton />
                </YStack>
              ) : !results.hasNextPage && results.total > 0 ? (
                <Text col={colors.placeholder} fos={fontSize.label} ta="center" py={layout.section}>
                  {t('endNote', { count: results.total })}
                </Text>
              ) : null
            }
          />
        )}
      </YStack>

      <FilterSheet
        open={filterOpen}
        filters={filters}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />

      <LocationPicker
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        onSelect={(code) => {
          setProvinceCode(code);
          // Sửa ngữ cảnh ở màn kết quả là muốn kết quả đổi theo NGAY, không phải sửa để đó.
          submit();
        }}
      />

      <RentalRangeSheet
        open={rangeOpen}
        value={draft.rental}
        mode={draft.rental.mode}
        onChange={setRentalRange}
        onModeChange={setRentalMode}
        onApply={() => {
          submit();
          setRangeOpen(false);
        }}
        onCancel={() => setRangeOpen(false)}
      />
    </YStack>
  );
}

/**
 * Rỗng vì BỘ LỌC khác rỗng vì HỆ THỐNG chưa có xe — hai câu chữ khác nhau và hai lối thoát khác
 * nhau. Gộp lại thì khách đang lọc quá tay sẽ tưởng nền tảng không có xe nào.
 */
function Empty({
  filtered,
  onClear,
  onChangeContext,
}: {
  filtered: boolean;
  onClear: () => void;
  onChangeContext: () => void;
}) {
  const t = useTranslations('Marketplace.results');

  if (!filtered) {
    return (
      <ScreenMessage
        icon="car-outline"
        title={t('emptySystemTitle')}
        description={t('emptySystemDesc')}
      />
    );
  }

  return (
    <YStack f={1} ai="center" jc="center" gap={space.md} p={layout.screenX}>
      <ScreenMessage
        icon="funnel-outline"
        title={t('emptyFilteredTitle')}
        description={t('emptyFilteredDesc')}
        actionLabel={t('clearAll')}
        onAction={onClear}
      />
      <Pressable onPress={onChangeContext} accessibilityRole="button" hitSlop={space.sm}>
        <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('changeTimeOrPlace')}
        </Text>
      </Pressable>
    </YStack>
  );
}
