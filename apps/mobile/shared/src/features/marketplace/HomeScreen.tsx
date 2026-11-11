import { draftToFilterPatch } from '@xeprime/domain';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigation } from 'expo-router';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RefreshControl } from 'react-native';
import { BANNER_PLACEMENT } from '@xeprime/types';
import { useTabBarHide, useTabBarInset } from '@/components/layout/tab-bar-inset';
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
import { onHomeScrollTop } from './home-scroll-top';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { FeaturedHosts } from './components/FeaturedHosts';
import { FeaturedLocations } from './components/FeaturedLocations';
import { HomeHero } from './components/HomeHero';
import { RentalSteps } from './components/RentalSteps';
import { SearchCard } from './components/SearchCard';
import { StickySearchBar, stickyThreshold } from './components/StickySearchBar';
import { VehiclePreview } from './components/VehiclePreview';
import { ROUTES } from '@/navigation/routes';
import { Reveal } from '@/components/motion/Reveal';
import { useParallaxHeader } from '@/components/motion/use-parallax-header';
import type { ExploreSearchParams } from '@/navigation/routes-base';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { CustomerReviews } from './components/home/CustomerReviews';
import { PartnerBanner } from './components/home/PartnerBanner';
import { PromoBanners, PromoBannersSkeleton } from './components/home/PromoBanners';
import { VehicleTypes, homeShowcaseBodyTypes } from './components/home/VehicleTypes';
import { ScrollReveal, ScrollRevealProvider } from '@/components/motion/ScrollReveal';
import { WhyChooseUs } from './components/home/WhyChooseUs';
import { useContentWidth } from '@/theme/use-content-width';

