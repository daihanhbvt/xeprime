import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { dayjs, DAY_PARAM_FORMAT, type Dayjs } from '@xeprime/domain';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { MonthGrid, visibleDays } from './MonthGrid';
import { StepSlider } from './StepSlider';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

interface DayMark {
  selected: boolean;
  disabled: boolean;
}

const styles = StyleSheet.create({
  /** `dayContainer` của thư viện canh giữa theo chiều ngang — ô phải TRÀN cột mới bấm trúng. */
  cell: { alignSelf: 'stretch' },
});

/**
 * Kéo theo TỪNG PHÚT, không nhảy 15 một.
 *
 * Năm con số 00 · 15 · 30 · 45 · 60 dưới ray chỉ là MỐC ĐỌC để định vị, không phải các nấc mà
 * núm được phép dừng. Khoá nấc ở 15 thì một chuyến hẹn 08:20 không ghi được, mà giờ hẹn ở quầy
 * thì không ai làm tròn theo phần tư giờ.
 *
 * Đây là chỗ RỘNG HƠN web: `DateTimeField` bên đó đặt `minuteStep: 15`. Rộng hơn thì mọi mốc
 * web ghi được app đều ghi được — không có đơn nào của web mở trên app mà hiện sai giờ.
 */
const MINUTE_STEP = 1;

/**
 * Thanh phút chạy tới 60, không dừng ở 45.
 *
 * 60 là một mốc THẬT chứ không phải một số dư: nó nghĩa là "đúng đầu giờ kế tiếp", và người ở
 * quầy hay chốt tròn giờ hơn bất kỳ mốc nào khác. Không có nó thì muốn 09:00 phải bỏ thanh phút
 * mà quay lên kéo thanh giờ.
 *
 * Lúc chốt, 60 được quy về giờ+1 phút 00 (xem `applyMinute`) — `08:60` không phải một mốc có
 * thật, và để nó lọt xuống server là ghi một giờ không tồn tại.
 */
const MINUTE_MAX = 60;

const pad = (value: number) => String(value).padStart(2, '0');

/** Năm mốc đọc được trên thanh giờ — đủ định vị mà không thành một hàng số dày đặc. */
const HOUR_TICKS = [0, 6, 12, 18, 23].map((hour) => ({
  value: hour,
  label: `${pad(hour)}:00`,
}));

/** Mốc ĐỌC của thanh phút — để định vị, không phải nấc dừng của núm (xem `MINUTE_STEP`). */
const MINUTE_TICKS = [0, 15, 30, 45, 60].map((minute) => ({
  value: minute,
  label: pad(minute),
}));

/**
 * Chọn MỘT MỐC thời gian — ngày và giờ.
 *
 * KHÔNG chép bố cục của web (lịch trái + hai cột giờ/phút cuộn phải, popover ~440px): đó là một
 * control cho CHUỘT trên màn rộng, và bóp nó xuống màn dọc hẹp thì thứ bị bóp trước tiên luôn là
 * vùng chạm — ô ngày còn ~29dp, và cột cuộn dọc lồng trong tấm trượt cuộn dọc thì không trục nào
 * kéo ra hồn.
 *
 * ```
 * ┌────────────────┬────────────────┐
 * │ Ngày           │ Giờ            │  ← hai thẻ chỉ để ĐỌC kết quả
 * │ 29/08/2026     │ 08:30          │
 * ├────────────────┴────────────────┤
 * │           lịch, trọn bề ngang   │
 * ├─────────────────────────────────┤
 * │ Giờ nhận xe            [08:30]  │
 * │ ──────●───────────────────────  │  ← thanh giờ, mốc 00 · 06 · 12 · 18 · 23
 * │ Phút                            │
 * │ ────────────●─────────────────  │  ← thanh phút, kéo từng phút; mốc đọc 00 · 15 · 30 · 45 · 60
 * ├─────────────────────────────────┤
 * │ Bây giờ                   Xong  │
 * └─────────────────────────────────┘
 * ```
 *
 * Ngày chọn bằng LƯỚI, giờ bằng THANH TRƯỢT — ngày là 30 giá trị rời rạc cần nhìn cả tháng để
 * định vị, giờ là một trục liên tục. Không vùng cuộn nào lồng vào vùng cuộn nào, nên kéo ngang
 * không tranh với cuộn dọc của tấm trượt.
 *
 * Thông tin giữ đúng bộ của web; chỉ bước phút là rộng hơn — xem `MINUTE_STEP`.
 */
