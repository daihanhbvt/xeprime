import { IS_PARTNER_APP } from '@/lib/app-kind';
import FilterOutlined from '@ant-design/icons-svg/es/asn/FilterOutlined';
import { AntIcon } from '@/components/icons/AntIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CountBadge } from '@/components/ui/CountBadge';
import { SearchInput } from '@/components/ui/SearchInput';
import { BackToTopButton } from '@/components/ui/BackToTopButton';
import { useCollapseOnScroll, type CollapseOnScroll } from '@/hooks/use-collapse-on-scroll';
import { layout } from '@/theme/layout';
import { useResponsive } from '@/theme/use-responsive';
import { useTabBarInset } from '@/components/layout/tab-bar-inset';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space, typeScale } from '@/theme/tokens';
import { DotsLoader } from '@/components/ui/DotsLoader';
import { FilterButton } from '@/components/ui/FilterButton';
import { ListSearchBar } from './ListSearchBar';
import { activeFilterCount, ManageFilterSheet, type FilterGroup } from './ManageFilterSheet';
import {
  applyBranchFilterGroup,
  BRANCH_FILTER_GROUP_KEY,
  useBranchFilterGroup,
} from '@/features/branches/components/BranchFilterField';
import type { BranchFilterState } from '@/features/branches/hooks/use-branch-filter';

const useStyles = makeStyles((colors) => ({
  /**
   * Khối đầu trang ĐÈ lên danh sách, không nằm trong luồng layout.
   *
   * Để nó trong luồng (rồi thu lại bằng `marginBottom` âm) tạo một vòng lặp: đổi layout → mốc
   * cuộn nhảy → `onScroll` bắn → đổi hướng → ẩn/hiện lật → layout lại đổi, và cuộn nhanh quanh
   * ngưỡng là nó tự dao động. Ngoài luồng thì ẩn/hiện không đụng tới layout.
   */
  head: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    /*
     * NỀN ĐẶC, bắt buộc.
     *
     * Khối này đè lên danh sách, nên thiếu nền thì các thẻ cuộn xuyên qua nó và chữ chồng lên
     * chữ. Đây là cái giá của việc ra khỏi luồng layout — và là lỗi "vỡ bố cục" đã gặp.
     */
    backgroundColor: colors.background,
  },
  /*
    Bo tròn HẾT CỠ (`radius.pill`), giống hệt nút Thêm đứng ngay cạnh (`IconButton` luôn
    `radius.pill`) — trước đây nút này bo `radius.md` (góc vuông hơn) trong khi nút Thêm là một
    hình tròn đặc, nên dù đứng sát nhau và cùng chiều cao, mắt vẫn đọc ra hai điều khiển RIÊNG LẺ
    thay vì MỘT cụm hành động của hàng tiêu đề.
  */
  filterButton: {
    /*
      KHÔNG co lại. Nút đứng cùng hàng với tiêu đề, mà tiêu đề là `f={1}` — thiếu dòng này thì
      trên màn hẹp, tiêu đề dài sẽ bóp nút xuống còn cái phễu với nửa chữ.
    */
    flexShrink: 0,
    height: sizing.touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  /*
    Chữ số trong huy hiệu đếm — ba dòng này là thứ đưa nó về ĐÚNG TÂM hình tròn.

    `includeFontPadding` của Android mặc định BẬT: nó chèn thêm phần đệm theo ascent/descent của
    font vào hộp dòng, và phần đệm đó không cân — chữ số vì thế bị đẩy xuống dưới tâm dù khung
    cha đã `ai/jc center`. Đây đúng là hiện tượng "số không nằm giữa hình tròn", và nó chỉ có
    trên Android nên rất dễ lọt khi soi trên iOS.

    Bỏ `lineHeight` cố định vì lý do cùng gốc: gán chiều cao dòng bằng chiều cao khung thì hộp
    dòng tự căn glyph theo baseline của nó, không theo tâm khung. Không có nó thì flexbox của
    khung cha làm việc căn giữa, và nó căn đúng.
  */
}));

