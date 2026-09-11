import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { OCCUPANCY_SOURCE_TYPE_META, type OccupancySourceType } from '@xeprime/types';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CalendarEvent, CalendarResource, Holiday } from '../api';
import { CAL_SURFACE, eventTone, isDashedEvent } from '../calendar-tone';
import { EVENT_ICON, eventBarShowsLabel, eventStatusGroup } from '../event-tone';
import { priceMarkerKey, type PriceMarker } from '../hooks/use-calendar-data';
import type { CalendarRange, DayCell } from '../utils/calendar-date.util';
import { layoutEventBars } from '../utils/calendar-position.util';

/**
 * Kích thước lưới — JS cần biết để ảo hoá + định vị thanh event.
 *
 * `ROW_H` chứa đúng HAI tầng event (`4 + lane*22 + 20`): trên lịch thật, ba đơn chồng nhau trong
 * cùng một ngày của cùng một xe gần như không xảy ra, và cho hàng cao hơn nữa thì màn 360dp chỉ
 * còn thấy bốn chiếc xe cùng lúc.
 */
const HEADER_H = 52;
const ROW_H = 56;
const SUMMARY_H = 34;

/**
 * Bề ngang cột xe — đủ cho BIỂN SỐ đọc trọn.
 *
 * Biển Việt Nam dài nhất (`43A-123.45`) ở cỡ chữ `meta` chiếm ~62dp; cộng ảnh 24 + lề 8 + khe 4
 * là 98, nên 112 còn dư cho biển hiếm và cho cỡ chữ hệ thống lớn hơn. Tên xe VẪN được phép cắt —
 * nó dài tuỳ ý và đã có đủ trong thẻ thông tin; biển số thì là ĐỊNH DANH, cắt đi là hỏng.
 *
 * Nới thêm 12dp KHÔNG lấy mất bề ngang của cột ngày: cột ngày đã chạm sàn `MIN_DAY_W` từ trước,
 * nên phần nới chỉ đổi số cột NHÌN THẤY (5,4 thay vì 5,8) — cuộn ngang bù lại.
 */
const RESOURCE_W = 112;
/** Cột xe THU GỌN: chỉ còn ảnh — nhường tối đa bề ngang cho lưới ngày. */
const RESOURCE_W_COLLAPSED = 44;
/** Sàn bề rộng một cột ngày: (360−44)/7 ≈ 45, nên 46 giữ 7 ngày vừa khít máy hẹp nhất. */
const MIN_DAY_W = 46;

/**
 * Hình học của lưới, XUẤT RA cho khung chờ dùng lại.
 *
 * Khung chờ phải có đúng hình của lưới thật, nếu không lúc dữ liệu về mọi thứ nhảy một cái —
 * và cái nhảy đó còn khó chịu hơn là không có khung chờ. "Đúng hình" chỉ giữ được nếu hai bên
 * đọc CÙNG một bộ số: bản trước khung chờ giữ bản sao riêng (cột xe 100dp, không có hàng tổng),
 * và nó lặng lẽ trôi khỏi lưới ngay lần đầu cột xe được nới lên 112.
 */
export const GRID_METRICS = {
  headerHeight: HEADER_H,
  rowHeight: ROW_H,
  summaryHeight: SUMMARY_H,
  resourceWidth: RESOURCE_W,
  minDayWidth: MIN_DAY_W,
} as const;

/**
 * Cửa sổ ảo hoá của lưới.
 *
 * Bản trước siết `maxToRenderPerBatch` xuống 4 và giãn nhịp lô lên 60ms để "đỡ nặng" — và mua
 * đúng cái lỗi người dùng báo: vuốt nhanh thì hàng chưa kịp dựng, để lại từng mảng TRẮNG ở giữa
 * và ở cuối lưới. Với danh sách ảo hoá thì vùng trắng luôn có một nghĩa duy nhất — dựng không
 * kịp — và cách chữa luôn là NỚI, không phải siết.
 *
 * `windowSize` là con dao HAI LƯỠI ở màn này, và bản trước đã cầm sai đầu.
 *
 * Nó không chỉ quyết định "còn bao nhiêu hàng sẵn khi fling" — nó còn là SỐ HÀNG PHẢI DỰNG LẠI
 * mỗi khi `renderItem` đổi danh tính. Mà ở lưới lịch, đổi khoảng ngày làm đúng điều đó: `days`
 * và `dayWidth` đi vào `renderTrack`, nên bấm một cú "tiến 14 ngày" là dựng lại trọn cửa sổ.
 * Ở `9` (~4 màn mỗi phía ≈ 99 hàng × 14 ô) thì cú bấm đó khoá luồng JS vài giây, và người dùng
 * thấy đúng một thứ: ngày trên thanh công cụ không đổi.
 *
 * `5` (~2 màn mỗi phía) là chỗ cân bằng: vẫn đủ đệm cho fling — vùng trắng lần trước đến từ lô
 * dựng bị siết còn 4 mỗi 60ms, chứ không từ cửa sổ hẹp — mà cắt hơn nửa chi phí đổi khoảng.
 *
 * Dùng CHUNG cho cả hai danh sách, không phải để cho gọn: đồng bộ chạy theo OFFSET, nên hai bên
 * phải dựng cùng một dải hàng thì lúc fling mới không có bên nào còn trống trong khi bên kia đã
 * vẽ xong.
 *
 * `removeClippedSubviews` để TẮT: cột xe bị cuộn bằng lệnh chứ không bằng ngón tay, và cờ kia
 * hay tháo nhầm view còn đang nhìn thấy ở đúng tình huống đó trên Android.
 */
