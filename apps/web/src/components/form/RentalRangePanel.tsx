'use client';

import 'react-day-picker/style.css';

import { Button, DatePicker, Radio, Select, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DayPicker, type DateRange, type DayButtonProps } from 'react-day-picker';
import { enUS, vi } from 'react-day-picker/locale';
import { cx } from '@/lib/cx';
import {
  busyLevelOf,
  busyPeriodsOf,
  EMPTY_BUSY_INDEX,
  firstBusyDayAfter,
  rangeBusyConflict,
  type BusyDayIndex,
  type BusyPeriod,
} from '@/lib/rental-busy';
import styles from './RentalRangePanel.module.css';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useLocale } from 'next-intl';

/** Định nghĩa gốc ở `@xeprime/domain` (search-draft) — bản nháp tìm kiếm mang chính giá trị này. */
export type { RentalMode } from '@xeprime/domain';
import type { RentalMode } from '@xeprime/domain';

export interface RentalRangeDraft {
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
}

interface RentalRangePanelProps {
  value: RentalRangeDraft;
  onChange: (next: RentalRangeDraft) => void;
  mode: RentalMode;
  onModeChange: (mode: RentalMode) => void;
  /** Một tháng (mobile) hay lịch đôi (desktop) — chỉ áp dụng cho chế độ theo ngày. */
  months: 1 | 2;
  /**
   * Sàn số ngày tính tiền (cùng công thức backend: `ceil(Δ/24h)`) — thuê DÀI HẠN truyền
   * `LONG_TERM_MIN_DAYS`. >1 thì ẩn tab "Thuê theo giờ" (dài hạn không có ngữ nghĩa giờ),
   * lịch khoá các ngày trả không đạt sàn, và "Áp dụng" chỉ bật khi đủ sàn.
   */
  minDays?: number;
  /**
   * Lịch bận của chính chiếc xe đang chọn (`GET /public/booking-requests/busy-days`). Bỏ trống
   * ⇒ lịch không khoá gì cả, đúng như trước — control này còn dùng ở những chỗ chưa gắn với
   * một xe cụ thể (thanh tìm kiếm marketplace).
   */
  busyDays?: BusyDayIndex;
  /** Đang tải lịch bận — chỉ để nói cho khách biết vì sao lịch chưa tô, không khoá thao tác. */
  busyLoading?: boolean;
  onApply: () => void;
  onCancel: () => void;
}

/** Giờ theo bước 30 phút. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hhmm = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: hhmm, label: hhmm };
});

/** Thời lượng thuê giờ 1–24h — quá 24h thì chuyển tab "Thuê theo ngày" mới hợp lý. */
const HOURLY_DURATIONS = Array.from({ length: 24 }, (_, i) => i + 1);

const DEFAULT_HOUR = 10;
const DEFAULT_HOURLY_DURATION = 4;

/**
 * Tầm nhìn xa nhất khi dò ngày bận kế tiếp. Bằng cửa sổ mà API trả về (một năm): dò xa hơn chỉ
 * đọc phải khoảng "chưa có dữ liệu" và khoá nhầm ngày rảnh.
 */
const BUSY_LOOKAHEAD_DAYS = 366;

/**
 * Ô ngày có `title` — DayPicker không có API tooltip, mà chú thích "bận khung nào" phải bám
 * đúng ô: một dòng chữ dưới lịch thì khách phải tự dò ngày nào ứng với ghi chú nào.
 *
 * Giữ nguyên hiệu ứng focus của bản gốc (`modifiers.focused` → `focus()`); bỏ nó đi là mất
 * điều hướng lịch bằng bàn phím. Dựng qua factory + `useMemo` ở nơi gọi vì một component MỚI
 * mỗi lần render sẽ remount toàn bộ nút ngày và đánh rơi tiêu điểm.
 */
function createDayButton(titleOf: (day: Date) => string | undefined) {
  return function RentalDayButton({ day, modifiers, ...buttonProps }: DayButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (modifiers.focused) ref.current?.focus();
    }, [modifiers.focused]);
    return <button ref={ref} {...buttonProps} title={titleOf(day.date)} />;
  };
}

