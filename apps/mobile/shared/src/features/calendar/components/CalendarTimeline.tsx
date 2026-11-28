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
import { Ionicons } from '@/components/icons/Ionicons';
import { LineIcon } from '@/components/icons/LineIcon';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { toAppTz } from '@xeprime/domain';
import {
  OCCUPANCY_SOURCE_TYPE,
  OCCUPANCY_SOURCE_TYPE_META,
  isMarketplaceBooking,
  type OccupancySourceType,
} from '@xeprime/types';
import {
  RENTAL_STAGE_TONE,
  rentalStageOfBookingStatus,
  rentalStageOfRequestStatus,
} from '@/features/bookings/rental-stages';
import { RemoteImage } from '@/components/ui/RemoteImage';
import {
  bookingSourceSkinOf,
  useBookingSourceSkins,
  useBookingSourceText,
} from '@/components/ui/BookingSourceChip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { CalendarEvent, CalendarResource, Holiday } from '../api';
import { isDashedEvent, serviceAccent, stageFill } from '../calendar-tone';
import { eventStatusGroup } from '../event-tone';
import { priceMarkerKey, type PriceMarker } from '../hooks/use-calendar-data';
import type { CalendarRange, DayCell } from '../utils/calendar-date.util';
import { layoutEventBars } from '../utils/calendar-position.util';

/**
 * Kích thước lưới - Figma Lịch thuê xe "Option 2" (`24729:82215`).
 *
 * - Header ngày cao 44, cột xe rộng 100 (ảnh 63×40 + tên + biển số xếp DỌC).
 * - Cột ngày 97 ở khổ 390 ⇒ sàn 96: ba ngày nhìn thấy, cuộn ngang cho phần còn lại.
 * - Hàng: Figma 92 chở thẻ 4 dòng (mã · chặng · tiền · giờ). Người dùng chốt GIỮ thêm tên khách
 *   (27/11/2026) thành dòng thứ năm ⇒ hàng 108, thẻ 98.
 */
const HEADER_H = 44;
const ROW_H = 108;
const RESOURCE_W = 100;
/** Cột xe THU GỌN: chỉ còn ảnh - nhường tối đa bề ngang cho lưới ngày. */
const RESOURCE_W_COLLAPSED = 52;
const MIN_DAY_W = 96;

/** Ảnh xe ở cột ghim (Figma "Vehicle Image" `24729:82238`): 63×40 bo 8. */
const THUMB_W = 63;
const THUMB_H = 40;
const THUMB_W_COLLAPSED = 36;
const THUMB_H_COLLAPSED = 24;

/**
 * Hình học của lưới, XUẤT RA cho khung chờ dùng lại - khung chờ phải có đúng hình của lưới thật,
 * nếu không lúc dữ liệu về mọi thứ nhảy một cái.
 */
export const GRID_METRICS = {
  headerHeight: HEADER_H,
  rowHeight: ROW_H,
  resourceWidth: RESOURCE_W,
  minDayWidth: MIN_DAY_W,
} as const;

/**
 * Cửa sổ ảo hoá của lưới - xem lịch sử ở git: `windowSize` 5 cân giữa fling không trắng và đổi
 * khoảng không khoá luồng JS; `removeClippedSubviews` TẮT vì cột xe cuộn bằng lệnh.
 */
const LIST_WINDOW = {
  initialNumToRender: 8,
  windowSize: 5,
  maxToRenderPerBatch: 6,
  updateCellsBatchingPeriod: 30,
  removeClippedSubviews: false,
} as const;

/** Nét ngăn HÀNG và mép cột ghim: `stroke/gray-low200` (#e9eaeb). */
const useGridLine = themed((colors) => colors.border);
/** Nét ngăn CỘT ngày trong thân lưới: `bg/gray-100` (#f5f5f5) - Figma vẽ vạch 1px nhạt hơn nét hàng. */
const useColumnLine = themed((colors) => colors.borderSubtle);

