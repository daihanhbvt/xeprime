'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { DRIVER_LINK_END_PARTY, DRIVER_LINK_STATUS } from '@xeprime/types';
import { driverLinkTone } from '@xeprime/domain';
import { ToneBadge } from '@/components/data-display/ToneBadge';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { Driver } from '../types';
import { DriverLicenceStateTag } from './DriverLicenceStateTag';
import styles from './DriverDetail.module.css';

/**
 * Tab Hồ sơ — liên kết với tài khoản khách (ADR 0063). Bên thuê chỉ thấy TRẠNG THÁI bằng lái,
 * không ảnh, không số bằng. Mốc nào chưa xảy ra thì không hiện dòng đó.
 */
export function DriverProfileTab({ driver }: { driver: Driver }) {
  const t = useTranslations('Drivers.detail.profile');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const ended = driver.linkStatus === DRIVER_LINK_STATUS.ENDED;

  // Ba nhóm trong thẻ riêng có tiêu đề (người dùng 16/11/2026), thay cho MỘT lưới dài.
  const infoFacts: WorkDrawerFact[] = [
    { key: 'name', label: t('name'), value: driver.name },
    { key: 'phone', label: t('phone'), value: driver.phone },
    {
      key: 'account',
      label: t('account'),
      value: driver.account.displayName ?? tCommon('labels.emptyValue'),
    },
    {
      key: 'type',
      label: t('type'),
      value: <Tag>{domainLabel('driverType', driver.driverType, driver.driverType)}</Tag>,
    },
  ];
  const licenceFacts: WorkDrawerFact[] = [
    {
      key: 'licence',
      label: t('licence'),
      value: <DriverLicenceStateTag licence={driver.licence} invitedName={driver.name} />,
      wide: true,
    },
  ];
  const linkFacts: WorkDrawerFact[] = [
    {
      key: 'status',
      label: t('status'),
      value: (
        <ToneBadge tone={driverLinkTone(driver.linkStatus)}>
          {domainLabel('driverLinkStatus', driver.linkStatus)}
        </ToneBadge>
      ),
    },
    {
      key: 'active',
      label: t('activeBookings'),
      value: fmt.count(driver.activeBookingCount),
    },
    { key: 'invitedAt', label: t('invitedAt'), value: fmt.dateTime(driver.invitedAt) },
    ...(driver.respondedAt
      ? [{ key: 'respondedAt', label: t('respondedAt'), value: fmt.dateTime(driver.respondedAt) }]
      : []),
    ...(ended && driver.endedAt
      ? [
          {
            key: 'endedAt',
            label: t('endedAt'),
            value: (
              <>
                {fmt.dateTime(driver.endedAt)}
                {driver.endedByParty ? (
                  <span className={styles.sub}>
                    {' · '}
                    {driver.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
                      ? t('endedByDriver')
                      : t('endedByEmployer')}
                  </span>
                ) : null}
              </>
            ),
          },
        ]
      : []),
  ];
  const noteFacts: WorkDrawerFact[] = [
    {
      key: 'note',
      label: t('note'),
      value: driver.note ?? <span className={styles.muted}>{t('noNote')}</span>,
      wide: true,
      multiline: Boolean(driver.note),
    },
  ];

  const section = (key: string, title: string, items: WorkDrawerFact[]) => (
    <section key={key} className={styles.profileSection} aria-label={title}>
      <h3 className={styles.profileSectionTitle}>{title}</h3>
      <WorkDrawerFacts items={items} />
    </section>
  );

  return (
    <div className={styles.tabBody}>
      {section('info', t('sectionInfo'), infoFacts)}
      {section('licence', t('sectionLicence'), licenceFacts)}
      {section('link', t('sectionLink'), linkFacts)}
      {section('note', t('sectionNote'), noteFacts)}
    </div>
  );
}
