'use client';

import {
  BOOKING_DIRECT_SOURCE_VALUES,
  BOOKING_SOURCE,
  bookingSourceTakesLabel,
} from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';
import { AutoCompleteField } from '@/components/form/AutoCompleteField';
import { SelectField } from '@/components/form/SelectField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useBookingSourceLabels } from '../hooks/use-booking-source-labels';

interface BookingSourceFieldsProps<T extends FieldValues> {
  control: Control<T>;
  sourceName: Path<T>;
  labelName: Path<T>;
}

/**
 * Hai ô NGUỒN ĐƠN của đơn tự lập (ADR 0110): chọn kênh khách tới, và - với "Nền tảng khác" / "Nguồn
 * khác" - gõ tên nguồn. Ô tên gợi ý lại những nhãn gian hàng đã từng nhập, để một nguồn chỉ có MỘT
 * cách viết và bộ lọc gom được.
 *
 * `xeprime` không có trong danh sách: nguồn đó do server gắn cho đơn khách đặt qua sàn.
 */
export function BookingSourceFields<T extends FieldValues>({
  control,
  sourceName,
  labelName,
}: BookingSourceFieldsProps<T>) {
  const t = useTranslations('Bookings.source');
  const domainLabel = useDomainLabel();
  const source = useWatch({ control, name: sourceName }) as string | undefined;
  const takesLabel = Boolean(source) && bookingSourceTakesLabel(source as string);
  const labels = useBookingSourceLabels({ enabled: takesLabel });
  const isPlatform = source === BOOKING_SOURCE.OTHER_PLATFORM;

  return (
    <>
      <SelectField
        control={control}
        name={sourceName}
        label={t('label')}
        placeholder={t('placeholder')}
        options={BOOKING_DIRECT_SOURCE_VALUES.map((value) => ({
          value,
          label: domainLabel('bookingSource', value),
        }))}
        required
      />
      {takesLabel ? (
        <AutoCompleteField
          control={control}
          name={labelName}
          label={isPlatform ? t('platformLabel') : t('nameLabel')}
          placeholder={isPlatform ? t('platformPlaceholder') : t('namePlaceholder')}
          options={(labels.data ?? []).map((value) => ({ value }))}
          required
        />
      ) : null}
    </>
  );
}
