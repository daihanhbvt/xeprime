'use client';

import { CalendarOutlined } from '@ant-design/icons';
import { DatePicker } from 'antd';
import { useTranslations } from 'next-intl';
import { AutoSearchInput } from '@/components/filter/AutoSearchInput';
import { useDatePickerPattern } from '@/i18n/use-app-format';
import { DAY_PARAM_FORMAT, dayjs } from '@/lib/datetime';
import type { TripListNarrow } from '../api';
import styles from './TripHistoryFilters.module.css';

/**
 * Hàng lọc của tab "Lịch sử chuyến đi" — Figma `19879:72400`: ô "Tìm kiếm chuyến đi" (kính lúp bên
 * trái) + ô "Chọn khoảng thời gian" (lịch bên phải), hai cột bằng nhau, cao 44, bo 12.
 *
 * Lọc ở SERVER (`GET /trips?q=&dateFrom=&dateTo=`) — giá trị sống trên URL (ADR 0004).
 */
export function TripHistoryFilters({
  narrow,
  onChange,
}: {
  narrow: TripListNarrow;
  onChange: (next: TripListNarrow) => void;
}) {
  const t = useTranslations('Trips.list');
  const datePattern = useDatePickerPattern();

  return (
    <div className={styles.row}>
      <AutoSearchInput
        className={styles.field}
        size="large"
        aria-label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        value={narrow.q}
        maxLength={80}
        onSearch={(q) => onChange({ ...narrow, q: q || undefined })}
      />
      <DatePicker.RangePicker
        className={styles.field}
        size="large"
        aria-label={t('rangeLabel')}
        placeholder={[t('rangeStart'), t('rangeEnd')]}
        allowEmpty={[true, true]}
        suffixIcon={<CalendarOutlined />}
        format={datePattern.date}
        value={[
          narrow.from ? dayjs(narrow.from, DAY_PARAM_FORMAT) : null,
          narrow.to ? dayjs(narrow.to, DAY_PARAM_FORMAT) : null,
        ]}
        onChange={(dates) =>
          onChange({
            ...narrow,
            from: dates?.[0] ? dates[0].format(DAY_PARAM_FORMAT) : undefined,
            to: dates?.[1] ? dates[1].format(DAY_PARAM_FORMAT) : undefined,
          })
        }
      />
    </div>
  );
}
