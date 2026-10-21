import { draftToFilterPatch } from '@xeprime/domain';
import { useCallback, useState, type ReactNode } from 'react';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { RefreshControl, useWindowDimensions } from 'react-native';
import { BANNER_PLACEMENT } from '@xeprime/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useOpenPushPermissionGate } from '@/features/notifications/push-permission-gate';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { SearchExperienceProvider, useSearchExperience } from './search-context';
import { useBanners } from './hooks/use-marketplace-data';
import { FeaturedHosts } from './components/FeaturedHosts';
import { FeaturedLocations } from './components/FeaturedLocations';
import { HomeHero } from './components/HomeHero';
import { HomeFooter } from './components/HomeFooter';
import { RentalSteps } from './components/RentalSteps';
import { SearchCard } from './components/SearchCard';
import { StickySearchBar, stickyThreshold } from './components/StickySearchBar';
import { VehiclePreview } from './components/VehiclePreview';
import { ROUTES } from '@/navigation/routes';
import type { ExploreSearchParams } from '@/navigation/routes-base';
import { CustomerReviews } from './components/home/CustomerReviews';
import { PartnerBanner } from './components/home/PartnerBanner';
import { PromoBanners } from './components/home/PromoBanners';
import { VehicleTypes, homeShowcaseBodyTypes } from './components/home/VehicleTypes';
import { WhyChooseUs } from './components/home/WhyChooseUs';

/** Nhịp giữa các khối lớn của trang chủ v2 — rộng hơn `layout.section` vì mỗi khối có tiêu đề riêng. */
const HOME_SECTION_GAP = space.xl + space.sm;

/** Quãng cuộn để thanh thu gọn trượt hết vào — đủ dài để mượt, đủ ngắn để không lơ lửng. */
const REVEAL_DISTANCE = 120;

/**
 * Trang chủ Marketplace (MKT-01) — cùng thứ tự khối, cùng dữ liệu và cùng chữ với `apps/web`.
 *
 * Xem được ở chế độ KHÁCH: marketplace là khu công khai ở cả hai client.
 *
 * KHÔNG bọc `<Screen>`: trang này tràn viền (banner chạm mép) nên nó tự lo safe area — cạnh trên
 * ở header, cạnh dưới ở lề cuối vùng cuộn. Bàn phím cũng không phải lo: ô nhập duy nhất nằm
 * trong `LocationPicker`, và nó là modal có `<Screen>` riêng.
 *
 * Thẻ tìm kiếm ĐÈ lên mép dưới banner (`mt` âm) đúng như bố cục web.
 */
export function HomeScreen() {
  return (
    <SearchExperienceProvider askLocation>
      <HomeContent />
    </SearchExperienceProvider>
  );
}