export function MomentPickerSheet({
  open,
  onClose,
  value,
  onChange,
  title,
  notBefore,
  notAfter,
}: {
  open: boolean;
  onClose: () => void;
  value: Dayjs;
  onChange: (next: Dayjs) => void;
  title: string;
  /**
   * Chặn hai đầu — KHÔNG có mặc định, vì hai nơi dùng nó cần hai luật ngược nhau:
   *
   * - biên bản bàn giao ghi việc ĐÃ xảy ra ⇒ `notAfter={dayjs()}`;
   * - giờ nhận xe của một đơn sắp tới ⇒ không chặn gì (web cũng không chặn).
   *
   * Đặt sẵn một luật ở đây là ép nơi thứ hai phải chống lại nó.
   */
  notBefore?: Dayjs;
  notAfter?: Dayjs;
}) {
  const t = useTranslations('Common.actions');
  const tMoment = useTranslations('Common.components.moment');

  const [draft, setDraft] = useState<Dayjs>(value);
  const [month, setMonth] = useState<Dayjs>(() => value.startOf('month'));

  const floor = notBefore?.startOf('day').valueOf();
  const ceiling = notAfter?.endOf('day').valueOf();
  const selectedKey = draft.format(DAY_PARAM_FORMAT);

  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const day of visibleDays(month)) {
      const key = day.format(DAY_PARAM_FORMAT);
      const at = day.valueOf();
      out[key] = {
        selected: key === selectedKey,
        disabled: (floor != null && at < floor) || (ceiling != null && at > ceiling),
      };
    }
    return out;
  }, [month, selectedKey, floor, ceiling]);

  const pickDay = useCallback((day: Dayjs) => {
    setDraft((prev) => day.hour(prev.hour()).minute(prev.minute()).second(0));
  }, []);

  const setHour = useCallback((hour: number) => setDraft((prev) => prev.hour(hour).second(0)), []);

  const setMinute = useCallback(
    (minute: number) => setDraft((prev) => applyMinute(prev, minute)),
    [],
  );

  const renderDay = useCallback(
    ({ day, mark, onPress }: { day: Dayjs; mark: DayMark | undefined; onPress: () => void }) => (
      <DayCell day={day} mark={mark} onPress={onPress} />
    ),
    [],
  );

  /**
   * Tháng sớm nhất lùi được: theo `notBefore` nếu có, không thì lùi hẳn một năm. Mặc định của
   * `MonthGrid` là tháng hiện tại vì nó sinh ra cho việc ĐẶT lịch — còn biên bản thì ghi việc đã
   * xảy ra, và khai bù một chuyến tháng trước là chuyện thường ở quầy.
   *
   * Ghi nhớ vì `dayjs()` dựng một đối tượng MỚI mỗi lần render, và một prop đổi danh tính là đủ
   * để phá bộ nhớ của cả cái lịch bên dưới.
   */
  const minMonth = useMemo(
    () => notBefore?.startOf('month') ?? dayjs().subtract(1, 'year').startOf('month'),
    [notBefore],
  );

  /**
   * Cái LỊCH được ghi nhớ riêng, tách khỏi phần còn lại của tấm trượt.
   *
   * Kéo thanh giờ bắn khoảng 10 lần cập nhật mỗi giây, mỗi lần là một `setDraft` — và không có
   * lớp này thì mỗi lần đó dựng lại nguyên cái lịch của `react-native-calendars` (42 ô ngày +
   * bố cục tháng) chỉ vì một con số phút vừa đổi. Đó là chỗ giật, chứ không phải bản thân thanh
   * trượt.
   *
   * Deps CỐ Ý không có `draft`: lịch chỉ quan tâm tới NGÀY, mà ngày đã nằm trong `marks`. Giờ và
   * phút đổi thì `marks` giữ nguyên danh tính, phần tử này được dùng lại, và React bỏ qua trọn
   * cây con.
   */
  const calendar = useMemo(
    () => (
      <MonthGrid
        month={month}
        minMonth={minMonth}
        marks={marks}
        onMonthChange={setMonth}
        onDayPress={pickDay}
        renderDay={renderDay}
      />
    ),
    [month, minMonth, marks, pickDay, renderDay],
  );

  /*
   * "Bây giờ" kéo cả lịch về đúng tháng hiện tại — không có vế đó thì người dùng đang xem tháng
   * 12 bấm nút này sẽ thấy không có gì đổi, vì ngày vừa chọn nằm ở tháng khác.
   */
  const jumpToNow = () => {
    const now = dayjs();
    setDraft(now);
    setMonth(now.startOf('month'));
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <XStack gap={space.sm}>
          <YStack f={1}>
            <Button label={t('now')} variant="secondary" onPress={jumpToNow} />
          </YStack>
          <YStack f={1}>
            <Button
              label={t('done')}
              onPress={() => {
                onChange(draft);
                onClose();
              }}
            />
          </YStack>
        </XStack>
      }
    >
      {/* Hai thẻ chỉ để ĐỌC: cả ngày lẫn giờ đều chỉnh được ngay bên dưới, không cần chuyển bảng. */}
      <XStack gap={space.sm}>
        <SummaryCard label={tMoment('date')} value={draft.format('DD/MM/YYYY')} highlighted />
        <SummaryCard label={tMoment('time')} value={draft.format('HH:mm')} />
      </XStack>

      {calendar}

      <YStack h={1} bg={colors.borderSubtle} />

      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {title}
          </Text>
          {/* Kết quả đọc to và tách khung: đây là con số người dùng đang chỉnh, không phải chú thích. */}
          <XStack px={space.md} py={space.xs} br={radius.md} bw={1} bc={colors.primary}>
            <Text col={colors.primaryActive} fos={fontSize.h4} fow={fontWeight.bold}>
              {draft.format('HH:mm')}
            </Text>
          </XStack>
        </XStack>

        {/*
          `onSlide` và `onChange` cùng trỏ về một chỗ: trong tấm trượt này, "đang kéo" và "đã
          chốt" là một — `draft` chỉ đi ra ngoài lúc bấm "Xong". Cái đắt tiền (lịch) đã được ghi
          nhớ riêng, nên cập nhật giữa lúc kéo chỉ dựng lại vài dòng chữ.
        */}
        <StepSlider
          min={0}
          max={23}
          step={1}
          value={draft.hour()}
          onSlide={setHour}
          onChange={setHour}
          ticks={HOUR_TICKS}
        />

        <YStack gap={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {tMoment('minute')}
          </Text>
          <StepSlider
            min={0}
            max={MINUTE_MAX}
            step={MINUTE_STEP}
            value={draft.minute()}
            onSlide={setMinute}
            onChange={setMinute}
            ticks={MINUTE_TICKS}
          />
        </YStack>
      </YStack>
    </BottomSheet>
  );
}

