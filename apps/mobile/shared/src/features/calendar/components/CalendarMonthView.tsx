import type React from 'react';
import { memo, useMemo } from 'react';
import { Pressable, RefreshControl } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scrollThrottle } from '@/theme/motion';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { startOfAppDay, toAppTz } from '@xeprime/domain';
import { OCCUPANCY_SOURCE_TYPE } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import {
  RENTAL_STAGE_TONE,
  rentalStageOfBookingStatus,
  rentalStageOfRequestStatus,
} from '@/features/bookings/rental-stages';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { AppColors } from '@/theme/tokens';
import type { CalendarEvent, CalendarResource, Holiday } from '../api';
import { isOccupying, serviceAccent, stageFill } from '../calendar-tone';
import { eventStatusGroup } from '../event-tone';
import { priceMarkerKey, type PriceMarker } from '../hooks/use-calendar-data';
import type { DayCell } from '../utils/calendar-date.util';

/** Figma "30-Day Fleet Heatmap" `24729:78597`: đệm 9, ô cao 50 cách nhau 4, bo 8. */
const GRID_PAD = 9;
const CELL_GAP = 4;
const CELL_H = 50;
const BAR_W = 34;
const BAR_H = 4;
/** Figma "Selected Day Fleet Breakdown" `24729:78778`: đệm 12/10, dòng cách 8. */
const PANEL_PAD_X = 12;
const PANEL_PAD_Y = 10;
const PANEL_GAP = 8;
const SECTION_GAP = 16;

const isTrip = (event: CalendarEvent) =>
  event.type === OCCUPANCY_SOURCE_TYPE.BOOKING || event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST;

/** Xe bận trong một ngày: các event CHIẾM lịch chạm ngày đó (cùng luật `isCellRangeFree` của màn). */
interface DayLoad {
  /** resourceId → event chạm ngày, theo giờ bắt đầu. */
  byResource: Map<string, CalendarEvent[]>;
}

/** Mức kín của một ngày (Figma): ≤ 1/2 xanh · trên 1/2 cam · kín hết đỏ. */
type LoadLevel = 'low' | 'mid' | 'full';

function levelOf(busy: number, total: number): LoadLevel {
  if (total > 0 && busy >= total) return 'full';
  return total > 0 && busy * 2 > total ? 'mid' : 'low';
}

function levelTone(level: LoadLevel, colors: AppColors) {
  switch (level) {
    case 'full':
      return { text: colors.danger, bar: colors.dangerVivid, bg: colors.dangerWash };
    case 'mid':
      return { text: colors.warningHigh, bar: colors.warningVivid, bg: colors.warningWash };
    default:
      return { text: colors.success, bar: colors.successVivid, bg: colors.surface };
  }
}

/**
 * Lịch THÁNG - Figma Lịch thuê xe "30-Day Fleet Heatmap" + "Selected Day Fleet Breakdown"
 * (`24729:78586`). Người dùng chốt dựng ở CLIENT (27/11/2026): mọi con số suy từ đúng bộ dữ liệu
 * của lưới (`resources` + `events` của khoảng tháng, cùng bộ lọc) - không API mới, không phép tính
 * nào khác lưới:
 *
 * - "x/N xe kín": N = số xe đang lọc, x = số xe có event CHIẾM lịch chạm ngày đó (yêu cầu chờ duyệt
 *   không chiếm - cùng luật `isCellRangeFree`).
 * - Khối ngày: "xe trống" = xe không có event nào chạm ngày; "thuê" = xe có đơn/yêu cầu chiếm lịch;
 *   "BD" = xe chỉ bận vì khoá/bảo dưỡng.
 *
 * Ô ngày NGOÀI tháng chỉ in số mờ, không chạm được - như Figma.
 */
