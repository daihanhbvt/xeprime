'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FEE_POLICY_STATUS_META, VEHICLE_TYPE_VALUES, type FeePolicyStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { commissionTierRanges } from '../form';
import { useFeePolicyFormat } from '../hooks/use-fee-policy-format';
import { useTierRangeLabel } from '../hooks/use-tier-range-label';
import type { FeePolicy } from '../types';
import styles from './FeePolicyDetailDrawer.module.css';

/**
 * Panel CHỈ ĐỌC của một phiên bản chính sách phí — đủ mọi con số của luồng tiền v2, kể cả với
 * bản đã lưu trữ (đối chiếu đơn cũ). Không có nút sửa: bản đã hiệu lực là bất biến, bản nháp sửa
 * qua form ở trang danh sách.
 */
export function FeePolicyDetailDrawer({
  policy,
  onClose,
}: {
  policy: FeePolicy | null;
  onClose: () => void;
}) {
  const t = useTranslations('FeePolicies.detail');

  return (
    <DetailDrawer
      open={Boolean(policy)}
      onClose={onClose}
      size="lg"
      title={policy ? t('title', { name: policy.name, version: policy.version }) : ''}
      extra={
        policy ? (
          <StatusTag
            value={policy.status as FeePolicyStatus}
            meta={FEE_POLICY_STATUS_META}
            group="feePolicyStatus"
          />
        ) : null
      }
    >
      {policy ? <Body key={policy.id} policy={policy} /> : null}
    </DetailDrawer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Body({ policy }: { policy: FeePolicy }) {
  const t = useTranslations('FeePolicies.detail');
  const tForm = useTranslations('FeePolicies.form');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pf = useFeePolicyFormat();
  const rangeLabel = useTierRangeLabel();
  const empty = tCommon('labels.emptyValue');
  const off = t('off');
  const perDay = (value: string) => t('perDay', { value: fmt.money(value) });

  const general: WorkDrawerFact[] = [
    { key: 'effectiveFrom', label: t('facts.effectiveFrom'), value: fmt.dateTime(policy.effectiveFrom) },
    { key: 'effectiveTo', label: t('facts.effectiveTo'), value: fmt.dateTime(policy.effectiveTo) },
    { key: 'activatedBy', label: t('facts.activatedBy'), value: policy.activatedByName ?? empty },
    { key: 'createdBy', label: t('facts.createdBy'), value: policy.createdByName ?? empty },
    { key: 'createdAt', label: t('facts.createdAt'), value: fmt.dateTime(policy.createdAt) },
    ...(policy.note
      ? [{ key: 'note', label: t('facts.note'), value: policy.note, wide: true, multiline: true }]
      : []),
  ];

  const platformFee: WorkDrawerFact[] = VEHICLE_TYPE_VALUES.map((type) => ({
    key: type,
    label: domainLabel('vehicleType', type),
    value: fmt.money(policy.customerPlatformFee[type]),
  }));

  const ranges = commissionTierRanges(policy.ownerCommissionTiers);
  const commission: WorkDrawerFact[] = ranges.flatMap((range, index) =>
    range
      ? [{ key: String(index), label: rangeLabel(range), value: pf.percent(range.percent) }]
      : [],
  );

  const deposit: WorkDrawerFact[] = [
    { key: 'depositPercent', label: tForm('depositPercent'), value: pf.percent(policy.depositPercent) },
    { key: 'depositMinAmount', label: tForm('depositMinAmount'), value: fmt.money(policy.depositMinAmount) },
    { key: 'depositMaxPercent', label: tForm('depositMaxPercent'), value: pf.percent(policy.depositMaxPercent) },
    { key: 'holdMinAmount', label: tForm('holdMinAmount'), value: fmt.money(policy.holdMinAmount) },
    {
      key: 'holdPaymentWindowMinutes',
      label: tForm('holdPaymentWindowMinutes'),
      value: tCommon('units.minute', { count: policy.holdPaymentWindowMinutes }),
    },
    {
      key: 'freeCancelHours',
      label: tForm('freeCancelHours'),
      value: tCommon('units.hour', { count: policy.freeCancelHours }),
    },
  ];

  const insurance: WorkDrawerFact[] = [
    {
      key: 'vehicleProtection',
      label: t('facts.vehicleProtection'),
      value: policy.vehicleProtectionEnabled ? (
        <PerVehicleList
          rows={VEHICLE_TYPE_VALUES.map((type) => ({
            key: type,
            label: domainLabel('vehicleType', type),
            value: perDay(policy.vehicleProtectionDailyAmount[type]),
          }))}
        />
      ) : (
        off
      ),
    },
    {
      key: 'personalAccident',
      label: t('facts.personalAccident'),
      value: policy.tripInsuranceEnabled ? (
        <PerVehicleList
          rows={VEHICLE_TYPE_VALUES.map((type) => ({
            key: type,
            label: domainLabel('vehicleType', type),
            value: perDay(policy.tripInsuranceDailyAmount[type]),
          }))}
        />
      ) : (
        off
      ),
    },
    { key: 'partner', label: t('facts.insurancePartner'), value: policy.insurancePartnerName ?? empty },
  ];

  const tax: WorkDrawerFact[] = policy.taxEnabled
    ? [
        {
          key: 'taxPercent',
          label: t('facts.taxPercent'),
          value: policy.taxPercent != null ? pf.percent(policy.taxPercent) : empty,
        },
        { key: 'taxLabel', label: t('facts.taxLabel'), value: policy.taxLabel ?? empty },
      ]
    : [{ key: 'taxOff', label: t('facts.taxPercent'), value: off }];

  /* Số của mô hình cũ — chỉ hiện khi phiên bản thật sự mang chúng (bản đời trước luồng tiền v2). */
  const legacy: WorkDrawerFact[] = [
    ...(policy.serviceFeePercent > 0
      ? [{ key: 'serviceFee', label: t('facts.serviceFeePercent'), value: pf.percent(policy.serviceFeePercent) }]
      : []),
    ...(policy.tripInsurancePercent != null
      ? [{ key: 'trip', label: t('facts.tripInsurancePercent'), value: pf.percent(policy.tripInsurancePercent) }]
      : []),
    ...(policy.vehicleProtectionPercent != null
      ? [
          {
            key: 'vehicle',
            label: t('facts.vehicleProtectionPercent'),
            value: pf.percent(policy.vehicleProtectionPercent),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.body}>
      <Section title={t('sections.general')}>
        <WorkDrawerFacts items={general} />
      </Section>
      <Section title={t('sections.platformFee')}>
        <WorkDrawerFacts items={platformFee} />
      </Section>
      <Section title={t('sections.commission')}>
        {commission.length > 0 ? <WorkDrawerFacts items={commission} /> : <p className={styles.muted}>{empty}</p>}
      </Section>
      <Section title={t('sections.deposit')}>
        <WorkDrawerFacts items={deposit} />
      </Section>
      <Section title={t('sections.insurance')}>
        <WorkDrawerFacts items={insurance} />
      </Section>
      <Section title={t('sections.tax')}>
        <WorkDrawerFacts items={tax} />
      </Section>
      {legacy.length > 0 ? (
        <Section title={t('sections.legacy')}>
          <Alert type="info" showIcon title={t('legacyHint')} className={styles.alert} />
          <WorkDrawerFacts items={legacy} />
        </Section>
      ) : null}
      {policy.activationBlockers.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={tForm('activationBlocked')}
          description={policy.activationBlockers
            .map((code) => domainLabel('feePolicyActivationBlocker', code))
            .join(' · ')}
        />
      ) : null}
    </div>
  );
}

function PerVehicleList({ rows }: { rows: { key: string; label: string; value: string }[] }) {
  return (
    <ul className={styles.perVehicle}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className={styles.muted}>{row.label}</span> {row.value}
        </li>
      ))}
    </ul>
  );
}
