'use client';

import { DatePicker } from 'antd';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import styles from './DriversPage.module.css';

/** Tháng thống kê tiền công trên URL — `YYYY-MM` (giờ VN), cùng định dạng server nhận. */
export const DRIVER_MONTH_FORMAT = 'YYYY-MM';
export const DRIVER_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Bộ chọn tháng thống kê tiền công — một bản cho cột tháng của trang Tài xế và ngăn chi tiết, vì
 * hai nơi đọc CÙNG tham số `month` trên URL (đổi ở đâu thì cả hai cùng đổi).
 */
export function DriverMonthPicker({
  month,
  onChange,
}: {
  /** `YYYY-MM` — bỏ trống = tháng hiện tại. */
  month: string | undefined;
  onChange: (month: string) => void;
}) {
  const t = useTranslations('Drivers.wage.month');
  const fmt = useAppFormat();
  const value = month ? dayjs(month, DRIVER_MONTH_FORMAT) : nowInAppTz();
  return (
    <DatePicker
      picker="month"
      className={styles.month}
      value={value}
      format={(v) => fmt.monthYear(v.toDate())}
      allowClear={false}
      aria-label={t('label')}
      placeholder={t('placeholder')}
      /* Tháng sau chưa có chuyến nào kết thúc — một cột rỗng của tương lai không nói lên điều gì. */
      maxDate={nowInAppTz()}
      onChange={(v) => {
        if (v) onChange(v.format(DRIVER_MONTH_FORMAT));
      }}
    />
  );
}
