import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { RentalMode } from '@xeprime/domain';
import { nowInAppTz, type Dayjs } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

/** Giờ theo bước 30 phút — cùng `TIME_OPTIONS` của web. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  return `${hh}:${i % 2 ? '30' : '00'}`;
});

/** Thời lượng thuê giờ 1–24h — quá 24h thì chuyển tab "Thuê theo ngày" mới hợp lý. */
const HOURLY_DURATIONS = Array.from({ length: 24 }, (_, i) => i + 1);

const DEFAULT_HOUR = 10;
const DEFAULT_HOURLY_DURATION = 4;

/** Tấm trượt chiếm 3/4 chiều cao — vẫn thấy trang phía sau, cùng cách với bộ chọn địa điểm. */
const SHEET_RATIO = 0.85;

export interface RentalRangeDraft {
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
}

interface RentalRangeSheetProps {
  open: boolean;
  value: RentalRangeDraft;
  mode: RentalMode;
  onChange: (next: RentalRangeDraft) => void;
  onModeChange: (mode: RentalMode) => void;
  onApply: () => void;
  onCancel: () => void;
  /**
   * Sàn số ngày tính tiền (cùng công thức backend: `ceil(Δ/24h)`). >1 thì ẩn tab "Thuê theo
   * giờ" — thuê dài hạn không có ngữ nghĩa giờ.
   */
  minDays?: number;
}

/**
 * Hộp chọn khoảng thuê — bản native của `components/form/RentalRangePanel.tsx`.
 *
 * Hai tab, MỘT giá trị `{pickupAt, returnAt}`:
 *
 * - **Thuê theo ngày**: lịch chọn một DẢI. Luật chọn kiểu đặt phòng, tính từ ngày vừa bấm:
 *   dải đã đủ hai đầu → cú bấm mới bắt đầu dải mới; mới có ngày nhận → bấm sau nó là ngày trả,
 *   bấm trước nó là chọn lại ngày nhận. Lịch và giá trị là MỘT nguồn nên phần tô sáng không thể
 *   lệch với dòng tóm tắt.
 * - **Thuê theo giờ**: ngày bắt đầu + giờ nhận + THỜI LƯỢNG; giờ trả là giá trị DẪN XUẤT
 *   (bắt đầu + thời lượng), khách không phải tự cộng giờ.
 *
 * Không nhận `busyDays`: thẻ tìm kiếm trang chủ của web cũng không truyền — lịch bận chỉ có
 * nghĩa khi đã chọn một chiếc xe cụ thể (trang chi tiết).
 *
 * Tất cả chỉ là preview (ADR 0006): quyết định thật là exclusion constraint lúc ghi.
 */
