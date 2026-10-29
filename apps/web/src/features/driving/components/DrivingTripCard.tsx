'use client';

import {
  CheckOutlined,
  CloseOutlined,
  MessageOutlined,
  PhoneOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Popconfirm } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { chargedDays, driverTripBadges, driverWageLine, telHref, toAppTz } from '@xeprime/domain';
import { DRIVER_ASSIGNMENT_OUTCOME, holdRemainingMs, isDriverTripAwaitingAnswer } from '@xeprime/types';
import { ROUTES, drivingTripPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useAcceptDriverTrip, useDeclineDriverTrip } from '../hooks';
import type { DriverTrip } from '../types';
import { EmployerAvatar, Fact, ToneBadge } from './DriverCenterParts';
import { DropTripDialog } from './DropTripDialog';
import styles from './DriverCenter.module.css';

/**
 * Thẻ một chuyến nhìn từ tài xế — Figma "Vehicle Card" (`21777:56605`, `21788:58194`).
 *
 * Tiền công (ADR 0075): một dòng "Tiền công" ngay trong thẻ — tài xế thấy số TRƯỚC khi bấm Nhận, và
 * sau chuyến thấy "Đã nhận". Chỉ tiền công của chính tài xế; không có giá thuê hay tiền của khách.
 * Lịch sử sửa nằm ở trang chi tiết chuyến. Chân thẻ theo chặng:
 *  - chờ tôi nhận → đồng hồ hạn trả lời (ADR 0066) + Gọi khách / Từ chối / Nhận chuyến;
 *  - đã nhận, chưa giao xe → "Bạn đã xác nhận" (+ đồng hồ rút không phạt khi còn cửa sổ trả lại) +
 *    Gọi khách / Báo sự cố – Rút khỏi chuyến (ADR 0074);
 *  - đã qua → Liên hệ hỗ trợ.
 */
