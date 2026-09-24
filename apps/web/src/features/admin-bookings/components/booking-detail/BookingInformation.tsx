'use client';

import { App } from 'antd';
import Link from 'next/link';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION, TENANT_STATUS_META, type TenantStatus } from '@xeprime/types';
import { MaskedContact } from '@/components/data-display/MaskedContact';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useRevealBookingContact } from '../../hooks/use-admin-bookings';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

/**
 * "Thông tin đơn" — các dòng nhãn/giá trị.
 *
 * Không có dòng "Điểm nhận xe": `PlatformBookingDetailDto` không mang địa chỉ nhận xe, và một
 * dòng luôn hiện "—" sẽ bị đọc thành "đơn này không có điểm nhận". Tên khách không phải link:
 * DTO không có id tài khoản khách để trỏ tới hồ sơ.
 */
export function BookingInformation({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.info');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const reveal = useRevealBookingContact(booking.id);
  const titleId = useId();

  const vehicleLabel = booking.vehiclePlateNumber
    ? `${booking.vehicleName} · ${booking.vehiclePlateNumber}`
    : booking.vehicleName;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {t('title')}
      </h3>
      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt>{t('customer')}</dt>
          <dd>
            <div className={styles.fieldPrimary}>{booking.customerName}</div>
            <MaskedContact
              masked={booking.customerPhoneMasked}
              revealed={reveal.data?.customerPhone}
              canReveal={has(PERMISSION.PLATFORM_CUSTOMER_PII_VIEW)}
              loading={reveal.isPending}
              onReveal={() =>
                reveal.mutate(undefined, {
                  onError: (err) => message.error(errorMessage(err)),
                })
              }
            />
          </dd>
        </div>
        <div className={styles.field}>
          <dt>{t('tenant')}</dt>
          <dd>
            <span className={styles.inline}>
              <Link
                href={`${ROUTES.MANAGE.ADMIN_TENANTS}?q=${encodeURIComponent(booking.tenantName)}`}
              >
                {booking.tenantName}
              </Link>
              <StatusTag
                value={booking.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
            </span>
          </dd>
        </div>
        <div className={styles.field}>
          <dt>{t('vehicle')}</dt>
          <dd>
            {/* Biển số trúng đúng một xe; tên xe thì nhiều gian hàng trùng nhau. */}
            <Link
              href={`${ROUTES.MANAGE.ADMIN_VEHICLES}?q=${encodeURIComponent(
                booking.vehiclePlateNumber ?? booking.vehicleName,
              )}`}
            >
              {vehicleLabel}
            </Link>
          </dd>
        </div>
        <div className={styles.field}>
          <dt>{t('service')}</dt>
          <dd>{domainLabel('serviceType', booking.serviceType)}</dd>
        </div>
        {booking.note ? (
          <div className={styles.field}>
            <dt>{t('note')}</dt>
            <dd className={styles.note}>{booking.note}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