export function RentalRangeSheet({
  open,
  value,
  mode,
  onChange,
  onModeChange,
  onApply,
  onCancel,
  minDays = 1,
}: RentalRangeSheetProps) {
  const t = useTranslations('Common.components.rentalRange');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const pattern = useDatePickerPattern();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [month, setMonth] = useState<Dayjs>(() =>
    (value.pickupAt ?? nowInAppTz()).startOf('month'),
  );
  const [timeSheet, setTimeSheet] = useState<'pickupAt' | 'returnAt' | null>(null);
  /** Lịch của tab theo giờ có đang bung không. */
  const [dateOpen, setDateOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);

  /** Số ngày TÍNH TIỀN — trùng công thức `PricingService.chargedDays` để hai tầng không lệch. */
  const chargedDays = (a: Dayjs, b: Dayjs) => Math.max(1, Math.ceil(b.diff(a, 'minute') / 1440));

  const timeOf = (d: Dayjs | null) =>
    d ? d.format('HH:mm') : `${String(DEFAULT_HOUR).padStart(2, '0')}:00`;

  /** Gắn giờ đang chọn (hoặc mặc định) vào một ngày trên lịch. */
  const withTime = (day: Dayjs, current: Dayjs | null): Dayjs => {
    const [h, m] = timeOf(current).split(':').map(Number);
    return day
      .hour(h ?? DEFAULT_HOUR)
      .minute(m ?? 0)
      .second(0)
      .millisecond(0);
  };

  /**
   * Luật chọn dải kiểu đặt phòng, tính từ NGÀY VỪA BẤM:
   *   - dải đã đủ hai đầu → cú bấm mới BẮT ĐẦU dải mới (ngày bấm = nhận, chờ chọn trả);
   *   - mới có ngày nhận → bấm sau nó = ngày trả; bấm trước nó = chọn lại ngày nhận.
   */
  function selectDay(clicked: Dayjs) {
    const clickedDay = clicked.startOf('day');

    if (!value.pickupAt || (value.pickupAt && value.returnAt)) {
      onChange({ pickupAt: withTime(clicked, value.pickupAt), returnAt: null });
      return;
    }
    if (clickedDay.isBefore(value.pickupAt.startOf('day'))) {
      onChange({ pickupAt: withTime(clicked, value.pickupAt), returnAt: null });
      return;
    }

    let returnAt = withTime(clicked, value.returnAt);
    if (!returnAt.isAfter(value.pickupAt)) {
      returnAt = value.pickupAt.add(Math.max(1, minDays), 'day');
    } else if (chargedDays(value.pickupAt, returnAt) < minDays) {
      // Lưới an toàn cho ca lệch giờ — lịch đã khoá các ngày trả dưới sàn.
      returnAt = withTime(value.pickupAt.add(minDays, 'day'), value.returnAt);
    }
    onChange({ pickupAt: value.pickupAt, returnAt });
  }

  function setTime(which: 'pickupAt' | 'returnAt', hhmm: string) {
    const base = value[which];
    if (!base) return;
    const [h, m] = hhmm.split(':').map(Number);
    onChange({
      ...value,
      [which]: base
        .hour(h ?? 0)
        .minute(m ?? 0)
        .second(0)
        .millisecond(0),
    });
  }

  // --- Thuê theo giờ: giờ trả = bắt đầu + thời lượng ---------------------------------------
  const hourlyStart =
    value.pickupAt ??
    nowInAppTz().add(1, 'day').hour(DEFAULT_HOUR).minute(0).second(0).millisecond(0);

  const hourlyDuration = (() => {
    if (!value.pickupAt || !value.returnAt) return DEFAULT_HOURLY_DURATION;
    const h = Math.round(value.returnAt.diff(value.pickupAt, 'minute') / 60);
    return h >= 1 && h <= 24 ? h : DEFAULT_HOURLY_DURATION;
  })();

  const setHourly = (start: Dayjs, duration: number) =>
    onChange({ pickupAt: start, returnAt: start.add(duration, 'hour') });

  function switchMode(next: RentalMode) {
    onModeChange(next);
    // Sang tab giờ: chuẩn hoá ngay về "bắt đầu + thời lượng" để hai tab không đá nhau.
    if (next === 'hourly') setHourly(hourlyStart, hourlyDuration);
  }

  const complete = Boolean(value.pickupAt && value.returnAt);
  const ordered = Boolean(value.pickupAt && value.returnAt?.isAfter(value.pickupAt));
  const meetsMin = complete && ordered && chargedDays(value.pickupAt!, value.returnAt!) >= minDays;

  const hourly = mode === 'hourly';

  /**
   * Thời lượng HIỂN THỊ dùng `fmt.rentalDuration`, KHÔNG phải `chargedDays`.
   *
   * Hai công thức khác nhau và cả hai đều đúng việc của nó:
   *   - `chargedDays` = `ceil(Δ/24h)` — số ngày TÍNH TIỀN, trùng `PricingService`. Chỉ dùng để
   *     xét sàn `minDays`.
   *   - `rentalDuration` = `floor` ngày + phần giờ dư — thời lượng THẬT của chuyến.
   *
   * 25/08 01:30 → 27/08 16:00 là 62,5 giờ: tính tiền 3 ngày, nhưng thời lượng là "2 ngày 15 giờ".
   * In số tính tiền vào dòng này là nói với khách rằng họ thuê 3 ngày.
   */
  const durationLabel =
    complete && ordered ? fmt.rentalDuration(value.pickupAt!, value.returnAt!) : '';

  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  // "Hôm nay" là ngày Việt Nam (CLAUDE.md §9) — không phải ngày trên máy của khách.
  const today = nowInAppTz().startOf('day');
  const canGoBack = month.isAfter(today.startOf('month'));

  /**
   * Lịch tháng — DÙNG CHUNG cho cả hai tab.
   *
   * Tab theo giờ bên web mở `DatePicker` chọn MỘT ngày; native không nhét thêm một tầng modal
   * nữa mà bung chính lịch này ngay dưới ô "Ngày bắt đầu" — cùng dữ liệu, cùng luật chặn ngày,
   * chỉ khác cách trưng ra.
   */
  function renderCalendar({
    selected,
    range,
    onDay,
  }: {
    selected: Dayjs | null;
    /** Có tô dải tới ngày trả hay không — tab theo giờ chỉ có một ngày. */
    range: boolean;
    onDay: (day: Dayjs) => void;
  }) {
    return (
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between">
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            {fmt.monthYear(month.toDate())}
          </Text>
          <XStack gap={space.xs}>
            <IconButton
              icon="chevron-back"
              label={tCommon('actions.previous')}
              onPress={() => setMonth((m) => m.subtract(1, 'month'))}
              disabled={!canGoBack}
              size={18}
            />
            <IconButton
              icon="chevron-forward"
              label={tCommon('actions.next')}
              onPress={() => setMonth((m) => m.add(1, 'month'))}
              size={18}
            />
          </XStack>
        </XStack>

        <XStack>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <YStack key={weekday} f={1} ai="center">
              <Text col={colors.textMuted} fos={fontSize.label}>
                {tCommon(`weekdayShort.${weekday}` as never)}
              </Text>
            </YStack>
          ))}
        </XStack>

        <YStack>
          {weeks.map((week, row) => (
            <XStack key={row}>
              {week.map((cell) => (
                <DayCell
                  key={cell.date.toISOString()}
                  cell={cell}
                  pickupAt={selected}
                  returnAt={range ? value.returnAt : null}
                  today={today}
                  onPress={onDay}
                />
              ))}
            </XStack>
          ))}
        </YStack>
      </YStack>
    );
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onCancel}>
      {/*
        Lớp phủ chỉ chiếm phần TRÊN tấm trượt, và tấm trượt là anh em chứ không phải con của nó.

        Trước đây tấm trượt nằm TRONG một `Pressable` (để chặn cú chạm lọt xuống lớp phủ) — và
        chính `Pressable` đó nuốt cử chỉ kéo, làm vùng cuộn bên trong gần như không kéo được.
        Tách ra thì chạm vào tấm trượt không bao giờ tới lớp phủ, mà cũng chẳng có gì chặn cuộn.
      */}
      <YStack f={1}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onCancel} />
        <YStack>
          <YStack
            maxHeight={height * SHEET_RATIO}
            bg={colors.surface}
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            pb={insets.bottom}
          >
            <XStack ai="center" gap={space.xs} px={space.sm} pt={space.sm}>
              <IconButton icon="close" label={tCommon('actions.cancel')} onPress={onCancel} />
              <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('drawerTitle')}
              </Text>
            </XStack>

            {/* Dài hạn (`minDays > 1`) không có ngữ nghĩa giờ — web ẩn hẳn tab, native cũng vậy. */}
            {minDays === 1 ? (
              <XStack
                px={layout.screenX}
                borderBottomWidth={1}
                bc={colors.borderSubtle}
                accessibilityRole="tablist"
                accessibilityLabel={t('modeTablist')}
              >
                <ModeTab
                  label={t('modeDaily')}
                  active={!hourly}
                  onPress={() => switchMode('daily')}
                />
                <ModeTab
                  label={t('modeHourly')}
                  active={hourly}
                  onPress={() => switchMode('hourly')}
                />
              </XStack>
            ) : null}

            <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
              {hourly ? (
                <YStack gap={space.md}>
                  <XStack gap={space.sm}>
                    <Field label={t('startDate')} grow>
                      <Pressable
                        onPress={() => {
                          // Mở là nhảy về tháng của ngày đang chọn — không để người dùng tự dò.
                          if (!dateOpen) setMonth(hourlyStart.startOf('month'));
                          setDateOpen((v) => !v);
                        }}
                      >
                        <Box>
                          <Text f={1} col={colors.text} fos={fontSize.body}>
                            {hourlyStart.format(pattern.date)}
                          </Text>
                          <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                        </Box>
                      </Pressable>
                    </Field>

                    <Field label={t('pickupTime')} grow>
                      <Pressable onPress={() => setTimeSheet('pickupAt')}>
                        <Box>
                          <Text f={1} col={colors.text} fos={fontSize.body}>
                            {hourlyStart.format('HH:mm')}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                        </Box>
                      </Pressable>
                    </Field>
                  </XStack>

                  {dateOpen ? (
                    <YStack
                      bw={1}
                      bc={colors.border}
                      br={radius.md}
                      p={space.sm}
                      accessibilityLabel={t('startDate')}
                    >
                      {renderCalendar({
                        selected: hourlyStart,
                        range: false,
                        onDay: (day) => {
                          /*
                           * Chỉ đổi NGÀY, giữ nguyên giờ bắt đầu và thời lượng — đúng như web:
                           * `d.hour(hourlyStart.hour()).minute(hourlyStart.minute())`.
                           */
                          setHourly(
                            day
                              .hour(hourlyStart.hour())
                              .minute(hourlyStart.minute())
                              .second(0)
                              .millisecond(0),
                            hourlyDuration,
                          );
                          setDateOpen(false);
                        },
                      })}
                    </YStack>
                  ) : null}

                  <Field label={t('duration')}>
                    <Pressable onPress={() => setDurationOpen((v) => !v)}>
                      <Box>
                        <Text f={1} col={colors.text} fos={fontSize.body} numberOfLines={1}>
                          {t('durationOption', {
                            duration: tCommon('units.hour', { count: hourlyDuration }),
                            time: hourlyStart.add(hourlyDuration, 'hour').format(pattern.dateTime),
                          })}
                        </Text>
                        <Ionicons
                          name={durationOpen ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={colors.textMuted}
                        />
                      </Box>
                    </Pressable>
                  </Field>

                  {/*
                    Danh sách thời lượng KHÔNG có vùng cuộn riêng: một `ScrollView` lồng trong
                    `ScrollView` khiến cả tấm trượt khó cuộn — ngón tay đặt trúng danh sách thì
                    vùng ngoài không nhận cử chỉ, đặt ngoài thì danh sách không nhận. Cả tấm chỉ
                    có ĐÚNG MỘT vùng cuộn, và 24 dòng trải hết ra trong đó.
                  */}
                  {durationOpen ? (
                    <YStack bw={1} bc={colors.border} br={radius.md} ov="hidden">
                      <YStack>
                        {HOURLY_DURATIONS.map((hours) => {
                          const selected = hours === hourlyDuration;
                          return (
                            <Pressable
                              key={hours}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              onPress={() => {
                                setHourly(hourlyStart, hours);
                                setDurationOpen(false);
                              }}
                            >
                              <XStack
                                ai="center"
                                gap={space.sm}
                                px={layout.screenX}
                                minHeight={sizing.touchTarget}
                                bg={selected ? colors.surfaceSelected : 'transparent'}
                              >
                                <Ionicons
                                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                                  size={17}
                                  color={selected ? colors.primary : colors.border}
                                />
                                <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                                  {tCommon('units.hour', { count: hours })}
                                </Text>
                                <Text col={colors.textMuted} fos={fontSize.label}>
                                  {t('durationEndsAt', {
                                    time: hourlyStart.add(hours, 'hour').format(pattern.dateTime),
                                  })}
                                </Text>
                              </XStack>
                            </Pressable>
                          );
                        })}
                      </YStack>
                    </YStack>
                  ) : null}
                </YStack>
              ) : (
                <YStack gap={space.md}>
                  {renderCalendar({ selected: value.pickupAt, range: true, onDay: selectDay })}

                  <XStack gap={space.sm}>
                    <Field label={t('pickupTime')} grow>
                      <Pressable
                        disabled={!value.pickupAt}
                        onPress={() => setTimeSheet('pickupAt')}
                      >
                        <Box muted={!value.pickupAt}>
                          <Text f={1} col={colors.text} fos={fontSize.body}>
                            {timeOf(value.pickupAt)}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                        </Box>
                      </Pressable>
                    </Field>

                    <Field label={t('returnTime')} grow>
                      <Pressable
                        disabled={!value.returnAt}
                        onPress={() => setTimeSheet('returnAt')}
                      >
                        <Box muted={!value.returnAt}>
                          <Text f={1} col={colors.text} fos={fontSize.body}>
                            {timeOf(value.returnAt)}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                        </Box>
                      </Pressable>
                    </Field>
                  </XStack>
                </YStack>
              )}
            </ScrollView>

            <YStack px={layout.screenX} pt={space.sm} pb={space.md} gap={space.sm}>
              {complete && ordered ? (
                <YStack gap={2}>
                  {/* Dòng mốc là kết quả của cả thao tác chọn — đậm vừa (600) để nổi hơn nhãn
                      quanh nó mà không tranh chỗ với con số thời lượng bên dưới. */}
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {fmt.rentalPoint(value.pickupAt!)} – {fmt.rentalPoint(value.returnAt!)}
                  </Text>
                  <XStack gap={4}>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('duration')}:
                    </Text>
                    <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {durationLabel}
                    </Text>
                  </XStack>
                </YStack>
              ) : (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {minDays > 1
                    ? t('placeholderMinDays', { count: minDays })
                    : complete && !ordered
                      ? t('returnBeforePickup')
                      : t('placeholder')}
                </Text>
              )}

              <XStack gap={space.sm}>
                <YStack f={1}>
                  <Button
                    label={tCommon('actions.cancel')}
                    variant="secondary"
                    onPress={onCancel}
                  />
                </YStack>
                <YStack f={1}>
                  <Button label={tCommon('actions.apply')} onPress={onApply} disabled={!meetsMin} />
                </YStack>
              </XStack>
            </YStack>
          </YStack>
        </YStack>
      </YStack>

      {timeSheet ? (
        <TimeSheet
          title={timeSheet === 'pickupAt' ? t('pickupTime') : t('returnTime')}
          current={
            timeSheet === 'pickupAt'
              ? timeOf(hourly ? hourlyStart : value.pickupAt)
              : timeOf(value.returnAt)
          }
          onClose={() => setTimeSheet(null)}
          onSelect={(hhmm) => {
            if (hourly) {
              const [h, m] = hhmm.split(':').map(Number);
              setHourly(
                hourlyStart
                  .hour(h ?? 0)
                  .minute(m ?? 0)
                  .second(0)
                  .millisecond(0),
                hourlyDuration,
              );
            } else {
              setTime(timeSheet, hhmm);
            }
            setTimeSheet(null);
          }}
        />
      ) : null}
    </Modal>
  );
}