function HomeContent() {
  const colors = useColors();
  // Chạm nhanh nhiều lần vào "xem chi tiết" từng đẩy nhiều màn chồng nhau — xem hook.
  const navigateOnce = useNavigateOnce();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: user } = useCurrentUser();
  // Trang chủ là một trong hai màn CHÍNH mà người dùng hạ cánh — mở cửa xin quyền thông báo ở đây,
  // không phải ở màn nhập OTP (`push-permission-gate.ts`).
  useOpenPushPermissionGate();
  const { data: banners, isLoading: bannersLoading, refetch: refetchBanners } = useBanners();
  const { draft, submit } = useSearchExperience();

  const threshold = stickyThreshold(width);

  /**
   * 0 = thanh thu gọn nằm ngoài màn hình, 1 = hiện đủ.
   *
   * Chạy trên luồng UI (Reanimated worklet) chứ không qua `setState`: `onScroll` bắn mỗi khung
   * hình, đẩy qua React là render lại cả trang chủ suốt quãng cuộn và thanh giật theo.
   */
  const progress = useSharedValue(0);

  // Thanh thu gọn neo ở `top: 0` được vì thanh trên + safe-area nằm ở layout của `(tabs)`, ngoài
  // navigator — khung toạ độ của màn bắt đầu ngay dưới nó, khỏi cần `onLayout` đo header.

  /**
   * Dựng params từ BẢN NHÁP, không phải `filters`: `submit()` vừa gọi ngay trên nên `filters` của
   * render này còn là giá trị cũ, và khách chưa chạm gì vào thẻ thì nó rỗng.
   *
   * Duyệt trọn patch thay vì liệt kê tay từng khoá — thêm một chiều vào `draftToFilterPatch` mà
   * quên sửa chỗ này là ngữ cảnh rơi mất trên đường sang.
   */
  const openSearch = useCallback(() => {
    submit();

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(draftToFilterPatch(draft))) {
      if (value === undefined || value === null || value === '' || value === false) continue;
      params[key] = value === true ? '1' : String(value);
    }

    navigateOnce(ROUTES.explore.search(params));
  }, [draft, navigateOnce, submit]);

  /**
   * Lối tắt sang kết quả với MỘT bộ lọc cố định (kiểu dáng, tỉnh) — cùng đích
   * `marketplaceSearchHref({...})` mà các thẻ "Loại xe" / "Điểm đến" bên web trỏ tới. Không mang
   * bản nháp của thẻ tìm kiếm theo: web cũng chỉ gửi đúng chiều của thẻ được bấm.
   */
  const openSearchWith = useCallback(
    (params: ExploreSearchParams) => navigateOnce(ROUTES.explore.search(params)),
    [navigateOnce],
  );

  const { catalog } = useCatalog();
  const showcaseTypes = homeShowcaseBodyTypes(catalog.body_type);
  const { data: promoBanners, refetch: refetchPromo } = useBanners(BANNER_PLACEMENT.PROMO);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const past = event.contentOffset.y - threshold;
      // Gán THẲNG, không `withTiming`: mỗi sự kiện cuộn khởi động lại một hoạt cảnh 120ms từ
      // vị trí hiện tại, nên thanh chỉ tiệm cận 0/1 chứ không bao giờ tới — nó đứng lưng chừng,
      // mờ mờ, và trễ hẳn một nhịp sau ngón tay. Dải `REVEAL_DISTANCE` đã đủ mềm.
      progress.value = Math.min(Math.max(past / REVEAL_DISTANCE, 0), 1);
    },
  });

  /*
   * Lề đáy: ĐÃ đăng nhập thì thanh tab chiếm phần dưới và tự nuốt inset của hệ thống, nên chỉ
   * cần một khoảng thở. Là KHÁCH thì không có thanh tab, và layout của `(tabs)` chỉ giữ cạnh
   * trên — nội dung sẽ chui xuống dưới thanh điều hướng nếu không tự cộng inset vào.
   */
  const [pulling, setPulling] = useState(false);
  const bottomPadding = layout.section + (user ? 0 : insets.bottom);

  return (
    // Web `.page`: nền trang chủ là `bg-container` (trắng / #0f1620), không phải `bg`.
    <YStack f={1} bg={colors.surface}>
      {/*
        Thanh thu gọn nằm ĐÈ lên nội dung (`position: absolute`) và trượt vào từ trên, nên nó
        không chiếm chỗ trong dòng chảy — thêm/bớt nó không đẩy nội dung nhảy một nấc.
      */}
      <YStack pos="absolute" top={0} left={0} right={0} zi={10} pointerEvents="box-none">
        <StickySearchBar onSubmit={openSearch} progress={progress} />
      </YStack>

      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        /*
          Kéo-làm-mới cho hai dải banner — nội dung marketing admin bật/tắt theo giờ. Các khối
          còn lại tự làm mới theo `staleTime` của chúng; ô tìm kiếm là state cục bộ.
        */
        refreshControl={
          <RefreshControl
            /*
              CHỈ quay khi người dùng kéo: `isRefetching` còn bật cả khi React Query tự làm mới nền
              (quay lại tab, app về trước) — buộc vào nó là vòng xoay hiện lơ lửng dưới header mà
              không ai kéo.
            */
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void Promise.allSettled([refetchBanners(), refetchPromo()]).finally(() =>
                setPulling(false),
              );
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={scrollThrottle.frame}
      >
        <HomeHero banners={banners ?? []} isLoading={bannersLoading} />

        {/* Web: thẻ tìm kiếm nằm ngay dưới banner, không đè lên ảnh (`HomeHero.module.css`). */}
        <YStack px={layout.screenX}>
          <SearchCard onSearch={openSearch} />
        </YStack>

        {/*
          Thứ tự khối = `app/(public)/page.tsx` bên web (trang chủ v2, ADR 0062): Tại sao chọn →
          Xe tiêu biểu → Banner khuyến mãi → Loại xe → Điểm đến → Gian hàng → Đối tác → Các bước →
          Đánh giá → chân màn. Khối "Tải ứng dụng" của web KHÔNG mang sang: người xem đang ở
          trong chính ứng dụng đó (xem docblock `HomeFooter`).
        */}
        <YStack px={layout.screenX} pt={layout.section} gap={HOME_SECTION_GAP}>
          <WhyChooseUs />
          <VehiclePreview
            onExplore={openSearch}
            onOpenListing={(listing, serviceType) =>
              // Mang ngữ cảnh dịch vụ sang, cùng vai trò `?serviceType=` bên web.
              navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType))
            }
          />
          {/* Chưa có banner khuyến mãi nào đang hiển thị thì không dựng khối — như web. */}
          {promoBanners && promoBanners.length > 0 ? <PromoBanners banners={promoBanners} /> : null}
          {/* Kiểu dáng bật "Hiện ở trang chủ" — chưa có mục nào thì không dựng khối. */}
          {showcaseTypes.length > 0 ? (
            <HomeBand>
              <VehicleTypes items={showcaseTypes} onOpenSearch={openSearchWith} />
            </HomeBand>
          ) : null}
          <FeaturedLocations onOpenSearch={openSearchWith} />
          <FeaturedHosts onOpenShop={(slug) => navigateOnce(ROUTES.explore.shopDetail(slug))} />
          <PartnerBanner onRegister={() => navigateOnce(ROUTES.listYourVehicle.root())} />
          <RentalSteps />
          <HomeBand>
            <CustomerReviews />
          </HomeBand>
          {/*
            Chân màn: lối vào trang giới thiệu, trung tâm trợ giúp và bốn văn bản pháp lý — đúng
            chỗ web đặt chân trang trên trang chủ, và là bề mặt CÔNG KHAI duy nhất của app (không
            đòi phiên). Xem docblock `HomeFooter`.
          */}
          <HomeFooter onExplore={openSearchWith} />
        </YStack>
      </Animated.ScrollView>
    </YStack>
  );
}

/**
 * Dải nền `bg` tràn hết bề ngang (`.typesBand` ≤640px và `.testimonialsBand` của web) — khối
 * bên trong vẫn canh lề nội dung, đệm trên/dưới 40 như `.block` ở bề rộng điện thoại.
 */
function HomeBand({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack
      mx={-layout.screenX}
      px={layout.screenX}
      py={space.xl + space.sm}
      bg={colors.background}
    >
      {children}
    </YStack>
  );
}
