import { useCallback, useMemo, useState } from 'react';
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { ScreenError } from '@/components/state/ScreenError';
import { Button } from '@/components/ui/Button';
import { ShopDetailSkeleton, VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { PublicListing } from './api';
import { ShopHeader } from './components/ShopHeader';
import { VehicleCard } from './components/VehicleCard';
import { useInfiniteShopListings, usePublicShop } from './hooks/use-shop';

/** Cuộn qua bao nhiêu thì tên gian hàng hiện trên header nổi — non nửa chiều cao ảnh bìa. */
const TITLE_REVEAL = 120;

const keyExtractor = (item: PublicListing) => item.id;
const Separator = () => <YStack h={layout.block} />;

/**
 * Trang gian hàng công khai (MKT-05) — bản native của `/shops/[slug]`.
 *
 * Cùng hai khối với web: `ShopHeader` (hồ sơ) rồi danh sách xe đang cho thuê của gian hàng đó.
 * Công khai hoàn toàn — không `RequireSession`, vì khách chưa đăng nhập cũng phải xem được, y
 * như trang web mở từ kết quả tìm kiếm Google.
 *
 * Khác web đúng một chỗ, và là khác biệt HÌNH THÁI ĐIỀU HƯỚNG: web phân trang bằng `?page=` để
 * chia sẻ được đúng trang, native cuộn tải dần. Cùng endpoint, cùng cỡ trang, cùng thứ tự.
 *
 * Hồ sơ và danh sách xe là HAI truy vấn tách rời, mỗi cái có trạng thái riêng: hồ sơ hỏng thì
 * không còn gì để nói về gian hàng nên cả màn báo lỗi; danh sách xe hỏng thì hồ sơ vẫn đứng
 * nguyên và chỉ khối xe báo lỗi — mất danh sách không làm mất tên, địa chỉ và số điện thoại,
 * vốn là thứ khách vào đây tìm.
 */
export function ShopDetailScreen({ slug, onBack }: { slug: string; onBack: () => void }) {
  const t = useTranslations('Shops.vehicles');
  const tResults = useTranslations('Marketplace.results');
  const insets = useSafeAreaInsets();
  const navigateOnce = useNavigateOnce();

  const shop = usePublicShop(slug);
  const listings = useInfiniteShopListings(slug);
  const [scrolled, setScrolled] = useState(false);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const passed = event.nativeEvent.contentOffset.y > TITLE_REVEAL;
    // `onScroll` bắn liên tục — chỉ set khi giá trị thật sự đổi, nếu không cả danh sách render
    // lại mỗi khung hình cuộn.
    setScrolled((prev) => (prev === passed ? prev : passed));
  }, []);

  const openListing = useCallback(
    (listing: PublicListing, serviceType: string | undefined) =>
      navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType)),
    [navigateOnce],
  );

  /*
   * Lề ngang nằm ở TỪNG THẺ chứ không ở `contentContainerStyle`: ảnh bìa trong
   * `ListHeaderComponent` phải chạm hai mép màn hình, mà một lề đặt ở container thì thụt cả
   * header lẫn danh sách.
   */
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <YStack px={layout.screenX}>
        <VehicleCard listing={item} onPress={openListing} />
      </YStack>
    ),
    [openListing],
  );

  const listPadding = useMemo(
    () => ({ paddingBottom: layout.section + insets.bottom }),
    [insets.bottom],
  );

  if (shop.isError) {
    return (
      <YStack f={1} bg={colors.background}>
        <AppHeader onBack={onBack} />
        <ScreenError error={shop.error} onRetry={() => void shop.refetch()} />
      </YStack>
    );
  }

  if (shop.isPending) {
    return (
      <YStack f={1} bg={colors.background}>
        {/* Cùng kiểu header với lúc có dữ liệu — đổi kiểu giữa chừng làm nút Lui nhảy chỗ. */}
        <AppHeader variant="overlay" onBack={onBack} />
        <ShopDetailSkeleton />
      </YStack>
    );
  }

  return (
    <YStack f={1} bg={colors.background}>
      {/*
        Header NỔI trên ảnh bìa: bìa chạm mép trên màn hình, một thanh đặc phía trên sẽ cắt mất
        phần trên của ảnh. Tên chỉ hiện sau khi cuộn qua khối hồ sơ — lúc đó tên ở thân trang đã
        khuất và header mới cần nhắc lại nó.
      */}
      <AppHeader variant="overlay" onBack={onBack} title={shop.data.name} showTitle={scrolled} />

      <FlatList
        data={listings.listings}
        keyExtractor={keyExtractor}
        {...LIST_TUNING}
        onScroll={onScroll}
        scrollEventThrottle={scrollThrottle.frame}
        contentContainerStyle={listPadding}
        ItemSeparatorComponent={Separator}
        renderItem={renderItem}
        onEndReached={listings.fetchNextPage}
        ListHeaderComponent={
          <YStack gap={layout.block} pb={layout.block}>
            <ShopHeader shop={shop.data} />

            <YStack px={layout.screenX} gap={layout.block}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {listings.total > 0 ? t('titleWithCount', { count: listings.total }) : t('title')}
              </Text>

              {listings.initialError ? (
                <ScreenError
                  error={listings.initialError}
                  onRetry={listings.retryInitial}
                  title={t('loadError')}
                />
              ) : listings.isInitialLoading ? (
                <YStack gap={layout.block} accessibilityLabel={tResults('loadingLabel')}>
                  {Array.from({ length: 3 }, (_, i) => (
                    <VehicleCardSkeleton key={i} />
                  ))}
                </YStack>
              ) : listings.total === 0 ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('empty')}
                </Text>
              ) : null}
            </YStack>
          </YStack>
        }
        ListFooterComponent={
          listings.appendError ? (
            <YStack py={layout.section} px={layout.screenX} gap={space.sm} ai="center">
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {tResults('appendError', { reason: '' })}
              </Text>
              <Button
                label={tResults('loadMore')}
                variant="secondary"
                block={false}
                onPress={listings.retryNextPage}
              />
            </YStack>
          ) : listings.isFetchingNextPage ? (
            <YStack pt={layout.block} px={layout.screenX} accessibilityLabel={tResults('loadingMore')}>
              <VehicleCardSkeleton />
            </YStack>
          ) : !listings.hasNextPage && listings.total > 0 ? (
            <Text col={colors.placeholder} fos={fontSize.label} ta="center" py={layout.section}>
              {tResults('endNote', { count: listings.total })}
            </Text>
          ) : null
        }
      />
    </YStack>
  );
}