/** Tab chế độ. Gạch dưới ở tab đang chọn — cùng cách web phân biệt hai cách tính thời gian. */
function ModeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <YStack
        px={layout.screenX}
        py={space.sm}
        borderBottomWidth={2}
        bc={active ? colors.primary : 'transparent'}
      >
        <Text
          col={active ? colors.text : colors.textMuted}
          fos={fontSize.body}
          fow={active ? fontWeight.semibold : fontWeight.regular}
        >
          {label}
        </Text>
      </YStack>
    </Pressable>
  );
}

/** Một ô ngày. Hai đầu dải tô đậm, ngày ở giữa tô nhạt — cùng cách web đọc một khoảng. */
function DayCell({
  cell,
  pickupAt,
  returnAt,
  today,
  onPress,
}: {
  cell: GridDay;
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
  today: Dayjs;
  onPress: (day: Dayjs) => void;
}) {
  const day = cell.date;

  // Ngày của tháng kề chỉ để lấp tuần — bấm được thì lịch nhảy tháng ngay dưới ngón tay.
  const past = cell.outside || day.isBefore(today, 'day');
  const isPickup = Boolean(pickupAt && day.isSame(pickupAt, 'day'));
  const isReturn = Boolean(returnAt && day.isSame(returnAt, 'day'));
  const inRange = Boolean(
    pickupAt && returnAt && day.isAfter(pickupAt, 'day') && day.isBefore(returnAt, 'day'),
  );
  const edge = isPickup || isReturn;

  return (
    <Pressable
      disabled={past}
      onPress={() => onPress(day)}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityState={{ selected: edge || inRange, disabled: past }}
    >
      <YStack
        h={sizing.touchTarget}
        ai="center"
        jc="center"
        bg={edge ? colors.primary : inRange ? colors.primaryLight : 'transparent'}
        borderTopLeftRadius={isPickup ? radius.md : 0}
        borderBottomLeftRadius={isPickup ? radius.md : 0}
        borderTopRightRadius={isReturn ? radius.md : 0}
        borderBottomRightRadius={isReturn ? radius.md : 0}
      >
        <Text
          col={
            cell.outside
              ? colors.border
              : past
                ? colors.textDisabled
                : edge
                  ? colors.onPrimary
                  : colors.text
          }
          fos={fontSize.bodySm}
          fow={edge ? fontWeight.bold : fontWeight.regular}
        >
          {day.date()}
        </Text>
      </YStack>
    </Pressable>
  );
}

