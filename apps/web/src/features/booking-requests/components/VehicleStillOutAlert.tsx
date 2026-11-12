'use client';

import { Alert } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { bookingPath } from '@/constants/routes';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import type { BookingRequestItem } from '../types';

const MS_PER_MINUTE = 60_000;

/**
 * Cảnh báo trong hộp DUYỆT: chiếc xe của yêu cầu còn ở ngoài với một chuyến đã quá giờ trả
 * (`vehicleStillOut`, server tính lúc đọc chi tiết). Lịch xe chỉ chặn tới giờ trả gốc nên duyệt vẫn
 * được — đây là lời nhắc cho người duyệt, không phải cổng chặn; "Đặt ngay" đã tự dừng với xe này.
 */
export function VehicleStillOutAlert({
  stillOut,
}: {
  stillOut: BookingRequestItem['vehicleStillOut'];
}) {
  const t = useTranslations('BookingRequests.approve.stillOut');
  const fmt = useAppFormat();
  const now = useNow();
  if (!stillOut) return null;

  const overdueMinutes = Math.max(
    1,
    Math.round((now - new Date(stillOut.returnAt).getTime()) / MS_PER_MINUTE),
  );
  return (
    <Alert
      type="warning"
      showIcon
      title={t('title', {
        code: stillOut.bookingCode,
        duration: fmt.roughDuration(overdueMinutes),
      })}
      description={
        <>
          {t('body')} <Link href={bookingPath.detail(stillOut.bookingId)}>{t('open')}</Link>
        </>
      }
    />
  );
}
