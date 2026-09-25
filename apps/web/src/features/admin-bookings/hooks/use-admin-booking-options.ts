'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_DATE_FIELD_VALUES, BOOKING_STATUS_SELECTABLE_VALUES } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { useDomainLabel } from '@/i18n/use-domain-label';

interface Option {
  value: string;
  label: string;
}

export interface AdminBookingOptions {
  /** Trạng thái đơn, đã kèm mục "Tất cả trạng thái" (`ALL_FILTER`) ở đầu. */
  status: Option[];
  /** Trường thời gian mà khoảng ngày áp lên (`createdAt` / `pickupAt`). */
  dateField: Option[];
}

/**
 * Option cho bộ lọc màn "Đơn thuê toàn hệ thống" — dựng lúc CHẠY vì nhãn đổi theo ngôn ngữ.
 *
 * Trước đây là hằng ở module scope sinh từ `*_META`/`*_LABEL` của `@xeprime/types`: tính đúng
 * MỘT lần cho cả tiến trình, nên nhãn tiếng Việt dính lại khi người dùng xem tiếng Anh. Giá trị
 * (mã đi trên query string) vẫn lấy từ `@xeprime/types` — web và api phải hiểu cùng một mã.
 *
 * Trạng thái dùng `BOOKING_STATUS_SELECTABLE_VALUES`: `confirmed` đã deprecated từ ADR 0047,
 * không còn đơn nào mang nó nên một lựa chọn lọc theo nó chỉ trả về danh sách rỗng.
 */
export function useAdminBookingOptions(): AdminBookingOptions {
  const domainLabel = useDomainLabel();
  const t = useTranslations('AdminBookings.filters');

  return useMemo(
    () => ({
      status: [
        { value: ALL_FILTER, label: t('allStatuses') },
        ...BOOKING_STATUS_SELECTABLE_VALUES.map((value) => ({
          value,
          label: domainLabel('bookingStatus', value),
        })),
      ],
      dateField: BOOKING_DATE_FIELD_VALUES.map((value) => ({
        value,
        label: domainLabel('bookingDateField', value),
      })),
    }),
    [domainLabel, t],
  );
}