const HOLIDAY_FLAG_SIZE = 9;

/** Thẻ đơn (Figma "Vehicle details" `24729:82244`): lề trong ô 2, cách đỉnh hàng 5, hai tầng cách 4. */
const CARD_INSET_X = 2;
const CARD_INSET_Y = 5;
const CARD_LANE_GAP = 4;
/** Vạch trái 4×32, bo phải 12. */
const STRIP_W = 4;
const STRIP_H = 32;
const CARD_PAD_Y = 6;
const CARD_PAD_R = 12;
const CARD_GAP = 6;
const LINE_GAP = 2;

/** Hàng không có event: CÙNG một mảng, nếu không `memo(EventTrack)` hỏng ở mọi hàng trống. */
const NO_EVENTS: readonly CalendarEvent[] = [];

export interface TimelineHandlers {
  /** Chạm ô TRỐNG - mở bộ chọn hành động. `null` khi người dùng không có quyền thao tác nào. */
  onCellPress: ((resource: CalendarResource, day: DayCell) => void) | null;
  onEventPress: (event: CalendarEvent, resource: CalendarResource) => void;
  onResourcePress: (resource: CalendarResource) => void;
  /** Chạm thẻ ngày - mở bảng thao tác cả-đội-xe. `null` khi không có quyền nào. */
  onDayPress: ((day: DayCell) => void) | null;
}

