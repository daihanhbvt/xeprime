'use client';

import { EditOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { VEHICLE_TYPE_VALUES, parseTaxRates } from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { FEE_POLICY_FORM_TAB, commissionTierRanges, type FeePolicyFormTab } from '../form';
import { useFeePolicyFormat } from '../hooks/use-fee-policy-format';
import { useTierRangeLabel } from '../hooks/use-tier-range-label';
import type { FeePolicy } from '../types';
import { TaxRatesView } from './TaxRatesTable';
import styles from './FeePolicySummary.module.css';

/**
 * Mọi con số của MỘT phiên bản chính sách phí, chia theo khối nghiệp vụ — phần ĐỌC dùng chung:
 *  - `layout="grid"`: trang Chính sách phí, thẻ hai cột; mỗi thẻ có nút "Sửa" mở form ở đúng tab
 *    (`onEdit`). Thông tin phiên bản (ngày, người kích hoạt) do trang tự hiện ở đầu.
 *  - `layout="stack"`: panel chi tiết, xếp dọc, kèm thông tin phiên bản — đọc cả bản đã lưu trữ để
 *    đối chiếu đơn cũ.
 */
export function FeePolicySummary({
  policy,
  layout,
  onEdit,
}: {
  policy: FeePolicy;
  layout: 'grid' | 'stack';
  /** Có thì mỗi thẻ có nút "Sửa" mở form ở tab tương ứng. */
  onEdit?: (tab: FeePolicyFormTab) => void;
}) {
  const t = useTranslations('FeePolicies.detail');
  const tForm = useTranslations('FeePolicies.form');
  const tScope = useTranslations('FeePolicies.commissionScope');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pf = useFeePolicyFormat();
  const rangeLabel = useTierRangeLabel();
  const empty = tCommon('labels.emptyValue');
  const off = t('off');
  const perDay = (value: string) => t('perDay', { value: fmt.money(value) });
  // Bảo hiểm không còn là số của chính sách phí — quản lý ở Admin › Bảo hiểm (ADR 0098).

  const general: WorkDrawerFact[] = [
    {
      key: 'effectiveFrom',
      label: t('facts.effectiveFrom'),
      value: fmt.dateTime(policy.effectiveFrom),
    },
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
    value: pf.platformFeeOf(policy.customerPlatformFee, policy.customerPlatformFeeBasis, type),
  }));

  const ranges = commissionTierRanges(policy.ownerCommissionTiers);
  const commission: WorkDrawerFact[] = ranges.flatMap((range, index) =>
    range
      ? [{ key: String(index), label: rangeLabel(range), value: pf.percent(range.percent) }]
      : [],
  );

  const deposit: WorkDrawerFact[] = [
    {
      key: 'depositPercent',
      label: t('facts.depositPercent'),
      value: pf.percent(policy.depositPercent),
    },
    {
      key: 'depositMinAmount',
      label: tForm('depositMinAmount'),
      value: fmt.money(policy.depositMinAmount),
    },
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

  const booking: WorkDrawerFact[] = [
    {
      key: 'maxAdvanceBookingDays',
      label: tForm('maxAdvanceBookingDays'),
      value: tCommon('units.day', { count: policy.maxAdvanceBookingDays }),
    },
    {
      key: 'selfDriveMaxDays',
      label: tForm('selfDriveMaxDays'),
      value: tCommon('units.day', { count: policy.selfDriveMaxDays }),
    },
  ];

  /* Giới hạn chặn số vô lý của chuyến có tài xế (ADR 0075) — không phải dòng tiền. */
  const range = (r: { min: string; max: string }) =>
    t('rangePerDay', { min: fmt.money(r.min), max: fmt.money(r.max) });
  const withDriver: WorkDrawerFact[] = [
    {
      key: 'priceDaily',
      label: t('facts.withDriverPrice'),
      value: range(policy.withDriverLimits.priceDaily),
    },
    {
      key: 'wageDaily',
      label: t('facts.driverWage'),
      value: range(policy.withDriverLimits.wageDaily),
    },
    {
      key: 'wageSuggested',
      label: t('facts.driverWageSuggested'),
      value: perDay(policy.withDriverLimits.wageDailySuggested),
    },
  ];

  /*
   * Thuế (ADR 0068): bảng mức theo loại dịch vụ + căn cứ pháp lý. Phiên bản ≤ v8 (một mức, đã lưu
   * trữ) không có bảng — hiện đúng hai số cũ của nó để đối chiếu đơn cũ.
   */
  const taxRates = parseTaxRates(policy.taxRates);
  const tax: WorkDrawerFact[] = !policy.taxEnabled
    ? [{ key: 'taxOff', label: tForm('taxEnabled'), value: off }]
    : taxRates
      ? [
          {
            key: 'taxLegalBasis',
            label: t('facts.taxLegalBasis'),
            value: policy.taxLegalBasis ?? empty,
            wide: true,
          },
          {
            key: 'taxScope',
            label: t('facts.taxScope'),
            value: tForm('taxScopeValue'),
            wide: true,
          },
        ]
      : [
          {
            key: 'taxPercent',
            label: t('facts.taxPercent'),
            value: policy.taxPercent != null ? pf.percent(policy.taxPercent) : empty,
          },
          { key: 'taxLabel', label: t('facts.taxLabel'), value: policy.taxLabel ?? empty },
        ];

  /* Số của mô hình cũ — chỉ hiện khi phiên bản thật sự mang chúng (bản đời trước luồng tiền v2). */
  const legacy: WorkDrawerFact[] = [
    ...(policy.serviceFeePercent > 0
      ? [
          {
            key: 'serviceFee',
            label: t('facts.serviceFeePercent'),
            value: pf.percent(policy.serviceFeePercent),
          },
        ]
      : []),
    ...(policy.tripInsurancePercent != null
      ? [
          {
            key: 'trip',
            label: t('facts.tripInsurancePercent'),
            value: pf.percent(policy.tripInsurancePercent),
          },
        ]
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

  const grid = layout === 'grid';
  const section = (
    key: string,
    title: string,
    tab: FeePolicyFormTab | null,
    children: ReactNode,
    hint?: { label: string; content: ReactNode },
  ) => (
    <section key={key} className={cx(styles.section, grid && styles.card)} aria-label={title}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          {title}
          {hint ? <InfoHint label={hint.label} content={hint.content} /> : null}
        </h3>
        {grid && onEdit && tab ? (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined aria-hidden />}
            aria-label={t('editSection', { section: title })}
            onClick={() => onEdit(tab)}
          >
            {t('edit')}
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );

  return (
    <div className={grid ? styles.grid : styles.stack}>
      {grid
        ? null
        : section('general', t('sections.general'), null, <WorkDrawerFacts items={general} />)}
      {section(
        'platformFee',
        t('sections.platformFee'),
        FEE_POLICY_FORM_TAB.FEES,
        <WorkDrawerFacts items={platformFee} />,
        { label: t('hints.platformFee'), content: tForm('platformFeeHint') },
      )}
      {section(
        'commission',
        t('sections.commission'),
        FEE_POLICY_FORM_TAB.FEES,
        <>
          {/* Nấc này không áp cho gian hàng có gói (H = 0) — nói ngay đầu khối, không để người đọc suy. */}
          <p className={styles.scope}>{tScope('title')}</p>
          {commission.length > 0 ? (
            <WorkDrawerFacts items={commission} />
          ) : (
            <p className={styles.muted}>{empty}</p>
          )}
        </>,
        { label: t('hints.commission'), content: tForm('commissionHint') },
      )}
      {section(
        'deposit',
        t('sections.deposit'),
        FEE_POLICY_FORM_TAB.DEPOSIT,
        <WorkDrawerFacts items={deposit} />,
        { label: t('hints.deposit'), content: tForm('depositHint') },
      )}
      {section(
        'booking',
        t('sections.booking'),
        FEE_POLICY_FORM_TAB.BOOKING,
        <WorkDrawerFacts items={booking} />,
        { label: t('hints.booking'), content: tForm('bookingLimitsHint') },
      )}
      {section(
        'withDriver',
        t('sections.withDriver'),
        FEE_POLICY_FORM_TAB.BOOKING,
        <WorkDrawerFacts items={withDriver} />,
        { label: t('hints.withDriver'), content: tForm('withDriverLimitsHint') },
      )}
      {section(
        'tax',
        t('sections.tax'),
        FEE_POLICY_FORM_TAB.TAX,
        <>
          <WorkDrawerFacts items={tax} />
          {policy.taxEnabled && taxRates ? <TaxRatesView rates={taxRates} /> : null}
        </>,
      )}
      {legacy.length > 0
        ? section(
            'legacy',
            t('sections.legacy'),
            null,
            <>
              <p className={styles.muted}>{t('legacyHint')}</p>
              <WorkDrawerFacts items={legacy} />
            </>,
          )
        : null}
      {policy.activationBlockers.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          className={grid ? styles.full : undefined}
          title={tForm('activationBlocked')}
          description={policy.activationBlockers
            .map((code) => domainLabel('feePolicyActivationBlocker', code))
            .join(LIST_SEPARATOR)}
        />
      ) : null}
    </div>
  );
}
