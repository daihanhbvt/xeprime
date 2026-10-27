'use client';

import { CheckOutlined, PhoneOutlined } from '@ant-design/icons';
import { App, Button, Popconfirm } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { driverLinkTone, telHref } from '@xeprime/domain';
import { DRIVER_LINK_STATUS } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useAcceptDriverLink, useDeclineDriverLink, useLeaveDriverLink } from '../hooks';
import type { MyDriverLink } from '../types';
import { EmployerAvatar, Fact, ToneBadge } from './DriverCenterParts';
import styles from './DriverCenter.module.css';

type LinkStatusKey = 'invited' | 'active' | 'suspended' | 'declined' | 'ended';

/**
 * Thẻ một chủ xe đối tác nhìn từ tài xế — Figma `21788:62965`. Bấm thẻ mở popup chi tiết
 * (`21788:71387`). Không có dòng "Doanh thu nhận được": tài xế không thấy tiền (ADR 0063 điều 10).
 *
 * Hành động theo trạng thái liên kết: lời mời → Liên hệ / Từ chối / Xác nhận hợp tác; đang hợp tác
 * hoặc tạm khoá → Ngừng làm tài xế / Liên hệ; đã kết thúc → Liên hệ.
 */
export function DriverLinkCard({ link }: { link: MyDriverLink }) {
  const t = useTranslations('Driving.linkCard');
  const tStatus = useTranslations('Driving.linkStatus');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [detailOpen, setDetailOpen] = useState(false);

  const invited = link.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const working =
    link.linkStatus === DRIVER_LINK_STATUS.ACTIVE ||
    link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED;

  return (
    <article className={cx(styles.card, styles.partnerCard)}>
      <button
        type="button"
        className={styles.partnerOpen}
        aria-label={t('openDetail', { name: link.employer.name })}
        onClick={() => setDetailOpen(true)}
      />
      <div className={styles.partnerHead}>
        <div className={styles.partnerIdentity}>
          <EmployerAvatar
            name={link.employer.name}
            avatarUrl={link.employer.avatarUrl}
            kind={link.employer.kind}
            size="lg"
          />
          <h3 className={styles.name}>{link.employer.name}</h3>
          <ToneBadge tone={driverLinkTone(link.linkStatus)}>
            {tStatus(link.linkStatus as LinkStatusKey)}
          </ToneBadge>
        </div>
        <div className={cx(styles.actions, styles.raised)}>
          <LinkActions link={link} invited={invited} working={working} />
        </div>
      </div>

      <div className={styles.partnerFacts}>
        <dl className={styles.facts}>
          <Fact label={t('ownerKind')}>{domainLabel('driverEmployerKind', link.employer.kind)}</Fact>
          {working ? (
            <Fact label={t('completedTrips')}>{fmt.count(link.completedTripCount)}</Fact>
          ) : null}
          <Fact label={t('driverType')}>{domainLabel('driverType', link.driverType)}</Fact>
          {working ? (
            <Fact label={t('activeTrips')}>{fmt.count(link.activeTripCount)}</Fact>
          ) : null}
          <Fact label={invited ? t('invitedAt') : t('joinedAt')}>
            {fmt.dateTime(invited ? link.invitedAt : (link.respondedAt ?? link.invitedAt))}
          </Fact>
        </dl>
      </div>

      <DriverLinkDialog
        link={link}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        invited={invited}
        working={working}
      />
    </article>
  );
}

