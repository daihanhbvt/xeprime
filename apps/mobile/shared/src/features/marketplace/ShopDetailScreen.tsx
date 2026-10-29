import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, STOREFRONT_KIND } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { ScreenError } from '@/components/state/ScreenError';
import { Button } from '@/components/ui/Button';
import { ShopDetailSkeleton, VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { ROUTES } from '@/navigation/routes';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { ShopListingFilters } from '@/api/marketplace/api';
import type { PublicListing, PublicShop } from './api';
import { ShopBranches } from './components/ShopBranches';
import { ShopHeader } from './components/ShopHeader';
import { ShopReviews } from './components/ShopReviews';
import { ShopTrust } from './components/ShopTrust';
import { VehicleCard } from './components/VehicleCard';
import { SHOP_LIST_LAYOUT_MAX_VEHICLES } from './filter-constants';
import { useInfiniteShopListings, usePublicShop } from './hooks/use-shop';

/** Cuộn qua bao nhiêu thì tên gian hàng hiện trên header nổi — non nửa chiều cao ảnh bìa. */
const TITLE_REVEAL = 120;

/** Chip dịch vụ — chọn MỘT (một yêu cầu thuê chỉ có một dịch vụ), bấm lại để bỏ (web `ShopVehicles`). */
const SERVICE_CHIPS = [
  { key: 'withDriver', serviceType: SERVICE_TYPE.WITH_DRIVER },
  { key: 'longTerm', serviceType: SERVICE_TYPE.LONG_TERM },
] as const;

/** Chip tiện ích — bật/tắt độc lập, cộng dồn bằng AND như ở trang tìm kiếm. */
const TOGGLE_CHIPS = ['delivery', 'instantBook', 'noCollateral', 'vatInvoice'] as const;

const keyExtractor = (item: PublicListing) => item.id;
const Separator = () => <YStack h={layout.block} />;

/**
 * Trang gian hàng công khai (MKT-05) — bản native của `/shops/[slug]` (web #222, Figma chủ xe cá
 * nhân `20058:71206`, gian hàng `20063:59202`).
 *
 * Các khối theo đúng thứ tự web: thẻ hồ sơ → uy tín (chỉ gian hàng) → chi nhánh (chỉ gian hàng) →
 * xe đang cho thuê → đánh giá.
 *
 * Xe: ≤ `SHOP_LIST_LAYOUT_MAX_VEHICLES` xe ⇒ không bộ lọc, mỗi thẻ mang ba chỉ số chủ xe; nhiều
 * hơn ⇒ tab tỉnh/thành + chip lọc. Ngưỡng đếm trên TỔNG số xe công khai của gian hàng (từ hồ sơ),
 * không trên kết quả đã lọc. Chip 0 xe bị ẩn — trừ khi nó đang bật.
 *
 * Khác web ở HÌNH THÁI ĐIỀU HƯỚNG: web giữ bộ lọc + trang ở URL và phân trang số; native giữ bộ lọc
 * ở state màn và cuộn tải dần — cùng endpoint, cùng cỡ trang. Đánh giá vì thế nằm cuối danh sách.
 */
export function ShopDetailScreen({ slug, onBack }: { slug: string; onBack: () => void }) {
  const colors = useColors();
  const shop = usePublicShop(slug);
  const [scrolled, setScrolled] = useState(false);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const passed = event.nativeEvent.contentOffset.y > TITLE_REVEAL;
    // `onScroll` bắn liên tục — chỉ set khi giá trị thật sự đổi.
    setScrolled((prev) => (prev === passed ? prev : passed));
  }, []);

  if (shop.isError) {
    return (
      <YStack f={1} bg={colors.surface}>
        <AppHeader onBack={onBack} />
        <ScreenError error={shop.error} onRetry={() => void shop.refetch()} />
      </YStack>
    );
  }

  if (shop.isPending) {
    return (
      <YStack f={1} bg={colors.surface}>
        {/* Cùng kiểu header với lúc có dữ liệu — đổi kiểu giữa chừng làm nút Lui nhảy chỗ. */}
        <AppHeader variant="overlay" onBack={onBack} />
        <ShopDetailSkeleton />
      </YStack>
    );
  }

  return (
    // Nền trang — web `shops/[slug]/page.module.css` `.page`: `bg-container` (trắng), để thẻ đánh giá nền `bg` nổi lên.
    <YStack f={1} bg={colors.surface}>
      {/*
        Header NỔI trên ảnh bìa; tên chỉ hiện sau khi cuộn qua thẻ hồ sơ. Nút nhắn tin nằm trong thẻ
        hồ sơ như web (`ShopHeader`), không còn ở thanh trên.
      */}
      <AppHeader variant="overlay" onBack={onBack} title={shop.data.name} showTitle={scrolled} />
      <ShopBody shop={shop.data} onScroll={onScroll} onRefreshShop={shop.refetch} />
    </YStack>
  );
}

