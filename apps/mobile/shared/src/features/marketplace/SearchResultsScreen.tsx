import Animated from 'react-native-reanimated';
import {
  ScrollReveal,
  ScrollRevealProvider,
  useScrollRevealList,
} from '@/components/motion/ScrollReveal';
import { Ionicons } from '@/components/icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LISTING_AMENITY_LABEL,
  LISTING_AMENITY_VALUES,
  LISTING_SORT_LABEL,
  SEAT_BUCKET_LABEL,
  SERVICE_TYPE,
} from '@xeprime/types';
import { serviceUsesRentalRange } from '@xeprime/domain';
import { catalogLabel } from '@/api/catalog';
import { type MarketplaceFilters, type PublicListing } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { useTabBarInset } from '@/components/layout/tab-bar-inset';
import { ScreenError } from '@/components/state/ScreenError';
import { images } from '@/assets';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { DotsLoader } from '@/components/ui/DotsLoader';
import { VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { Reveal } from '@/components/motion/Reveal';
import { useCatalog, useCatalogLabels } from '@/features/catalog/use-catalog';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { TABLET_MIN_WIDTH, layout } from '@/theme/layout';
import { MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { LineIcon } from '@/components/icons/LineIcon';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { SearchExperienceProvider, useSearchExperience } from './search-context';
import { useInfinitePublicListings } from './hooks/use-search-results';
import { FilterSheet } from './components/FilterSheet';
import { SearchContextSheet } from './components/SearchContextSheet';
import { KeywordSearch } from './components/KeywordSearch';
import { LocationPicker } from './components/LocationPicker';
import { RentalRangeSheet } from './components/RentalRangeSheet';
import { VehicleCard } from './components/VehicleCard';
import { usePriceBandLabel } from './filter-constants';
import { QuickFilterPills } from './components/QuickFilterPills';
import { useRentalRangeLabel } from './use-rental-range-label';
import { SERVICE_LABEL_KEY } from './search-items';
import { ROUTES } from '@/navigation/routes';
import { gridCellWidth } from '@/components/layout/ResponsiveGrid';
import { useContentWidth } from '@/theme/use-content-width';

/**
 * Website: ≥900px kết quả tìm xe 4 cột, dải tablet còn lại 2 cột. App dùng 3 cột ở mốc rộng (lệch
 * web CÓ CHỦ ĐÍCH, 10/11/2026): thẻ xe native xếp thông số (chỗ · hộp số · nhiên liệu) trên MỘT
 * hàng và cần ~300dp — ở 4 cột (~235dp trên iPad 13") dòng đó dính chữ, tên xe/gian hàng bị cắt.
 */
const SEARCH_WIDE_MIN_WIDTH = 900;
const SEARCH_WIDE_COLUMNS = 3;
const SEARCH_TABLET_COLUMNS = 2;

type ViewMode = 'grid' | 'list';

/** Các chiều thuộc tấm Bộ lọc — "Xoá tất cả" gỡ đúng nhóm này, giữ nguyên ngữ cảnh tìm kiếm. */
const FACET_KEYS = [
  'brand',
  'bodyType',
  'seats',
  'fuelType',
  'features',
  'transmission',
  'motorbikeCategory',
  ...LISTING_AMENITY_VALUES,
  // Bộ lọc mới của tấm Bộ lọc (web `FACET_FILTER_KEYS`, #222) — "Xoá bộ lọc" phải gỡ cả chúng.
  'instantBook',
  'minRating',
  'priceMin',
  'priceMax',
  'sort',
  // Nhu cầu cũng hiện thành chip (khớp web) — "Xoá bộ lọc" gỡ cả nó lẫn lộ trình đi kèm.
  'serviceType',
  'routeType',
] as const;

/**
 * Thời gian một `Modal` RN trượt ra khỏi màn trên iOS. Mở `Modal` kế tiếp khi cái trước CHƯA rời
 * hẳn là iOS lặng lẽ không trình bày nó; Android không có ràng buộc đó.
 */
const MODAL_DISMISS_MS = 350;
/** Ô vuông bộ lọc cạnh khung tìm kiếm — Figma `20043:57783`: 36, icon 20. */
const FILTER_BUTTON_SIZE = 38;

function afterModalDismiss(run: () => void) {
  if (Platform.OS === 'ios') setTimeout(run, MODAL_DISMISS_MS);
  else run();
}

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
  embedded = false,
}: {
  /** Ngữ cảnh mang từ trang chủ sang — cùng vai trò query string bên web. */
  initialFilters: MarketplaceFilters;
  onBack: () => void;
  /**
   * Màn nằm TRONG bộ tab (tab "Tìm xe", 28/10/2026): thanh trên của app đã lo safe area và thanh
   * tab là lối ra ⇒ bỏ dải safe area và thanh tiêu đề có nút lui.
   */
  embedded?: boolean;
}) {
  return (
    <SearchExperienceProvider initial={initialFilters}>
      <ResultsBody
        onBack={onBack}
        embedded={embedded}
        contextKey={JSON.stringify(initialFilters)}
      />
    </SearchExperienceProvider>
  );
}

