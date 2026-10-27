'use client';

import { ArrowLeftOutlined, EnvironmentOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, App, Button, Popconfirm, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { API_ERROR_CODE, isDriverTripAwaitingAnswer } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { drivingTripPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import {
  useAcceptDriverTrip,
  useDeclineDriverTrip,
  useDriverTrip,
  useReleaseDriverTrip,
} from '../hooks';
import { placeMapUrl } from '../maps';
import { DriverRespondCountdown } from './DriverRespondCountdown';
import { DrivingTripTags } from './DrivingTripTags';
import styles from './Driving.module.css';

/**
 * Chi tiết một chuyến tôi lái (`/trips/driving/:id`, ADR 0063) — chỉ xem, cộng nhận/từ chối khi
 * lượt gán còn `pending`. SĐT khách do SERVER che ngoài cửa sổ quanh chuyến; màn này chỉ nói khi
 * nào nó hiện (`contactVisibleFrom`), không tự tính.
 */
export function DrivingTripDetailView({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Driving.detail');
  const tToast = useTranslations('Driving.toast');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const { data: trip, isLoading, isError, error, refetch } = useDriverTrip(bookingId);
  const accept = useAcceptDriverTrip();
  const decline = useDeclineDriverTrip();
  const release = useReleaseDriverTrip();
  const tCard = useTranslations('Driving.tripCard');
  const busy = accept.isPending || decline.isPending || release.isPending;

  const back = (
    <Link href={drivingTripPath.list} className={styles.backLink}>
      <ArrowLeftOutlined /> {t('back')}
    </Link>
  );

  if (isLoading) {
    return (
      <div className={styles.page}>
        {back}
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !trip) {
    const notFound = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <div className={styles.page}>
        {back}
        <EmptyState
          variant="error"
          title={t('loadError')}
          description={notFound ? t('notFound') : errorMessage(error)}
          action={
            notFound ? undefined : (
              <Button type="primary" onClick={() => void refetch()}>
                {t('retry')}
              </Button>
            )
          }
        />
      </div>
    );
  }

  // Chuyến đã không còn giao cho mình (bị gỡ / từ chối / đơn khép) thì không còn gì để trả lời.
  const pending = isDriverTripAwaitingAnswer(trip);
  const pickupMap = placeMapUrl(trip.pickupAddress, trip.pickupLatitude, trip.pickupLongitude);
  const destinationMap = placeMapUrl(
    trip.destination,
    trip.destinationLatitude,
    trip.destinationLongitude,
  );
  const empty = t('emptyValue');

  return (
    <div className={styles.page}>
      {back}
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('title', { code: trip.code })}</h1>
        <div>
          <DrivingTripTags trip={trip} />
        </div>
        <p className={styles.sub}>
          {trip.respondedAt
            ? t('respondedAt', { time: fmt.dateTime(trip.respondedAt) })
            : t('assignedAt', { time: fmt.dateTime(trip.assignedAt) })}
        </p>
      </header>

      {pending ? (
        <Alert
          type="warning"
          showIcon
          title={t('pendingTitle')}
          description={
            <>
              <p className={styles.meta}>{t('pendingBody')}</p>
              <DriverRespondCountdown respondBy={trip.respondBy} />
              <div className={styles.actions}>
                <Button
                  type="primary"
                  loading={accept.isPending}
                  disabled={busy}
                  onClick={() =>
                    accept.mutate(trip.id, {
                      onSuccess: () => message.success(tToast('tripAccepted')),
                      onError: (err) => message.error(errorMessage(err)),
                    })
                  }
                >
                  {t('accept')}
                </Button>
                <Popconfirm
                  title={t('declineConfirm')}
                  okText={t('decline')}
                  cancelText={tCommon('actions.close')}
                  onConfirm={() =>
                    decline.mutate(trip.id, {
                      onSuccess: () => {
                        message.success(tToast('tripDeclined'));
                        // Từ chối xong chuyến không còn là của mình — về danh sách.
                        router.replace(drivingTripPath.list);
                      },
                      onError: (err) => message.error(errorMessage(err)),
                    })
                  }
                >
                  <Button danger loading={decline.isPending} disabled={busy}>
                    {t('decline')}
                  </Button>
                </Popconfirm>
              </div>
            </>
          }
        />
      ) : null}

      {trip.releaseUntil ? (
        <Alert
          type="success"
          showIcon
          title={tCard('confirmed')}
          description={
            <div className={styles.actions}>
              <Popconfirm
                title={tCard('releaseConfirmTitle')}
                description={tCard('releaseConfirmBody')}
                okText={tCard('release')}
                okButtonProps={{ danger: true }}
                cancelText={tCommon('actions.close')}
                onConfirm={() =>
                  release.mutate(trip.id, {
                    onSuccess: () => message.success(tToast('tripReleased')),
                    onError: (err) => message.error(errorMessage(err)),
                  })
                }
              >
                <Button danger loading={release.isPending} disabled={busy}>
                  {tCard('release')}
                </Button>
              </Popconfirm>
            </div>
          }
        />
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('schedule')}</h2>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>{t('pickupAt')}</dt>
            <dd>{fmt.dateTime(trip.pickupAt)}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t('returnAt')}</dt>
            <dd>{fmt.dateTime(trip.returnAt)}</dd>
          </div>
          {trip.actualPickupAt ? (
            <div className={styles.meta}>
              {t('actualPickupAt', { time: fmt.dateTime(trip.actualPickupAt) })}
            </div>
          ) : null}
          {trip.actualReturnAt ? (
            <div className={styles.meta}>
              {t('actualReturnAt', { time: fmt.dateTime(trip.actualReturnAt) })}
            </div>
          ) : null}
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('route')}</h2>
        <dl className={styles.rows}>
          {trip.routeType ? (
            <div className={styles.row}>
              <dt>{t('route')}</dt>
              <dd>{domainLabel('routeType', trip.routeType)}</dd>
            </div>
          ) : null}
          <div className={styles.row}>
            <dt>{t('pickupAddress')}</dt>
            <dd>{trip.pickupAddress ?? empty}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t('destination')}</dt>
            <dd>{trip.destination ?? empty}</dd>
          </div>
        </dl>
        <div className={styles.actions}>
          {pickupMap ? (
            <Button
              icon={<EnvironmentOutlined />}
              href={pickupMap}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openMap')} · {t('pickupAddress')}
            </Button>
          ) : null}
          {destinationMap ? (
            <Button
              icon={<EnvironmentOutlined />}
              href={destinationMap}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openMap')} · {t('destination')}
            </Button>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('vehicle')}</h2>
        <p className={styles.title}>
          {trip.vehicle.name}
          {trip.vehicle.plateNumber ? ` · ${trip.vehicle.plateNumber}` : ''}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('customer')}</h2>
        <p className={styles.title}>{trip.customer.name}</p>
        {trip.customer.phone ? (
          <div className={styles.actions}>
            <Button icon={<PhoneOutlined />} href={`tel:${trip.customer.phone}`}>
              {t('callCustomer')} · {trip.customer.phone}
            </Button>
          </div>
        ) : trip.customer.contactVisibleFrom ? (
          <p className={styles.meta}>
            {t('contactFrom', { time: fmt.dateTime(trip.customer.contactVisibleFrom) })}
          </p>
        ) : (
          <p className={styles.meta}>{t('contactHidden')}</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('employer')}</h2>
        <p className={styles.title}>{trip.employer.name}</p>
        <p className={styles.meta}>{domainLabel('driverEmployerKind', trip.employer.kind)}</p>
        {trip.employer.phone ? (
          <div className={styles.actions}>
            <Button icon={<PhoneOutlined />} href={`tel:${trip.employer.phone}`}>
              {t('callEmployer')} · {trip.employer.phone}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
