import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import type { Dayjs } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Nhãn một khoảng thuê "nhận  →  trả" — dùng chung cho ô khoảng thuê ở thẻ tìm kiếm
 * (`RentalRangeField`) và ô "Thời gian thuê" trong tấm Bộ lọc, để hai nơi không tự ghép chuỗi.
 *
 * `compact` = bản gọn KHÔNG có thứ, đúng prop `compactPoint` mà `FilterModal` web truyền cho
 * `RentalDateTimeRangeField`; ô ở hero web dùng bản đầy đủ (có thứ).
 */
export function useRentalRangeLabel(compact = false) {
  const fmt = useAppFormat();
  const t = useTranslations('Common.components.rentalRange');

  return useCallback(
    (pickupAt: Dayjs | null, returnAt: Dayjs | null) => {
      const point = (value: Dayjs | null) =>
        value
          ? compact
            ? fmt.rentalPointCompact(value)
            : fmt.rentalPoint(value)
          : t('notSelected');
      return `${point(pickupAt)}  →  ${point(returnAt)}`;
    },
    [compact, fmt, t],
  );
}