const LIST_WINDOW = {
  initialNumToRender: 12,
  windowSize: 5,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 30,
  removeClippedSubviews: false,
} as const;

/**
 * Nét kẻ của lưới — bậc ĐẬM (`color-border-strong`), không phải `color-border` như web.
 *
 * Đây là một chỗ cố ý lệch khỏi web, và lý do nằm ở chính việc bỏ nền vằn: khi hàng chẵn lẻ còn
 * so le màu thì nét kẻ chỉ là phụ trợ, mắt bám hàng bằng dải nền. Bỏ nền đi thì nét kẻ trở thành
 * thứ DUY NHẤT chia ô — và `color-border` (#e8e4dd) trên nền trắng chỉ chênh vài phần trăm độ
 * sáng, đủ thấy trên màn hình PC ở 1x nhưng tan biến trên điện thoại.
 *
 * `CAL_SURFACE.line` vẫn giữ nguyên giá trị web dùng — nó là bản dịch của `--xp-cal-line` và
 * không được phép trôi theo một quyết định trình bày của riêng app.
 *
 * ## Nét nằm trên chính Ô, KHÔNG nằm trên hàng
 *
 * Hàng vẽ nền và viền của nó trước, rồi mới vẽ các ô con lên trên. Ô ngày có nền riêng (hôm nay,
 * cuối tuần, ngày lễ) nên nền đó PHỦ MẤT nét ngăn hàng — kết quả là cột hôm nay và hai cột cuối
 * tuần chạy liền một dải dọc, không còn ranh giới hàng nào, đúng như người dùng báo.
 *
 * Để chính ô vẽ nét thì nét luôn nằm TRÊN nền của nó, không phụ thuộc thứ tự vẽ hay cách Yoga
 * quy đổi `height: '100%'` ra chiều cao thật. Vì vậy hàng/header/hàng tổng đều KHÔNG còn
 * `borderBottomWidth`; từng ô mang nét của chính nó.
 */
const GRID_LINE = colors.borderInput;

/**
 * Lá cờ ngày lễ — 9dp, GHIM ở góc trên phải ô, đúng `.holidayFlag` của web.
 *
 * Nó nằm ngoài dòng chảy, không phải là con thứ ba của ô. Xếp nó vào dòng chảy (bản trước) thì ô
 * header cao lên ba dòng: thứ · ngày · cờ — mà ba dòng đó nhân với chiều cao header cố định là
 * chữ bị bóp lại, và cột ngày lễ trông khác hẳn cột thường ở đúng thứ không nên khác.
 *
 * Nhỏ 9dp có chủ đích: đây là DẤU HIỆU, không phải nội dung. Nó tồn tại vì nền cột ngày lễ cố ý
 * pha rất nhạt (8%) — cờ mới là thứ nhìn thấy được, kể cả với người không phân biệt sắc đỏ.
 */
const HOLIDAY_FLAG_SIZE = 9;

const EVENT_H = 20;
const EVENT_TOP = 4;

/** Hàng không có event: CÙNG một mảng, nếu không `memo(EventTrack)` hỏng ở mọi hàng trống. */
const NO_EVENTS: readonly CalendarEvent[] = [];
const EVENT_LANE_STEP = 22;

export interface TimelineHandlers {
  /** Chạm ô TRỐNG — mở bộ chọn hành động. `null` khi người dùng không có quyền thao tác nào. */
  onCellPress: ((resource: CalendarResource, day: DayCell) => void) | null;
  onEventPress: (event: CalendarEvent, resource: CalendarResource) => void;
  onResourcePress: (resource: CalendarResource) => void;
  /** Chạm thẻ ngày — mở bảng thao tác cả-đội-xe. `null` khi không có quyền nào. */
  onDayPress: ((day: DayCell) => void) | null;
}

