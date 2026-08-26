import { draftToFilterPatch } from '@xeprime/domain';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useWindowDimensions, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { colors, space } from '@/theme/tokens';
import { SearchExperienceProvider, useSearchExperience } from './search-context';
import { useBanners } from './hooks/use-marketplace-data';
import { FeaturedHosts } from './components/FeaturedHosts';
import { FeaturedLocations } from './components/FeaturedLocations';
import { HomeHero } from './components/HomeHero';
import { MarketHeader } from './components/MarketHeader';
import { RentalSteps } from './components/RentalSteps';
import { SearchCard } from './components/SearchCard';
import { StickySearchBar, stickyThreshold } from './components/StickySearchBar';
import { VehiclePreview } from './components/VehiclePreview';
import { ROUTES } from '@/navigation/routes';

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
    <SearchExperienceProvider>
      <HomeContent />
    </SearchExperienceProvider>
  );
}

function HomeContent() {
  // Chạm nhanh nhiều lần vào "xem chi tiết" từng đẩy nhiều màn chồng nhau — xem hook.
  const navigateOnce = useNavigateOnce();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: user } = useCurrentUser();
  const { data: banners, isLoading: bannersLoading } = useBanners();
  const { draft, submit } = useSearchExperience();

  const threshold = stickyThreshold(width);

  /**
   * 0 = thanh thu gọn nằm ngoài màn hình, 1 = hiện đủ.
   *
   * Chạy trên luồng UI (Reanimated worklet) chứ không qua `setState`: `onScroll` bắn mỗi khung
   * hình, đẩy qua React là render lại cả trang chủ suốt quãng cuộn và thanh giật theo.
   */
  const progress = useSharedValue(0);

  /**
   * MÉP DƯỚI của header, đo bằng `onLayout`.
   *
   * Lấy `y + height` chứ không chỉ `height`: thanh thu gọn định vị tuyệt đối trong cùng khung
   * với header, mà gốc toạ độ của khung đó phụ thuộc `SafeAreaView` đệm bao nhiêu — con số ấy
   * khác nhau giữa Android (thanh trạng thái trong suốt hay không) và iOS. Cộng `y` vào là hết
   * phải đoán: mép dưới header ở đâu thì thanh nằm ngay đó.
   *
   * Trước đây dùng `STICKY_BAR_HEIGHT + insets.top` — vừa đoán chiều cao header, vừa cộng lại
   * một lần inset mà `SafeAreaView` đã đệm, nên thanh nghỉ sai chỗ và đè lên hàng ngôn ngữ.
   */
  const [headerBottom, setHeaderBottom] = useState(0);
  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setHeaderBottom(y + height);
  }, []);

  /**
   * Sang màn kết quả, mang trọn ngữ cảnh — cùng thứ `buildSearchHref` bên web nhét vào query
   * string, và cũng dựng từ **bản nháp**.
   *
   * Đọc `filters` ở đây thì sai hai lần: (1) `submit()` vừa gọi ngay trên nên `filters` của
   * render này vẫn là giá trị CŨ, (2) khách chưa chạm gì vào thẻ thì `filters` còn rỗng — màn
   * kết quả mở ra không có "Ô tô"/"Tự lái" nào cả, dù thẻ đang hiện đúng hai nhãn đó.
   *
   * Duyệt trọn patch thay vì liệt kê tay từng khoá: thêm một chiều vào `draftToFilterPatch`
   * (ADR 0011 từng thêm `hourly`) mà quên sửa chỗ này là ngữ cảnh rơi mất trên đường sang.
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

  /*
   * Cuộn về khối "Xe khả dụng" sau khi chọn một địa điểm nổi bật.
   *
   * Web gọi `scrollIntoView('#recommendations')` vì cùng một lý do: khối kết quả nằm PHÍA TRÊN
   * danh sách địa điểm, nên đổi bộ lọc mà màn hình đứng im thì cú bấm trông như rơi vào hư không.
   */
  /*
   * Ref THƯỜNG, không phải `useAnimatedRef`.
   *
   * `scrollTo` ở đây gọi từ luồng JS (một cú bấm), không phải từ worklet — mà chính vùng cuộn
   * này đang mang `useAnimatedScrollHandler` điều khiển thanh tìm kiếm thu gọn. Cắm thêm một
   * animated ref vào cùng node là đưa một thứ mình không cần vào đúng đường đi mảnh nhất.
   *
   */
  const scrollRef = useRef<ScrollView>(null);
  const [previewY, setPreviewY] = useState(0);
  const onPreviewLayout = useCallback(
    (event: LayoutChangeEvent) => setPreviewY(event.nativeEvent.layout.y),
    [],
  );
  const scrollToPreview = useCallback(
    () => scrollRef.current?.scrollTo({ y: Math.max(previewY - space.md, 0), animated: true }),
    [previewY, scrollRef],
  );

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
   * cần một khoảng thở. Là KHÁCH thì không có thanh tab, và `SafeAreaView` ở đây chỉ giữ cạnh
   * trên — nội dung sẽ chui xuống dưới thanh điều hướng nếu không tự cộng inset vào.
   */
  const bottomPadding = layout.section + (user ? 0 : insets.bottom);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack onLayout={onHeaderLayout}>
        <MarketHeader />
      </YStack>

      {/*
        Thanh thu gọn nằm ĐÈ lên nội dung (`position: absolute`) và trượt vào từ trên, nên nó
        không chiếm chỗ trong dòng chảy — thêm/bớt nó không đẩy nội dung nhảy một nấc.
      */}
      <YStack pos="absolute" top={headerBottom} left={0} right={0} zi={10}>
        <StickySearchBar onSubmit={openSearch} progress={progress} />
      </YStack>

      <Animated.ScrollView
        // Reanimated không xuất kiểu instance của bản bọc; runtime vẫn là một `ScrollView`.
        ref={scrollRef as ComponentProps<typeof Animated.ScrollView>['ref']}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <HomeHero banners={banners ?? []} isLoading={bannersLoading} />

        <YStack px={layout.screenX} mt={-layout.heroOverlap}>
          <SearchCard onSearch={openSearch} />
        </YStack>

        {/* Trang gian hàng (MKT-05) là task riêng chưa dựng. */}
        <YStack
          px={layout.screenX}
          pt={layout.section}
          gap={layout.section}
          onLayout={onPreviewLayout}
        >
          <VehiclePreview
            onExplore={openSearch}
            onOpenListing={(listing, serviceType) =>
              // Mang ngữ cảnh dịch vụ sang, cùng vai trò `?serviceType=` bên web.
              navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType))
            }
          />
          <FeaturedLocations onPicked={scrollToPreview} />
          <FeaturedHosts />
          <RentalSteps />
        </YStack>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