export function DrivingTripCard({ trip }: { trip: DriverTrip }) {
  const t = useTranslations('Driving.tripCard');
  const tBadge = useTranslations('Driving.tripBadge');
  const tDetail = useTranslations('Driving.detail');
  const tToast = useTranslations('Driving.toast');
  const tWage = useTranslations('Driving.wage');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const accept = useAcceptDriverTrip();
  const decline = useDeclineDriverTrip();
  const [dropOpen, setDropOpen] = useState(false);
  const busy = accept.isPending || decline.isPending;
  const onError = (err: unknown) => message.error(errorMessage(err));

  const open = trip.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN;
  const pending = isDriverTripAwaitingAnswer(trip);
  const callHref = trip.customer.phone ? telHref(trip.customer.phone) : null;
  const days = chargedDays(toAppTz(trip.pickupAt), toAppTz(trip.returnAt));
  const wage = driverWageLine(trip.wage);

  return (
    <article className={styles.card}>
      <div className={styles.tripMain}>
        <div className={styles.media}>
          {trip.vehicle.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
            <img src={trip.vehicle.mainImageUrl} alt="" loading="lazy" className={styles.image} />
          ) : (
            <div className={styles.imageFallback}>{t('noImage')}</div>
          )}
        </div>

        <div className={styles.details}>
          <div className={styles.tripHead}>
            <div className={styles.identity}>
              <p className={styles.code}>#{trip.code}</p>
              <div className={styles.nameRow}>
                <h3 className={styles.name}>
                  <Link
                    href={drivingTripPath.detail(trip.id)}
                    className={styles.nameLink}
                    aria-label={t('openDetail', { code: trip.code })}
                  >
                    {trip.vehicle.name}
                  </Link>
                </h3>
                {trip.vehicle.plateNumber ? (
                  <span className={styles.plate}>{trip.vehicle.plateNumber}</span>
                ) : null}
              </div>
            </div>
            <div className={styles.badges}>
              {driverTripBadges({ ...trip, respondedAt: trip.respondedAt ?? null }).map((badge) => (
                <ToneBadge key={badge.key} tone={badge.tone}>
                  {tBadge(badge.key)}
                </ToneBadge>
              ))}
            </div>
          </div>

          <dl className={styles.facts}>
            <Fact label={t('owner')}>
              <span className={styles.owner}>
                <EmployerAvatar
                  name={trip.employer.name}
                  avatarUrl={trip.employer.avatarUrl}
                  kind={trip.employer.kind}
                />
                {trip.employer.name}
              </span>
            </Fact>
            <Fact label={t('customer')}>
              {trip.customer.name}
              {trip.customer.phone ? (
                <span className={styles.muted}> | {trip.customer.phone}</span>
              ) : null}
            </Fact>
            <Fact label={t('time')}>
              {fmt.dateTimeRange(trip.pickupAt, trip.returnAt)}
              <span className={styles.muted}> {t('days', { count: days })}</span>
            </Fact>
            {trip.pickupAddress ? <Fact label={t('pickup')}>{trip.pickupAddress}</Fact> : null}
            {trip.destination ? <Fact label={t('destination')}>{trip.destination}</Fact> : null}
            {wage ? (
              <Fact label={tWage('title')}>
                <span className={wage.kind === 'none' ? styles.muted : styles.wage}>
                  {tWage(`line.${wage.kind}`, {
                    amount: fmt.money(wage.amount),
                    days: trip.wage.days ?? days,
                  })}
                </span>
              </Fact>
            ) : null}
          </dl>
        </div>
      </div>

      <div className={styles.footer}>
        {pending && trip.respondBy ? (
          <DeadlineNote
            deadline={trip.respondBy}
            prefix={t('respondLeft')}
            expired={t('respondExpired')}
            tone="danger"
          />
        ) : open && trip.releaseUntil ? (
          <DeadlineNote
            deadline={trip.releaseUntil}
            prefix={t('releaseLeft')}
            lead={t('confirmed')}
            tone="success"
          />
        ) : open && !pending ? (
          <p className={cx(styles.footerNote, styles.noteSuccess)}>{t('confirmed')}</p>
        ) : null}

        <div className={styles.actions}>
          {open && callHref ? (
            <Button href={callHref} icon={<PhoneOutlined />}>
              {t('callCustomer')}
            </Button>
          ) : null}

          {pending ? (
            <>
              <Popconfirm
                title={tDetail('declineConfirm')}
                okText={t('decline')}
                cancelText={tCommon('actions.close')}
                onConfirm={() =>
                  decline.mutate(trip.id, {
                    onSuccess: () => message.success(tToast('tripDeclined')),
                    onError,
                  })
                }
              >
                <Button
                  className={styles.dangerOutline}
                  icon={<CloseOutlined />}
                  loading={decline.isPending}
                  disabled={busy}
                >
                  {t('decline')}
                </Button>
              </Popconfirm>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={accept.isPending}
                disabled={busy}
                onClick={() =>
                  accept.mutate(trip.id, {
                    onSuccess: () => message.success(tToast('tripAccepted')),
                    onError,
                  })
                }
              >
                {t('accept')}
              </Button>
            </>
          ) : null}

          {trip.canDrop ? (
            <Button
              className={styles.dangerOutline}
              icon={<WarningOutlined />}
              disabled={busy}
              onClick={() => setDropOpen(true)}
            >
              {t('drop')}
            </Button>
          ) : null}

          {!open ? (
            <Button href={ROUTES.ACCOUNT.SUPPORT} icon={<MessageOutlined />}>
              {t('support')}
            </Button>
          ) : null}
        </div>
      </div>
      {trip.canDrop ? (
        <DropTripDialog trip={trip} open={dropOpen} onClose={() => setDropOpen(false)} />
      ) : null}
    </article>
  );
}

/** `hh:mm:ss` có đệm số 0 — đúng dạng bản vẽ ("00:59:38"). */
function paddedClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Dòng hạn ở chân thẻ. Mốc do SERVER chốt (`respondBy`, `releaseUntil`); đồng hồ chỉ hiển thị —
 * cửa chặn thật nằm trong câu `UPDATE` của lệnh. Hết giờ thì làm mới danh sách để nút biến mất.
 */
function DeadlineNote({
  deadline,
  prefix,
  expired,
  lead,
  tone,
}: {
  deadline: string;
  prefix: string;
  expired?: string;
  lead?: string;
  tone: 'danger' | 'success';
}) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = holdRemainingMs(deadline, new Date(now));

  useEffect(() => {
    if (holdRemainingMs(deadline) <= 0) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (holdRemainingMs(deadline) <= 0) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  }, [deadline]);

  const toneClass = tone === 'danger' ? styles.noteDanger : styles.noteSuccess;
  if (remaining <= 0) {
    return lead || expired ? (
      <p className={cx(styles.footerNote, toneClass)}>{lead ?? expired}</p>
    ) : null;
  }
  return (
    <p className={cx(styles.footerNote, toneClass)} suppressHydrationWarning>
      {lead ? (
        <>
          {lead} <span className={styles.muted}>{prefix}</span>
        </>
      ) : (
        prefix
      )}
      <span className={styles.clock}>{paddedClock(remaining)}</span>
    </p>
  );
}