/**
 * Đặt phút, quy mốc 60 về đầu giờ kế tiếp.
 *
 * `dayjs().minute(60)` tự cộng sang giờ sau, nhưng làm tường minh ở đây vì đó là một QUYẾT ĐỊNH
 * nghiệp vụ chứ không phải hành vi tình cờ của thư viện: 23:60 phải thành 00:00 của HÔM SAU, và
 * người đọc mã cần thấy điều đó được cân nhắc.
 */
function applyMinute(current: Dayjs, minute: number): Dayjs {
  if (minute < MINUTE_MAX) return current.minute(minute).second(0);
  return current.add(1, 'hour').minute(0).second(0);
}

/**
 * Một thẻ tóm tắt ở đầu tấm trượt — chỗ ĐỌC giá trị đang chọn.
 *
 * Không phải nút: cả ngày lẫn giờ đều chỉnh được ngay trong cùng một màn, nên không có bảng nào
 * để chuyển. Nó tồn tại để người dùng thấy kết quả mà không phải cuộn.
 */
function SummaryCard({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <YStack
      f={1}
      gap={2}
      px={space.sm}
      py={space.xs}
      br={radius.md}
      bw={1}
      minHeight={sizing.touchTarget}
      jc="center"
      bg={highlighted ? colors.primaryLight : colors.surfaceMuted}
      bc={highlighted ? colors.primary : colors.borderInput}
    >
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      <Text
        col={highlighted ? colors.primaryActive : colors.text}
        fos={fontSize.body}
        fow={fontWeight.bold}
        numberOfLines={1}
      >
        {value}
      </Text>
    </YStack>
  );
}

function DayCell({
  day,
  mark,
  onPress,
}: {
  day: Dayjs;
  mark: DayMark | undefined;
  onPress: () => void;
}) {
  const disabled = mark?.disabled ?? false;
  const selected = mark?.selected ?? false;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={styles.cell}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <YStack
        ai="center"
        jc="center"
        h={sizing.touchTarget}
        br={radius.sm}
        bg={selected ? colors.primary : 'transparent'}
      >
        <Text
          col={disabled ? colors.placeholder : selected ? colors.onPrimary : colors.text}
          fos={fontSize.bodySm}
          fow={selected ? fontWeight.semibold : fontWeight.regular}
        >
          {day.date()}
        </Text>
      </YStack>
    </Pressable>
  );
}
