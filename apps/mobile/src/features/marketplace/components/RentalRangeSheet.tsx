import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { RentalMode } from '@xeprime/domain';
import {
  busyLevelOf,
  chargedDays,
  DAY_PARAM_FORMAT,
  EMPTY_BUSY_INDEX,
  nowInAppTz,
  rangeBusyConflict,
  type BusyDayIndex,
  type BusyLevel,
  type Dayjs,
} from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StripePattern } from '@/components/ui/StripePattern';
import { MonthGrid, useDayAccessibilityLabel, visibleDays } from '@/components/ui/MonthGrid';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

/** Giờ theo bước 30 phút — cùng `TIME_OPTIONS` của web. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  return `${hh}:${i % 2 ? '30' : '00'}`;
});

/** Thời lượng thuê giờ 1–24h — quá 24h thì chuyển tab "Thuê theo ngày" mới hợp lý. */
const HOURLY_DURATIONS = Array.from({ length: 24 }, (_, i) => i + 1);

/**
 * Màu vân của ngày bận, khớp `.busyFull` / `.busyPartial` bên web.
 *
 * Web viết bằng `color-mix(… 45%, transparent)`; RN không có hàm đó nhưng hiểu hex 8 số, nên độ
 * mờ đi ở hai chữ số cuối: 45% ≈ `73`, 35% ≈ `59`. Vân phải MỜ — nó nằm dưới con số ngày, đậm
 * lên là số hết đọc được.
 */
const BUSY_STRIPE = {
  full: `${colors.placeholder}73`,
  partial: `${colors.warning}59`,
} as const;

const DEFAULT_HOUR = 10;
const DEFAULT_HOURLY_DURATION = 4;

/** Tấm trượt chiếm 3/4 chiều cao — vẫn thấy trang phía sau, cùng cách với bộ chọn địa điểm. */
const SHEET_RATIO = 0.85;

/** Tấm trượt chọn giờ thấp hơn: 48 mục một cột, cao hơn nữa thì lớp phủ gần như biến mất. */
const TIME_SHEET_RATIO = 0.6;

const rangeStyles = StyleSheet.create({
  /** `dayContainer` của thư viện canh giữa theo chiều ngang — ô phải TRÀN cột, nếu không dải
      ngày đang chọn đứt thành bảy chấm rời thay vì một thanh liền. */
  cell: { alignSelf: 'stretch' },
});

/**
 * Trạng thái vẽ của MỘT ô ngày.
 *
 * Đi qua `markedDates` của lịch nên phải PHẲNG và so sâu được: thư viện dùng chính nó để quyết
 * định ô nào cần vẽ lại (xem docblock `MonthGrid`). Thứ gì ảnh hưởng hình hài của ô mà thiếu ở
 * đây thì ô sẽ đứng yên với trạng thái cũ.
 */