/**
 * Ruột hộp chọn khoảng thuê — hai tab, MỘT giá trị `{pickupAt, returnAt}`:
 *
 * - "Thuê theo ngày": lịch đôi react-day-picker, CONTROLLED HOÀN TOÀN (`selected` + `onSelect`).
 *   Bài học 10/08: bản trước dùng `onDayClick` tự chế luật "đầu đang sửa" mà không `onSelect`
 *   → DayPicker giữ selection nội bộ RIÊNG, lịch tô 19–21 nhưng giá trị lại 11→21. Giờ selection
 *   trên lịch và giá trị là một — không thể lệch.
 * - "Thuê theo giờ" (mockup 10/08): Ngày bắt đầu + Giờ nhận xe + danh sách THỜI LƯỢNG kèm giờ
 *   kết thúc tính sẵn — giờ trả là GIÁ TRỊ DẪN XUẤT (bắt đầu + thời lượng), người dùng không
 *   phải tự cộng giờ.
 *
 * Lịch bận (`busyDays`, 20/08) có hai mức và chúng KHÔNG cùng cách xử lý:
 *   - bận trọn ngày → khoá thẳng ô, và khoá luôn mọi ngày trả nằm SAU nó (một khoảng đi xuyên
 *     qua ngày bận là bất khả thi dù hai đầu đều rảnh);
 *   - bận vài giờ → vẫn chọn được, tô gạch nhạt + tooltip nói rõ khung giờ bận, vì đó có thể
 *     là ngày nhận/trả hoàn toàn hợp lệ. Nếu khoảng đang chọn CHẠM vào khung giờ đó thì "Áp
 *     dụng" tắt kèm câu giải thích — chặn ở đây tốt hơn để khách đi tiếp rồi mới bị từ chối.
 *
 * Tất cả chỉ là preview (ADR 0006): quyết định thật vẫn là exclusion constraint lúc ghi.
 */