interface TimelineProps extends TimelineHandlers {
  resources: readonly CalendarResource[];
  eventsByResource: ReadonlyMap<string, CalendarEvent[]>;
  priceMarkers: ReadonlyMap<string, PriceMarker>;
  availableByDay: ReadonlyMap<string, number>;
  holidaysByDay: ReadonlyMap<string, Holiday>;
  days: readonly DayCell[];
  range: CalendarRange;
  /** Bề ngang/chiều cao thật của vùng lưới — đo ở màn, truyền xuống để mọi phép tính dùng chung. */
  viewport: { width: number; height: number };
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Lưới lịch dạng resource timeline — bản native của `CalendarScheduler` bên web.
 *
 * ## Cột xe ghim ra sao khi React Native không có `position: sticky`
 *
 * Cột xe nằm HOÀN TOÀN NGOÀI vùng cuộn ngang — nó là một cột anh em của `ScrollView` chứ không
 * phải một thứ bên trong được dịch ngược lại. Nhờ vậy khi vuốt trái phải nó không dịch một pixel
 * nào và cũng không có phép biến đổi nào để trễ: nó ĐỨNG YÊN theo đúng nghĩa `position: sticky`
 * của web, chứ không phải "được kéo về chỗ cũ mỗi khung hình".
 *
 * Đổi lại, hai cột là hai `FlatList` và trục DỌC phải đồng bộ bằng tay. React Native chỉ cho một
 * bộ cuộn native mỗi trục, nên một trong hai trục bắt buộc phải làm thủ công; đặt việc đó lên
 * trục dọc là chọn chỗ ít lộ nhất, vì trên trục đó hai cột vốn đã đi cùng nhau. Chi tiết ba cách
 * đã thử và vì sao hai cách kia sai: xem docblock của `syncColumn`.
 *
 * Danh sách cột xe `scrollEnabled={false}`: nó không bao giờ tự cuộn, chỉ đi theo. Nhờ vậy không
 * có vòng lặp "A cuộn → B cuộn → A cuộn"; đồng bộ chạy đúng MỘT chiều.
 *
 * Hàng CAO CỐ ĐỊNH + `getItemLayout`, nên đội 1.000 xe chỉ dựng khoảng mười hàng đang nhìn
 * thấy — không bao giờ dựng ma trận xe × ngày.
 *
 * ## Vì sao KHÔNG có kéo-thả
 *
 * Web đã bỏ kéo-thả CÓ CHỦ ĐÍCH (`CalendarScheduler` docblock): đổi giờ đi qua form sửa
 * đơn/khoá/bảo dưỡng, nơi có xác nhận và backend quyết định (ADR 0006). App bám đúng quyết định
 * đó — thêm kéo-thả ở đây là mở một đường ghi lịch mà web không có, và trên cảm ứng thì một cú
 * cuộn ngang rất dễ thành một cú kéo nhầm.
 */
export function CalendarTimeline({
  resources,
  eventsByResource,
  priceMarkers,
  availableByDay,
  holidaysByDay,
  days,
  range,
  viewport,
  collapsed,
  onToggleCollapsed,
  onCellPress,
  onEventPress,
  onResourcePress,
  onDayPress,
}: TimelineProps) {
  const t = useTranslations('Calendar');

  const resourceW = collapsed ? RESOURCE_W_COLLAPSED : RESOURCE_W;
  const trackViewportW = Math.max(0, viewport.width - resourceW);
  const dayWidth = Math.max(
    MIN_DAY_W,
    trackViewportW > 0 ? Math.floor(trackViewportW / days.length) : MIN_DAY_W,
  );
  const trackWidth = days.length * dayWidth;
  const listHeight = Math.max(0, viewport.height - HEADER_H - SUMMARY_H);

  /**
   * Vị trí cuộn DỌC của dải ngày — nguồn chuyển động của cột xe, sống trên luồng UI.
   *
   * Đây là chỗ đã hỏng ba lần theo ba kiểu khác nhau, nên ghi lại cả ba:
   *
   * 1. Cột xe là `FlatList` bị cuộn bằng `scrollTo` của worklet. Ảo hoá của `FlatList` sống ở
   *    luồng JS: danh sách bị cuộn từ worklet KHÔNG biết mình đã dịch chuyển, giữ nguyên dải
   *    hàng dựng lúc đầu, và vuốt nhanh một cái là cột xe TRẮNG TRƠN.
   * 2. Cột xe nằm TRONG vùng cuộn ngang, dịch ngược lại theo `scrollX`. Giữ được ảo hoá nhưng
   *    RUNG khi vuốt ngang: nội dung `ScrollView` do bộ cuộn native dời ngay trong lúc vẽ, còn
   *    transform chỉ được áp sau khi sự kiện cuộn bắn ra — luôn trễ một khung hình, và mắt đọc
   *    ra ngay vì cột xe là thứ đáng lẽ đứng im tuyệt đối.
   * 3. Cột xe là `FlatList` bị cuộn bằng `scrollToOffset` từ `onScroll` của JS. Đúng về ảo hoá,
   *    nhưng cả chuyển động lẫn việc dựng đều xếp hàng sau luồng JS — mà luồng JS lúc fling thì
   *    đang bận dựng hàng mới. Kết quả là cột xe ĐUỔI THEO sau vài trăm mili giây.
   *
   * Lối ra là TÁCH hai thứ mà cả ba cách trên đều buộc vào nhau: chuyển động và cửa sổ dựng.
   * Chuyển động là một phép dịch trên luồng UI, không lệ thuộc JS. Cửa sổ dựng thì vẫn ở JS,
   * nhưng chỉ được đánh thức mỗi khi vượt qua MỘT hàng (56dp) chứ không phải mỗi khung hình —
   * xem {@link ResourceColumn}. Trễ ở JS lúc đó chỉ ăn vào phần đệm, không ăn vào vị trí.
   *
   * `useScrollViewOffset` chứ KHÔNG phải `useAnimatedScrollHandler`, và khác biệt này quan
   * trọng: `onScroll` là một prop mà `VirtualizedList` dùng cho việc ghi sổ của chính nó, nên
   * chiếm chỗ đó bằng một bộ nhận worklet là đặt cược vào việc hai bên chịu nhường nhau. Hook
   * này gắn thẳng vào node cuộn qua `ref` và không đụng tới prop nào — ảo hoá của dải ngày chạy
   * y như khi không có Reanimated trong file.
   */
  const trackRef = useAnimatedRef<Animated.FlatList<CalendarResource>>();
  const scrollY = useScrollViewOffset(trackRef);

  const getItemLayout = useCallback(
    (_data: ArrayLike<CalendarResource> | null | undefined, index: number) => ({
      length: ROW_H,
      offset: ROW_H * index,
      index,
    }),
    [],
  );

  const keyOf = useCallback((resource: CalendarResource) => resource.id, []);

  const renderTrack = useCallback(
    ({ item }: { item: CalendarResource }) => (
      <EventTrack
        resource={item}
        events={eventsByResource.get(item.id) ?? NO_EVENTS}
        days={days}
        range={range}
        dayWidth={dayWidth}
        priceMarkers={priceMarkers}
        holidaysByDay={holidaysByDay}
        onCellPress={onCellPress}
        onEventPress={onEventPress}
      />
    ),
    [
      dayWidth,
      days,
      eventsByResource,
      holidaysByDay,
      onCellPress,
      onEventPress,
      priceMarkers,
      range,
    ],
  );

  return (
    <XStack f={1} bg={colors.surface}>
      {/* ── Cột xe: GHIM, nằm NGOÀI vùng cuộn ngang ─────────────────────── */}
      <YStack w={resourceW} borderRightWidth={1} borderColor={GRID_LINE}>
        <Pressable
          onPress={onToggleCollapsed}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={t(collapsed ? 'grid.expandColumn' : 'grid.collapseColumn')}
        >
          <XStack
            h={HEADER_H}
            ai="center"
            jc={collapsed ? 'center' : 'space-between'}
            px={space.xs}
            bg={colors.surfaceElevated}
            borderBottomWidth={1}
            borderColor={GRID_LINE}
          >
            {collapsed ? null : (
              <Text
                f={1}
                col={colors.textMuted}
                fos={fontSize.meta}
                fow={fontWeight.semibold}
                numberOfLines={2}
              >
                {t('grid.resourceHeader', { count: resources.length })}
              </Text>
            )}
            <Ionicons
              name={collapsed ? 'chevron-forward' : 'chevron-back'}
              size={iconSize.sm}
              color={colors.textMuted}
            />
          </XStack>
        </Pressable>

        <ResourceColumn
          resources={resources}
          collapsed={collapsed}
          listHeight={listHeight}
          scrollY={scrollY}
          onPress={onResourcePress}
        />

        <XStack
          h={SUMMARY_H}
          ai="center"
          px={space.xs}
          bg={colors.surfaceElevated}
          borderTopWidth={1}
          borderColor={GRID_LINE}
        >
          <Text
            col={colors.textMuted}
            fos={fontSize.meta}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {t(collapsed ? 'grid.availableRowShort' : 'grid.availableRow')}
          </Text>
        </XStack>
      </YStack>

      {/* ── Dải ngày: cuộn NGANG theo thời gian, cuộn DỌC theo xe ────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ width: trackViewportW }}
        contentContainerStyle={{ width: trackWidth }}
      >
        <YStack w={trackWidth}>
          <XStack h={HEADER_H} bg={colors.surfaceElevated}>
            {days.map((day) => (
              <DayHeaderCell
                key={day.key}
                day={day}
                holiday={holidaysByDay.get(day.key)}
                width={dayWidth}
                onPress={onDayPress}
              />
            ))}
          </XStack>

          <Animated.FlatList
            ref={trackRef}
            style={{ height: listHeight }}
            data={resources as CalendarResource[]}
            keyExtractor={keyOf}
            renderItem={renderTrack}
            getItemLayout={getItemLayout}
            {...LIST_WINDOW}
            showsVerticalScrollIndicator={false}
          />

          {/* Nét ngăn do từng Ô vẽ, không do hàng — xem docblock `GRID_LINE`. */}
          <XStack h={SUMMARY_H} bg={colors.surfaceElevated}>
            {days.map((day) => {
              const count = availableByDay.get(day.key);
              return (
                <YStack
                  key={day.key}
                  w={dayWidth}
                  ai="center"
                  jc="center"
                  /* Hôm nay THẮNG ngày lễ — nó là mốc điều hướng, ngày lễ chỉ là ngữ cảnh
                     (web xếp cùng thứ tự ưu tiên ở CSS). */
                  bg={
                    day.isToday
                      ? CAL_SURFACE.todayBg
                      : holidaysByDay.has(day.key)
                        ? CAL_SURFACE.holidayBg
                        : 'transparent'
                  }
                  borderRightWidth={1}
                  borderTopWidth={1}
                  borderColor={GRID_LINE}
                  accessibilityLabel={
                    count === undefined
                      ? t('grid.availableCellPending', { day: day.dayOfMonth })
                      : t('grid.availableCell', { day: day.dayOfMonth, count })
                  }
                >
                  {/*
                    Xanh LÁ, không phải màu chữ thường — web đặt `color: var(--xp-color-success)`
                    thẳng trên `.summaryCell`. Con số này trả lời "còn nhận đơn được không", nên
                    nó là một tín hiệu trạng thái chứ không phải một ô dữ liệu; hết xe thì đổi
                    sang đỏ (`.summaryNone`) và VẪN in số 0 — màu không bao giờ là tín hiệu duy
                    nhất.
                  */}
                  <Text
                    col={count === 0 ? colors.danger : colors.success}
                    fos={fontSize.meta}
                    fow={fontWeight.semibold}
                  >
                    {count ?? '—'}
                  </Text>
                </YStack>
              );
            })}
          </XStack>
        </YStack>
      </ScrollView>
    </XStack>
  );
}

/**
 * Băng hàng GIỮ SỐNG của cột xe, đo bằng số MÀN mỗi phía — rộng hơn hẳn cửa sổ của dải ngày.
 *
 * Hai cột có chi phí ngược nhau, nên chúng không được dùng chung một con số:
 *
 * - Một hàng dải ngày là 14 ô cộng thanh event: ĐẮT khi giữ, RẺ khi dựng lại (chỉ là mấy khối
 *   màu). Nên nó giữ hẹp (`windowSize: 5`).
 * - Một ô cột xe là một tấm ảnh MẠNG: rẻ khi giữ, nhưng dựng lại thì `RemoteImage` quay về
 *   `phase: 'pending'` và diễn lại trọn khung chờ + fade — kể cả khi ảnh đã nằm sẵn trong cache.
 *   Người dùng thấy đúng điều đó: cuộn xuống rồi kéo lên, những chiếc xe VỪA XEM lại trắng ra
 *   một lượt nữa.
 *
 * Ba màn mỗi phía là chỗ dừng: với đội xe cỡ thường (vài chục chiếc) thì băng này phủ trọn danh
 * sách và không ô nào phải mount lại lần thứ hai; với đội 1.000 xe nó vẫn chỉ giữ khoảng tám
 * chục ảnh 24dp.
 */
const RESOURCE_OVERSCAN_SCREENS = 3;

/**
 * Cột xe — dựng bằng tay, không phải `FlatList`.
 *
 * ## Vì sao không dùng `FlatList`
 *
 * `FlatList` buộc chuyển động vào cửa sổ dựng: muốn nó hiện đúng dải hàng thì phải CUỘN nó, mà
 * cuộn nó thì hoặc đi qua luồng JS (trễ vài trăm ms lúc fling) hoặc đi qua worklet (nó không
 * biết mình đã dịch và để lại một cột trắng). Xem docblock của `scrollY` về cả ba lần hỏng.
 *
 * Ở đây hai thứ đó tách hẳn nhau:
 *
 * - **Chuyển động** là một phép dịch trên luồng UI, đọc thẳng từ `scrollY`. Không có JS trong
 *   đường đi, nên cột bám dải ngày kể cả khi luồng JS đang dựng hàng.
 * - **Cửa sổ dựng** là state React thường, nhưng `useAnimatedReaction` chỉ đánh thức nó khi chỉ
 *   số hàng đầu ĐỔI — tức mỗi 56dp cuộn, không phải mỗi khung hình. Một cú fling dài sinh ra
 *   vài chục lần `setState`, đúng bằng thứ `FlatList` tự làm bên trong.
 *
 * Miếng đệm `height: start * ROW_H` đặt dải hàng đang dựng vào đúng toạ độ tuyệt đối của nó
 * trong danh sách, nên phép dịch `-scrollY` khớp một-đối-một với dải ngày.
 */
const ResourceColumn = memo(function ResourceColumn({
  resources,
  collapsed,
  listHeight,
  scrollY,
  onPress,
}: {
  resources: readonly CalendarResource[];
  collapsed: boolean;
  listHeight: number;
  scrollY: SharedValue<number>;
  onPress: (resource: CalendarResource) => void;
}) {
  const [firstRow, setFirstRow] = useState(0);

  const rowsPerScreen = Math.max(1, Math.ceil(listHeight / ROW_H));
  const overscan = rowsPerScreen * RESOURCE_OVERSCAN_SCREENS;

  useAnimatedReaction(
    () => Math.max(0, Math.floor(scrollY.value / ROW_H) - overscan),
    (start, previous) => {
      'worklet';
      if (start !== previous) runOnJS(setFirstRow)(start);
    },
  );

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }));

  /*
   * Kẹp lại theo danh sách HIỆN TẠI: đổi bộ lọc làm danh sách ngắn đi mà vị trí cuộn thì chưa
   * kịp về 0, và một `start` quá cuối mảng sẽ dựng ra cột rỗng.
   */
  const start = Math.min(firstRow, Math.max(0, resources.length - 1));
  const visible = resources.slice(start, start + rowsPerScreen + overscan * 2);

  return (
    <View style={{ height: listHeight, overflow: 'hidden' }}>
      <Animated.View style={style}>
        <View style={{ height: start * ROW_H }} />
        {visible.map((resource) => (
          <ResourceCell
            key={resource.id}
            resource={resource}
            collapsed={collapsed}
            onPress={onPress}
          />
        ))}
      </Animated.View>
    </View>
  );
});

