import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Pagination } from '@/components/ui/Pagination';
import { useCollapseOnScroll, type CollapseOnScroll } from '@/hooks/use-collapse-on-scroll';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { activeFilterCount, ManageFilterSheet, type FilterGroup } from './ManageFilterSheet';

const styles = StyleSheet.create({
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
  /** Cùng chiều cao và cùng bán kính với ô tìm kiếm bên cạnh — cả hàng là MỘT cụm điều khiển. */
  filterButton: {
    /*
      KHÔNG co lại. Nút đứng cùng hàng với tiêu đề, mà tiêu đề là `f={1}` — thiếu dòng này thì
      trên màn hẹp, tiêu đề dài sẽ bóp nút xuống còn cái phễu với nửa chữ.
    */
    flexShrink: 0,
    height: sizing.touchTarget,
    borderRadius: radius.md,
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
  filterCountText: {
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});

/** Đường kính huy hiệu đếm. 20 chứ không phải 18: 18 vừa khít một chữ số nên trông như bị bó. */
const COUNT_SIZE = 20;

/** Con số bộ lọc đang bật, gắn trên nút "Bộ lọc". Gold đặc + chữ tối, trùng tông huy hiệu menu. */
function FilterCount({ count }: { count: number }) {
  return (
    <YStack
      minWidth={COUNT_SIZE}
      h={COUNT_SIZE}
      px={space.xs}
      br={radius.pill}
      bg={colors.primary}
      ai="center"
      jc="center"
    >
      <Text
        col={colors.onPrimary}
        fos={fontSize.label}
        fow={fontWeight.bold}
        style={styles.filterCountText}
      >
        {count}
      </Text>
    </YStack>
  );
}

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
  total,
  action,
  summary,
  tabs,
  searchValue,
  searchLabel,
  searchPlaceholder,
  onSearchChange,
  groups,
  onFilterChange,
  meta,
  onPageChange,
  children,
}: {
  title: string;
  total?: string;
  action?: ReactNode;
  /**
   * Dải CHỈ SỐ tóm tắt, nằm giữa tiêu đề và dải tab.
   *
   * Tách khỏi `tabs` vì nó trả lời một câu khác: tab hỏi "đang xem cái nào", chỉ số hỏi "còn bao
   * nhiêu việc". Web dựng đúng thứ tự này (`ManagePageHeader extra` rồi mới tới `Tabs`).
   */
  summary?: ReactNode;
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
  meta?: { page: number; limit: number; total: number } | undefined;
  onPageChange: (page: number) => void;
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
  }) => ReactNode;
}) {
  const t = useTranslations('Common.filters');
  const [filtering, setFiltering] = useState(false);

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
  } = useCollapseOnScroll();

  /*
   * Từ khoá tìm kiếm cũng là MỘT bộ lọc.
   *
   * Từ khi ô tìm kiếm nằm trong tấm trượt, nó không còn hiện trên màn nữa — nên nếu nút lọc
   * không đếm nó, người dùng gõ một từ khoá rồi thấy danh sách ngắn lại mà không còn dấu vết
   * nào trên màn giải thích vì sao.
   */
  const count = activeFilterCount(groups) + (searchValue.trim() ? 1 : 0);

  /**
   * Danh sách CÓ gì để cuộn hay không.
   *
   * `meta` vắng nghĩa là đang tải hoặc vừa lỗi; `total === 0` nghĩa là không có bản ghi nào.
   * Cả ba trạng thái đó đều không đủ dài để cuộn.
   */
  const scrollable = meta !== undefined && meta.total > 0;

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
    const shown = scrollable ? progress.value : 1;

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
  }, [scrollable]);

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
        {children({ onScroll, headerHeight: headHeight })}

        <Animated.View style={[styles.head, headStyle]} onLayout={measureHead}>
          <XStack ai="center" gap={space.sm} px={layout.screenX} pt={space.md} pb={space.xs}>
            <YStack f={1} gap={1}>
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} numberOfLines={1}>
                {title}
              </Text>
              {total ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {total}
                </Text>
              ) : null}
            </YStack>
            {action}

            {/*
              Nút lọc nằm ĐỐI DIỆN tiêu đề chứ không phải một hàng riêng: hàng tiêu đề vốn bỏ
              trống cột phải ở hầu hết các màn, nên đưa nút về đó tiết kiệm trọn một hàng mà
              không mất gì — khối đầu trang càng cao thì càng lâu mới thấy bản ghi đầu tiên.

              Nút có NHÃN CHỮ, không chỉ biểu tượng — web ghi rõ "Bộ lọc" kèm phễu, và một từ ở
              đây bỏ hẳn được phần đoán. Con số bộ lọc đang bật nằm trên chính nút: thiếu nó thì
              người dùng phải mở tấm trượt mới biết vì sao danh sách ngắn bất thường.
            */}
            <Pressable
              onPress={() => setFiltering(true)}
              accessibilityRole="button"
              accessibilityLabel={
                count > 0 ? `${t('title')}, ${t('activeCount', { count })}` : t('open')
              }
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
              <Text
                col={count > 0 ? colors.primaryActive : colors.text}
                fos={fontSize.bodySm}
                fow={fontWeight.medium}
              >
                {t('title')}
              </Text>
              {count > 0 ? <FilterCount count={count} /> : null}
            </Pressable>
          </XStack>

          {summary}

          {/* Dải tab là hàng CUỐI của khối đầu trang từ khi ô tìm kiếm dời vào tấm lọc. */}
          <YStack pb={space.sm}>{tabs}</YStack>

        </Animated.View>
      </YStack>

      {/* NGOÀI vùng cuộn và KHÔNG ẩn theo cuộn — xem ghi chú ở `Pagination` và ở đầu file. */}
      {meta ? (
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          onChange={onPageChange}
        />
      ) : null}

      <ManageFilterSheet
        open={filtering}
        groups={groups}
        onChange={onFilterChange}
        searchValue={searchValue}
        searchLabel={searchLabel}
        searchPlaceholder={searchPlaceholder}
        onSearchChange={onSearchChange}
        onClose={() => setFiltering(false)}
      />
    </>
  );
}