export const CalendarMonthView = memo(function CalendarMonthView({
  days,
  rangeFrom,
  rangeTo,
  resources,
  eventsByResource,
  priceMarkers,
  holidaysByDay,
  selectedKey,
  onSelectDay,
  onEventPress,
  onCreate,
  onDayActions,
  onScroll,
  topInset = 0,
  refreshing = false,
  onRefresh,
}: {
  /** Đủ các tuần của lưới (bắt đầu thứ Hai), kể cả ngày tháng trước/sau. */
  days: readonly DayCell[];
  /** Tháng đang xem (0-11) - để làm mờ ngày ngoài tháng. */
  /** Khoảng đang xem (YYYY-MM-DD, tính cả hai đầu) - ngày ngoài khoảng làm mờ, không chạm. */
  rangeFrom: string;
  rangeTo: string;
  resources: readonly CalendarResource[];
  eventsByResource: ReadonlyMap<string, CalendarEvent[]>;
  priceMarkers: ReadonlyMap<string, PriceMarker>;
  holidaysByDay: ReadonlyMap<string, Holiday>;
  selectedKey: string;
  onSelectDay: (key: string) => void;
  onEventPress: (event: CalendarEvent, resource: CalendarResource) => void;
  /** Tạo đơn cho một xe trống ngày đó - `null` khi không có quyền lập đơn. */
  onCreate: ((resource: CalendarResource, dayKey: string) => void) | null;
  /** Bảng thao tác cả-đội-xe của ngày (khoá / đặt giá hàng loạt) - `null` khi không có quyền. */
  onDayActions: ((day: DayCell) => void) | null;
  /** Handler Reanimated - màn dùng để ẩn/hiện khối đầu trang khi cuộn. */
  onScroll?: React.ComponentProps<typeof Animated.ScrollView>['onScroll'];
  /** Khối đầu trang nằm ĐÈ lên vùng này - nội dung chừa đúng chiều cao của nó. */
  topInset?: number;
  /** Kéo-để-tải-lại. */
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  const safeBottom = useSafeAreaInsets().bottom;
  const total = resources.length;

  /** Một lượt duyệt event cho CẢ lưới - ngày → xe → event, không lọc lại mỗi ô. */
  const loads = useMemo(() => {
    const map = new Map<string, DayLoad>();
    if (days.length === 0) return map;
    const first = days[0] as DayCell;
    const gridStart = startOfAppDay(first.key);
    for (const [resourceId, events] of eventsByResource) {
      for (const event of events) {
        if (!isOccupying(event)) continue;
        const startMs = new Date(event.startAt).getTime();
        const endMs = new Date(event.endAt).getTime();
        for (let i = 0; i < days.length; i += 1) {
          const dayStart = gridStart.add(i, 'day');
          if (startMs < dayStart.add(1, 'day').valueOf() && endMs > dayStart.valueOf()) {
            const key = (days[i] as DayCell).key;
            const load = map.get(key) ?? { byResource: new Map<string, CalendarEvent[]>() };
            const list = load.byResource.get(resourceId);
            if (list) list.push(event);
            else load.byResource.set(resourceId, [event]);
            map.set(key, load);
          }
        }
      }
    }
    return map;
  }, [days, eventsByResource]);

  /** Ngày có ÍT NHẤT một xe đặt giá riêng - tô nền "Giá riêng" của chú giải. */
  const pricedDays = useMemo(() => {
    const set = new Set<string>();
    for (const day of days) {
      if (resources.some((r) => priceMarkers.has(priceMarkerKey(r.vehicleId, day.key)))) {
        set.add(day.key);
      }
    }
    return set;
  }, [days, resources, priceMarkers]);

  const weeks = useMemo(() => {
    const rows: DayCell[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [days]);

  const selected = days.find((day) => day.key === selectedKey) ?? null;
  const byId = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={scrollThrottle.frame}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryActive}
            colors={[colors.primaryActive]}
            progressViewOffset={topInset}
          />
        ) : undefined
      }
      contentContainerStyle={{
        paddingTop: topInset,
        paddingHorizontal: layout.screenX,
        // Như lưới Danh sách: chừa thanh điều hướng hệ thống + 4 để khối cuối không bị che.
        paddingBottom: safeBottom + 4,
        gap: SECTION_GAP,
      }}
      showsVerticalScrollIndicator={false}
    >
      <YStack
        p={GRID_PAD}
        gap={CELL_GAP}
        br={radius.card}
        bw={1}
        bc={colors.border}
        bg={colors.surface}
        accessibilityLabel={t('month.gridAriaLabel')}
      >
        <XStack gap={CELL_GAP}>
          {(weeks[0] ?? []).map((day) => (
            <Text
              key={day.key}
              f={1}
              ta="center"
              col={day.isWeekend ? colors.danger : colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
            >
              {fmt.weekdayShort(day.at)}
            </Text>
          ))}
        </XStack>
        {weeks.map((week) => (
          <XStack key={week[0]?.key} gap={CELL_GAP}>
            {week.map((day) => (
              <MonthCell
                key={day.key}
                day={day}
                inMonth={day.key >= rangeFrom && day.key <= rangeTo}
                busy={loads.get(day.key)?.byResource.size ?? 0}
                total={total}
                priced={pricedDays.has(day.key)}
                holiday={holidaysByDay.get(day.key)}
                selected={day.key === selectedKey}
                onPress={onSelectDay}
              />
            ))}
          </XStack>
        ))}
      </YStack>

      {selected ? (
        <DayBreakdown
          day={selected}
          resources={resources}
          load={loads.get(selected.key)}
          byId={byId}
          onEventPress={onEventPress}
          onCreate={onCreate}
          onDayActions={onDayActions}
        />
      ) : null}
    </Animated.ScrollView>
  );
});

