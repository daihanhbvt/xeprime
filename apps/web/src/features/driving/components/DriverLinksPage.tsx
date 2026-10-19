'use client';

import { App, Button, Pagination, Popconfirm, Segmented, Skeleton } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { DRIVER_LINK_END_PARTY, DRIVER_LINK_STATUS, DRIVER_LINK_STATUS_META } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { drivingTripPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useAcceptDriverLink,
  useDeclineDriverLink,
  useLeaveDriverLink,
  useMyDriverLinks,
} from '../hooks';
import { DRIVER_LINK_SCOPE, type DriverLinkScope, type MyDriverLink } from '../types';
import styles from './Driving.module.css';

/**
 * "Nơi tôi làm tài xế" (`/account/driving`, ADR 0063) — lời mời + liên kết của tài khoản khách này.
 * Phạm vi (hiện tại / đã kết thúc) và trang sống trên URL (ADR 0004).
 */
export function DriverLinksPage() {
  return (
    <Suspense fallback={null}>
      <DriverLinksInner />
    </Suspense>
  );
}

function DriverLinksInner() {
  const t = useTranslations('Driving.links');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const errorMessage = useErrorMessage();

  const scope: DriverLinkScope =
    params?.get('scope') === DRIVER_LINK_SCOPE.CLOSED
      ? DRIVER_LINK_SCOPE.CLOSED
      : DRIVER_LINK_SCOPE.OPEN;
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);

  const { data, isLoading, isError, error, refetch } = useMyDriverLinks(scope, page);

  function navigate(next: { scope?: DriverLinkScope; page?: number }) {
    const search = new URLSearchParams(params?.toString() ?? '');
    const nextScope = next.scope ?? scope;
    const nextPage = next.page ?? (next.scope !== undefined ? 1 : page);
    if (nextScope === DRIVER_LINK_SCOPE.OPEN) search.delete('scope');
    else search.set('scope', nextScope);
    if (nextPage <= 1) search.delete('page');
    else search.set('page', String(nextPage));
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('heading')}</h1>
        <p className={styles.sub}>{t('sub')}</p>
      </header>

      <Segmented<DriverLinkScope>
        aria-label={t('scopeLabel')}
        value={scope}
        onChange={(value) => navigate({ scope: value })}
        options={[
          { value: DRIVER_LINK_SCOPE.OPEN, label: t('scopeOpen') },
          { value: DRIVER_LINK_SCOPE.CLOSED, label: t('scopeClosed') },
        ]}
      />

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : isError ? (
        <EmptyState
          variant="error"
          title={t('loadError')}
          description={errorMessage(error)}
          action={
            <Button type="primary" onClick={() => void refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="empty"
          title={scope === DRIVER_LINK_SCOPE.OPEN ? t('emptyOpenTitle') : t('emptyClosedTitle')}
          description={scope === DRIVER_LINK_SCOPE.OPEN ? t('emptyOpenBody') : undefined}
        />
      ) : (
        <ul className={styles.list}>
          {items.map((link) => (
            <li key={link.id}>
              <DriverLinkCard link={link} />
            </li>
          ))}
        </ul>
      )}

      {meta && meta.total > meta.limit ? (
        <div className={styles.pager}>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            showSizeChanger={false}
            onChange={(next) => navigate({ page: next })}
          />
        </div>
      ) : null}
    </div>
  );
}

function DriverLinkCard({ link }: { link: MyDriverLink }) {
  const t = useTranslations('Driving.links');
  const tToast = useTranslations('Driving.toast');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const accept = useAcceptDriverLink();
  const decline = useDeclineDriverLink();
  const leave = useLeaveDriverLink();
  const busy = accept.isPending || decline.isPending || leave.isPending;

  const feedback = (key: 'linkAccepted' | 'linkDeclined' | 'linkLeft') => ({
    onSuccess: () => message.success(tToast(key)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });

  const invited = link.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const working =
    link.linkStatus === DRIVER_LINK_STATUS.ACTIVE ||
    link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED;
  const closed = !invited && !working;

  return (
    <article className={`${styles.card} ${invited ? styles.cardPending : ''}`}>
      <div className={styles.cardHead}>
        <div>
          <p className={styles.title}>{link.employer.name}</p>
          <p className={styles.meta}>
            {domainLabel('driverEmployerKind', link.employer.kind)} ·{' '}
            {domainLabel('driverType', link.driverType)}
          </p>
        </div>
        <StatusTag
          value={link.linkStatus}
          meta={DRIVER_LINK_STATUS_META}
          group="driverLinkStatus"
        />
      </div>

      <p className={styles.meta}>
        {closed && link.endedAt
          ? t('endedAt', { time: fmt.dateTime(link.endedAt) })
          : t('invitedAt', { time: fmt.dateTime(link.invitedAt) })}
        {closed && link.endedByParty
          ? ` · ${
              link.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
                ? t('endedByDriver')
                : t('endedByEmployer')
            }`
          : ''}
      </p>
      {link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? (
        <p className={styles.warn}>{t('suspendedHint')}</p>
      ) : null}
      {working && link.activeTripCount > 0 ? (
        <p className={styles.meta}>
          <Link href={drivingTripPath.list} className={styles.backLink}>
            {t('activeTrips', { count: link.activeTripCount })}
          </Link>
        </p>
      ) : null}

      <div className={styles.actions}>
        {link.employer.phone ? (
          <Button href={`tel:${link.employer.phone}`}>
            {t('callEmployer', { phone: link.employer.phone })}
          </Button>
        ) : null}
        {invited ? (
          <>
            <Button
              type="primary"
              loading={accept.isPending}
              disabled={busy}
              onClick={() => accept.mutate(link.id, feedback('linkAccepted'))}
            >
              {t('accept')}
            </Button>
            <Popconfirm
              title={t('declineConfirm')}
              okText={t('decline')}
              cancelText={tCommon('actions.close')}
              onConfirm={() => decline.mutate(link.id, feedback('linkDeclined'))}
            >
              <Button danger loading={decline.isPending} disabled={busy}>
                {t('decline')}
              </Button>
            </Popconfirm>
          </>
        ) : null}
        {working ? (
          <Popconfirm
            title={t('leaveConfirm')}
            okText={t('leave')}
            cancelText={tCommon('actions.close')}
            onConfirm={() => leave.mutate(link.id, feedback('linkLeft'))}
          >
            <Button danger loading={leave.isPending} disabled={busy}>
              {t('leave')}
            </Button>
          </Popconfirm>
        ) : null}
      </div>
    </article>
  );
}