/** Hàng nút của một liên kết — dùng ở thẻ và ở chân popup. */
function LinkActions({
  link,
  invited,
  working,
  primaryContact = false,
}: {
  link: MyDriverLink;
  invited: boolean;
  working: boolean;
  /** Popup: "Liên hệ" là nút chính (vàng) như bản vẽ. */
  primaryContact?: boolean;
}) {
  const t = useTranslations('Driving.linkCard');
  const tDriving = useTranslations('Driving.links');
  const tToast = useTranslations('Driving.toast');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const accept = useAcceptDriverLink();
  const decline = useDeclineDriverLink();
  const leave = useLeaveDriverLink();
  const busy = accept.isPending || decline.isPending || leave.isPending;

  const feedback = (key: 'linkAccepted' | 'linkDeclined' | 'linkLeft') => ({
    onSuccess: () => message.success(tToast(key)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });

  const contact = link.employer.phone ? (
    <Button
      href={telHref(link.employer.phone) ?? undefined}
      type={primaryContact ? 'primary' : 'default'}
      icon={<PhoneOutlined />}
    >
      {t('contact')}
    </Button>
  ) : null;

  const leaveButton = working ? (
    <Popconfirm
      title={tDriving('leaveConfirm')}
      okText={t('leave')}
      okButtonProps={{ danger: true }}
      cancelText={tCommon('actions.close')}
      onConfirm={() => leave.mutate(link.id, feedback('linkLeft'))}
    >
      <Button className={styles.dangerOutline} loading={leave.isPending} disabled={busy}>
        {t('leave')}
      </Button>
    </Popconfirm>
  ) : null;

  if (invited) {
    return (
      <>
        {contact}
        <Popconfirm
          title={tDriving('declineConfirm')}
          okText={t('decline')}
          cancelText={tCommon('actions.close')}
          onConfirm={() => decline.mutate(link.id, feedback('linkDeclined'))}
        >
          <Button className={styles.dangerOutline} loading={decline.isPending} disabled={busy}>
            {t('decline')}
          </Button>
        </Popconfirm>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          loading={accept.isPending}
          disabled={busy}
          onClick={() => accept.mutate(link.id, feedback('linkAccepted'))}
        >
          {t('accept')}
        </Button>
      </>
    );
  }
  return (
    <>
      {leaveButton}
      {contact}
    </>
  );
}

/** Popup "Chi tiết chủ xe đối tác" — Figma `21788:71387`. */
function DriverLinkDialog({
  link,
  open,
  onClose,
  invited,
  working,
}: {
  link: MyDriverLink;
  open: boolean;
  onClose: () => void;
  invited: boolean;
  working: boolean;
}) {
  const t = useTranslations('Driving.linkDialog');
  const tCard = useTranslations('Driving.linkCard');
  const tStatus = useTranslations('Driving.linkStatus');
  const tDetail = useTranslations('Driving.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const kind = domainLabel('driverEmployerKind', link.employer.kind);
  const empty = tDetail('emptyValue');
  const contact = link.employerContact;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={t('title')}
      size="sm"
      footer={
        <div className={styles.actions}>
          <LinkActions link={link} invited={invited} working={working} primaryContact />
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <div className={styles.profile}>
          <EmployerAvatar
            name={link.employer.name}
            avatarUrl={link.employer.avatarUrl}
            kind={link.employer.kind}
            size="xl"
          />
          <div className={styles.profileText}>
            <div className={styles.nameRow}>
              <p className={styles.name}>{link.employer.name}</p>
              <ToneBadge tone={driverLinkTone(link.linkStatus)}>
                {tStatus(link.linkStatus as LinkStatusKey)}
              </ToneBadge>
            </div>
            <p className={cx(styles.footerNote, styles.muted)}>{t('subtitle', { kind })}</p>
          </div>
        </div>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('contactSection')}</h4>
          <dl className={styles.facts}>
            <Fact label={t('representative')}>{contact.representativeName ?? empty}</Fact>
            <Fact label={t('phone')}>{link.employer.phone ?? empty}</Fact>
            <Fact label={t('email')}>{contact.email ?? empty}</Fact>
            <Fact label={t('area')}>{contact.areaName ?? empty}</Fact>
          </dl>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('partnershipSection')}</h4>
          <dl className={styles.facts}>
            <Fact label={tCard('ownerKind')}>{kind}</Fact>
            <Fact label={tCard('driverType')}>{domainLabel('driverType', link.driverType)}</Fact>
            <Fact label={invited ? tCard('invitedAt') : tCard('joinedAt')}>
              {fmt.dateTime(invited ? link.invitedAt : (link.respondedAt ?? link.invitedAt))}
            </Fact>
          </dl>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('completedTrips')}</span>
              <span className={styles.statValue}>{fmt.count(link.completedTripCount)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('activeTrips')}</span>
              <span className={styles.statValue}>{fmt.count(link.activeTripCount)}</span>
            </div>
          </div>
        </section>
      </div>
    </ResponsiveDialog>
  );
}