/**
 * Một cột ngày ở header — và là ĐƯỜNG VÀO các thao tác cả-đội-xe cho ngày đó.
 *
 * Ngày lễ được đánh dấu bằng HAI thứ, không chỉ màu nền: một lá cờ nhìn thấy được và một
 * `accessibilityLabel` nói thẳng tên ngày lễ — nền cột cố ý rất nhạt nên màu một mình không đủ.
 *
 * Mọi ngày đều chạm được, không riêng ngày lễ: khoá xe và đặt giá là việc của mọi ngày trong năm.
 */
const DayHeaderCell = memo(function DayHeaderCell({
  day,
  holiday,
  width,
  onPress,
}: {
  day: DayCell;
  holiday: Holiday | undefined;
  width: number;
  onPress: ((day: DayCell) => void) | null;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  /*
   * Thứ tự ưu tiên: cuối tuần < ngày lễ < hôm nay — đúng thứ tự web khai ở CSS. Hôm nay là mốc
   * điều hướng nên nó thắng; ngày lễ chỉ là ngữ cảnh. Ô thường để TRONG SUỐT cho nền hàng header
   * hiện lên, y như `.dayHeaderCell` bên web.
   */
  const background = day.isToday
    ? CAL_SURFACE.todayBg
    : holiday
      ? CAL_SURFACE.holidayBg
      : day.isWeekend
        ? CAL_SURFACE.weekendBg
        : 'transparent';

  const body = (
    <YStack
      w={width}
      h={HEADER_H}
      ai="center"
      jc="center"
      gap={1}
      bg={background}
      borderRightWidth={1}
      borderBottomWidth={1}
      borderColor={GRID_LINE}
    >
      <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
        {fmt.weekdayShort(day.at)}
      </Text>
      {/*
        SỐ ngày đổi màu theo ngày lễ, không phải cả ô — web đặt màu ở `.dayHeaderCell` nhưng
        `.weekdayLabel` có màu riêng nên chỉ số ngày thừa hưởng. Hôm nay THẮNG ngày lễ: nó là mốc
        điều hướng, ngày lễ chỉ là ngữ cảnh.
      */}
      <Text
        col={day.isToday ? colors.primaryActive : holiday ? colors.danger : colors.text}
        fos={fontSize.bodySm}
        fow={day.isToday ? fontWeight.bold : fontWeight.semibold}
      >
        {day.dayOfMonth}
      </Text>
      {holiday ? (
        <YStack position="absolute" top={2} right={3}>
          <Ionicons name="flag" size={HOLIDAY_FLAG_SIZE} color={colors.danger} />
        </YStack>
      ) : null}
    </YStack>
  );

  // Không quyền nào và không phải ngày lễ ⇒ không có gì để mở, đừng mời người dùng chạm.
  if (!onPress && !holiday) return body;

  const label = holiday
    ? t('dayPanel.triggerHoliday', { name: holiday.name, date: fmt.dateKey(day.key) })
    : t('dayPanel.trigger', { date: fmt.dateKey(day.key) });

  return (
    <Pressable
      onPress={() => onPress?.(day)}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
    </Pressable>
  );
});

/**
 * Ô cột xe: ảnh nhận diện + tên + biển số/mã. Chạm mở thẻ thông tin xe.
 *
 * KHÔNG có dòng giá dù web có (`.resourcePrice`): trên hàng cao 56dp thì dòng thứ ba ép cả ba
 * dòng xuống bậc chữ nhỏ hơn, và giá đã nằm sẵn ở thẻ thông tin xe mở ngay từ chính ô này — một
 * cú chạm, không phải một chuyến đi.
 */
const ResourceCell = memo(function ResourceCell({
  resource,
  collapsed,
  onPress,
}: {
  resource: CalendarResource;
  collapsed: boolean;
  onPress: (resource: CalendarResource) => void;
}) {
  const t = useTranslations('Calendar');

  return (
    <Pressable
      onPress={() => onPress(resource)}
      accessibilityRole="button"
      accessibilityLabel={t('vehicleCard.trigger', { vehicle: resource.name })}
    >
      <XStack
        h={ROW_H}
        ai="center"
        gap={space.xs}
        px={space.xs}
        bg={colors.surface}
        borderBottomWidth={1}
        borderColor={GRID_LINE}
      >
        <YStack w={24} h={24} br={radius.sm} ov="hidden" bg={colors.surfaceMuted}>
          <RemoteImage
            uri={resource.mainImageUrl}
            recyclingKey={resource.id}
            fallback={<Ionicons name="car-outline" size={iconSize.sm} color={colors.placeholder} />}
          />
        </YStack>
        {collapsed ? null : (
          <YStack f={1} gap={1}>
            <Text col={colors.text} fos={fontSize.meta} fow={fontWeight.semibold} numberOfLines={1}>
              {resource.name}
            </Text>
            {/* Biển số KHÔNG cắt — xem docblock `RESOURCE_W`. */}
            <Text
              col={colors.textMuted}
              fos={fontSize.meta}
              numberOfLines={1}
              adjustsFontSizeToFit
              /* Sàn co chữ: bảo vệ biển số khi người dùng bật cỡ chữ hệ thống lớn, nhưng không
                 cho nó co tới mức không đọc nổi — dưới 0.85 thì thà cắt còn hơn. */
              minimumFontScale={0.85}
            >
              {resource.plateNumber ?? resource.code}
            </Text>
          </YStack>
        )}
      </XStack>
    </Pressable>
  );
});

/**
 * Dải ô ngày + thanh event của MỘT hàng xe.
 *
 * Ô ngày và thanh event nằm trong cùng một khung định vị: ô là nền (chạm để tạo lịch), thanh nằm
 * đè lên (chạm để mở chi tiết). Thanh phải vẽ SAU trong cây để nhận được cú chạm của chính nó.
 */
const EventTrack = memo(function EventTrack({
  resource,
  events,
  days,
  range,
  dayWidth,
  priceMarkers,
  holidaysByDay,
  onCellPress,
  onEventPress,
}: {
  resource: CalendarResource;
  events: readonly CalendarEvent[];
  days: readonly DayCell[];
  range: CalendarRange;
  dayWidth: number;
  priceMarkers: ReadonlyMap<string, PriceMarker>;
  holidaysByDay: ReadonlyMap<string, Holiday>;
  onCellPress: ((resource: CalendarResource, day: DayCell) => void) | null;
  onEventPress: (event: CalendarEvent, resource: CalendarResource) => void;
}) {
  const t = useTranslations('Calendar');

  const bars = useMemo(() => layoutEventBars(events, range, dayWidth), [events, range, dayWidth]);

  return (
    /* Nét ngăn hàng do từng Ô vẽ, không do hàng — xem docblock `GRID_LINE`. */
    <XStack h={ROW_H} w={days.length * dayWidth} bg={colors.surface}>
      {days.map((day) => {
        const marker = priceMarkers.get(priceMarkerKey(resource.vehicleId, day.key));
        const holiday = holidaysByDay.get(day.key);
        /*
         * Ghi chú ghép bằng MÃ chứ không bằng một khoá message có hai chỗ trống: hai ghi chú này
         * độc lập nhau (có thể có một, cả hai, hoặc không có), và ` · ` là quy ước TRÌNH BÀY
         * giống nhau ở mọi ngôn ngữ — đúng cách web ghép.
         */
        const notes = [
          marker ? t('cell.customPriceNote') : null,
          holiday ? t('cell.holidayNote', { name: holiday.name }) : null,
        ].filter(Boolean);
        const label =
          t('cell.action', {
            vehicle: resource.name,
            date: `${day.key.slice(8, 10)}/${day.key.slice(5, 7)}`,
          }) + notes.map((note) => ` · ${note}`).join('');

        const cell = (
          <YStack
            w={dayWidth}
            h="100%"
            borderRightWidth={1}
            borderBottomWidth={1}
            borderColor={GRID_LINE}
            /* Cuối tuần < ngày lễ < hôm nay; ô thường trong suốt để nền hàng hiện lên. */
            bg={
              day.isToday
                ? CAL_SURFACE.todayBg
                : holiday
                  ? CAL_SURFACE.holidayBg
                  : day.isWeekend
                    ? CAL_SURFACE.weekendBg
                    : 'transparent'
            }
          >
            {marker ? (
              /*
               * Chấm giá riêng — gold ĐẶC viền vòng nhạt, đúng `.priceMarker` của web
               * (`box-shadow: 0 0 0 2px`). Vòng nhạt không phải trang trí: không có nó thì chấm
               * biến mất khi rơi đúng vào cột hôm nay, vốn cũng gold.
               */
              <YStack
                position="absolute"
                bottom={3}
                right={3}
                w={10}
                h={10}
                br={radius.pill}
                bg={colors.primary}
                bw={2}
                bc={colors.primaryLight}
              />
            ) : null}
          </YStack>
        );

        return onCellPress ? (
          <Pressable
            key={day.key}
            onPress={() => onCellPress(resource, day)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            {cell}
          </Pressable>
        ) : (
          <View key={day.key} accessible accessibilityLabel={label}>
            {cell}
          </View>
        );
      })}

      {bars.map((bar) => (
        <EventBar
          key={bar.event.id}
          event={bar.event}
          left={bar.left}
          width={bar.width}
          lane={bar.lane}
          clippedStart={bar.position.clippedStart}
          clippedEnd={bar.position.clippedEnd}
          onPress={() => onEventPress(bar.event, resource)}
        />
      ))}
    </XStack>
  );
});

/**
 * Thanh event.
 *
 * Màu lấy từ META của `@xeprime/types`; loại còn phân biệt bằng ICON và bằng mép cắt — màu không
 * bao giờ là tín hiệu duy nhất. Nhãn trợ năng nói đủ "loại, tên, từ … đến …, trạng thái" vì trên
 * một thanh rộng 46dp thì chữ hiện ra gần như chắc chắn bị cắt.
 */
const EventBar = memo(function EventBar({
  event,
  left,
  width,
  lane,
  clippedStart,
  clippedEnd,
  onPress,
}: {
  event: CalendarEvent;
  left: number;
  width: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const tone = eventTone(event);
  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  const icon = EVENT_ICON[event.type as OccupancySourceType];
  /*
   * `event.status` mang HAI nghĩa tuỳ loại (contract của `CalendarEventDto`). Tra thẳng ở nhóm
   * trạng thái đơn thì `unplanned_maintenance` không có nhãn và chính cái MÃ đó đi ra nhãn trợ
   * năng — người dùng trình đọc màn hình nghe một chuỗi snake_case.
   */
  const statusGroup = eventStatusGroup(event);

  /* Bỏ chữ chỉ được phép khi có icon đứng thay — xem `eventBarShowsLabel`. */
  const showLabel = eventBarShowsLabel(width, icon);
  /* Nét ĐỨT cho chỗ bị giữ mà chưa phải chuyến đang chạy — xem `isDashedEvent`. */
  const dashed = isDashedEvent(event.type);

  const label = [
    domainLabel('occupancySourceType', event.type, typeMeta?.label ?? event.type),
    event.title,
    t('eventCard.barAriaRange', {
      start: fmt.dateTime(event.startAt),
      end: fmt.dateTime(event.endAt),
    }),
    statusGroup ? domainLabel(statusGroup, event.status) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        left,
        width,
        top: EVENT_TOP + lane * EVENT_LANE_STEP,
        height: EVENT_H,
      }}
    >
      <XStack
        f={1}
        ai="center"
        jc={showLabel ? 'flex-start' : 'center'}
        gap={2}
        px={3}
        bg={tone.bg}
        bw={1}
        /* Viền là màu trạng thái PHA LOÃNG, không phải màu chữ — nét đặc ở đây làm thanh nặng
           hơn hẳn web và nuốt luôn khoảng cách giữa hai thanh liền nhau. */
        bc={tone.border}
        {...(dashed ? { borderStyle: 'dashed' as const } : {})}
        // Mép PHẲNG ở đầu bị cắt — dấu hiệu "event còn chạy tiếp ngoài khoảng đang xem".
        borderTopLeftRadius={clippedStart ? 0 : radius.sm}
        borderBottomLeftRadius={clippedStart ? 0 : radius.sm}
        borderTopRightRadius={clippedEnd ? 0 : radius.sm}
        borderBottomRightRadius={clippedEnd ? 0 : radius.sm}
        ov="hidden"
      >
        {icon ? <Ionicons name={icon} size={iconSize.xs} color={tone.fg} /> : null}
        {showLabel ? (
          <Text f={1} col={tone.fg} fos={fontSize.meta} fow={fontWeight.semibold} numberOfLines={1}>
            {event.title}
          </Text>
        ) : null}
      </XStack>
    </Pressable>
  );
});