/**
 * Vỏ của một màn danh sách trong khu quản lý — gom bốn thứ mọi bảng dữ liệu ở đây đều cần: tiêu
 * đề + tổng số, thanh tìm kiếm + nút lọc, hành vi ẩn khi cuộn, và thanh phân trang.
 *
 * Ẩn khi cuộn chỉ ẩn khối ĐẦU TRANG; thanh phân trang thì KHÔNG, vì nó là đích của thao tác tiếp
 * theo. Trượt bằng `translateY` chứ không gắn/tháo khỏi cây — tháo ra thì chiều cao danh sách đổi
 * giữa chừng và vị trí cuộn nhảy đúng lúc người dùng đang đọc. Cuộn LÊN là hiện lại ngay.
 */
export function ManageListShell({
  title,
  subtitle: subtitleProp,
  total,
  action,
  actions,
  branchFilter,
  summary,
  searchBelowSummary = false,
  tabs,
  searchValue,
  searchLabel,
  searchPlaceholder,
  onSearchChange,
  groups: screenGroups,
  onFilterChange: onScreenFilterChange,
  hasRows,
  meta,
  onPageChange,
  loadingMore = false,
  variant = 'classic',
  // Mọi danh sách dùng tấm Lọc dạng lưới ô chọn (người dùng chốt 20/11/2026).
  filterLayout = 'grid',
  children,
}: {
  /**
   * Cách trình bày tấm "Lọc": `grid` = design v2 (Figma "_Filter Modal" `24158:105500` - ô tìm +
   * lưới ô chọn hai cột, "Xoá bộ lọc" · "Lưu bộ lọc"); `chips` = nhóm chip (màn chưa chuyển).
   */
  filterLayout?: 'chips' | 'grid';
  /**
   * `page` — khuôn design v2 (Figma "Rental Request - MB", người dùng chốt 13/11/2026): tiêu đề và
   * nút của trang đã lên THANH TRANG (`ManagePageHeader`), nên khối đầu trang chỉ còn câu mô tả,
   * hàng ô tìm v2 + nút "Lọc" v2 (`SearchInput variant="field"`, `FilterButton`), dải chỉ số và
   * dải tab. `title`/`actions` không vẽ ở đây. Màn chưa chuyển giữ `classic`.
   */
  variant?: 'classic' | 'page';
  title: string;
  /**
   * Phụ đề trang — web `ManagePageHeader subtitle` hiện ở mọi khổ (khổ hẹp chỉ thu icon), và mọi
   * trang danh sách web truyền một câu. Thu cùng khối đầu trang khi cuộn.
   */
  subtitle?: string;
  total?: string;
  /** Nút cũ ở hàng tiêu đề - chỉ còn cho màn CHƯA chuyển sang `actions`. */
  action?: ReactNode;
  /**
   * Hàng nút đầu trang - web `ManagePageHeader extra` khổ ≤640 (`.headerActions > * { flex: 1;
   * min-height: 44px }`): rộng hết khổ, các nút chia đều, nằm dưới tiêu đề + mô tả.
   */
  actions?: readonly ReactNode[];
  /**
   * Bộ lọc "Chi nhánh" của màn - ADR 0052. Web đặt `branch.field` trong `FilterBar`, nên ở khổ
   * ≤640 nó là chiều ĐẦU TIÊN của tấm "Lọc" (sau ô tìm kiếm) và được đếm trên huy hiệu nút.
   */
  branchFilter?: { filter: BranchFilterState; value: string | undefined };
  /**
   * Dải CHỈ SỐ tóm tắt, nằm giữa tiêu đề và dải tab.
   *
   * Tách khỏi `tabs` vì nó trả lời một câu khác: tab hỏi "đang xem cái nào", chỉ số hỏi "còn bao
   * nhiêu việc". Web dựng đúng thứ tự này (`ManagePageHeader extra` rồi mới tới `Tabs`).
   */
  summary?: ReactNode;
  /**
   * Ô tìm + nút Lọc nằm DƯỚI khối `summary` (thẻ thống kê) thay vì trên - Figma sổ Thu-Chi / Công nợ
   * (`24512:125313`): tab · kỳ · thống kê · tìm kiếm · danh sách. Chỉ ở biến thể `page`.
   */
  searchBelowSummary?: boolean;
  /**
   * Dải tab NGANG kèm số đếm, đặt giữa tiêu đề và ô tìm kiếm.
   *
   * Không nhét vào tấm trượt lọc dù về kỹ thuật nó cũng là một chiều lọc: tab mang CON SỐ ("Chờ
   * duyệt 3"), và con số đó là thứ người vận hành mở màn này để xem.
   */
  tabs?: ReactNode;
  searchValue: string;
  searchLabel: string;
  searchPlaceholder: string;
  onSearchChange: (next: string) => void;
  groups: readonly FilterGroup[];
  onFilterChange: (groupKey: string, value: string) => void;
  /**
   * Danh sách hiện có bản ghi nào không — thứ quyết định khối đầu trang được phép thu lại.
   *
   * BẮT BUỘC và tường minh, không suy từ `meta`. Bản trước suy `scrollable` từ
   * `meta !== undefined && meta.total > 0`, mà `meta` là prop của phân trang — từ khi mọi màn
   * quản lý chuyển sang cuộn vô hạn thì không màn nào truyền nó nữa, nên `scrollable` là
   * `false` ở KHẮP NƠI và khối đầu trang không bao giờ thu lại. Toàn bộ cơ chế ẩn-khi-cuộn nằm
   * chết trong khi mã của nó vẫn chạy đúng.
   *
   * Đây là bài học của việc lấy một prop TÙY CHỌN làm nguồn cho một hành vi BẮT BUỘC: bỏ trống
   * nó không báo lỗi ở đâu cả, chỉ lặng lẽ tắt một tính năng. Prop bắt buộc thì màn mới không
   * thể quên.
   */
  hasRows: boolean;
  meta?: { page: number; limit: number; total: number } | undefined;
  /**
   * Bỏ trống ở màn CUỘN VÔ HẠN — ở đó không có trang để đổi.
   *
   * `meta` và `onPageChange` đi thành cặp: có `meta` là có thanh phân trang ở chân, và thanh
   * đó cần chỗ để gọi khi người dùng bấm. Màn cuộn vô hạn không truyền cái nào cả.
   */
  onPageChange?: (page: number) => void;
  /** Đang tải trang kế (cuộn vô hạn) - hiện vòng xoay ở đáy, chặn xin trùng. */
  loadingMore?: boolean;
  /**
   * Danh sách.
   *
   * `onScroll` điều khiển việc ẩn khối đầu trang; `headerHeight` là khoảng danh sách phải tự
   * chừa ở trên, vì khối đó đè lên chứ không đẩy nội dung xuống.
   */
  children: (props: {
    /** Handler của Reanimated — gắn thẳng vào `onScroll` của `Animated.FlatList`/`FlatList`. */
    onScroll: CollapseOnScroll['onScroll'];
    headerHeight: number;
    /**
     * `contentContainerStyle` cho danh sách THẺ — đã chừa `headerHeight` ở trên và cùng một
     * tham chiếu giữa các lần render. Bốn màn từng tự viết object này inline, và một object mới
     * mỗi render là một lần `FlatList` so prop rồi dựng lại cả cây con giữa lúc đang cuộn.
     */
    contentContainerStyle: ViewStyle;
    /**
     * Gắn vào `ref` của chính danh sách — thứ cho phép vỏ đưa nó VỀ ĐẦU khi đổi trang.
     *
     * Callback ref chứ không phải object ref: mỗi màn có một `FlatList<T>` với `T` riêng, mà một
     * object ref thì bất biến theo kiểu nên không màn nào gán vừa. Hàm nhận `unknown` thì gán vào
     * đâu cũng được, và vỏ chỉ cần đúng một phương thức của nó.
     *
     * Bỏ không gắn thì phân trang vẫn chạy, chỉ mất phần cuộn về đầu.
     */
    bindList: (node: unknown) => void;
  }) => ReactNode;
}) {
  // Feedback thiết kế 20/11/2026 (dòng 2 "All Page"): app Partner bỏ câu mô tả dưới tiêu đề trang.
  const subtitle = IS_PARTNER_APP ? undefined : subtitleProp;
  const colors = useColors();
  const styles = useStyles();
  const tFilters = useTranslations('Common.filters');
  const [filtering, setFiltering] = useState(false);
  const branchGroup = useBranchFilterGroup(branchFilter?.filter, branchFilter?.value);
  const groups = useMemo<readonly FilterGroup[]>(
    () => (branchGroup ? [branchGroup, ...screenGroups] : screenGroups),
    [branchGroup, screenGroups],
  );
  const branchState = branchFilter?.filter;
  const onFilterChange = useCallback(
    (key: string, next: string) => {
      if (key === BRANCH_FILTER_GROUP_KEY && branchState) applyBranchFilterGroup(branchState, next);
      else onScreenFilterChange(key, next);
    },
    [branchState, onScreenFilterChange],
  );

  /**
   * Đổi trang là ĐƯA DANH SÁCH VỀ ĐẦU.
   *
   * Không làm thì vị trí cuộn được giữ nguyên qua lần đổi trang: đọc hết trang 1 rồi bấm sang
   * trang 2, người dùng rơi thẳng vào mục 17–20 của trang mới và không hề biết mình đã bỏ qua mục
   * 11–16 — một danh sách trông như thiếu mất một khúc. Nó là lỗi lộ ra đúng ở người dùng CHỊU KHÓ
   * cuộn hết trang, tức là người đọc kỹ nhất.
   *
   * Nằm ở vỏ chứ không ở từng màn: thanh phân trang đã ở đây, và sáu màn tự nhớ việc này thì màn
   * thứ bảy sẽ quên.
   *
   * `animated: false`: người dùng vừa bấm sang một TRANG KHÁC, không phải vuốt trong cùng một
   * danh sách — vẽ cảnh cuộn vun vút về đầu là mô tả sai chuyện vừa xảy ra. Cú nhảy này vẫn bắn
   * sự kiện cuộn với `y = 0`, nên khối đầu trang tự mở lại theo đúng đường của nó.
   */
  /*
   * Node danh sách giữ ở STATE chứ không ở ref: `children` được gọi NGAY TRONG lúc render, nên
   * mọi thứ đi qua nó đều bị coi là "đọc ref khi render" (`react-hooks/refs`) — và luật đó đúng,
   * một giá trị chỉ tồn tại trong ref thì React không có cách nào biết để dựng lại `changePage`
   * khi danh sách được gắn vào. Callback ref chỉ chạy lúc gắn và lúc tháo, nên cái giá là đúng
   * một lần render thêm cho mỗi lần danh sách vào/ra cây.
   */
  const [list, setList] = useState<{
    scrollToOffset?: (params: { offset: number; animated?: boolean }) => void;
  } | null>(null);

  const bindList = useCallback((node: unknown) => {
    setList(node as { scrollToOffset?: (params: { offset: number }) => void } | null);
  }, []);

  /*
   * Mobile: CUỘN VÔ HẠN thay thanh phân trang (người dùng 16/11/2026). Gần đáy thì xin trang kế;
   * màn gộp các trang bằng `useAccumulatedPages`. Không còn đổi trang kiểu bấm số.
   */
  const hasMore = meta !== undefined && meta.page * meta.limit < meta.total;
  const loadMore = useCallback(() => {
    if (meta && hasMore && !loadingMore) onPageChange?.(meta.page + 1);
  }, [meta, hasMore, loadingMore, onPageChange]);
  const [pastTop, setPastTop] = useState(false);
  const backToTop = useCallback(() => list?.scrollToOffset?.({ offset: 0, animated: true }), [list]);
  const openFilters = useCallback(() => setFiltering(true), []);
  const closeFilters = useCallback(() => setFiltering(false), []);

  /*
   * Chiều cao khối đầu trang phải ĐO, không được đoán: nó đổi theo màn (hộp thư có dải tab,
   * danh sách đơn thì không), và cả `translateY` lẫn `paddingTop` của danh sách đều lấy từ nó.
   */
  const {
    onScroll,
    progress,
    height: headHeight,
    heightValue: headHeightSv,
    onLayout: measureHead,
  } = useCollapseOnScroll({ onNearEnd: loadMore, onPastTopChange: setPastTop });

  // Màn rộng (iPad): danh sách thẻ và khối đầu trang cùng nằm trong một cột giữa màn.
  const { gutter } = useResponsive();
  // Thanh tab Partner NỔI đè nội dung - thẻ cuối phải cuộn lên được khỏi viên.
  const tabBarInset = useTabBarInset();
  const contentContainerStyle = useMemo<ViewStyle>(
    () => ({
      paddingHorizontal: gutter,
      paddingTop: headHeight,
      paddingBottom: layout.screenX + tabBarInset,
      gap: layout.inline,
    }),
    [headHeight, gutter, tabBarInset],
  );

  /*
   * Từ khoá tìm kiếm cũng là MỘT bộ lọc.
   *
   * Từ khi ô tìm kiếm nằm trong tấm trượt, nó không còn hiện trên màn nữa — nên nếu nút lọc
   * không đếm nó, người dùng gõ một từ khoá rồi thấy danh sách ngắn lại mà không còn dấu vết
   * nào trên màn giải thích vì sao.
   */
  /* Ô tìm kiếm hiện NGAY trên màn (web `FilterBar` khổ ≤640) nên không tính vào số bộ lọc. */
  const count = activeFilterCount(groups);

  /*
   * Khối đầu trang MỞ LẠI khi không còn gì để cuộn — SUY ở đây, không ghi vào `progress`.
   *
   * Nó chỉ hiện lại nhờ một cú cuộn ngược lên. Cuộn xuống cho nó ẩn đi rồi duyệt nốt yêu cầu
   * cuối cùng: danh sách thành rỗng, không còn sự kiện cuộn nào bắn ra, và khối đầu trang KẸT ở
   * trạng thái ẩn — mất luôn tiêu đề, hai chỉ số, cả dải tab lẫn ô tìm kiếm. Người dùng nhìn
   * thấy một màn trắng và không có cách nào gọi chúng trở lại ngoài việc rời màn. Đây đúng là ca
   * "duyệt xong thì mất hết tab": dữ liệu vẫn nguyên, chỉ phần điều khiển trượt ra ngoài màn.
   *
   * Suy thay vì ghi để `progress` chỉ có MỘT nguồn ghi là bộ nhận cuộn. Hai nguồn ghi vào cùng
   * một shared value — một từ luồng UI, một từ luồng JS — là thứ `react-hooks/immutability` chặn,
   * và nó chặn có lý: chúng có thể đè lên nhau giữa chừng một cú vuốt.
   *
   * `progress` không bị đụng tới trong lúc rỗng, nên khi dữ liệu quay lại nó vẫn giữ nguyên chỗ
   * người dùng đang đứng — không có cú nhảy nào.
   */
  const headStyle = useAnimatedStyle(() => {
    const shown = hasRows ? progress.value : 1;

    return {
      transform: [{ translateY: -headHeightSv.value * (1 - shown) }],
      /*
       * `box-none`, KHÔNG phải `auto`.
       *
       * Khối này đè lên danh sách. Với `auto` thì chính nó bắt mọi cú chạm trong vùng nó phủ —
       * và vì nó HIỆN LẠI ngay giữa lúc người dùng đang vuốt lên, ngón tay đột nhiên nằm trên
       * một view không cuộn được: cú cuộn bị cắt ngang. Đó là lỗi "cuộn mắc ngang header".
       *
       * `box-none` = bản thân view không bao giờ là đích của cú chạm, nhưng CON của nó thì vẫn.
       * Vuốt vào khoảng trống của khối là cuộn danh sách bên dưới; chạm đúng ô tìm kiếm, dải tab
       * hay nút lọc thì vẫn ăn.
       *
       * Thu hết rồi thì `none` — không được chặn gì nữa.
       */
      pointerEvents: shown > 0.01 ? ('box-none' as const) : ('none' as const),
    };
  }, [hasRows]);

  return (
    /*
      `overflow: hidden` ở KHUNG NGOÀI là thứ cắt khối đầu trang khi nó trượt lên.

      Khối đầu trang `position: absolute; top: 0` và thu bằng `translateY` âm. Không có khung
      cắt thì nó không biến mất — nó chỉ đi RA NGOÀI mép trên rồi vẽ đè lên `AppHeader` phía
      trên, vì React Native không tự cắt con tràn ra khỏi cha. Đó chính là "cuộn ẩn search nhưng
      vẫn mắc lại ở header".
    */
    <>
      <YStack f={1} ov="hidden">
        {children({ onScroll, headerHeight: headHeight, contentContainerStyle, bindList })}

        <Animated.View style={[styles.head, headStyle]} onLayout={measureHead}>
          {variant === 'page' ? (
            <YStack pt={PAGE_HEAD_PAD_TOP} pb={PAGE_HEAD_PAD_BOTTOM} gap={PAGE_HEAD_GAP}>
              {subtitle ? (
                <Text
                  px={gutter}
                  col={colors.placeholder}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                >
                  {subtitle}
                </Text>
              ) : null}
              {searchBelowSummary ? summary : null}
              {/* Figma "Tab List" `24175:57178`: ô tìm co giãn · nút "Lọc", cách 12. */}
              <ListSearchBar
                value={searchValue}
                onChange={onSearchChange}
                label={searchLabel}
                placeholder={searchPlaceholder}
                filterCount={count}
                {...(groups.length > 0 ? { onFilterPress: openFilters } : {})}
                gutter={gutter}
              />
              {searchBelowSummary ? null : summary}
              {tabs}
            </YStack>
          ) : (
            <>
              {/*
                Web `ManagePageHeader` khổ ≤640: tiêu đề h2 đậm vừa tự xuống dòng, mô tả 12 cách 4;
                `action` cũ (màn chưa chuyển) vẫn đứng cạnh tiêu đề.
              */}
              <XStack ai="center" gap={space.sm} px={gutter} pt={space.md}>
                <YStack f={1} gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.pageTitle} fow={fontWeight.semibold}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {subtitle}
                    </Text>
                  ) : null}
                  {total ? (
                    <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                      {total}
                    </Text>
                  ) : null}
                </YStack>
                {action ? (
                  <XStack ai="center" gap={space.xs} flexShrink={0}>
                    {action}
                  </XStack>
                ) : null}
              </XStack>

              {actions && actions.length > 0 ? (
                <XStack px={gutter} pt={space.sm} gap={HEADER_ACTIONS_GAP}>
                  {actions.map((node, index) => (
                    <YStack key={index} f={1} flexBasis={0} minWidth={0}>
                      {node}
                    </YStack>
                  ))}
                </XStack>
              ) : null}

              {/*
                Web `FilterBar` khổ ≤640 (`.mobileTop`): ô tìm kiếm LUÔN hiện, nút "Lọc" bên phải mở
                tấm chứa các ô lọc còn lại; số bộ lọc đang bật là huy hiệu ở góc nút.
              */}
              <XStack ai="center" gap={space.sm} px={gutter} pt={space.md} pb={space.sm}>
                <YStack f={1} minWidth={0}>
                  <SearchInput
                    value={searchValue}
                    onChange={onSearchChange}
                    label={searchLabel}
                    placeholder={searchPlaceholder}
                    variant="boxed"
                  />
                </YStack>
                {groups.length > 0 ? <ListFilterButton count={count} onPress={openFilters} /> : null}
              </XStack>

              {summary}

              {/* Dải tab là hàng CUỐI của khối đầu trang từ khi ô tìm kiếm dời vào tấm lọc. */}
              <YStack pb={space.sm}>{tabs}</YStack>
            </>
          )}
        </Animated.View>
      </YStack>

      {/* NGOÀI vùng cuộn và KHÔNG ẩn theo cuộn — xem ghi chú ở `Pagination` và ở đầu file. */}
      {loadingMore ? (
        <YStack pos="absolute" left={0} right={0} bottom={tabBarInset + space.sm} ai="center" pointerEvents="none">
          {/* Viên trắng bo tròn sau ba chấm để chấm đọc rõ trên nền thẻ. */}
          <YStack bg={colors.surface} br={radius.pill} bw={1} bc={colors.border} px={space.lg}>
            <DotsLoader />
          </YStack>
        </YStack>
      ) : null}
      <BackToTopButton visible={pastTop} onPress={backToTop} bottom={tabBarInset + space.md} />

      <ManageFilterSheet
        open={filtering}
        groups={groups}
        onChange={onFilterChange}
        onClose={closeFilters}
        layout={filterLayout}
        // KHÔNG đưa ô tìm vào tấm: màn đã có ô tìm ngay trên danh sách, và huy hiệu số của nút "Lọc"
        // chỉ đếm các ô lọc - tìm trong tấm thì nút không báo gì (người dùng 20/11/2026).
      />
    </>
  );
}