interface TimelineProps extends TimelineHandlers {
  resources: readonly CalendarResource[];
  eventsByResource: ReadonlyMap<string, CalendarEvent[]>;
  priceMarkers: ReadonlyMap<string, PriceMarker>;
  holidaysByDay: ReadonlyMap<string, Holiday>;
  days: readonly DayCell[];
  range: CalendarRange;
  /** Bề ngang/chiều cao thật của vùng lưới - đo ở màn, truyền xuống để mọi phép tính dùng chung. */
  viewport: { width: number; height: number };
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Lưới lịch dạng resource timeline - bản native của `CalendarScheduler` bên web, khoác giao diện
 * Figma Lịch thuê xe (`24729:81894`).
 *
 * Cột xe nằm HOÀN TOÀN NGOÀI vùng cuộn ngang (ghim thật, không dịch ngược); trục DỌC đồng bộ trên
 * luồng UI qua `useScrollViewOffset` - xem docblock {@link ResourceColumn}. Hàng CAO CỐ ĐỊNH +
 * `getItemLayout` nên đội 1.000 xe chỉ dựng vài hàng đang nhìn thấy.
 *
 * KHÔNG có kéo-thả: web đã bỏ có chủ đích (đổi giờ đi qua form có xác nhận, backend quyết - ADR 0006).
 */
export function CalendarTimeline({
  resources,
  eventsByResource,
  priceMarkers,
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
  const colors = useColors();
  const GRID_LINE = useGridLine();
  const t = useTranslations('Calendar');

  const resourceW = collapsed ? RESOURCE_W_COLLAPSED : RESOURCE_W;
  const trackViewportW = Math.max(0, viewport.width - resourceW);
  const dayWidth = Math.max(
    MIN_DAY_W,
    trackViewportW > 0 ? Math.floor(trackViewportW / days.length) : MIN_DAY_W,
  );
  const trackWidth = days.length * dayWidth;
  /* −1: mép trên 1px của lưới (Figma "Option 2" viền trên/dưới) nằm trong vùng đo. */
  const listHeight = Math.max(0, viewport.height - HEADER_H - 1);

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
    <XStack f={1} bg={colors.surface} borderTopWidth={1} borderColor={GRID_LINE}>
      {/* ── Cột xe: GHIM, nằm NGOÀI vùng cuộn ngang ─────────────────────── */}
      <YStack w={resourceW} borderRightWidth={1} borderColor={GRID_LINE}>
        {/*
          Góc "PHƯƠNG TIỆN" (Figma `24729:82217`). Nút thu gọn cột Figma không vẽ - người dùng chốt
          giữ (27/11/2026), nên góc mang thêm một mũi tên nhỏ.
        */}
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
            px={8}
            bg={colors.background}
            borderBottomWidth={1}
            borderColor={GRID_LINE}
          >
            {collapsed ? null : (
              <Text
                f={1}
                minWidth={0}
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.semibold}
                textTransform="uppercase"
                numberOfLines={1}
              >
                {t('grid.resourceTitle')}
              </Text>
            )}
            <LineIcon
              name={collapsed ? 'chevron-right' : 'chevron-left'}
              size={14}
              color={colors.placeholder}
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
      </YStack>

      {/* ── Dải ngày: cuộn NGANG theo thời gian, cuộn DỌC theo xe ────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ width: trackViewportW }}
        contentContainerStyle={{ width: trackWidth }}
      >
        <YStack w={trackWidth}>
          <XStack h={HEADER_H} bg={colors.background}>
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
        </YStack>
      </ScrollView>
    </XStack>
  );
}

/** Băng hàng GIỮ SỐNG của cột xe, đo bằng số MÀN mỗi phía - ảnh mạng rẻ khi giữ, đắt khi dựng lại. */
const RESOURCE_OVERSCAN_SCREENS = 3;

/**
 * Cột xe - dựng bằng tay, không phải `FlatList`: chuyển động là phép dịch trên luồng UI đọc thẳng
 * `scrollY`; cửa sổ dựng là state React, chỉ đánh thức khi chỉ số hàng đầu ĐỔI (mỗi `ROW_H`).
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

  /* Kẹp theo danh sách HIỆN TẠI: đổi bộ lọc làm danh sách ngắn đi khi vị trí cuộn chưa kịp về 0. */
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
 * Một cột ngày ở header (Figma `24729:82221`): thứ 12/18 medium `text/gray/low` (cuối tuần đỏ) trên
 * số ngày 12/18 semibold; HÔM NAY nền `bg/primary-low` + số `text/brand/primary-2`. Ngày lễ: số đỏ +
 * cờ ghim góc. Chạm ⇒ bảng thao tác cả-đội-xe của ngày đó.
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
  const colors = useColors();
  const GRID_LINE = useGridLine();
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  const body = (
    <YStack
      w={width}
      h={HEADER_H}
      ai="center"
      jc="center"
      gap={1}
      px={2}
      bg={day.isToday ? colors.brandLow : 'transparent'}
      borderBottomWidth={1}
      borderColor={GRID_LINE}
    >
      <Text
        col={day.isWeekend ? colors.danger : colors.placeholder}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {fmt.weekdayShort(day.at)}
      </Text>
      <Text
        col={day.isToday ? colors.brandLink : holiday ? colors.danger : colors.text}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.semibold}
      >
        {day.dayOfMonth}
      </Text>
      {holiday ? (
        <YStack position="absolute" top={3} right={4}>
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
 * Ô cột xe (Figma "Car Pin" `24729:82237`): ảnh 63×40 bo 8 · tên 12/18 semibold · biển số 12/18
 * `text/gray/low`, xếp dọc, đệm 8/6. Chạm mở thẻ thông tin xe. Thu gọn ⇒ chỉ còn ảnh nhỏ.
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
  const colors = useColors();
  const GRID_LINE = useGridLine();
  const t = useTranslations('Calendar');

  return (
    <Pressable
      onPress={() => onPress(resource)}
      accessibilityRole="button"
      accessibilityLabel={t('vehicleCard.trigger', { vehicle: resource.name })}
    >
      <YStack
        h={ROW_H}
        jc="center"
        ai={collapsed ? 'center' : 'flex-start'}
        gap={2}
        px={8}
        py={6}
        bg={colors.surface}
        borderBottomWidth={1}
        borderColor={GRID_LINE}
      >
        <YStack
          w={collapsed ? THUMB_W_COLLAPSED : THUMB_W}
          h={collapsed ? THUMB_H_COLLAPSED : THUMB_H}
          br={8}
          ov="hidden"
          bg={colors.surfaceMuted}
        >
          <RemoteImage
            uri={resource.mainImageUrl}
            recyclingKey={resource.id}
            fallback={<LineIcon name="car" size={20} color={colors.textPlaceholder} />}
          />
        </YStack>
        {collapsed ? null : (
          <>
            <Text
              alignSelf="stretch"
              col={colors.text}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {resource.name}
            </Text>
            {/* Biển số là ĐỊNH DANH - co chữ (sàn 0.85) chứ không cắt. */}
            <Text
              alignSelf="stretch"
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.regular}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {resource.plateNumber ?? resource.code}
            </Text>
          </>
        )}
      </YStack>
    </Pressable>
  );
});

/**
 * Dải ô ngày + thẻ event của MỘT hàng xe. Ô là nền (chạm để tạo lịch), thẻ nằm đè (chạm để mở);
 * thẻ vẽ SAU trong cây để nhận cú chạm của chính nó.
 *
 * Nền ô theo chú giải Figma: ngày có GIÁ RIÊNG tô `bg/primary-low` (ô mẫu "Giá riêng"), ngày lễ
 * tô `status/error-25`. Figma không tô cột hôm nay/cuối tuần trong thân lưới - chỉ ở header.
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
  const colors = useColors();
  const GRID_LINE = useGridLine();
  const COLUMN_LINE = useColumnLine();
  const t = useTranslations('Calendar');

  const bars = useMemo(() => layoutEventBars(events, range, dayWidth), [events, range, dayWidth]);
  /* Số tầng của HÀNG này - thẻ chia đều chiều cao hàng, nên hai đơn chồng nhau vẫn vừa trong 108. */
  const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 1);
  const cardH = Math.floor(
    (ROW_H - CARD_INSET_Y * 2 - CARD_LANE_GAP * (laneCount - 1)) / laneCount,
  );