interface RentalDayMark {
  busy: BusyLevel;
  /** Quá khứ hoặc bận TRỌN ngày. Bận MỘT PHẦN vẫn bấm được — trả xe trước giờ bận là hợp lệ. */
  disabled: boolean;
  edge: 'start' | 'end' | 'both' | null;
  inRange: boolean;
}

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
  /**
   * Lịch bận của MỘT chiếc xe. Bỏ trống ở thẻ tìm kiếm trang chủ — lịch bận chỉ có nghĩa khi
   * khách đã chọn xe (trang chi tiết / luồng gửi yêu cầu).
   *
   * Đây là PREVIEW cho UX, không phải lớp bảo vệ: quyết định thật là exclusion constraint lúc
   * ghi (ADR 0006). Vì thế ngày bận trọn bị khoá, còn ngày bận một phần vẫn bấm được — trả xe
   * trước giờ bận là hợp lệ, và khoá nó đi là từ chối một khoảng khả thi.
   */
  busyDays?: BusyDayIndex;
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
 * `busyDays` là TUỲ CHỌN: thẻ tìm kiếm trang chủ không truyền (lịch bận chỉ có nghĩa khi đã
 * chọn một chiếc xe cụ thể), còn luồng gửi yêu cầu thuê thì có.
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
  busyDays = EMPTY_BUSY_INDEX,
}: RentalRangeSheetProps) {
  const t = useTranslations('Common.components.rentalRange');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const pattern = useDatePickerPattern();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Tháng mở đầu theo ngày VIỆT NAM — khách ở múi giờ khác không được thấy lịch lệch một tháng.
  const [month, setMonth] = useState<Dayjs>(() =>
    (value.pickupAt ?? nowInAppTz()).startOf('month'),
  );
  const [timeSheet, setTimeSheet] = useState<'pickupAt' | 'returnAt' | null>(null);
  /** Lịch của tab theo giờ có đang bung không. */
  const [dateOpen, setDateOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);

  /**
   * Luật chọn dải kiểu đặt phòng, tính từ NGÀY VỪA BẤM:
   *   - dải đã đủ hai đầu → cú bấm mới BẮT ĐẦU dải mới (ngày bấm = nhận, chờ chọn trả);
   *   - mới có ngày nhận → bấm sau nó = ngày trả; bấm trước nó = chọn lại ngày nhận.
   */
  const selectDay = useCallback(
    (clicked: Dayjs) => {
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
    },
    [value, minDays, onChange],
  );

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
  /*
   * `useMemo` ở đây KHÔNG phải để tiết kiệm phép tính — nó để giữ THAM CHIẾU.
   *
   * Khi chưa chọn ngày, `hourlyStart` là một mốc MỚI mỗi lần render, và nó đi vào tham số
   * của `selectHourlyDay` rồi xuống tận `DayCell`. Tham chiếu đổi mỗi render thì `memo` của 42 ô
   * lịch trượt sạch.
   */
  const hourlyStart = useMemo(
    () =>
      value.pickupAt ??
      nowInAppTz().add(1, 'day').hour(DEFAULT_HOUR).minute(0).second(0).millisecond(0),
    [value.pickupAt],
  );

  const hourlyDuration = useMemo(() => {
    if (!value.pickupAt || !value.returnAt) return DEFAULT_HOURLY_DURATION;
    const h = Math.round(value.returnAt.diff(value.pickupAt, 'minute') / 60);
    return h >= 1 && h <= 24 ? h : DEFAULT_HOURLY_DURATION;
  }, [value.pickupAt, value.returnAt]);

  const setHourly = useCallback(
    (start: Dayjs, duration: number) =>
      onChange({ pickupAt: start, returnAt: start.add(duration, 'hour') }),
    [onChange],
  );

  function switchMode(next: RentalMode) {
    onModeChange(next);
    // Sang tab giờ: chuẩn hoá ngay về "bắt đầu + thời lượng" để hai tab không đá nhau.
    if (next === 'hourly') setHourly(hourlyStart, hourlyDuration);
  }

  const complete = Boolean(value.pickupAt && value.returnAt);
  const ordered = Boolean(value.pickupAt && value.returnAt?.isAfter(value.pickupAt));
  const meetsMin = complete && ordered && chargedDays(value.pickupAt!, value.returnAt!) >= minDays;

  /**
   * Quãng bận ĐẦU TIÊN mà khoảng đang chọn đụng phải.
   *
   * Hai đầu khoảng rảnh KHÔNG có nghĩa là cả khoảng rảnh: 21→27/08 mà 25/08 bận thì bất khả
   * thi. `rangeBusyConflict` so bằng mốc tuyệt đối và nửa mở `[)` giống hệt exclusion
   * constraint, nên lời cảnh báo trên màn khớp đúng thứ server sẽ từ chối (ADR 0006).
   */
  const conflict = rangeBusyConflict(busyDays, value.pickupAt, value.returnAt);

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

  /**
   * Mốc "hôm nay" — ngày VIỆT NAM (CLAUDE.md §9), không phải ngày trên máy khách.
   *
   * `useMemo` vì nó phải ĐỨNG YÊN: nó đi vào `marks`, mà một mốc mới mỗi lần render sẽ làm
   * `memo` của 42 ô lịch trượt sạch.
   */
  const today = useMemo(() => nowInAppTz().startOf('day'), []);

  /*
   * Chỉ đổi NGÀY, giữ nguyên giờ bắt đầu và thời lượng — đúng như web:
   * `d.hour(hourlyStart.hour()).minute(hourlyStart.minute())`.
   */
  const selectHourlyDay = useCallback(
    (day: Dayjs) => {
      setHourly(
        day.hour(hourlyStart.hour()).minute(hourlyStart.minute()).second(0).millisecond(0),
        hourlyDuration,
      );
      setDateOpen(false);
    },
    [setHourly, hourlyStart, hourlyDuration],
  );

  /**
   * Trạng thái vẽ của cả trang lịch.
   *
   * Tab theo giờ chỉ có MỘT ngày, tab theo ngày có cả dải — hai tab không bao giờ hiện cùng lúc
   * nên chỉ dựng `marks` cho tab đang mở.
   */
  const rangeStart = hourly ? hourlyStart : value.pickupAt;
  const rangeEnd = hourly ? null : value.returnAt;
  const startAt = rangeStart?.valueOf() ?? null;
  const endAt = rangeEnd?.valueOf() ?? null;

  const marks = useMemo(() => {
    const out: Record<string, RentalDayMark> = {};
    for (const day of visibleDays(month)) {
      const busy = busyLevelOf(busyDays, day);
      const isPickup = Boolean(rangeStart && day.isSame(rangeStart, 'day'));
      const isReturn = Boolean(rangeEnd && day.isSame(rangeEnd, 'day'));
      out[day.format(DAY_PARAM_FORMAT)] = {
        busy,
        disabled: day.isBefore(today, 'day') || busy === 'full',
        edge: isPickup && isReturn ? 'both' : isPickup ? 'start' : isReturn ? 'end' : null,
        inRange: Boolean(
          rangeStart && rangeEnd && day.isAfter(rangeStart, 'day') && day.isBefore(rangeEnd, 'day'),
        ),
      };
    }
    return out;
    // Theo dõi hai đầu dải bằng MỐC: `Dayjs` là đối tượng mới sau mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, busyDays, today, startAt, endAt]);

  /** Tham chiếu phải ĐỨNG YÊN, và ô chỉ được vẽ từ đối số — xem docblock `MonthGrid`. */
  const renderDay = useCallback(
    ({
      day,
      mark,
      onPress,
    }: {
      day: Dayjs;
      mark: RentalDayMark | undefined;
      onPress: () => void;
    }) => <DayCell day={day} mark={mark} onPress={onPress} />,
    [],
  );

  /**
   * Lịch tháng — DÙNG CHUNG cho cả hai tab.
   *
   * Tab theo giờ bên web mở `DatePicker` chọn MỘT ngày; native không nhét thêm một tầng modal
   * nữa mà bung chính lịch này ngay dưới ô "Ngày bắt đầu" — cùng dữ liệu, cùng luật chặn ngày,
   * chỉ khác cách trưng ra.
   */
  const calendar = (
    <MonthGrid
      month={month}
      onMonthChange={setMonth}
      marks={marks}
      onDayPress={hourly ? selectHourlyDay : selectDay}
      renderDay={renderDay}
      legend={
        /* Bốn ô mẫu, đúng bốn mục và đúng thứ tự của `.legend` bên web. */
        busyDays.size > 0 ? (
          <XStack flexWrap="wrap" columnGap={space.md} rowGap={space.xs} ai="center">
            <LegendItem label={t('busy.legendSelected')} fill={colors.primary} />
            <LegendItem label={t('busy.legendInRange')} fill={colors.surfaceSelected} bordered />
            <LegendItem
              label={t('busy.legendFull')}
              fill={colors.surfaceMuted}
              stripe={BUSY_STRIPE.full}
            />
            <LegendItem label={t('busy.legendPartial')} stripe={BUSY_STRIPE.partial} bordered />
          </XStack>
        ) : null
      }
    />
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onCancel}>
      {/*
        Lớp phủ chỉ chiếm phần TRÊN tấm trượt, và tấm trượt là anh em chứ không phải con của nó.

        Trước đây tấm trượt nằm TRONG một `Pressable` (để chặn cú chạm lọt xuống lớp phủ) — và
        chính `Pressable` đó nuốt cử chỉ kéo, làm vùng cuộn bên trong gần như không kéo được.
        Tách ra thì chạm vào tấm trượt không bao giờ tới lớp phủ, mà cũng chẳng có gì chặn cuộn.
      */}
      <YStack f={1}>
        <Pressable style={appStyles.scrim} onPress={onCancel} />
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
                          <Ionicons
                            name="calendar-outline"
                            size={iconSize.sm}
                            color={colors.textMuted}
                          />
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
                      {calendar}
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
                  {calendar}

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
                  <XStack gap={space.xs}>
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

              {conflict ? (
                <XStack ai="flex-start" gap={space.xs}>
                  <Ionicons name="alert-circle" size={iconSize.sm} color={colors.danger} />
                  <Text f={1} col={colors.danger} fos={fontSize.bodySm}>
                    {/*
                      `fmt.rentalPoint`, không phải `fmt.dateKey` — cùng bộ định dạng với web
                      ("T2, 31/08 · 00:00"). `dateKey` chỉ in ngày trần, mất mất GIỜ, mà giờ mới
                      là thứ đang đụng nhau ở đây.
                    */}
                    {t('busy.conflict', {
                      period: t('busy.period', {
                        start: conflict.startAt.format('HH:mm'),
                        end: conflict.endAt.format('HH:mm'),
                      }),
                      date: fmt.rentalPoint(conflict.startAt),
                    })}
                  </Text>
                </XStack>
              ) : null}

              <XStack gap={space.sm}>
                <YStack f={1}>
                  <Button
                    label={tCommon('actions.cancel')}
                    variant="secondary"
                    onPress={onCancel}
                  />
                </YStack>
                <YStack f={1}>
                  <Button
                    label={tCommon('actions.apply')}
                    onPress={onApply}
                    disabled={!meetsMin || conflict !== null}
                  />
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

/**
 * Một mục chú giải: ô mẫu 18×14 + nhãn, cùng kích thước `.swatch` của web.
 *
 * Ô mẫu vẽ ĐÚNG thứ ô ngày vẽ (nền + vân), không phải một biểu tượng gợi ý — chú giải chỉ có
 * ích khi mẫu và vật thật là một.
 */
function LegendItem({
  label,
  fill,
  stripe,
  bordered = false,
}: {
  label: string;
  fill?: string;
  stripe?: string;
  bordered?: boolean;
}) {
  return (
    <XStack ai="center" gap={6}>
      <YStack
        w={18}
        h={14}
        br={radius.sm}
        ov="hidden"
        bg={fill ?? 'transparent'}
        bw={bordered ? 1 : 0}
        bc={colors.border}
      >
        {stripe ? <StripePattern color={stripe} size={40} /> : null}
      </YStack>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
    </XStack>
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

/**
 * Một ô ngày. Hai đầu dải tô đậm, ngày ở giữa tô nhạt — cùng cách web đọc một khoảng.
 *
 * Không cần `memo`: `Day` của thư viện đã so sâu `mark` và bỏ qua ô không đổi (docblock
 * `MonthGrid`). Mọi thứ ô này vẽ đều đọc từ `mark`, nên phép so đó là đủ và đúng.
 *
 * Ngày của tháng KỀ vẫn CHỌN ĐƯỢC — cùng luật với web, nơi `.rdp-outside` không có rule nào: ô
 * chỉ mờ đi khi thật sự bị khoá (quá khứ / bận trọn). Vì thế `state` mà thư viện gán cho ô ngoài
 * tháng (`'disabled'`) bị BỎ QUA ở đây; tô mờ chúng thì 1–5/9 nhìn hệt 26–31/7 đã qua, trong khi
 * một bên chọn được còn một bên không.
 */
function DayCell({
  day,
  mark,
  onPress,
}: {
  day: Dayjs;
  mark: RentalDayMark | undefined;
  onPress: () => void;
}) {
  const dayLabel = useDayAccessibilityLabel();
  const tBusy = useTranslations('Common.components.rentalRange.busy');

  const busy = mark?.busy ?? 'free';
  const disabled = mark?.disabled ?? false;
  const inRange = mark?.inRange ?? false;
  const isPickup = mark?.edge === 'start' || mark?.edge === 'both';
  const isReturn = mark?.edge === 'end' || mark?.edge === 'both';
  const edge = isPickup || isReturn;

  /** Màu vân của ô, `null` = ngày rảnh. Cùng hai tông với `.busyFull` / `.busyPartial` của web. */
  const stripe =
    busy === 'full' ? BUSY_STRIPE.full : busy === 'partial' ? BUSY_STRIPE.partial : null;

  /*
   * `accessibilityState` lo phần trạng thái chọn/khoá; phần CHỮ gánh những gì state không diễn
   * đạt được: NGÀY NÀO, và VÌ SAO khoá (bận cả ngày) hay cần lưu ý (bận một phần).
   */
  const note =
    busy === 'full' ? tBusy('legendFull') : busy === 'partial' ? tBusy('legendPartial') : undefined;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={rangeStyles.cell}
      accessibilityRole="button"
      accessibilityLabel={dayLabel(day, note)}
      accessibilityState={{ selected: edge || inRange, disabled }}
    >
      <YStack
        h={sizing.touchTarget}
        ai="center"
        jc="center"
        ov="hidden"
        bg={
          edge
            ? colors.primary
            : inRange
              ? colors.surfaceSelected
              : busy === 'full'
                ? colors.surfaceMuted
                : 'transparent'
        }
        borderTopLeftRadius={isPickup ? radius.md : 0}
        borderBottomLeftRadius={isPickup ? radius.md : 0}
        borderTopRightRadius={isReturn ? radius.md : 0}
        borderBottomRightRadius={isReturn ? radius.md : 0}
      >
        {/*
          Vân gạch chéo, cùng hai tông với web: bận TRỌN ngày là vân xám trên nền `bg-muted`,
          bận VÀI GIỜ là vân cam cảnh báo trên nền trong suốt (ngày đó vẫn chọn được — nhận hoặc
          trả ngoài khung bận là hợp lệ).

          Hai đầu khoảng đã tô nền vàng đặc nên bỏ hẳn vân ở đó, y như `.rdp-range_start.busyPartial`
          của web — vân chồng lên nền đặc chỉ làm bẩn.
        */}
        {stripe && !edge ? <StripePattern color={stripe} /> : null}

        <Text
          col={edge ? colors.onPrimary : disabled ? colors.textDisabled : colors.text}
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
        <Pressable style={appStyles.scrim} onPress={onClose} />
        <YStack>
          <YStack
            maxHeight={height * TIME_SHEET_RATIO}
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