const MonthCell = memo(function MonthCell({
  day,
  inMonth,
  busy,
  total,
  priced,
  holiday,
  selected,
  onPress,
}: {
  day: DayCell;
  inMonth: boolean;
  busy: number;
  total: number;
  priced: boolean;
  holiday: Holiday | undefined;
  selected: boolean;
  onPress: (key: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  if (!inMonth) {
    return (
      <YStack f={1} h={CELL_H} ai="center" jc="center" br={8} bg={colors.surfaceMuted}>
        <Text
          col={colors.textPlaceholder}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={fontWeight.semibold}
        >
          {day.dayOfMonth}
        </Text>
      </YStack>
    );
  }

  const level = levelOf(busy, total);
  const tone = levelTone(level, colors);
  const ratio = total > 0 ? Math.min(1, busy / total) : 0;
  /* Nền: đang chọn > kín/cam > giá riêng > trắng (Figma `24729:78674` · `78684` · `78689` · `78694`). */
  const bg = selected
    ? colors.warningSubtle
    : level !== 'low'
      ? tone.bg
      : priced
        ? colors.brandLow
        : colors.surface;
  const numberColor = level === 'full' || holiday ? colors.danger : day.isToday ? colors.brandLink : colors.text;

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={() => onPress(day.key)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[
        t('month.cellAria', { date: fmt.dateKey(day.key), busy, total }),
        holiday ? t('cell.holidayNote', { name: holiday.name }) : null,
        priced ? t('cell.customPriceNote') : null,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <YStack
        h={CELL_H}
        ai="center"
        jc="center"
        gap={2}
        px={3}
        py={4}
        br={8}
        bg={bg}
        {...(selected ? { bw: 2, bc: colors.brandBorderStrong } : {})}
      >
        <Text
          col={numberColor}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={fontWeight.semibold}
        >
          {day.dayOfMonth}
        </Text>
        <Text
          col={tone.text}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {`${busy}/${total}`}
        </Text>
        <YStack w={BAR_W} maxWidth="100%" h={BAR_H} br={BAR_H} bg={colors.surfaceMuted} ov="hidden">
          <YStack h={BAR_H} w={`${Math.round(ratio * 100)}%`} br={BAR_H} bg={tone.bar} />
        </YStack>
      </YStack>
    </Pressable>
  );
});

/** Khối chi tiết của NGÀY đang chọn: xe trống (kèm "Tạo đơn") rồi các chuyến / lịch khoá chạm ngày. */
const DayBreakdown = memo(function DayBreakdown({
  day,
  resources,
  load,
  byId,
  onEventPress,
  onCreate,
  onDayActions,
}: {
  day: DayCell;
  resources: readonly CalendarResource[];
  load: DayLoad | undefined;
  byId: ReadonlyMap<string, CalendarResource>;
  onEventPress: (event: CalendarEvent, resource: CalendarResource) => void;
  onCreate: ((resource: CalendarResource, dayKey: string) => void) | null;
  onDayActions: ((day: DayCell) => void) | null;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  const byResource = load?.byResource;
  const free = resources.filter((r) => !byResource?.has(r.id));
  let rent = 0;
  let off = 0;
  const items: { event: CalendarEvent; resource: CalendarResource }[] = [];
  for (const [resourceId, events] of byResource ?? []) {
    const resource = byId.get(resourceId);
    if (!resource) continue;
    if (events.some(isTrip)) rent += 1;
    else off += 1;
    for (const event of events) items.push({ event, resource });
  }
  /* Chuyến trước, lịch khoá/bảo dưỡng sau; trong mỗi nhóm theo giờ bắt đầu. */
  items.sort((a, b) => {
    const trip = Number(isTrip(b.event)) - Number(isTrip(a.event));
    return trip !== 0 ? trip : a.event.startAt.localeCompare(b.event.startAt);
  });
  const busy = resources.length - free.length;
  const dateLabel = `${fmt.weekdayShort(day.at)}, ${fmt.dayMonth(day.key)}`;

  return (
    <YStack
      px={PANEL_PAD_X}
      py={PANEL_PAD_Y}
      gap={PANEL_GAP}
      br={radius.card}
      bw={1}
      bc={colors.brandShape}
      bg={colors.surface}
    >
      <XStack ai="center" jc="space-between" gap={6}>
        <Text
          f={1}
          minWidth={0}
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {t('month.daySummary', { date: dateLabel, busy, total: resources.length })}
        </Text>
        <XStack ai="center" gap={4} flexShrink={0}>
          <YStack px={8} py={2} br={radius.pill} bg={colors.successSurface}>
            <Text
              col={colors.success}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.semibold}
            >
              {t('month.free', { count: free.length })}
            </Text>
          </YStack>
          {busy > 0 ? (
            <YStack px={8} py={2} br={radius.pill} bg={colors.surfaceMuted}>
              <Text
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.medium}
              >
                {t('month.busy', { rent, off })}
              </Text>
            </YStack>
          ) : null}
          {/*
            Bảng thao tác cả-đội-xe (khoá / đặt giá hàng loạt) - ở lưới Danh sách nó mở từ đầu cột
            ngày; Lịch tháng không có đầu cột nên lối vào nằm cuối dòng tóm tắt ngày.
          */}
          {onDayActions ? (
            <Pressable
              onPress={() => onDayActions(day)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('dayPanel.trigger', { date: fmt.dateKey(day.key) })}
            >
              <LineIcon name="menu-kebab" size={20} color={colors.placeholder} />
            </Pressable>
          ) : null}
        </XStack>
      </XStack>

      {free.map((resource) => (
        <XStack
          key={resource.id}
          ai="center"
          gap={8}
          px={12}
          py={6}
          br={radius.control}
          bg={colors.background}
        >
          <YStack f={1} minWidth={0} gap={1}>
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {vehicleLine(resource)}
            </Text>
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.regular}
              numberOfLines={1}
            >
              {resource.weekdayPrice
                ? t('month.freeAllDayPrice', {
                    price: fmt.moneyCompact(resource.weekdayPrice, { price: true }),
                  })
                : t('month.freeAllDay')}
            </Text>
          </YStack>
          {onCreate ? (
            <Pressable
              onPress={() => onCreate(resource, day.key)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${t('month.create')}, ${resource.name}`}
            >
              {({ pressed }) => (
                <XStack ai="center" gap={6} opacity={pressed ? 0.6 : 1}>
                  <LineIcon name="add" size={20} color={colors.brandLink} />
                  <Text
                    col={colors.brandLink}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.semibold}
                  >
                    {t('month.create')}
                  </Text>
                </XStack>
              )}
            </Pressable>
          ) : null}
        </XStack>
      ))}

      {items.map(({ event, resource }) => (
        <DayEventCard
          key={`${event.id}-${resource.id}`}
          event={event}
          resource={resource}
          onPress={() => onEventPress(event, resource)}
        />
      ))}

    </YStack>
  );
});

function vehicleLine(resource: CalendarResource): string {
  const plate = resource.plateNumber ?? resource.code;
  return plate ? `${resource.name} · ${plate}` : resource.name;
}

/**
 * Thẻ một chuyến trong khối ngày (Figma `24729:78798`): nền `information-25` theo dịch vụ, vạch
 * trái 4×32 giữa thẻ, viên chặng nền đặc + mã đơn cùng sắc · xe · khoảng nhận → trả · tiền, tên
 * khách, thời lượng. Lịch khoá / bảo dưỡng: thẻ xám, ổ khoá + tiêu đề.
 */
const DayEventCard = memo(function DayEventCard({
  event,
  resource,
  onPress,
}: {
  event: CalendarEvent;
  resource: CalendarResource;
  onPress: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const tBoard = useTranslations('Bookings.board');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const trip = isTrip(event);
  const tone = serviceAccent(trip ? event.serviceType : null, colors);
  const stage =
    event.type === OCCUPANCY_SOURCE_TYPE.BOOKING
      ? rentalStageOfBookingStatus(event.status)
      : event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST
        ? rentalStageOfRequestStatus(event.status)
        : null;
  const group = eventStatusGroup(event);
  const badge = stage
    ? tBoard(`stage.${stage}`)
    : trip && group
      ? domainLabel(group, event.status)
      : null;
  const badgeBg = stage ? stageFill(RENTAL_STAGE_TONE[stage], colors) : colors.textPlaceholder;
  const range = fmt.rentalRange(event.startAt, event.endAt);
  const label = trip
    ? `${badge ?? ''} ${event.code ?? ''}, ${vehicleLine(resource)}, ${range}`
    : `${event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE ? t('event.blocked') : event.title}, ${vehicleLine(resource)}, ${range}`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <XStack
          ai="center"
          px={12}
          py={6}
          br={radius.control}
          bg={trip ? tone.card : colors.background}
          opacity={pressed ? 0.7 : 1}
          ov="hidden"
          {...(trip ? {} : { bw: 1, bc: colors.borderInput, borderStyle: 'dashed' as const })}
        >
          {trip ? (
            <YStack
              position="absolute"
              left={0}
              top="50%"
              mt={-16}
              w={4}
              h={32}
              bg={tone.accent}
              borderTopRightRadius={radius.control}
              borderBottomRightRadius={radius.control}
            />
          ) : null}
          <YStack f={1} minWidth={0} gap={2}>
            {trip ? (
              <XStack ai="center" jc="space-between" gap={8}>
                {badge ? (
                  <YStack px={4} py={2} br={4} bg={badgeBg} flexShrink={1}>
                    <Text
                      col={colors.textOnSolid}
                      fos={typeScale.caption.fontSize}
                      lh={typeScale.caption.lineHeight}
                      fow={fontWeight.medium}
                      numberOfLines={1}
                    >
                      {badge}
                    </Text>
                  </YStack>
                ) : (
                  <YStack />
                )}
                {event.code ? (
                  <Text
                    col={tone.accent}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {`#${event.code}`}
                  </Text>
                ) : null}
              </XStack>
            ) : (
              <XStack ai="center" gap={6}>
                <LineIcon
                  name={event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE ? 'lock-2' : 'setting-sm'}
                  size={16}
                  color={colors.textPlaceholder}
                />
                <Text
                  col={colors.placeholder}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE ? t('event.blocked') : event.title}
                </Text>
              </XStack>
            )}
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {vehicleLine(resource)}
            </Text>
            <Text
              col={colors.textMuted}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.regular}
              numberOfLines={1}
            >
              {range}
            </Text>
            {trip ? (
              <XStack ai="center" gap={8}>
                {event.amount ? (
                  <Text
                    col={colors.text}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {fmt.money(event.amount)}
                  </Text>
                ) : null}
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.textMuted}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.regular}
                  numberOfLines={1}
                >
                  {event.customerName ?? t('event.customerHidden')}
                </Text>
                <Text
                  col={tone.accent}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {fmt.rentalDuration(toAppTz(event.startAt), toAppTz(event.endAt))}
                </Text>
              </XStack>
            ) : null}
          </YStack>
        </XStack>
      )}
    </Pressable>
  );
});