/** Chọn giờ theo bước 30 phút. Tấm trượt riêng vì 48 mục không vừa một hàng chip. */
function TimeSheet({
  title,
  current,
  onClose,
  onSelect,
}: {
  title: string;
  current: string;
  onClose: () => void;
  onSelect: (hhmm: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Lớp phủ là ANH EM của tấm trượt, không phải cha — xem ghi chú ở tấm trượt chính. */}
      <YStack f={1}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
        <YStack>
          <YStack
            maxHeight={height * 0.6}
            bg={colors.surface}
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            pb={insets.bottom}
          >
            <Text
              col={colors.text}
              fos={fontSize.body}
              fow={fontWeight.semibold}
              px={layout.screenX}
              py={space.md}
            >
              {title}
            </Text>
            <ScrollView>
              {TIME_OPTIONS.map((hhmm) => {
                const selected = hhmm === current;
                return (
                  <Pressable
                    key={hhmm}
                    onPress={() => onSelect(hhmm)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <XStack
                      ai="center"
                      jc="space-between"
                      px={layout.screenX}
                      minHeight={sizing.touchTarget}
                      bg={selected ? colors.surfaceSelected : 'transparent'}
                    >
                      <Text
                        col={colors.text}
                        fos={fontSize.body}
                        fow={selected ? fontWeight.semibold : fontWeight.regular}
                      >
                        {hhmm}
                      </Text>
                      {selected ? (
                        <Ionicons name="checkmark" size={17} color={colors.primaryActive} />
                      ) : null}
                    </XStack>
                  </Pressable>
                );
              })}
            </ScrollView>
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}

function Field({
  label,
  grow = false,
  children,
}: {
  label: string;
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <YStack gap={space.xs} {...(grow ? { f: 1 } : {})}>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      {children}
    </YStack>
  );
}

function Box({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <XStack
      ai="center"
      gap={space.xs}
      bg={muted ? colors.surfaceMuted : colors.surface}
      br={radius.md}
      bw={1}
      bc={colors.border}
      px={layout.screenX}
      minHeight={sizing.touchTarget}
    >
      {children}
    </XStack>
  );
}

interface GridDay {
  date: Dayjs;
  /** Thuộc tháng TRƯỚC hoặc SAU — hiện để lấp đầy tuần, không chọn được. */
  outside: boolean;
}

/**
 * Lưới 7 cột của một tháng, hai đầu lấp bằng ngày của tháng KỀ.
 *
 * Không để ô trống: một tuần cụt ở hai đầu làm lịch trông như dữ liệu bị thiếu, và mắt mất chỗ
 * bám khi dò cột thứ. Web (react-day-picker) cũng hiện những ngày này — đây là cách một cuốn
 * lịch giấy vẫn in.
 *
 * `day()` của Day.js: 0 = Chủ nhật, khớp thứ tự nhãn `Common.weekdayShort.0…6`.
 */
function buildMonthGrid(month: Dayjs): GridDay[][] {
  const first = month.startOf('month');
  const cells: GridDay[] = [];

  // Đầu tuần đầu tiên: đếm ngược từ ngày 1 sang tháng trước.
  for (let i = first.day(); i > 0; i -= 1) {
    cells.push({ date: first.subtract(i, 'day'), outside: true });
  }
  for (let date = 1; date <= month.daysInMonth(); date += 1) {
    cells.push({ date: first.date(date), outside: false });
  }
  // Đuôi tuần cuối: đếm tiếp sang tháng sau cho tròn 7 cột.
  const last = first.endOf('month');
  for (let i = 1; cells.length % 7 !== 0; i += 1) {
    cells.push({ date: last.add(i, 'day'), outside: true });
  }

  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}