  return (
    <XStack
      h={ROW_H}
      w={days.length * dayWidth}
      bg={colors.surface}
      borderBottomWidth={1}
      borderColor={GRID_LINE}
    >
      {days.map((day, index) => {
        const marker = priceMarkers.get(priceMarkerKey(resource.vehicleId, day.key));
        const holiday = holidaysByDay.get(day.key);
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
            /* Vạch ngăn cột 1px `bg/gray-100` (Figma "Rectangle" `24729:82242`). */
            borderLeftWidth={index === 0 ? 0 : 1}
            borderColor={COLUMN_LINE}
            bg={marker ? colors.brandLow : holiday ? colors.dangerWash : 'transparent'}
          />
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
        <EventCard
          key={bar.event.id}
          event={bar.event}
          left={bar.left + CARD_INSET_X}
          width={Math.max(0, bar.width - CARD_INSET_X * 2)}
          top={CARD_INSET_Y + bar.lane * (cardH + CARD_LANE_GAP)}
          height={cardH}
          clippedStart={bar.position.clippedStart}
          clippedEnd={bar.position.clippedEnd}
          onPress={() => onEventPress(bar.event, resource)}
        />
      ))}
    </XStack>
  );
});

/** Chiều cao tối thiểu để thẻ chở đủ 5 dòng / 2 dòng (mã + chặng) - dưới nữa chỉ còn mã. */
const FULL_CARD_MIN_H = 96;
const MEDIUM_CARD_MIN_H = 44;

