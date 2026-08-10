'use client';

import 'react-day-picker/style.css';

import { Button, DatePicker, Radio, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { vi } from 'react-day-picker/locale';
import { cx } from '@/lib/cx';
import styles from './RentalRangePanel.module.css';

export type RentalMode = 'daily' | 'hourly';

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

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** "18:00 T2, 10/08" — format tóm tắt theo mockup thuê giờ. */
const fmtPoint = (d: Dayjs) => `${d.format('HH:mm')} ${WEEKDAY[d.day()]}, ${d.format('DD/MM')}`;

/**
 * Thời lượng dạng chữ: theo ngày hiện CẢ giờ lẻ ("10 ngày 2 giờ" khi giờ trả ≠ giờ nhận),
 * dưới một ngày hiện giờ. Làm tròn theo phút để 23h59 không thành "0 ngày".
 */
function durationLabel(pickupAt: Dayjs, returnAt: Dayjs): string {
  const minutes = returnAt.diff(pickupAt, 'minute');
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  if (days <= 0) return `${Math.max(1, hours)} giờ`;
  return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
}

/** Không cho chọn ngày trong quá khứ — thuê xe luôn là chuyện tương lai. */
const disabledDate = (current: Dayjs) => current.isBefore(dayjs().startOf('day'));

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
 */
export function RentalRangePanel({
  value,
  onChange,
  mode,
  onModeChange,
  months,
  onApply,
  onCancel,
}: RentalRangePanelProps) {
  const [month, setMonth] = useState<Date>(() => (value.pickupAt ?? dayjs()).toDate());

  const timeOf = (d: Dayjs | null) =>
    d ? d.format('HH:mm') : `${String(DEFAULT_HOUR).padStart(2, '0')}:00`;

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
    if (!returnAt.isAfter(value.pickupAt)) returnAt = value.pickupAt.add(1, 'day');
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

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Cách tính thời gian thuê">
        {(
          [
            { key: 'daily', label: 'Thuê theo ngày' },
            { key: 'hourly', label: 'Thuê theo giờ' },
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

      {mode === 'daily' ? (
        <>
          <DayPicker
            mode="range"
            locale={vi}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={months}
            selected={{ from: value.pickupAt?.toDate(), to: value.returnAt?.toDate() }}
            onSelect={handleSelect}
            disabled={{ before: dayjs().startOf('day').toDate() }}
            showOutsideDays
            /*
             * Figma: tuần bắt đầu CN, nhãn cột "CN T2…T7", caption "Tháng 8, 2026". Locale vi
             * của date-fns cho chữ khác ("Th 2", tuần bắt đầu T2) nên chỉnh cả ba cho khớp.
             */
            weekStartsOn={0}
            formatters={{
              formatCaption: (d) => `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`,
              formatWeekdayName: (d) => (d.getDay() === 0 ? 'CN' : `T${d.getDay() + 1}`),
            }}
            className={styles.dayPicker}
          />

          <div className={styles.timeRow}>
            <label className={styles.timeField}>
              <span className={styles.timeLabel}>Giờ nhận xe</span>
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
              <span className={styles.timeLabel}>Giờ trả xe</span>
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
              <span className={styles.timeLabel}>Ngày bắt đầu</span>
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
                format="DD/MM/YYYY"
                allowClear={false}
                inputReadOnly
                disabledDate={disabledDate}
                className={styles.timeSelect}
              />
            </label>
            <label className={styles.timeField}>
              <span className={styles.timeLabel}>Giờ nhận xe</span>
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
            <span className={styles.timeLabel}>Thời gian thuê</span>
            <Select
              value={hourlyDuration}
              onChange={(h) => setHourly(hourlyStart, h)}
              options={HOURLY_DURATIONS.map((h) => ({
                value: h,
                label: `${h} giờ (kết thúc: ${hourlyStart.add(h, 'hour').format('HH:mm DD/MM/YYYY')})`,
              }))}
              className={styles.timeSelect}
              popupMatchSelectWidth={false}
            />
          </label>

          {/* Danh sách thời lượng — mỗi dòng tính sẵn GIỜ KẾT THÚC, khỏi nhẩm cộng. */}
          <div className={styles.durationList} role="radiogroup" aria-label="Thời gian thuê">
            {HOURLY_DURATIONS.map((h) => {
              const end = hourlyStart.add(h, 'hour');
              const active = h === hourlyDuration;
              return (
                <label key={h} className={cx(styles.durationRow, active && styles.durationActive)}>
                  <span className={styles.durationLeft}>
                    <Radio checked={active} onChange={() => setHourly(hourlyStart, h)} />
                    <span>{h} giờ</span>
                  </span>
                  <span className={styles.durationEnd}>
                    kết thúc: {end.format('HH:mm DD/MM/YYYY')}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.summaryRow}>
          <div className={styles.summary} aria-live="polite">
            {complete && ordered ? (
              <>
                <span>
                  {fmtPoint(value.pickupAt!)} – {fmtPoint(value.returnAt!)}
                </span>
                <span className={styles.duration}>
                  Thời gian thuê:{' '}
                  <b className={styles.durationValue}>
                    {durationLabel(value.pickupAt!, value.returnAt!)}
                  </b>
                </span>
              </>
            ) : complete ? (
              <span className={styles.invalid}>Giờ trả phải sau giờ nhận</span>
            ) : (
              <span className={styles.placeholder}>Chọn ngày nhận và ngày trả xe</span>
            )}
          </div>
          <div className={styles.actions}>
            <Button onClick={onCancel}>Huỷ</Button>
            <Button type="primary" disabled={!complete || !ordered} onClick={onApply}>
              Áp dụng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