export function RentalRangePanel({
  value,
  onChange,
  mode,
  onModeChange,
  months,
  minDays = 1,
  busyDays = EMPTY_BUSY_INDEX,
  busyLoading = false,
  onApply,
  onCancel,
}: RentalRangePanelProps) {
  const dayPickerLocale = useLocale() === 'en' ? enUS : vi;
  const fmt = useAppFormat();
  const datePattern = useDatePickerPattern();
  const t = useTranslations('Common');

  const [month, setMonth] = useState<Date>(() => (value.pickupAt ?? dayjs()).toDate());

  /** Số ngày TÍNH TIỀN — trùng công thức `PricingService.chargedDays` để hai tầng không lệch. */
  const chargedDays = (a: Dayjs, b: Dayjs) => Math.max(1, Math.ceil(b.diff(a, 'minute') / 1440));

  const timeOf = (d: Dayjs | null) =>
    d ? d.format('HH:mm') : `${String(DEFAULT_HOUR).padStart(2, '0')}:00`;

  /** Một quãng bận thành chữ: `08:00–12:00`. Giờ 24h giống nhau ở cả hai ngôn ngữ. */
  const periodText = (p: BusyPeriod) =>
    t('components.rentalRange.busy.period', {
      start: p.startAt.format('HH:mm'),
      end: p.endAt.format('HH:mm'),
    });

  /** Gắn giờ đang chọn (hoặc mặc định) vào một ngày trên lịch. */
  const withTime = (day: Date, current: Dayjs | null): Dayjs => {
    const [h, m] = timeOf(current).split(':').map(Number);
    return dayjs(day)
      .hour(h ?? DEFAULT_HOUR)
      .minute(m ?? 0)
      .second(0)
      .millisecond(0);
  };

  /**
   * Luật chọn range kiểu đặt-phòng, tính từ NGÀY VỪA BẤM (`triggerDate`), không dùng range mà
   * rdp đề xuất — mặc định của rdp là NỚI RỘNG range cũ (đang 11–14, bấm 19 thành 11–19), đúng
   * bug 19–21 hoá 11–21 hôm 10/08. Luật ở đây:
   *   - range đã đủ hai đầu → cú bấm mới BẮT ĐẦU range mới (ngày bấm = nhận, chờ chọn trả);
   *   - mới có ngày nhận → bấm sau nó = ngày trả; bấm trước nó = chọn lại ngày nhận.
   * Lịch controlled theo `value` nên phần tô sáng và tóm tắt không bao giờ lệch nhau.
   */
  function handleSelect(_suggested: DateRange | undefined, triggerDate: Date) {
    const clickedDay = dayjs(triggerDate).startOf('day');

    if (!value.pickupAt || (value.pickupAt && value.returnAt)) {
      onChange({ pickupAt: withTime(triggerDate, value.pickupAt), returnAt: null });
      return;
    }
    if (clickedDay.isBefore(value.pickupAt.startOf('day'))) {
      onChange({ pickupAt: withTime(triggerDate, value.pickupAt), returnAt: null });
      return;
    }
    let returnAt = withTime(triggerDate, value.returnAt);
    if (!returnAt.isAfter(value.pickupAt))
      returnAt = value.pickupAt.add(Math.max(1, minDays), 'day');
    // Lưới an toàn cho ca lệch giờ — lịch đã khoá các ngày dưới sàn (xem `dailyDisabled`).
    else if (chargedDays(value.pickupAt, returnAt) < minDays) {
      returnAt = withTime(value.pickupAt.add(minDays, 'day').toDate(), value.returnAt);
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
    value.pickupAt ?? dayjs().add(1, 'day').hour(DEFAULT_HOUR).minute(0).second(0).millisecond(0);
  const hourlyDuration = (() => {
    if (!value.pickupAt || !value.returnAt) return DEFAULT_HOURLY_DURATION;
    const h = Math.round(value.returnAt.diff(value.pickupAt, 'minute') / 60);
    return h >= 1 && h <= 24 ? h : DEFAULT_HOURLY_DURATION;
  })();

  function setHourly(start: Dayjs, duration: number) {
    onChange({ pickupAt: start, returnAt: start.add(duration, 'hour') });
  }

  function switchMode(next: RentalMode) {
    onModeChange(next);
    // Sang tab giờ: chuẩn hoá ngay giá trị về "bắt đầu + thời lượng" để hai tab không đá nhau.
    if (next === 'hourly') setHourly(hourlyStart, hourlyDuration);
  }

  const complete = Boolean(value.pickupAt && value.returnAt);
  const ordered = Boolean(value.pickupAt && value.returnAt?.isAfter(value.pickupAt));
  const meetsMin = complete && ordered && chargedDays(value.pickupAt!, value.returnAt!) >= minDays;

  /** Quãng bận mà khoảng đang chọn đụng phải — chỉ xảy ra ở ngày bận MỘT PHẦN. */
  const conflict = rangeBusyConflict(busyDays, value.pickupAt, value.returnAt);

  /**
   * Trần ngày TRẢ khi đã có ngày nhận: ngày bận đầu tiên sau ngày nhận chặn mọi ngày sau nó.
   * Ngày bận một phần vẫn được phép LÀ ngày trả (trả trước giờ bận), ngày bận trọn thì không.
   */
  const returnCeiling = useMemo(() => {
    if (!value.pickupAt || value.returnAt) return null;
    const next = firstBusyDayAfter(busyDays, value.pickupAt, BUSY_LOOKAHEAD_DAYS);
    if (!next) return null;
    return next.level === 'full' ? next.date : next.date.add(1, 'day');
  }, [busyDays, value.pickupAt, value.returnAt]);

  // Đã chọn ngày nhận, đang chờ ngày trả + có sàn: khoá các ngày trả dưới sàn ngay trên lịch
  // (bấm TRƯỚC ngày nhận vẫn được — đó là chọn lại ngày nhận).
  const dailyDisabled = [
    { before: dayjs().startOf('day').toDate() },
    // Ngày bận trọn không bao giờ nhận/trả được, ở bất kỳ pha chọn nào.
    (day: Date) => busyLevelOf(busyDays, day) === 'full',
    ...(minDays > 1 && value.pickupAt && !value.returnAt
      ? [
          {
            after: value.pickupAt.startOf('day').toDate(),
            before: value.pickupAt.startOf('day').add(minDays, 'day').toDate(),
          },
        ]
      : []),
    ...(returnCeiling ? [{ after: returnCeiling.startOf('day').toDate() }] : []),
  ];

  const dayModifiers = {
    busyFull: (day: Date) => busyLevelOf(busyDays, day) === 'full',
    busyPartial: (day: Date) => busyLevelOf(busyDays, day) === 'partial',
  };

  /** Tooltip của một ô ngày — nói RÕ bận cả ngày hay bận khung giờ nào. */
  const DayButton = useMemo(
    () =>
      createDayButton((day) => {
        const level = busyLevelOf(busyDays, day);
        if (level === 'full') return t('components.rentalRange.busy.fullTooltip');
        if (level === 'partial') {
          return t('components.rentalRange.busy.partialTooltip', {
            ranges: busyPeriodsOf(busyDays, day)
              .map((p) =>
                t('components.rentalRange.busy.period', {
                  start: p.startAt.format('HH:mm'),
                  end: p.endAt.format('HH:mm'),
                }),
              )
              .join(', '),
          });
        }
        return undefined;
      }),
    [busyDays, t],
  );

  /** Thời lượng thuê giờ nào đụng lịch bận thì tắt hẳn trong danh sách, kèm lý do. */
  const hourlyConflictOf = (duration: number) =>
    rangeBusyConflict(busyDays, hourlyStart, hourlyStart.add(duration, 'hour'));

  return (
    <div className={styles.panel}>
      {/* Dài hạn (minDays > 1) không có ngữ nghĩa thuê giờ — bỏ hẳn hàng tab, chỉ còn lịch. */}
      {minDays > 1 ? null : (
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={t('components.rentalRange.modeTablist')}
        >
          {(
            [
              { key: 'daily', label: t('components.rentalRange.modeDaily') },
              { key: 'hourly', label: t('components.rentalRange.modeHourly') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              className={cx(styles.tab, mode === tab.key && styles.tabActive)}
              onClick={() => switchMode(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {mode === 'daily' ? (
        <>
          <DayPicker
            mode="range"
            locale={dayPickerLocale}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={months}
            selected={{ from: value.pickupAt?.toDate(), to: value.returnAt?.toDate() }}
            onSelect={handleSelect}
            disabled={dailyDisabled}
            modifiers={dayModifiers}
            modifiersClassNames={{
              busyFull: styles.busyFull!,
              busyPartial: styles.busyPartial!,
            }}
            showOutsideDays
            /*
             * Figma: tuần bắt đầu CN, nhãn cột "CN T2…T7", caption "Tháng 8, 2026". Locale vi
             * của date-fns cho chữ khác ("Th 2", tuần bắt đầu T2) nên chỉnh cả ba cho khớp.
             */
            weekStartsOn={0}
            formatters={{
              formatCaption: (d) => fmt.monthYear(d),
              formatWeekdayName: (d) => fmt.weekdayShort(dayjs(d)),
            }}
            components={{ DayButton }}
            className={styles.dayPicker}
          />

          <div className={styles.timeRow}>
            <label className={styles.timeField}>
              <span className={styles.timeLabel}>{t('components.rentalRange.pickupTime')}</span>
              <Select
                value={timeOf(value.pickupAt)}
                onChange={(v) => setTime('pickupAt', v)}
                options={TIME_OPTIONS}
                disabled={!value.pickupAt}
                className={styles.timeSelect}
                popupMatchSelectWidth={false}
              />
            </label>
            <label className={styles.timeField}>
              <span className={styles.timeLabel}>{t('components.rentalRange.returnTime')}</span>
              <Select
                value={timeOf(value.returnAt)}
                onChange={(v) => setTime('returnAt', v)}
                options={TIME_OPTIONS}
                disabled={!value.returnAt}
                className={styles.timeSelect}
                popupMatchSelectWidth={false}
              />
            </label>
          </div>
        </>
      ) : (
        /* --- Thuê theo giờ — mockup 10/08: ngày + giờ bắt đầu, thời lượng kèm giờ kết thúc. --- */
        <div className={styles.hourly}>
          <div className={styles.hourlyRow}>
            <label className={styles.timeField}>
              <span className={styles.timeLabel}>{t('components.rentalRange.startDate')}</span>
              <DatePicker
                value={hourlyStart}
                onChange={(d) => {
                  if (!d) return;
                  setHourly(
                    d
                      .hour(hourlyStart.hour())
                      .minute(hourlyStart.minute())
                      .second(0)
                      .millisecond(0),
                    hourlyDuration,
                  );
                }}
                format={datePattern.date}
                allowClear={false}
                inputReadOnly
                // Quá khứ và ngày bận trọn đều không thuê được — cùng một ô chặn.
                disabledDate={(current) =>
                  current.isBefore(dayjs().startOf('day')) ||
                  busyLevelOf(busyDays, current) === 'full'
                }
                className={styles.timeSelect}
              />
            </label>
            <label className={styles.timeField}>
              <span className={styles.timeLabel}>{t('components.rentalRange.pickupTime')}</span>
              <Select
                value={hourlyStart.format('HH:mm')}
                onChange={(v) => {
                  const [h, m] = v.split(':').map(Number);
                  setHourly(hourlyStart.hour(h ?? 0).minute(m ?? 0), hourlyDuration);
                }}
                options={TIME_OPTIONS}
                className={styles.timeSelect}
                popupMatchSelectWidth={false}
              />
            </label>
          </div>

          <label className={styles.timeField}>
            <span className={styles.timeLabel}>{t('components.rentalRange.duration')}</span>
            <Select
              value={hourlyDuration}
              onChange={(h) => setHourly(hourlyStart, h)}
              options={HOURLY_DURATIONS.map((h) => ({
                value: h,
                disabled: Boolean(hourlyConflictOf(h)),
                label: t('components.rentalRange.durationOption', {
                  duration: t('units.hour', { count: h }),
                  time: hourlyStart.add(h, 'hour').format(datePattern.dateTime),
                }),
              }))}
              className={styles.timeSelect}
              popupMatchSelectWidth={false}
            />
          </label>

          {/* Danh sách thời lượng — mỗi dòng tính sẵn GIỜ KẾT THÚC, khỏi nhẩm cộng. */}
          <div
            className={styles.durationList}
            role="radiogroup"
            aria-label={t('components.rentalRange.duration')}
          >
            {HOURLY_DURATIONS.map((h) => {
              const end = hourlyStart.add(h, 'hour');
              const active = h === hourlyDuration;
              const busy = hourlyConflictOf(h);
              return (
                <label
                  key={h}
                  className={cx(
                    styles.durationRow,
                    active && styles.durationActive,
                    busy && styles.durationBusy,
                  )}
                  title={busy ? periodText(busy) : undefined}
                >
                  <span className={styles.durationLeft}>
                    <Radio
                      checked={active}
                      disabled={Boolean(busy)}
                      onChange={() => setHourly(hourlyStart, h)}
                    />
                    <span>{t('units.hour', { count: h })}</span>
                  </span>
                  <span className={styles.durationEnd}>
                    {busy
                      ? t('components.rentalRange.busy.hourlyUnavailable')
                      : t('components.rentalRange.durationEndsAt', {
                          time: end.format(datePattern.dateTime),
                        })}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        {/* Chú giải màu — Figma 20/08. Chỉ hiện khi lịch THẬT SỰ có ngày bận để tô. */}
        {mode === 'daily' && busyDays.size > 0 ? (
          <ul className={styles.legend}>
            {(
              [
                ['selected', 'legendSelected'],
                ['inRange', 'legendInRange'],
                ['full', 'legendFull'],
                ['partial', 'legendPartial'],
              ] as const
            ).map(([swatch, key]) => (
              <li key={swatch} className={styles.legendItem}>
                <span className={cx(styles.swatch, styles[swatch])} aria-hidden />
                {t(`components.rentalRange.busy.${key}`)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.summaryRow}>
          <div className={styles.summary} aria-live="polite">
            {complete && ordered ? (
              <>
                <span>
                  {fmt.rentalPoint(value.pickupAt!)} – {fmt.rentalPoint(value.returnAt!)}
                </span>
                <span className={styles.duration}>
                  {t.rich('components.rentalRange.summaryDuration', {
                    duration: fmt.rentalDuration(value.pickupAt!, value.returnAt!),
                    value: (chunks) => <b className={styles.durationValue}>{chunks}</b>,
                  })}
                </span>
              </>
            ) : complete ? (
              <span className={styles.invalid}>
                {t('components.rentalRange.returnBeforePickup')}
              </span>
            ) : (
              <span className={styles.placeholder}>
                {minDays > 1
                  ? t('components.rentalRange.placeholderMinDays', { count: minDays })
                  : t('components.rentalRange.placeholder')}
              </span>
            )}
            {busyLoading ? (
              <span className={styles.placeholder}>{t('components.rentalRange.busy.loading')}</span>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button onClick={onCancel}>{t('actions.cancel')}</Button>
            <Tooltip
              title={
                conflict
                  ? t('components.rentalRange.busy.conflict', {
                      period: periodText(conflict),
                      date: fmt.rentalPoint(conflict.startAt),
                    })
                  : undefined
              }
            >
              {/* `span` bọc: nút disabled không phát sự kiện chuột nên Tooltip sẽ không bao giờ mở. */}
              <span>
                <Button type="primary" disabled={!meetsMin || Boolean(conflict)} onClick={onApply}>
                  {t('actions.apply')}
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>

        {/* Lý do "Áp dụng" bị tắt phải ĐỌC ĐƯỢC, không chỉ nằm trong tooltip khi rê chuột. */}
        {conflict ? (
          <p className={styles.conflict} role="alert">
            {t('components.rentalRange.busy.conflict', {
              period: periodText(conflict),
              date: fmt.rentalPoint(conflict.startAt),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
