'use client';

import 'react-day-picker/style.css';

import { Button, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
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
  /** Đầu đang sửa — bấm "Trả xe" ở trigger thì lần bấm lịch đầu tiên đổi NGÀY TRẢ, không reset. */
  focus: 'pickup' | 'return';
  onFocusChange: (focus: 'pickup' | 'return') => void;
  /** Một tháng (mobile) hay lịch đôi (desktop). */
  months: 1 | 2;
  onApply: () => void;
  onCancel: () => void;
}

/** Giờ theo bước 30 phút — đủ mịn cho thuê xe. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hhmm = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: hhmm, label: hhmm };
});

const DEFAULT_HOUR = 10;

/**
 * Ruột hộp chọn khoảng thuê — Figma `177:1652…177:1875`: tab Thuê theo ngày/giờ, lịch đôi
 * (desktop) hoặc một tháng (mobile), hàng giờ nhận/trả, tóm tắt + thời lượng, Huỷ/Áp dụng.
 *
 * Lịch là `react-day-picker` (điều khiển hoàn toàn, bàn phím được, locale vi) — AntD RangePicker
 * không tái tạo được đúng bố cục này: `showTime` của nó ép panel về một tháng, còn hàng giờ của
 * thiết kế nằm DƯỚI lịch. Không component nào ngoài file này đụng API của thư viện.
 *
 * "Thuê theo ngày/giờ" là HAI ĐỘ MỊN CHỌN GIỜ trên cùng một cặp `pickupAt/returnAt` — không phải
 * hai loại đơn ở backend (backend không có khái niệm đó; giá chốt vẫn do shop xác nhận).
 */
export function RentalRangePanel({
  value,
  onChange,
  mode,
  onModeChange,
  focus,
  onFocusChange,
  months,
  onApply,
  onCancel,
}: RentalRangePanelProps) {
  // Tháng đang xem — mở đúng tháng của ngày nhận đã chọn thay vì luôn tháng hiện tại.
  const [month, setMonth] = useState<Date>(() => (value.pickupAt ?? dayjs()).toDate());

  const timeOf = (d: Dayjs | null) =>
    d ? d.format('HH:mm') : `${String(DEFAULT_HOUR).padStart(2, '0')}:00`;

  /** Gắn giờ đang chọn (hoặc mặc định) vào một ngày vừa bấm trên lịch. */
  const withTime = (day: Date, current: Dayjs | null): Dayjs => {
    const base = dayjs(day);
    const [h, m] = timeOf(current).split(':').map(Number);
    return base
      .hour(h ?? DEFAULT_HOUR)
      .minute(m ?? 0)
      .second(0)
      .millisecond(0);
  };

  /**
   * Luật bấm ngày theo đầu đang sửa:
   *  - đang sửa NHẬN: ngày bấm thành ngày nhận; ngày trả giữ nguyên nếu vẫn sau ngày nhận,
   *    không thì xoá để chọn tiếp → chuyển sang sửa đầu TRẢ;
   *  - đang sửa TRẢ: bấm sau ngày nhận → thành ngày trả; bấm TRƯỚC ngày nhận → hiểu là chọn lại
   *    từ đầu (hành vi range picker quen thuộc), ngày bấm thành ngày nhận mới.
   */
  function handleDayClick(day: Date) {
    const clicked = dayjs(day).startOf('day');
    if (focus === 'pickup' || !value.pickupAt) {
      const pickupAt = withTime(day, value.pickupAt);
      const keepReturn = value.returnAt && value.returnAt.isAfter(pickupAt) ? value.returnAt : null;
      onChange({ pickupAt, returnAt: keepReturn });
      onFocusChange('return');
      return;
    }
    if (clicked.isBefore(value.pickupAt.startOf('day'))) {
      onChange({ pickupAt: withTime(day, value.pickupAt), returnAt: null });
      return;
    }
    let returnAt = withTime(day, value.returnAt ?? value.pickupAt);
    // Cùng ngày, chế độ theo ngày → đẩy giờ trả sau giờ nhận nếu đang bằng/ngược.
    if (!returnAt.isAfter(value.pickupAt)) {
      returnAt = mode === 'daily' ? value.pickupAt.add(1, 'day') : value.pickupAt.add(1, 'hour');
    }
    onChange({ pickupAt: value.pickupAt, returnAt });
  }

  function setTime(which: 'pickupAt' | 'returnAt', hhmm: string) {
    const base = value[which];
    if (!base) return;
    const [h, m] = hhmm.split(':').map(Number);
    const next = {
      ...value,
      [which]: base
        .hour(h ?? 0)
        .minute(m ?? 0)
        .second(0)
        .millisecond(0),
    };
    // Giờ mới làm khoảng bị ngược → không tự bịa lại ngày; nút Áp dụng sẽ khoá kèm lời nhắc.
    onChange(next);
  }

  const complete = Boolean(value.pickupAt && value.returnAt);
  const ordered = Boolean(value.pickupAt && value.returnAt?.isAfter(value.pickupAt));

  const duration = (() => {
    if (!value.pickupAt || !value.returnAt || !ordered) return null;
    if (mode === 'hourly') {
      const hours = Math.ceil(value.returnAt.diff(value.pickupAt, 'minute') / 60);
      return hours >= 24
        ? `${Math.floor(hours / 24)} ngày ${hours % 24 ? `${hours % 24} giờ` : ''}`.trim()
        : `${hours} giờ`;
    }
    return `${Math.max(1, Math.ceil(value.returnAt.diff(value.pickupAt, 'hour') / 24))} ngày`;
  })();

  return (
    <div className={styles.panel}>
      {/* Tab đổi độ mịn chọn giờ — Figma `177:1652`. */}
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
            onClick={() => onModeChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DayPicker
        mode="range"
        locale={vi}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={months}
        selected={{ from: value.pickupAt?.toDate(), to: value.returnAt?.toDate() }}
        onDayClick={handleDayClick}
        disabled={{ before: dayjs().startOf('day').toDate() }}
        showOutsideDays
        /*
         * Figma: tuần bắt đầu CN, nhãn cột "CN T2…T7", caption "Tháng 8, 2026". Locale vi của
         * date-fns cho chữ khác ("Th 2", tuần bắt đầu T2) nên chỉnh cả ba cho khớp.
         */
        weekStartsOn={0}
        formatters={{
          formatCaption: (d) => `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`,
          formatWeekdayName: (d) => (d.getDay() === 0 ? 'CN' : `T${d.getDay() + 1}`),
        }}
        className={styles.dayPicker}
      />

      {/* Hàng giờ dưới lịch (Figma `177:1854`) — hiện ở CẢ hai chế độ, đúng thiết kế. */}
      <div className={styles.footer}>
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

        <div className={styles.summaryRow}>
          <div className={styles.summary} aria-live="polite">
            {complete ? (
              <>
                <span>
                  {value.pickupAt!.format('DD/MM, HH:mm')} →{' '}
                  {value.returnAt!.format('DD/MM, HH:mm')}
                </span>
                {duration ? <span className={styles.duration}>{duration}</span> : null}
                {!ordered ? (
                  <span className={styles.invalid}>Giờ trả phải sau giờ nhận</span>
                ) : null}
              </>
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
