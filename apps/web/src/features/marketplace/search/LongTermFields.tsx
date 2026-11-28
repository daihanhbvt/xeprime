'use client';

import { DatePicker, Select } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import {
  DAY_PARAM_FORMAT,
  longTermReturnDate,
  nowInAppTz,
  startOfAppDay,
  type LongTermPick,
} from '@xeprime/domain';
import { LONG_TERM_PACKAGE_MONTHS, type LongTermPackageMonths } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { dayjs } from '@/lib/datetime';
import styles from './LongTermFields.module.css';

interface LongTermFieldProps {
  value: LongTermPick;
  onChange: (next: LongTermPick) => void;
  className?: string;
  /** Icon ở cuối ô (lịch ở thẻ trang chủ, mũi tên ở khay hành trình). */
  suffix?: ReactNode;
  /** Icon ở đầu ô (thanh thu gọn). */
  prefix?: ReactNode;
  /** Ô nằm trong lớp `position: fixed` phải neo popup vào chính lớp đó. */
  getPopupContainer?: () => HTMLElement;
}

/**
 * Ngày nhận MONG MUỐN của thuê dài hạn (Figma `22647:39581` · `22647:49462`).
 *
 * Chỉ chọn NGÀY, không chọn giờ: giờ nhận do gian hàng chốt lúc duyệt (ADR 0011). Giá trị là khoá
 * ngày `YYYY-MM-DD` theo lịch Việt Nam; lịch của AntD làm việc bằng ngày của ô bấm, nên đi qua
 * khoá ngày chứ không qua một mốc giờ — không có múi giờ nào để lệch một ngày.
 *
 * `withFromPrefix`: thẻ trang chủ đọc "Từ 28/12/2026"; khay hành trình có nhãn riêng nên chỉ ngày.
 */
export function LongTermDateField({
  value,
  onChange,
  className,
  suffix,
  prefix,
  getPopupContainer,
  withFromPrefix = false,
}: LongTermFieldProps & { withFromPrefix?: boolean }) {
  const t = useTranslations('HomeSearch.longTerm');
  const fmt = useAppFormat();
  const todayKey = nowInAppTz().format(DAY_PARAM_FORMAT);

  return (
    <DatePicker
      value={dayjs(value.fromDate)}
      onChange={(next) => {
        if (next) onChange({ ...value, fromDate: next.format(DAY_PARAM_FORMAT) });
      }}
      format={(day) => {
        const date = fmt.date(startOfAppDay(day.format(DAY_PARAM_FORMAT)).toISOString());
        return withFromPrefix ? t('from', { date }) : date;
      }}
      disabledDate={(day) => day.format(DAY_PARAM_FORMAT) < todayKey}
      allowClear={false}
      inputReadOnly
      variant="borderless"
      prefix={prefix}
      // Không truyền icon cuối thì KHÔNG có icon - AntD tự chèn lịch, trùng với icon đầu ô.
      suffixIcon={suffix ?? null}
      getPopupContainer={getPopupContainer}
      aria-label={t('dateLabel')}
      className={cx(styles.date, className)}
    />
  );
}

/**
 * Gói thuê dài hạn — đúng sáu gói của ADR 0011, không có thời lượng tuỳ ý.
 *
 * `withReturnDate`: khay hành trình hiện thêm "đến 13/12/2026" ở mép phải (ngày nhận + N tháng
 * LỊCH, cùng hàm server dùng). Chỉ để khách hình dung: ngày thật do gian hàng chốt lúc duyệt.
 */
export function LongTermMonthsField({
  value,
  onChange,
  className,
  suffix,
  prefix,
  getPopupContainer,
  withReturnDate = false,
}: LongTermFieldProps & { withReturnDate?: boolean }) {
  const t = useTranslations('HomeSearch.longTerm');
  const fmt = useAppFormat();
  const options = useMemo(
    () =>
      LONG_TERM_PACKAGE_MONTHS.map((months) => ({
        value: months,
        label: fmt.packageLabel(months),
      })),
    [fmt],
  );
  const returnDate = withReturnDate
    ? fmt.date(startOfAppDay(longTermReturnDate(value)).toISOString())
    : null;

  return (
    <Select<LongTermPackageMonths>
      value={value.months}
      onChange={(months) => onChange({ ...value, months })}
      options={options}
      variant="borderless"
      prefix={prefix}
      suffixIcon={suffix}
      getPopupContainer={getPopupContainer}
      popupMatchSelectWidth={false}
      aria-label={t('monthsLabel')}
      className={cx(styles.months, className)}
      labelRender={({ label }) => (
        <span className={styles.monthsValue}>
          <span className={styles.monthsLabel}>{label}</span>
          {returnDate ? (
            <span className={styles.until}>{t('until', { date: returnDate })}</span>
          ) : null}
        </span>
      )}
    />
  );
}
