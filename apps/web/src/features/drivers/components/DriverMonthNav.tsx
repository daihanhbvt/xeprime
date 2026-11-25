'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { DRIVER_MONTH_FORMAT, DriverMonthPicker } from './DriverMonthPicker';
import styles from './DriverDetail.module.css';

/**
 * "‹ [Tháng 10/2026] ›" ở góc phải trang chi tiết tài xế (Figma `24042:71009`). Hai mũi tên lùi /
 * tiến một tháng; tháng sau tháng hiện tại không có gì để xem nên mũi tên phải tắt ở tháng này.
 */
export function DriverMonthNav({
  month,
  onChange,
}: {
  /** `YYYY-MM` — bỏ trống = tháng hiện tại. */
  month: string | undefined;
  onChange: (month: string) => void;
}) {
  const t = useTranslations('Drivers.detailPage.month');
  const current = month ? dayjs(month, DRIVER_MONTH_FORMAT) : nowInAppTz().startOf('month');
  const atLatest = !current.isBefore(nowInAppTz().startOf('month'), 'month');
  const shift = (delta: number) => onChange(current.add(delta, 'month').format(DRIVER_MONTH_FORMAT));

  return (
    <div className={styles.monthNav}>
      <Button icon={<LeftOutlined />} aria-label={t('previous')} onClick={() => shift(-1)} />
      <DriverMonthPicker month={current.format(DRIVER_MONTH_FORMAT)} onChange={onChange} />
      <Button
        icon={<RightOutlined />}
        aria-label={t('next')}
        disabled={atLatest}
        onClick={() => shift(1)}
      />
    </div>
  );
}