/**
 * Nút "Bộ lọc" của các danh sách — phễu + chữ + số bộ lọc đang bật, bo tròn hết cỡ, tô vàng khi đang
 * lọc. Dùng chung cho mọi danh sách (Partner và khách) để nút lọc ở đâu cũng một kiểu.
 */
export function ManageFilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Common.filters');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${t('title')}, ${t('activeCount', { count })}` : t('open')}
      style={({ pressed }) => [
        styles.filterButton,
        {
          backgroundColor: count > 0 ? colors.primaryLight : colors.surface,
          borderColor: count > 0 ? colors.primary : colors.borderInput,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons
        name="funnel-outline"
        size={iconSize.sm}
        color={count > 0 ? colors.primaryActive : colors.textMuted}
      />
      <Text col={count > 0 ? colors.primaryActive : colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {t('title')}
      </Text>
      {count > 0 ? <CountBadge count={count} /> : null}
    </Pressable>
  );
}

/** Khuôn `page` (Figma "Rental Request - MB"): đệm trên 16, các hàng cách 12, ô tìm cách nút lọc 12. */
const PAGE_HEAD_PAD_TOP = 16;
const PAGE_HEAD_PAD_BOTTOM = 12;
const PAGE_HEAD_GAP = 12;

/** Web `.headerActions { gap: var(--xp-space-12) }`. */
const HEADER_ACTIONS_GAP = 12;

/**
 * Nút "Lọc" của khung danh sách - web `FilterBar` khổ ≤640: `Button size="large"` viền
 * `border-input`, bo 10, icon `FilterOutlined` + chữ "Lọc"; số bộ lọc đang bật là `Badge` đỏ ở GÓC.
 */
function ListFilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const colors = useColors();
  const t = useTranslations('Common.filters');
  const tActions = useTranslations('Common.actions');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${t('title')}, ${t('activeCount', { count })}` : t('open')}
      hitSlop={4}
    >
      {({ pressed }) => (
        <XStack
          ai="center"
          gap={space.sm}
          minHeight={sizing.touchTarget}
          px={FILTER_BUTTON_PAD_X}
          bg={colors.surface}
          bw={1}
          bc={colors.borderInput}
          br={radius.md}
          opacity={pressed ? 0.7 : 1}
        >
          <AntIcon icon={FilterOutlined} color={colors.text} size={iconSize.sm} />
          <Text col={colors.text} fos={fontSize.body}>
            {tActions('filter')}
          </Text>
          {count > 0 ? (
            <YStack pos="absolute" top={-FILTER_BADGE_OFFSET} right={-FILTER_BADGE_OFFSET}>
              <CountBadge count={count} tone="danger" size="sm" />
            </YStack>
          ) : null}
        </XStack>
      )}
    </Pressable>
  );
}

/** AntD `Button size="large"`: đệm ngang 15 (16 trừ viền 1); `Badge size="small"` lệch ra góc ~6. */
const FILTER_BUTTON_PAD_X = 15;
const FILTER_BADGE_OFFSET = 6;