function ShopBody({
  shop,
  onScroll,
  onRefreshShop,
}: {
  shop: PublicShop;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Làm mới hồ sơ gian hàng — đi cùng danh sách xe trong một lượt kéo. */
  onRefreshShop: () => Promise<unknown>;
}) {
  const colors = useColors();
  const t = useTranslations('Shops');
  const tResults = useTranslations('Marketplace.results');
  const insets = useSafeAreaInsets();
  const navigateOnce = useNavigateOnce();

  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const layoutKind = shop.vehicleCount <= SHOP_LIST_LAYOUT_MAX_VEHICLES ? 'list' : 'grid';
  const filterable = layoutKind === 'grid';

  const [filters, setFilters] = useState<ShopListingFilters>({});
  const activeFilters: ShopListingFilters = filterable ? filters : {};
  const hasActiveFilter = Object.values(activeFilters).some(Boolean);
  const listings = useInfiniteShopListings(shop.slug, activeFilters);
  const pull = usePullRefresh(
    useCallback(() => Promise.all([onRefreshShop(), listings.refresh()]), [onRefreshShop, listings.refresh]),
  );

  const counts = shop.vehicleFilterCounts;
  const serviceChips = SERVICE_CHIPS.filter(
    (chip) => counts[chip.key] > 0 || filters.serviceType === chip.serviceType,
  );
  const toggleChips = TOGGLE_CHIPS.filter((key) => counts[key] > 0 || Boolean(filters[key]));
  const showProvinceTabs = filterable && shop.serviceProvinces.length > 1;
  const showChips = filterable && serviceChips.length + toggleChips.length > 0;

  const patch = (next: Partial<ShopListingFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const clearFilters = () => setFilters({});

  const openListing = useCallback(
    (listing: PublicListing, serviceType: string | undefined) =>
      navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType)),
    [navigateOnce],
  );

  const metrics = layoutKind === 'list' ? shop.metrics : null;
  // Chip dịch vụ đang bật đổi giá / "Đặt ngay" / link chi tiết của thẻ — như web, nơi thẻ đọc URL
  // của chính trang gian hàng.
  const activeService = activeFilters.serviceType;
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <YStack px={layout.screenX}>
        <VehicleCard
          listing={item}
          onPress={openListing}
          {...(activeService ? { serviceType: activeService } : {})}
          {...(metrics ? { variant: 'list' as const, hostMetrics: metrics } : {})}
        />
      </YStack>
    ),
    [openListing, metrics, activeService],
  );

  const listPadding = useMemo(
    () => ({ paddingBottom: layout.section + insets.bottom }),
    [insets.bottom],
  );

  return (
    <FlatList
      data={listings.listings}
      keyExtractor={keyExtractor}
      {...MEDIA_LIST_TUNING}
      onScroll={onScroll}
      scrollEventThrottle={scrollThrottle.half}
      refreshControl={
        <RefreshControl
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={listPadding}
      ItemSeparatorComponent={Separator}
      renderItem={renderItem}
      ListHeaderComponent={
        <YStack gap={layout.block} pb={layout.block}>
          <ShopHeader shop={shop} />

          {isShop ? (
            <YStack px={layout.screenX}>
              <ShopTrust
                trust={shop.trust}
                vehicleCount={shop.vehicleCount}
                noCollateralCount={counts.noCollateral}
              />
            </YStack>
          ) : null}
          {isShop ? (
            <YStack px={layout.screenX}>
              <ShopBranches branches={shop.branches} />
            </YStack>
          ) : null}

          <YStack gap={space.md}>
            <YStack px={layout.screenX}>
              <Text
                col={colors.text}
                fos={fontSize.lead}
                fow={fontWeight.semibold}
                accessibilityRole="header"
              >
                {listings.total > 0
                  ? t('vehicles.titleWithCount', { count: listings.total })
                  : t('vehicles.title')}
              </Text>
            </YStack>

            {showProvinceTabs ? (
              <ChipRow label={t('vehicleFilters.provinceLabel')}>
                <ShopFilterChip
                  label={t('vehicleFilters.all')}
                  active={!filters.provinceCode}
                  onPress={() => patch({ provinceCode: undefined })}
                />
                {shop.serviceProvinces.map((province) => (
                  <ShopFilterChip
                    key={province.code}
                    label={province.name}
                    active={filters.provinceCode === province.code}
                    onPress={() => patch({ provinceCode: province.code })}
                  />
                ))}
              </ChipRow>
            ) : null}

            {showChips ? (
              <ChipRow label={t('vehicleFilters.label')}>
                {serviceChips.map((chip) => {
                  const active = filters.serviceType === chip.serviceType;
                  return (
                    <ShopFilterChip
                      key={chip.key}
                      label={t(`vehicleFilters.${chip.key}`)}
                      active={active}
                      onPress={() => patch({ serviceType: active ? undefined : chip.serviceType })}
                    />
                  );
                })}
                {toggleChips.map((key) => (
                  <ShopFilterChip
                    key={key}
                    label={t(`vehicleFilters.${key}`)}
                    active={Boolean(filters[key])}
                    onPress={() => patch({ [key]: !filters[key] })}
                  />
                ))}
              </ChipRow>
            ) : null}

            <YStack px={layout.screenX}>
              {listings.initialError ? (
                <ScreenError
                  error={listings.initialError}
                  onRetry={listings.retryInitial}
                  title={t('vehicles.loadError')}
                />
              ) : listings.isInitialLoading ? (
                <YStack gap={layout.block} accessibilityLabel={tResults('loadingLabel')}>
                  {Array.from(
                    { length: Math.max(1, Math.min(3, shop.vehicleCount)) },
                    (_, i) => (
                      <VehicleCardSkeleton key={i} />
                    ),
                  )}
                </YStack>
              ) : listings.total === 0 ? (
                hasActiveFilter ? (
                  <YStack ai="center" gap={space.md} py={space.xl}>
                    <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                      {t('vehicleFilters.emptyFiltered')}
                    </Text>
                    <Button
                      label={t('vehicleFilters.clear')}
                      variant="secondary"
                      block={false}
                      align="center"
                      onPress={clearFilters}
                    />
                  </YStack>
                ) : (
                  <Text col={colors.textMuted} fos={fontSize.body} ta="center" py={space.xl}>
                    {t('vehicles.empty')}
                  </Text>
                )
              ) : null}
            </YStack>
          </YStack>
        </YStack>
      }
      ListFooterComponent={
        <YStack gap={layout.block}>
          {listings.appendError ? (
            <YStack py={layout.section} px={layout.screenX} gap={space.sm} ai="center">
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {tResults('appendError', { reason: '' })}
              </Text>
              <Button
                label={tResults('loadMore')}
                icon="chevron-down-outline"
                variant="secondary"
                block={false}
                align="center"
                onPress={listings.retryNextPage}
              />
            </YStack>
          ) : listings.isFetchingNextPage ? (
            <YStack pt={layout.block} px={layout.screenX} accessibilityLabel={tResults('loadingMore')}>
              <VehicleCardSkeleton />
            </YStack>
          ) : listings.hasNextPage ? (
            /*
             * Tải thêm bằng NÚT, không tự tải khi cuộn: web phân trang số nên khối đánh giá luôn
             * nằm ngay cuối trang hiện tại. Tự tải khi chạm đáy thì đánh giá bị đẩy xuống mãi —
             * gian hàng 100 xe phải cuộn qua cả đội xe mới thấy (thiếu thông tin so với web).
             */
            <YStack pt={layout.block} px={layout.screenX} ai="center">
              <Button
                label={tResults('loadMore')}
                icon="chevron-down-outline"
                variant="secondary"
                block={false}
                align="center"
                onPress={listings.fetchNextPage}
              />
            </YStack>
          ) : null}
          {/* Đánh giá ĐỨNG SAU danh sách xe đang hiện, như web — luôn hiện, không chờ tải hết xe. */}
          {!listings.isInitialLoading ? (
            <YStack px={layout.screenX} pt={layout.block}>
              <ShopReviews slug={shop.slug} />
            </YStack>
          ) : null}
        </YStack>
      }
    />
  );
}

/** Hàng chip cuộn ngang ở bề ngang điện thoại (web @640px `.chips { flex-wrap: nowrap; overflow-x: auto }`). */
function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={{ paddingHorizontal: layout.screenX, gap: space.sm + space.xs }}
    >
      {children}
    </ScrollView>
  );
}

/** Chip lọc dạng viên của trang gian hàng — đúng `.chip` / `.chipActive` web (Figma "_Card Filter"). */
function ShopFilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 4, bottom: 4 }}
    >
      <XStack
        ai="center"
        py={space.sm}
        px={space.sm + space.xs}
        bw={1}
        bc={active ? colors.primary : colors.border}
        br={radius.pill}
        bg={active ? colors.primarySubtle : colors.surface}
        style={elevation.xs}
      >
        <Text
          col={active ? colors.primary : colors.textMuted}
          fos={fontSize.body}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}
