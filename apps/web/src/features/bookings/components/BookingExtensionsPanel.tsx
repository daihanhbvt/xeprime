'use client';

import { SyncOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BOOKING_EXTENSION_STATUS,
  BOOKING_EXTENSION_STATUS_META,
  BOOKING_STATUS,
  PERMISSION,
  SERVICE_TYPE,
} from '@xeprime/types';
import { SectionCard } from '@/components/layout/SectionCard';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useBookingExtensions } from '../hooks/use-booking-extensions';
import type { BookingDetail } from '../types';
import { ExtendBookingDialog } from './ExtendBookingDialog';
import styles from './BookingExtensionsPanel.module.css';

/**
 * PHỤ LỤC GIA HẠN của một đơn dài hạn trên trang chi tiết (ADR 0077): lịch sử các lần gia hạn +
 * lối "Gia hạn" / "Xem mã thanh toán". Đơn không phải dài hạn ⇒ không có khối này.
 */
export function BookingExtensionsPanel({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.extension');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const settlementHidden = useSupportHides(SUPPORT_HIDDEN_AREA.SETTLEMENT);
  const longTerm = booking.serviceType === SERVICE_TYPE.LONG_TERM;
  const extensions = useBookingExtensions(booking.id, longTerm && !settlementHidden);
  const [open, setOpen] = useState(false);

  if (!longTerm || settlementHidden) return null;
  const rows = extensions.data ?? [];
  // Chỉ đơn đặt qua chợ: đơn tự lập không có tài khoản khách nhận QR / tiền hoàn (ADR 0077).
  const canExtend =
    has(PERMISSION.BOOKING_UPDATE) &&
    booking.status === BOOKING_STATUS.ACTIVE &&
    booking.bookingRequestId != null;
  const pending = rows.some((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);
  if (!canExtend && rows.length === 0 && !extensions.isError) return null;

  return (
    <>
      <SectionCard
        title={t('panelTitle')}
        className={styles.panel}
        extra={
          canExtend ? (
            <Button icon={<SyncOutlined />} onClick={() => setOpen(true)}>
              {pending ? t('viewPayment') : t('action')}
            </Button>
          ) : null
        }
      >
        {extensions.isError ? (
          <Alert type="error" showIcon message={errorMessage(extensions.error)} />
        ) : rows.length === 0 ? (
          <p className={styles.empty}>{t('freeNote')}</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((e) => (
              <li key={e.id} className={styles.row}>
                <span className={styles.summary}>
                  {t('rowSummary', {
                    months: e.months,
                    from: fmt.shortDateTime(e.fromAt),
                    to: fmt.shortDateTime(e.toAt),
                  })}
                </span>
                <span className={styles.amount}>{fmt.money(e.rentalAmount)}</span>
                <ToneDotBadge color={BOOKING_EXTENSION_STATUS_META[e.status].color}>
                  {t(`status.${e.status}`)}
                </ToneDotBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {open ? <ExtendBookingDialog booking={booking} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