/** Nhịp giữa các khối lớn của trang chủ v2 — rộng hơn `layout.section` vì mỗi khối có tiêu đề riêng. */
const HOME_SECTION_GAP = space.xl + space.sm;
/** `.cardOuter` của `SearchCard` web ≤640px — lề hai bên 12 (`space-12`), hẹp hơn lề màn 16. */
const SEARCH_CARD_GUTTER = toPx(XP_TOKENS['space-12']);

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
/** Quãng cuộn tối thiểu (dp) trước khi đổi trạng thái thanh tab. */
const TAB_BAR_SCROLL_SLOP = 12;

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
  const width = useContentWidth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  // Trang chủ là một trong hai màn CHÍNH mà người dùng hạ cánh — mở cửa xin quyền thông báo ở đây,
  // không phải ở màn nhập OTP (`push-permission-gate.ts`).
  useOpenPushPermissionGate();

  /*
   * Lên đầu trang kiểu Facebook: bấm LẠI tab Khám phá khi đang đứng ở nó, hoặc bấm logo ở thanh
   * trên. Từ tab khác chuyển sang thì GIỮ vị trí cuộn — `tabPress` vẫn phát nhưng màn chưa focus.
   */
  const scrollRef = useRef<Animated.ScrollView>(null);
  const navigation = useNavigation();
  useEffect(() => {
    const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
    const offTab = navigation.addListener?.('tabPress' as never, () => {
      if (navigation.isFocused()) toTop();
    });
    const offLogo = onHomeScrollTop(toTop);
    return () => {
      offTab?.();
      offLogo();
    };
  }, [navigation]);
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
  /** Offset cuộn dọc trên luồng UI — banner đầu trang parallax theo nó. */
  const scrollY = useSharedValue(0);
  /*
   * Parallax banner: hook dùng chung `useParallaxHeader` (trôi 0.45×, co 0.92, mờ 0.35 trong
   * 280dp đầu; kéo quá đỉnh thì phóng nhẹ) — cùng công thức cho mọi đầu trang có ảnh lớn.
   */
  const heroStyle = useParallaxHeader(scrollY);
  /** Đỉnh vùng khối nội dung + đỉnh dải đối tác trong vùng đó (đo `onLayout`) — xem `PartnerBanner`. */
  // -1 = CHƯA đo. `ScrollReveal` chờ mốc này có thật mới xét "khối đã vào màn": các khối con đo vị
  // trí TRƯỚC vùng cha, nếu mốc mặc định 0 thì mọi khối gần đầu bị coi là đã hiện ngay lúc mở trang
  // (hiệu ứng chạy hết khi chưa cuộn tới, "100+" đếm xong sẵn) - lỗi 09/11/2026.
  const sectionsY = useSharedValue(-1);
  const partnerY = useSharedValue(0);
  const revealCtx = useMemo(() => ({ scrollY, baseOffset: sectionsY }), [scrollY, sectionsY]);
  const tabBarHide = useTabBarHide();
  const lastScrollY = useSharedValue(0);
  const tabBarTarget = useSharedValue(0);

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
  // Hàm ỔN ĐỊNH cho các khối con (memo): viết thẳng trong JSX là mỗi lần trang chủ chạy lại thì
  // cả lưới "Xe tiêu biểu" / "Chủ xe nổi bật" dựng lại theo.
  const openListing = useCallback(
    // Mang ngữ cảnh dịch vụ sang, cùng vai trò `?serviceType=` bên web.
    (listing: { id: string }, serviceType: string | undefined) =>
      navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType)),
    [navigateOnce],
  );
  const openShop = useCallback(
    (slug: string) => navigateOnce(ROUTES.explore.shopDetail(slug)),
    [navigateOnce],
  );

  const { catalog } = useCatalog();
  const showcaseTypes = homeShowcaseBodyTypes(catalog.body_type);
  const {
    data: promoBanners,
    isLoading: promoLoading,
    refetch: refetchPromo,
  } = useBanners(BANNER_PLACEMENT.PROMO);
  // Ảnh nền dải đối tác do admin cấu hình — banner ĐẦU TIÊN đang hiển thị, như web.
  const { data: partnerBanners, refetch: refetchPartner } = useBanners(BANNER_PLACEMENT.PARTNER);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const past = event.contentOffset.y - threshold;
      // Gán THẲNG, không `withTiming`: mỗi sự kiện cuộn khởi động lại một hoạt cảnh 120ms từ
      // vị trí hiện tại, nên thanh chỉ tiệm cận 0/1 chứ không bao giờ tới — nó đứng lưng chừng,
      // mờ mờ, và trễ hẳn một nhịp sau ngón tay. Dải `REVEAL_DISTANCE` đã đủ mềm.
      progress.value = Math.min(Math.max(past / REVEAL_DISTANCE, 0), 1);

      // Thanh tab kiểu Facebook: cuộn XUỐNG thì trượt mất, cuộn LÊN (hoặc về gần đầu) thì hiện lại.
      // Bỏ qua rung nhỏ dưới TAB_BAR_SCROLL_SLOP để thanh không nháy khi ngón tay khựng.
      if (tabBarHide) {
        const y = event.contentOffset.y;
        const dy = y - lastScrollY.value;
        if (Math.abs(dy) >= TAB_BAR_SCROLL_SLOP || y <= 0) {
          const target = y > TAB_BAR_SCROLL_SLOP && dy > 0 ? 1 : 0;
          if (tabBarTarget.value !== target) {
            tabBarTarget.value = target;
            tabBarHide.set(withTiming(target, { duration: 220 }));
          }
          lastScrollY.value = y;
        }
      }
    },
  });

  /*
   * Lề đáy: ĐÃ đăng nhập thì thanh tab chiếm phần dưới và tự nuốt inset của hệ thống, nên chỉ
   * cần một khoảng thở. Là KHÁCH thì không có thanh tab, và layout của `(tabs)` chỉ giữ cạnh
   * trên — nội dung sẽ chui xuống dưới thanh điều hướng nếu không tự cộng inset vào.
   */
  const [pulling, setPulling] = useState(false);
  // Thanh tab nổi đè lên trang (đã đăng nhập) — chừa đúng chiều cao của nó.
  const tabBarInset = useTabBarInset();
  const bottomPadding = layout.section + (user ? tabBarInset : insets.bottom);

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
        ref={scrollRef}
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
              // Cả dữ liệu CHỢ (xe gợi ý, giá, gian hàng, địa điểm, đánh giá) — chỉ làm mới banner
              // thì chủ xe vừa đổi giá, khách kéo trang chủ vẫn thấy giá cũ.
              void Promise.allSettled([
                refetchBanners(),
                refetchPromo(),
                refetchPartner(),
                queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all }),
              ]).finally(() => setPulling(false));
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={scrollThrottle.frame}
      >
        {/* Các khối hiện lần lượt lúc mở trang (một lần — kéo làm mới không chạy lại). */}
        <Reveal variant="fade">
          <Animated.View style={heroStyle}>
            <HomeHero banners={banners ?? []} isLoading={bannersLoading} />
          </Animated.View>
        </Reveal>

        {/*
          Web: thẻ tìm kiếm nằm ngay dưới banner, không đè lên ảnh (`HomeHero.module.css`).
          Lề hai bên = `.cardOuter { padding: 0 space-12 }` của `SearchCard` web ở ≤640px.
        */}
        <Reveal index={1}>
          <YStack px={SEARCH_CARD_GUTTER}>
            <SearchCard onSearch={openSearch} />
          </YStack>
        </Reveal>

        {/*
          Thứ tự khối = `app/(public)/page.tsx` bên web (trang chủ v2, ADR 0062): Banner khuyến mãi →
          Xe tiêu biểu → Lý do chọn XePrime → Loại xe → Điểm đến → Gian hàng → Đối tác → Các bước →
          Đánh giá. KHÔNG mang sang: khối "Tải ứng dụng" (người xem đang ở trong chính ứng dụng đó) và
          chân trang — liên kết, pháp lý, bản quyền (người dùng chốt 29/10/2026 bỏ khỏi app).
        */}
        <YStack
          px={layout.screenX}
          pt={layout.section}
          gap={HOME_SECTION_GAP}
          onLayout={(e) => {
            sectionsY.value = e.nativeEvent.layout.y;
          }}
        >
          {/* Khối hiện ra khi cuộn tới (luồng UI, chỉ trượt — không mờ khối có bóng). */}
          <ScrollRevealProvider value={revealCtx}>
            {/* TRÊN "Xe tiêu biểu" như web (người dùng chốt 04/11/2026). Chưa có banner thì không dựng khối. */}
            {promoLoading ? (
              <PromoBannersSkeleton />
            ) : promoBanners && promoBanners.length > 0 ? (
              <ScrollReveal>
                <PromoBanners banners={promoBanners} />
              </ScrollReveal>
            ) : null}
            <ScrollReveal index={0}>
              <VehiclePreview
                onExplore={openSearch}
                onOpenListing={openListing}
              />
            </ScrollReveal>
            <ScrollReveal index={1}>
              <WhyChooseUs />
            </ScrollReveal>
            {/* Kiểu dáng bật "Hiện ở trang chủ" — chưa có mục nào thì không dựng khối. */}
            {showcaseTypes.length > 0 ? (
              <ScrollReveal index={2}>
                <HomeBand muted>
                  <VehicleTypes items={showcaseTypes} onOpenSearch={openSearchWith} />
                </HomeBand>
              </ScrollReveal>
            ) : null}
            <ScrollReveal index={3}>
              <FeaturedLocations onOpenSearch={openSearchWith} />
            </ScrollReveal>
            <ScrollReveal index={4}>
              <FeaturedHosts onOpenShop={openShop} />
            </ScrollReveal>
            {/* Không có nút "Đăng ký ngay" trên app (người dùng chốt 29/10/2026). */}
            {/* Đo dải đối tác qua `onLayout` của ScrollReveal: nó là con trực tiếp của vùng khối nên toạ độ đúng cho parallax. */}
            <ScrollReveal
              index={5}
              onLayout={(e) => {
                partnerY.value = e.nativeEvent.layout.y;
              }}
            >
              <PartnerBanner
                banner={partnerBanners?.[0] ?? null}
                parallax={{ scrollY, offset: partnerY, baseOffset: sectionsY }}
              />
            </ScrollReveal>
            <ScrollReveal index={6}>
              <RentalSteps />
            </ScrollReveal>
            <ScrollReveal index={6}>
              <HomeBand>
                <CustomerReviews />
              </HomeBand>
            </ScrollReveal>
          </ScrollRevealProvider>
        </YStack>
      </Animated.ScrollView>
    </YStack>
  );
}

/**
 * Dải nền tràn hết bề ngang — `muted`: nền BG/gray-100 của `.typesBand` (Figma `21965:5272`); mặc
 * định: nền `bg` của `.testimonialsBand`. Khối bên trong vẫn canh lề nội dung, đệm trên/dưới 40 như
 * `.block` ở bề rộng điện thoại.
 */
function HomeBand({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return (
    <YStack
      mx={-layout.screenX}
      px={layout.screenX}
      py={space.xl + space.sm}
      bg={muted ? colors.surfaceMuted : colors.background}
    >
      {children}
    </YStack>
  );
}
