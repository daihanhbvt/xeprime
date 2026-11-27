'use client';

import { EditOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, isMarketplaceBooking } from '@xeprime/types';
import { BookingSourceChip } from '@/components/data-display/BookingSourceChip';
import { usePermissions } from '@/hooks/use-permissions';
import { BookingSourceDialog } from './BookingSourceDialog';
import styles from './BookingSourceControl.module.css';

interface BookingSourceControlProps {
  booking: {
    id: string;
    code: string;
    source: string;
    sourceLabel: string | null;
  };
}

/**
 * Nguồn đơn ở ĐẦU chi tiết đơn (ADR 0110) - đứng ngay cạnh nhãn chặng, kèm nút bút đổi nguồn. Nguồn
 * của đơn qua sàn do server gắn nên không có nút; đơn tự lập đổi được ở mọi trạng thái.
 */
export function BookingSourceControl({ booking }: BookingSourceControlProps) {
  const t = useTranslations('Bookings.source');
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);
  // Đơn qua sàn: nguồn mặc định, không nhãn và không đổi được - không vẽ gì.
  if (isMarketplaceBooking(booking.source)) return null;
  const canEdit = has(PERMISSION.BOOKING_UPDATE);

  return (
    <span className={styles.control}>
      <BookingSourceChip source={booking.source} sourceLabel={booking.sourceLabel} />
      {canEdit ? (
        <>
          <Tooltip title={t('edit.action')}>
            <Button
              type="text"
              size="small"
              className={styles.edit}
              icon={<EditOutlined />}
              aria-label={t('edit.action')}
              onClick={() => setOpen(true)}
            />
          </Tooltip>
          <BookingSourceDialog
            bookingId={booking.id}
            bookingCode={booking.code}
            source={booking.source}
            sourceLabel={booking.sourceLabel}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      ) : null}
    </span>
  );
}