/**
 * Thẻ event trên lưới.
 *
 * - Đơn / yêu cầu (Figma "Vehicle details" `24729:82244`): nền nhạt theo DỊCH VỤ, vạch trái 4×32,
 *   mã 10/14 cùng sắc · viên chặng nền đặc chữ trắng 10/14 · tiền 12/18 medium · giờ 10/14 · tên
 *   khách 10/14 (người dùng chốt giữ). Dấu nguồn đơn + dấu đã thu (ADR 0110) nằm cuối dòng mã.
 *   Yêu cầu chưa chiếm lịch: nền trắng + viền ĐỨT cùng sắc (`isDashedEvent`).
 * - Khoá xe / bảo dưỡng (Figma `24729:82414`): nền `bg/gray-50`, viền ĐỨT `stroke/gray-low300`,
 *   ổ khoá + "Đã khóa" 12/18 `text/gray/low`.
 *
 * Nhiều tầng chồng nhau thì thẻ thấp đi và bỏ dần dòng phụ - nhãn trợ năng vẫn nói đủ.
 */
const EventCard = memo(function EventCard({
  event,
  left,
  width,
  top,
  height,
  clippedStart,
  clippedEnd,
  onPress,
}: {
  event: CalendarEvent;
  left: number;
  width: number;
  top: number;
  height: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('Calendar');
  const tBoard = useTranslations('Bookings.board');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const sourceText = useBookingSourceText();
  const sourceSkins = useBookingSourceSkins();
  const colors = useColors();

  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  const statusGroup = eventStatusGroup(event);
  const dashed = isDashedEvent(event);
  const isBooking = event.type === OCCUPANCY_SOURCE_TYPE.BOOKING;
  const isTrip = isBooking || event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST;
  const stage = isBooking
    ? rentalStageOfBookingStatus(event.status)
    : event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST
      ? rentalStageOfRequestStatus(event.status)
      : null;

  /* Nguồn đơn + thanh toán (ADR 0110): chỉ ĐƠN tự khai thác mang dấu nguồn; dấu đã thu đọc `paidPercent` server tính. */
  const source =
    isBooking && event.bookingSource && !isMarketplaceBooking(event.bookingSource)
      ? { code: event.bookingSource, label: event.bookingSourceLabel ?? null }
      : null;
  const sourceName = source ? sourceText(source.code, source.label) : null;
  const sourceSkin = source ? bookingSourceSkinOf(sourceSkins, source.code) : null;
  const paidPercent = isBooking ? (event.paidPercent ?? null) : null;
  const paidLabel =
    paidPercent == null
      ? null
      : paidPercent >= 100
        ? t('event.paidFull')
        : paidPercent > 0
          ? t('event.paidPartial', { percent: paidPercent })
          : t('event.unpaid');

  const clockOf = (iso: string) => {
    const at = toAppTz(iso);
    return tUnits('rentalTime', { hour: at.format('HH'), minute: at.format('mm') });
  };
  const hours = t('event.hours', { from: clockOf(event.startAt), to: clockOf(event.endAt) });

  const label = [
    stage
      ? tBoard(`stage.${stage}`)
      : domainLabel('occupancySourceType', event.type, typeMeta?.label ?? event.type),
    isTrip ? event.customerName : event.title,
    event.code,
    isTrip && event.serviceType ? domainLabel('serviceType', event.serviceType) : null,
    event.amount ? fmt.money(event.amount) : null,
    sourceName ? t('event.sourceAria', { source: sourceName }) : null,
    paidLabel,
    t('eventCard.barAriaRange', {
      start: fmt.dateTime(event.startAt),
      end: fmt.dateTime(event.endAt),
    }),
    !stage && statusGroup ? domainLabel(statusGroup, event.status) : null,
  ]
    .filter(Boolean)
    .join(', ');

  const corners = {
    borderTopLeftRadius: clippedStart ? 0 : radius.control,
    borderBottomLeftRadius: clippedStart ? 0 : radius.control,
    borderTopRightRadius: clippedEnd ? 0 : radius.control,
    borderBottomRightRadius: clippedEnd ? 0 : radius.control,
  };
  const frame = { position: 'absolute' as const, left, width, top, height };

  if (!isTrip) {
    const isBlock = event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE;
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={frame}>
        <YStack
          f={1}
          jc="center"
          gap={2}
          px={12}
          py={4}
          bg={colors.background}
          bw={1}
          bc={colors.borderInput}
          borderStyle="dashed"
          ov="hidden"
          {...corners}
        >
          <LineIcon
            name={isBlock ? 'lock-2' : 'setting-sm'}
            size={20}
            color={colors.textPlaceholder}
          />
          {height >= MEDIUM_CARD_MIN_H ? (
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {isBlock ? t('event.blocked') : event.title}
            </Text>
          ) : null}
        </YStack>
      </Pressable>
    );
  }

  const tone = serviceAccent(event.serviceType, colors);
  const stageBg = stage ? stageFill(RENTAL_STAGE_TONE[stage], colors) : colors.textPlaceholder;
  const stageText = stage
    ? tBoard(`stage.${stage}`)
    : statusGroup
      ? domainLabel(statusGroup, event.status)
      : null;
  const full = height >= FULL_CARD_MIN_H;
  const medium = height >= MEDIUM_CARD_MIN_H;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={frame}>
      <XStack
        f={1}
        ai="center"
        gap={CARD_GAP}
        pr={CARD_PAD_R}
        py={full ? CARD_PAD_Y : 2}
        bg={dashed ? colors.surface : tone.wash}
        ov="hidden"
        {...(dashed ? { bw: 1, bc: tone.accent, borderStyle: 'dashed' as const } : {})}
        {...corners}
      >
        <YStack
          w={STRIP_W}
          h={Math.min(STRIP_H, Math.max(0, height - 8))}
          bg={tone.accent}
          borderTopRightRadius={radius.control}
          borderBottomRightRadius={radius.control}
        />
        <YStack f={1} minWidth={0} gap={LINE_GAP}>
          <XStack ai="center" gap={4}>
            <Text
              f={1}
              minWidth={0}
              col={tone.accent}
              fos={typeScale.caption.fontSize}
              lh={typeScale.caption.lineHeight}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {event.code ? `#${event.code}` : (event.customerName ?? t('event.customerHidden'))}
            </Text>
            {sourceName && sourceSkin ? (
              <YStack
                w={14}
                h={14}
                br={7}
                ai="center"
                jc="center"
                flexShrink={0}
                bg={sourceSkin.bg}
                bw={1}
                bc={sourceSkin.border}
              >
                <Text col={sourceSkin.fg} fos={9} lh={11} fow={fontWeight.semibold}>
                  {sourceName.trim().charAt(0).toUpperCase()}
                </Text>
              </YStack>
            ) : null}
            {paidPercent != null && paidPercent > 0 ? (
              paidPercent >= 100 ? (
                <LineIcon name="tick-circle-fill" size={14} color={colors.success} />
              ) : (
                <Text
                  flexShrink={0}
                  col={colors.warningStrong}
                  fos={typeScale.caption.fontSize}
                  lh={typeScale.caption.lineHeight}
                  fow={fontWeight.semibold}
                >
                  {`${paidPercent}%`}
                </Text>
              )
            ) : null}
          </XStack>
          {medium && stageText ? (
            <YStack alignSelf="flex-start" maxWidth="100%" px={4} py={2} br={4} bg={stageBg}>
              <Text
                col={colors.textOnSolid}
                fos={typeScale.caption.fontSize}
                lh={typeScale.caption.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {stageText}
              </Text>
            </YStack>
          ) : null}
          {full && event.amount ? (
            <Text
              col={colors.text}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {fmt.money(event.amount)}
            </Text>
          ) : null}
          {full ? (
            <Text
              col={colors.textMuted}
              fos={typeScale.caption.fontSize}
              lh={typeScale.caption.lineHeight}
              fow={fontWeight.regular}
              numberOfLines={1}
            >
              {hours}
            </Text>
          ) : null}
          {full ? (
            <Text
              col={colors.placeholder}
              fos={typeScale.caption.fontSize}
              lh={typeScale.caption.lineHeight}
              fow={fontWeight.regular}
              numberOfLines={1}
            >
              {event.customerName ?? t('event.customerHidden')}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </Pressable>
  );
});