function ResultsBody({
  onBack,
  embedded,
  contextKey,
}: {
  onBack: () => void;
  embedded: boolean;
  /** Nội dung ngữ cảnh màn trước gửi sang — đổi ⇒ kết quả mới, cuộn về đầu. */
  contextKey: string;
}) {
  const colors = useColors();
  const t = useTranslations('Marketplace.results');
  const compactRangeLabel = useRentalRangeLabel(true);
  const errorMessage = useErrorMessage();
  const tPanel = useTranslations('Marketplace.filterPanel');
  const priceBandLabel = usePriceBandLabel();
  const tService = useTranslations('HomeSearch.service');
  const tNav = useTranslations('Navigation.public');
  const domainLabel = useDomainLabel();
  const insets = useSafeAreaInsets();
  const navigateOnce = useNavigateOnce();
  const { catalog } = useCatalog();
  const { brandLabel } = useCatalogLabels();

  const {
    draft,
    filters,
    setProvinceCode,
    setRentalRange,
    setRentalMode,
    setFilters,
    submit,
    provinceLabel,
  } = useSearchExperience();

  const [filterOpen, setFilterOpen] = useState(false);
  /** Tấm "Tìm xe" (bộ chọn của thẻ tìm kiếm trang chủ) — Figma `19973:49063`. */
  const [contextOpen, setContextOpen] = useState(false);
  const listRef = useRef<FlatList<PublicListing>>(null);
  /*
   * Trang chủ gửi ngữ cảnh MỚI (màn không dựng lại nữa) ⇒ về đầu danh sách: kết quả mới mà giữ vị
   * trí cuộn cũ là đọc giữa chừng một danh sách khác. Đổi lọc TRONG màn không đi qua đây.
   */
  const contextKeyRef = useRef(contextKey);
  useEffect(() => {
    if (contextKeyRef.current === contextKey) return;
    contextKeyRef.current = contextKey;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [contextKey]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  /**
   * Tấm Bộ lọc đang ĐÓNG TẠM để khách chọn địa điểm / thời gian (web đặt hai ô đó trong hộp lọc).
   * Không mở `Modal` trong `Modal` — iOS không trình bày ổn định — nên: đóng tấm → đợi nó rời màn
   * → mở bộ chọn → xong thì mở lại tấm với bản nháp nguyên vẹn (`preserveDraft`).
   */
  const [returnTo, setReturnTo] = useState<'filter' | 'context' | null>(null);
  const filterReturn = returnTo === 'filter';
  const pickFromFilter = (openPicker: () => void) => {
    setReturnTo('filter');
    setFilterOpen(false);
    afterModalDismiss(openPicker);
  };
  /** Cùng luật cho tấm "Tìm xe": đóng tấm → bộ chọn → mở lại tấm (ngữ cảnh chung giữ nguyên). */
  const pickFromContext = (openPicker: () => void) => {
    setReturnTo('context');
    setContextOpen(false);
    afterModalDismiss(openPicker);
  };
  const closeContext = () => {
    setReturnTo(null);
    setContextOpen(false);
  };
  const backToFilter = () => {
    if (returnTo === 'filter') afterModalDismiss(() => setFilterOpen(true));
    else if (returnTo === 'context') afterModalDismiss(() => setContextOpen(true));
  };
  const closeFilter = () => {
    setReturnTo(null);
    setFilterOpen(false);
  };
  const results = useInfinitePublicListings(filters);

  /*
   * Ba thứ dưới đây phải GIỮ NGUYÊN THAM CHIẾU giữa các lần render, nếu không `memo` trên
   * `VehicleCard` thành vô nghĩa: màn này dựng lại vì đủ chuyện không liên quan tới một chiếc
   * xe cụ thể (đo chiều cao khối lọc, tải thêm trang, đổi sắp xếp), và một `renderItem` mới là
   * đủ để FlatList vẽ lại toàn bộ hàng đang hiển thị.
   */
  const openShop = useCallback(
    (slug: string) => navigateOnce(ROUTES.explore.shopDetail(slug)),
    [navigateOnce],
  );
  const openListing = useCallback(
    (listing: PublicListing, serviceType: string | undefined) =>
      // Mang ngữ cảnh dịch vụ sang, cùng vai trò `?serviceType=` bên web.
      navigateOnce(ROUTES.explore.listingDetail(listing.id, serviceType)),
    [navigateOnce],
  );

  /*
   * Chế độ xem CỐ ĐỊNH dạng lưới (09/11/2026): bỏ nút chuyển lưới/danh sách và hàng Sắp xếp cho
   * trang kết quả gọn - sắp xếp chuyển vào tấm Bộ lọc. Không đọc lựa chọn cũ đã lưu, để máy từng
   * chọn "danh sách" không bị kẹt ở đó mà không còn nút đổi lại.
   */
  const viewMode = 'grid' as ViewMode;

  // Thẻ trượt lên khi cuộn tới — ScrollReveal đo vị trí thật trên luồng UI.
  const listReveal = useScrollRevealList();
  /*
   * Máy tính bảng, chế độ lưới: nhiều cột như website (`MarketplaceResults.module.css` — 2 cột ở
   * 641-899px, 4 cột từ 900px). Chế độ "hàng" (thẻ ngang) giữ 1 cột: thẻ đó vốn đã trải ngang.
   * Ô có bề ngang CỐ ĐỊNH (không `flex: 1`) để ô lẻ ở hàng cuối không giãn hết hàng.
   */
  const columnWidth = useContentWidth();
  const contentWidth = columnWidth - layout.screenX * 2;
  const columns =
    viewMode === 'list' || columnWidth < TABLET_MIN_WIDTH
      ? 1
      : columnWidth >= SEARCH_WIDE_MIN_WIDTH
        ? SEARCH_WIDE_COLUMNS
        : SEARCH_TABLET_COLUMNS;
  const cellStyle = useMemo(
    () => (columns > 1 ? { width: gridCellWidth(contentWidth, columns, space.md) } : undefined),
    [columns, contentWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PublicListing; index: number }) => (
      // Thẻ có bóng: CHỈ trượt lên khi cuộn tới (ScrollReveal), không mờ.
      <ScrollReveal index={index} {...(cellStyle ? { style: cellStyle } : {})}>
        <VehicleCard
          listing={item}
          onPress={openListing}
          variant={viewMode === 'list' ? 'row' : 'grid'}
        />
      </ScrollReveal>
    ),
    [openListing, viewMode, cellStyle],
  );

  const tabBarInset = useTabBarInset();
  const listPadding = useMemo(
    () => ({
      paddingHorizontal: layout.screenX,
      paddingTop: space.sm,
      // + thanh tab nổi khi nằm trong bộ tab — thẻ cuối không khuất dưới thanh.
      paddingBottom: layout.section + insets.bottom + tabBarInset,
    }),
    [insets.bottom, tabBarInset],
  );

  /** Chip cho từng giá trị đang lọc — bấm × là gỡ đúng giá trị đó, không xoá cả chiều. */
  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; clear: () => void }[] = [];

    // Nhu cầu (Tự lái / Có tài xế / Thuê dài hạn) — chip đầu hàng, khớp web.
    if (filters.serviceType) {
      chips.push({
        id: `serviceType:${filters.serviceType}`,
        label: domainLabel('serviceType', filters.serviceType),
        clear: () => setFilters({ serviceType: undefined, routeType: undefined }),
      });
    }

    const listChip = (
      dim: 'brand' | 'bodyType' | 'seats' | 'fuelType' | 'features' | 'transmission',
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

    // Thứ tự chip đúng web `MarketplaceResults.appliedChips`.
    listChip('bodyType', (key) => catalogLabel(catalog.body_type, key) ?? key);
    for (const key of filters.motorbikeCategory ?? []) {
      chips.push({
        id: `motorbikeCategory:${key}`,
        label: domainLabel('motorbikeCategory', key),
        clear: () =>
          setFilters({
            motorbikeCategory: (filters.motorbikeCategory ?? []).filter((k) => k !== key),
          }),
      });
    }
    listChip('brand', (key) => brandLabel(key) ?? key);
    listChip('transmission', (key) => domainLabel('transmissionType', key));
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

    if (filters.instantBook) {
      chips.push({
        id: 'instantBook',
        label: tPanel('modal.chips.instantBook'),
        clear: () => setFilters({ instantBook: undefined }),
      });
    }

    if (filters.minRating != null) {
      chips.push({
        id: 'minRating',
        label: tPanel('modal.ratingFrom', { rating: filters.minRating }),
        clear: () => setFilters({ minRating: undefined }),
      });
    }

    // Sắp xếp KHÔNG thành chip (web cũng không) - nó đổi thứ tự, không thu hẹp kết quả.
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      chips.push({
        id: 'price',
        label: priceBandLabel({ min: filters.priceMin, max: filters.priceMax }),
        clear: () => setFilters({ priceMin: undefined, priceMax: undefined }),
      });
    }

    return chips;
  }, [filters, brandLabel, catalog, domainLabel, priceBandLabel, setFilters, tPanel]);

  /**
   * Huy hiệu trên nút Bộ lọc = SỐ VIÊN đang hiện ngay cạnh "Xoá tất cả".
   *
   * Đếm theo CHIỀU (hãng = 1 dù chọn ba hãng) thì con số và hàng viên nói hai điều khác nhau
   * trên cùng một màn — người ta đọc "2 bộ lọc" rồi đếm được năm viên bên dưới. Web cũng lấy
   * đúng `appliedChips.length`.
   */
  const filterCount = activeChips.length;

  /** "Áp dụng" của tấm Tìm xe: chốt ngữ cảnh, đóng tấm, đưa danh sách về đầu. */
  const applyContext = () => {
    submit();
    closeContext();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  /** Dòng 2 của khung tìm kiếm: "Ô tô | Có tài xế | Hồ Chí Minh | 08:00 T3, 13/10 – …". */
  const contextSummary = [
    domainLabel('vehicleType', draft.vehicleType),
    draft.serviceType === SERVICE_TYPE.SELF_DRIVE
      ? null
      : tService(SERVICE_LABEL_KEY[draft.serviceType] as never),
    provinceLabel(draft.provinceCode ?? ''),
    serviceUsesRentalRange(draft.serviceType)
      ? compactRangeLabel(draft.rental.pickupAt, draft.rental.returnAt)
      : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const clearFacets = () =>
    setFilters(Object.fromEntries(FACET_KEYS.map((key) => [key, undefined])));

  /*
   * Phần CUỘN của đầu màn: hai hàng viên lọc nhanh, số kết quả, chip đang áp, sắp xếp. Khung tìm
   * kiếm hai dòng + nút Bộ lọc nằm CỐ ĐỊNH phía trên (Figma `21977:56604`: cuộn xuống chỉ còn nó).
   */
  const listHeader = (
    <YStack gap={12} pb={space.md}>
      {/* Viên lọc nhanh hai hàng — Figma `20043:57771`; mỗi hàng cuộn ngang riêng. */}
      <QuickFilterPills filters={filters} onChange={setFilters} />

      {/* Số kết quả: bỏ khỏi màn (09/11/2026, như web ≤640px) - chỉ còn cho trình đọc màn hình. */}
      <Text
        accessibilityLiveRegion="polite"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      >
        {results.isInitialLoading
          ? t('searching')
          : filters.q
            ? t('availableFor', { count: results.total, q: filters.q })
            : t('foundCount', { count: results.total })}
      </Text>

      {/* "Điều kiện đang chọn" - Figma `22230:58296`: MỘT dòng chip cuộn ngang (không mũi tên),
          nút xoá icon "Rotate Right" 20 vàng ghim ở mép phải. */}
      {activeChips.length > 0 ? (
        <XStack ai="center" gap={space.sm}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Co theo nội dung: ít chip thì nút xoá đứng ngay sau chip cuối; tràn thì bị đẩy ra mép phải.
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{
              gap: 8,
              alignItems: 'center',
              paddingHorizontal: 2,
              paddingVertical: 1,
            }}
          >
            {activeChips.map((chip) => (
              <Pressable
                key={chip.id}
                onPress={chip.clear}
                accessibilityRole="button"
                accessibilityLabel={t('removeFilter', { label: chip.label })}
              >
                <XStack
                  ai="center"
                  gap={4}
                  bg={colors.primaryLight}
                  bw={1}
                  bc={colors.primaryBright}
                  br={radius.pill}
                  // Đệm viết bằng `style` (shorthand `pl` không áp trong cấu hình Tamagui này - chữ dính viền trái).
                  style={{ paddingLeft: 10, paddingRight: 8, paddingVertical: 3, minHeight: 26 }}
                >
                  {/* Như web ≤640px: chữ 12/18 thường (không đậm - đậm trên Android dính chữ), đệm 3/10, x 12. */}
                  <Text col={colors.brandText} fos={fontSize.label} lh={18} numberOfLines={1}>
                    {chip.label}
                  </Text>
                  <Ionicons name="close" size={12} color={colors.brandText} />
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={clearFacets}
            accessibilityRole="button"
            accessibilityLabel={t('clearAllAria')}
            hitSlop={space.sm}
          >
            <LineIcon name="rotate-right" size={20} color={colors.primary} />
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  );

  /** Trạng thái thay cho danh sách — nằm DƯỚI đầu màn, không che thẻ tìm kiếm. */
  const listEmpty = results.initialError ? (
    <ScreenError
      title={t('loadErrorTitle')}
      error={results.initialError}
      onRetry={results.retryInitial}
    />
  ) : results.isInitialLoading ? (
    <YStack gap={layout.block}>
      {Array.from({ length: 3 }, (_, i) => (
        <VehicleCardSkeleton key={i} />
      ))}
    </YStack>
  ) : (
    <Reveal variant="fade">
      <Empty
        keyword={filters.q}
        onClearKeyword={() => setFilters({ q: undefined })}
        filtered={filterCount > 0}
        onClear={clearFacets}
        onChangeContext={() => setLocationOpen(true)}
      />
    </Reveal>
  );
  const showList = !results.initialError && !results.isInitialLoading;

  return (
    <YStack f={1} bg={colors.background}>
      {/*
        Dải safe area ĐỨNG YÊN. Thanh tiêu đề trượt đi cùng khối lọc, nên nếu không có dải này
        thì danh sách chạy thẳng lên dưới thanh trạng thái.
      */}
      {embedded ? null : <YStack h={insets.top} bg={colors.surface} />}
      {embedded ? null : <AppHeader onBack={onBack} title={t('title')} flushTop />}

      {/*
        KHUNG TÌM KIẾM CỐ ĐỊNH — Figma `20043:57775` / `21977:56604`: khung xám bo tròn, đệm 8/12,
        dòng 1 (22) ô từ khoá · khoảng 8 · dòng 2 (18) tóm tắt ngữ cảnh, icon 16 cách chữ 6; bên phải
        nút Bộ lọc 36 (icon 20). Chạm dòng 2 ⇒ tấm "Tìm xe" (bộ chọn của thẻ tìm kiếm trang chủ).
      */}
      <XStack px={layout.screenX} py={space.sm} gap={space.sm} ai="center" bg={colors.surface}>
        <YStack
          f={1}
          minWidth={0}
          gap={space.sm}
          px={12}
          py={space.sm}
          br={radius.card}
          bg={colors.surfaceMuted}
        >
          <KeywordSearch
            variant="bare"
            value={filters.q}
            onApply={(q) => setFilters({ q })}
            onOpenShop={openShop}
          />
          <Pressable
            onPress={() => setContextOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${tNav('searchCars')}: ${contextSummary}`}
          >
            <XStack ai="center" gap={6} h={18}>
              <LineIcon name="location" size={16} color={colors.primary} />
              <Text
                f={1}
                col={colors.textMuted}
                fos={fontSize.label}
                fow={fontWeight.medium}
                lh={18}
                numberOfLines={1}
              >
                {contextSummary}
              </Text>
            </XStack>
          </Pressable>
        </YStack>
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('filters')}
        >
          <YStack
            w={FILTER_BUTTON_SIZE}
            h={FILTER_BUTTON_SIZE}
            ai="center"
            jc="center"
            bg={colors.surfaceMuted}
            bw={1}
            bc={colors.placeholder}
            br={12}
          >
            <LineIcon name="filter-5" size={20} color={colors.textMuted} />
            {filterCount > 0 ? (
              <YStack
                position="absolute"
                top={-6}
                right={-6}
                minWidth={18}
                h={18}
                px={4}
                br={radius.pill}
                bg={colors.primary}
                ai="center"
                jc="center"
              >
                <Text col={colors.onPrimary} fos={fontSize.meta} fow={fontWeight.bold}>
                  {filterCount}
                </Text>
              </YStack>
            ) : null}
          </YStack>
        </Pressable>
      </XStack>

      <ScrollRevealProvider value={listReveal.ctx}>
        <Animated.FlatList
          // Đổi số cột là dựng lại danh sách — FlatList không cho đổi `numColumns` tại chỗ.
          key={`cols-${columns}`}
          numColumns={columns}
          {...(columns > 1 ? { columnWrapperStyle: { gap: space.md } } : {})}
          ref={listRef as never}
          onScroll={listReveal.onScroll}
          scrollEventThrottle={16}
          data={showList ? results.listings : []}
          keyExtractor={keyExtractor}
          {...MEDIA_LIST_TUNING}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={listPadding}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
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
                  {t('appendError', { reason: errorMessage(results.appendError) })}
                </Text>
                <Button
                  label={t('loadMore')}
                  icon="chevron-down-outline"
                  variant="secondary"
                  block={false}
                  align="center"
                  onPress={results.retryNextPage}
                />
              </YStack>
            ) : results.isFetchingNextPage ? (
              <YStack pt={layout.block} pb={layout.block} accessibilityLabel={t('loadingMore')}>
                <DotsLoader />
              </YStack>
            ) : showList && !results.hasNextPage && results.total > 0 ? (
              <YStack ai="center" gap={space.xs} py={layout.section}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} ta="center">
                  {t('allViewed')}
                </Text>
                <Text col={colors.placeholder} fos={fontSize.label} ta="center">
                  {t('allViewedDesc')}
                </Text>
              </YStack>
            ) : null
          }
        />
      </ScrollRevealProvider>

      <FilterSheet
        open={filterOpen}
        filters={filters}
        onApply={setFilters}
        onClose={closeFilter}
        preserveDraft={filterReturn}
        locationLabel={provinceLabel(draft.provinceCode ?? '')}
        // Luôn hiện như web (`FilterModal` không phân nhánh theo dịch vụ, kể cả dài hạn); bản gọn
        // không thứ = `compactPoint` của `RentalDateTimeRangeField` trong hộp lọc web.
        rentalLabel={compactRangeLabel(draft.rental.pickupAt, draft.rental.returnAt)}
        onPickLocation={() => pickFromFilter(() => setLocationOpen(true))}
        onPickRentalTime={() => pickFromFilter(() => setRangeOpen(true))}
      />

      <SearchContextSheet
        open={contextOpen}
        onClose={closeContext}
        onApply={applyContext}
        onPickLocation={() => pickFromContext(() => setLocationOpen(true))}
        onPickRange={() => pickFromContext(() => setRangeOpen(true))}
      />

      <LocationPicker
        open={locationOpen}
        onClose={() => {
          setLocationOpen(false);
          backToFilter();
        }}
        onSelect={(code) => {
          setProvinceCode(code);
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
          backToFilter();
        }}
        onCancel={() => {
          setRangeOpen(false);
          backToFilter();
        }}
      />
    </YStack>
  );
}

/**
 * Rỗng vì BỘ LỌC khác rỗng vì HỆ THỐNG chưa có xe — hai câu chữ khác nhau và hai lối thoát khác
 * nhau. Gộp lại thì khách đang lọc quá tay sẽ tưởng nền tảng không có xe nào.
 */
function Empty({
  keyword,
  onClearKeyword,
  filtered,
  onClear,
  onChangeContext,
}: {
  /** Rỗng vì TỪ KHOÁ — lối thoát đúng là xoá từ khoá, không phải bộ lọc. */
  keyword?: string;
  onClearKeyword: () => void;
  filtered: boolean;
  onClear: () => void;
  onChangeContext: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Marketplace.results');
  // Hai trạng thái rỗng dùng nhãn 'Xoá bộ lọc' của bộ lọc — như web.
  const tFilters = useTranslations('Marketplace.filterPanel');

  if (keyword) {
    return (
      <YStack flexGrow={1} ai="center" jc="center" gap={space.md} p={layout.screenX}>
        <ScreenMessage
          kind="no-results"
          title={t('emptyKeywordTitle', { q: keyword })}
          description={t('emptyKeywordDesc')}
          actionLabel={t('clearKeyword')}
          onAction={onClearKeyword}
        />
        {filtered ? (
          <Pressable onPress={onClear} accessibilityRole="button" hitSlop={space.sm}>
            <Text col={colors.accentText} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {tFilters('clear')}
            </Text>
          </Pressable>
        ) : null}
      </YStack>
    );
  }

  if (!filtered) {
    return (
      <YStack flexGrow={1} jc="center">
        <ScreenMessage
          kind="no-results"
          title={t('emptySystemTitle')}
          description={t('emptySystemDesc')}
        />
      </YStack>
    );
  }

  return (
    <YStack flexGrow={1} ai="center" jc="center" gap={space.md} p={layout.screenX}>
      <ScreenMessage
        kind="no-results"
        title={t('emptyFilteredTitle')}
        description={t('emptyFilteredDesc')}
        actionLabel={tFilters('clear')}
        onAction={onClear}
      />
      <Pressable onPress={onChangeContext} accessibilityRole="button" hitSlop={space.sm}>
        <Text col={colors.accentText} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('changeTimeOrPlace')}
        </Text>
      </Pressable>
    </YStack>
  );
}
